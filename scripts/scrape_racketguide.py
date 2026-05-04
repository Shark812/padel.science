#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import html
import json
import random
import re
import subprocess
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from xml.etree import ElementTree as ET

import requests
from requests import RequestException


SITEMAP_URL = "https://www.racketguide.com/sitemap.xml"
DEFAULT_DELAY_SECONDS = 1.2
REQUEST_TIMEOUT = 20
MAX_RETRIES = 1
SITEMAP_CACHE_PATH = Path("data/racketguide-sitemap-cache.xml")
SITEMAP_NS = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
JSON_LD_PATTERN = re.compile(
    r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>',
    re.DOTALL | re.IGNORECASE,
)
TABLE_ROW_PATTERN = re.compile(
    r"<tr>\s*<th[^>]*>(.*?)</th>\s*<td[^>]*>(.*?)</td>\s*</tr>",
    re.DOTALL | re.IGNORECASE,
)
TAG_RE = re.compile(r"<[^>]+>")


def build_session() -> requests.Session:
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/126.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9,it-IT;q=0.8,sv-SE;q=0.7",
        }
    )
    return session


def fetch_text(session: requests.Session, url: str) -> str:
    for attempt in range(MAX_RETRIES + 1):
        try:
            response = session.get(url, timeout=REQUEST_TIMEOUT)
        except RequestException:
            if attempt >= MAX_RETRIES:
                break
            wait_seconds = min(45.0, 2 ** attempt) + random.uniform(0.35, 1.35)
            time.sleep(wait_seconds)
            continue
        if response.status_code != 429:
            response.raise_for_status()
            return response.text

        if attempt >= MAX_RETRIES:
            response.raise_for_status()
        retry_after = response.headers.get("Retry-After")
        wait_seconds = 0.0
        if retry_after and retry_after.isdigit():
            wait_seconds = float(retry_after)
        if wait_seconds <= 0:
            wait_seconds = min(45.0, 2 ** attempt) + random.uniform(0.35, 1.35)
        time.sleep(wait_seconds)

    # Fallback transport: curl can pass when requests gets fingerprint-limited.
    return fetch_text_via_curl(url)


def fetch_text_via_curl(url: str) -> str:
    command = [
        "curl.exe",
        "--silent",
        "--show-error",
        "--location",
        "--max-time",
        str(REQUEST_TIMEOUT),
        "--connect-timeout",
        "8",
        "--http1.1",
        "-H",
        "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "-H",
        "Accept-Language: en-US,en;q=0.9,it-IT;q=0.8,sv-SE;q=0.7",
        "-A",
        (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/126.0.0.0 Safari/537.36"
        ),
        url,
    ]
    completed = subprocess.run(command, capture_output=True, text=True, encoding="utf-8")
    if completed.returncode != 0:
        stderr = completed.stderr.strip() or "unknown curl error"
        raise RuntimeError(f"curl fetch failed: {stderr}")
    return completed.stdout


def strip_tags(text: str) -> str:
    return html.unescape(re.sub(r"\s+", " ", TAG_RE.sub(" ", text))).strip()


def normalize_slug(url: str) -> str:
    return url.rstrip("/").rsplit("/", 1)[-1]


def extract_locale(url: str) -> str:
    path_parts = [part for part in urlparse(url).path.split("/") if part]
    return path_parts[0] if path_parts else ""


def parse_float(value: str | None) -> float | None:
    if not value:
        return None
    cleaned = value.replace(",", ".")
    match = re.search(r"-?\d+(?:\.\d+)?", cleaned)
    if not match:
        return None
    try:
        return float(match.group(0))
    except ValueError:
        return None


def parse_json_ld(page_html: str) -> dict[str, Any]:
    for raw_json in JSON_LD_PATTERN.findall(page_html):
        try:
            parsed = json.loads(raw_json)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict) and parsed.get("@type") == "Product":
            return parsed
    return {}


def load_product_urls(session: requests.Session, locale_filter: str | None = None) -> list[str]:
    # Prefer cache first for stability under anti-bot/network throttling.
    if SITEMAP_CACHE_PATH.exists():
        xml_text = SITEMAP_CACHE_PATH.read_text(encoding="utf-8")
    else:
        xml_text = fetch_text(session, SITEMAP_URL)
        SITEMAP_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        SITEMAP_CACHE_PATH.write_text(xml_text, encoding="utf-8")

    root = ET.fromstring(xml_text)
    urls = [node.text.strip() for node in root.findall(".//sm:url/sm:loc", SITEMAP_NS) if node.text]
    products = [
        url
        for url in urls
        if "/padel/" in url
        and re.search(r"/padel/[^/]+/[^/]+/?$", url)
    ]
    if locale_filter:
        locale_products = [url for url in products if f"/{locale_filter}/" in url]
        # Some locales (e.g. it-en) may be available on page routing but not present in sitemap.
        # In that case we derive those URLs from the canonical se-sv sitemap entries.
        if locale_products:
            products = locale_products
        else:
            products = [
                url.replace("/se-sv/", f"/{locale_filter}/")
                for url in products
                if "/se-sv/" in url
            ]
    return list(dict.fromkeys(products))


def normalize_label_key(label_html: str) -> str:
    cleaned = strip_tags(label_html).lower()
    cleaned = cleaned.replace("å", "a").replace("ä", "a").replace("ö", "o")
    cleaned = re.sub(r"[^a-z0-9]+", " ", cleaned).strip()
    tokens = cleaned.split()
    joined = "_".join(tokens)

    if "lanseringsar" in joined or "launch_year" in joined or "year_of_launch" in joined:
        return "year"
    if "vikt" in joined or joined == "weight":
        return "weight_raw"
    if joined == "form" or "shape" in joined:
        return "shape"
    if "balanspunkt" in joined or "balance_point" in joined:
        return "balance"
    if "ramprofil" in joined or "frame_profile" in joined:
        return "frame_profile"
    if "ram_material" in joined or "frame_material" in joined:
        return "frame_material"
    if "ytskikt_typ" in joined or "surface_layer_type" in joined:
        return "surface_layer_type"
    if "ytskikt_fasthet" in joined or "surface_layer_firmness" in joined:
        return "surface_layer_firmness"
    if "ytskikt_material" in joined or "surface_layer_material" in joined:
        return "surface_layer_material"
    if "karna_fasthet" in joined or "core_firmness" in joined:
        return "core_firmness"
    if "karna_material" in joined or "core_material" in joined:
        return "core_material"
    if "speltyp" in joined or "type_of_player" in joined:
        return "type_of_player"
    if "malgrupp" in joined or "target_group" in joined:
        return "target_group"
    if "verifierad" in joined or joined == "verified":
        return "verified"
    return joined


def extract_spec_rows(page_html: str) -> dict[str, str]:
    specs: dict[str, str] = {}
    for label_html, value_html in TABLE_ROW_PATTERN.findall(page_html):
        key = normalize_label_key(label_html)
        value = strip_tags(value_html)
        if key and value:
            specs[key] = value
    return specs


def extract_year_from_text(text: str) -> int | None:
    match = re.search(r"\b(20[0-3][0-9])\b", text)
    return int(match.group(1)) if match else None


def parse_product(session: requests.Session, url: str) -> dict[str, Any]:
    page_html = fetch_text(session, url)
    product_json = parse_json_ld(page_html)
    specs = extract_spec_rows(page_html)

    name = product_json.get("name") if isinstance(product_json, dict) else None
    description = product_json.get("description") if isinstance(product_json, dict) else None
    image = product_json.get("image") if isinstance(product_json, dict) else None
    offers = product_json.get("offers", {}) if isinstance(product_json.get("offers"), dict) else {}
    aggregate = (
        product_json.get("aggregateRating", {})
        if isinstance(product_json.get("aggregateRating"), dict)
        else {}
    )

    year = None
    if "year" in specs:
        year = extract_year_from_text(specs["year"])
    if year is None and name:
        year = extract_year_from_text(str(name))
    if year is None and description:
        year = extract_year_from_text(str(description))

    brand = ""
    parts = [part for part in urlparse(url).path.split("/") if part]
    if len(parts) >= 3 and parts[1] == "padel":
        brand = parts[2]

    image_url = image if isinstance(image, str) else (image[0] if isinstance(image, list) and image else None)

    return {
        "source_portal": "racketguide",
        "source_url": url,
        "locale": extract_locale(url),
        "slug": normalize_slug(url),
        "name": strip_tags(str(name)) if name else None,
        "brand": brand or None,
        "year": year,
        "image_url": image_url,
        "description": strip_tags(str(description)) if description else None,
        "price": parse_float(str(offers.get("price"))) if offers.get("price") is not None else None,
        "price_currency": offers.get("priceCurrency"),
        "overall_rating": parse_float(str(aggregate.get("ratingValue"))) if aggregate.get("ratingValue") is not None else None,
        "review_count": int(aggregate.get("reviewCount")) if str(aggregate.get("reviewCount", "")).isdigit() else None,
        "weight_raw": specs.get("weight_raw"),
        "shape": specs.get("shape"),
        "balance": specs.get("balance"),
        "frame_profile": specs.get("frame_profile"),
        "frame_material": specs.get("frame_material"),
        "surface_layer_type": specs.get("surface_layer_type"),
        "surface_layer_firmness": specs.get("surface_layer_firmness"),
        "surface_layer_material": specs.get("surface_layer_material"),
        "core_firmness": specs.get("core_firmness"),
        "core_material": specs.get("core_material"),
        "type_of_player": specs.get("type_of_player"),
        "target_group": specs.get("target_group"),
        "verified": specs.get("verified"),
    }


def write_json(records: list[dict[str, Any]], destination: Path) -> None:
    destination.write_text(
        json.dumps(records, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def write_csv(records: list[dict[str, Any]], destination: Path) -> None:
    if not records:
        destination.write_text("", encoding="utf-8")
        return

    fieldnames: list[str] = []
    seen: set[str] = set()
    for record in records:
        for key in record.keys():
            if key not in seen:
                seen.add(key)
                fieldnames.append(key)

    with destination.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(records)


def summarize(records: list[dict[str, Any]]) -> dict[str, Any]:
    def filled(field: str) -> int:
        return sum(1 for record in records if record.get(field) not in (None, "", []))

    return {
        "products": len(records),
        "with_name": filled("name"),
        "with_brand": filled("brand"),
        "with_year": filled("year"),
        "with_image_url": filled("image_url"),
        "with_overall_rating": filled("overall_rating"),
        "with_weight_raw": filled("weight_raw"),
        "with_shape": filled("shape"),
        "with_balance": filled("balance"),
        "with_frame_material": filled("frame_material"),
        "with_surface_layer_type": filled("surface_layer_type"),
        "with_surface_layer_material": filled("surface_layer_material"),
        "with_core_material": filled("core_material"),
        "with_type_of_player": filled("type_of_player"),
        "with_target_group": filled("target_group"),
        "with_verified": filled("verified"),
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Scrape Racketguide padel product pages."
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=DEFAULT_DELAY_SECONDS,
        help=f"Delay between requests. Default: {DEFAULT_DELAY_SECONDS}",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Optional max number of product pages to scrape.",
    )
    parser.add_argument(
        "--locale",
        default=None,
        help="Optional locale filter, e.g. it-en, se-sv, us-en.",
    )
    parser.add_argument(
        "--outdir",
        default="data/racketguide-it-en-full",
        help="Output directory for exports.",
    )
    args = parser.parse_args()

    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    session = build_session()
    urls = load_product_urls(session, locale_filter=args.locale)
    if args.limit is not None:
        urls = urls[: args.limit]

    records: list[dict[str, Any]] = []
    for index, url in enumerate(urls, start=1):
        print(f"[{index}/{len(urls)}] {url}")
        try:
            records.append(parse_product(session, url))
        except Exception as exc:  # pragma: no cover
            print(f"  ! error: {exc}")
        if index < len(urls):
            time.sleep(args.delay)

    write_json(records, outdir / "racketguide.json")
    write_csv(records, outdir / "racketguide.csv")

    summary = summarize(records)
    (outdir / "racketguide-summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
