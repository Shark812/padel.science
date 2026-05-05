#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import html
import json
import re
import time
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

import requests


BASE_LIST_URL = "https://www.extreme-tennis.eu/822-padel-rackets"
DEFAULT_DELAY_SECONDS = 0.2
REQUEST_TIMEOUT = 30
JSON_LD_SCRIPT_PATTERN = re.compile(
    r'<script type="application/ld\+json">\s*(\{.*?\})\s*</script>',
    re.DOTALL | re.IGNORECASE,
)
XCOMPARE_PATTERN = re.compile(
    r"var xcompareHookData = \{.*?currentProduct:\s*\{(.*?)\}\s*,\s*features:\s*\[(.*?)\]",
    re.DOTALL | re.IGNORECASE,
)
FEATURE_VALUES_PATTERN = re.compile(
    r'"id_feature"\s*:\s*(\d+)\s*,\s*"value"\s*:\s*"([^"]*)"',
    re.DOTALL,
)
FEATURE_NAMES_PATTERN = re.compile(
    r'"id_feature"\s*:\s*(\d+)\s*,\s*"name"\s*:\s*"([^"]*)"',
    re.DOTALL,
)
PRODUCT_NAME_PATTERN = re.compile(r'"product_name"\s*:\s*"((?:\\.|[^"\\])*)"', re.DOTALL)
MANUFACTURER_PATTERN = re.compile(
    r'"manufacturer_name"\s*:\s*"((?:\\.|[^"\\])*)"',
    re.DOTALL,
)
PRODUCT_ID_PATTERN = re.compile(r'"id_product"\s*:\s*(\d+)', re.DOTALL)
PRICE_PATTERN = re.compile(r'"price_tax_incl"\s*:\s*([\d.]+)', re.DOTALL)
SCORE_PATTERN = re.compile(r'"score"\s*:\s*([\d.]+)', re.DOTALL)
META_DESCRIPTION_PATTERN = re.compile(
    r'<meta name="description" content="([^"]*)"',
    re.IGNORECASE,
)
OG_DESCRIPTION_PATTERN = re.compile(
    r'<meta property="og:description" content="([^"]*)"',
    re.IGNORECASE,
)


def build_session() -> requests.Session:
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/136.0.0.0 Safari/537.36"
            ),
            "Accept-Language": "en-US,en;q=0.9",
        }
    )
    return session


def fetch_text(session: requests.Session, url: str) -> str:
    response = session.get(url, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    return response.text


def decode_json_string(raw_value: str | None) -> str | None:
    if raw_value is None:
        return None
    return html.unescape(json.loads(f'"{raw_value}"')).strip()


def load_page_product_urls(session: requests.Session, page: int) -> list[str]:
    url = BASE_LIST_URL if page == 1 else f"{BASE_LIST_URL}?page={page}"
    page_html = fetch_text(session, url)
    itemlist: dict[str, Any] | None = None
    for raw_json in JSON_LD_SCRIPT_PATTERN.findall(page_html):
        try:
            parsed = json.loads(raw_json)
        except json.JSONDecodeError:
            continue
        if parsed.get("@type") == "ItemList":
            itemlist = parsed
            break
    if not itemlist:
        return []
    entries = itemlist.get("itemListElement", [])
    urls: list[str] = []
    for entry in entries:
        product_url = entry.get("url")
        if product_url:
            urls.append(urljoin(url, product_url))
    return urls


def load_all_product_urls(session: requests.Session, max_pages: int = 50) -> list[str]:
    seen: set[str] = set()
    urls: list[str] = []
    for page in range(1, max_pages + 1):
        page_urls = load_page_product_urls(session, page)
        if not page_urls:
            break
        new_urls = [url for url in page_urls if url not in seen]
        if not new_urls:
            break
        urls.extend(new_urls)
        seen.update(new_urls)
    return urls


def extract_first(pattern: re.Pattern[str], text: str) -> str | None:
    match = pattern.search(text)
    if not match:
        return None
    return match.group(1)


def parse_product_json_ld(page_html: str) -> dict[str, Any]:
    for raw_json in JSON_LD_SCRIPT_PATTERN.findall(page_html):
        try:
            parsed = json.loads(raw_json)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict) and parsed.get("@type") == "Product":
            return parsed
    return {}


def extract_meta_description(page_html: str) -> str | None:
    raw_value = extract_first(OG_DESCRIPTION_PATTERN, page_html) or extract_first(
        META_DESCRIPTION_PATTERN,
        page_html,
    )
    if not raw_value:
        return None
    return html.unescape(raw_value).strip()


def normalize_float(value: str | None) -> float | None:
    if not value:
        return None
    return float(value)


def normalize_int(value: str | None) -> int | None:
    if not value:
        return None
    return int(value)


def slug_from_url(url: str) -> str:
    return url.rstrip("/").rsplit("/", 1)[-1].removesuffix(".html")


def parse_product(session: requests.Session, url: str) -> dict[str, Any]:
    page_html = fetch_text(session, url)
    product_json = parse_product_json_ld(page_html)
    match = XCOMPARE_PATTERN.search(page_html)
    if not match:
        raise ValueError("xcompareHookData block not found")

    current_product_block = match.group(1)
    feature_names_block = match.group(2)

    feature_name_map = {
        int(feature_id): feature_name
        for feature_id, feature_name in FEATURE_NAMES_PATTERN.findall(feature_names_block)
    }
    feature_value_map = {
        int(feature_id): value
        for feature_id, value in FEATURE_VALUES_PATTERN.findall(current_product_block)
    }

    label_to_key = {
        "Power": "power",
        "Control": "control",
        "Comfort": "comfort",
        "Spin": "spin",
        "Forgiveness": "forgiveness",
        "Maneuverability": "maneuverability",
        "Low speed": "low_speed",
    }

    ratings: dict[str, int | None] = {key: None for key in label_to_key.values()}
    for feature_id, label in feature_name_map.items():
        key = label_to_key.get(label)
        if key and feature_id in feature_value_map:
            ratings[key] = normalize_int(feature_value_map[feature_id])

    return {
        "source_portal": "extreme-tennis",
        "source_url": url,
        "slug": slug_from_url(url),
        "product_id": normalize_int(extract_first(PRODUCT_ID_PATTERN, current_product_block)),
        "name": decode_json_string(extract_first(PRODUCT_NAME_PATTERN, current_product_block)),
        "brand": decode_json_string(extract_first(MANUFACTURER_PATTERN, current_product_block)),
        "description": product_json.get("description") or extract_meta_description(page_html),
        "price_eur": normalize_float(extract_first(PRICE_PATTERN, current_product_block)),
        "score": normalize_float(extract_first(SCORE_PATTERN, current_product_block)),
        **ratings,
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
        return sum(1 for record in records if record.get(field) not in (None, ""))

    return {
        "products": len(records),
        "with_name": filled("name"),
        "with_brand": filled("brand"),
        "with_description": filled("description"),
        "with_price": filled("price_eur"),
        "with_score": filled("score"),
        "with_power": filled("power"),
        "with_control": filled("control"),
        "with_comfort": filled("comfort"),
        "with_spin": filled("spin"),
        "with_forgiveness": filled("forgiveness"),
        "with_maneuverability": filled("maneuverability"),
        "with_low_speed": filled("low_speed"),
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Scrape Extreme Tennis padel racket rating data."
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=DEFAULT_DELAY_SECONDS,
        help=f"Delay between product requests in seconds. Default: {DEFAULT_DELAY_SECONDS}",
    )
    parser.add_argument(
        "--outdir",
        default="data/extreme-tennis-en-full",
        help="Output directory for exported files.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Optional maximum number of product pages to scrape.",
    )
    parser.add_argument(
        "--max-pages",
        type=int,
        default=50,
        help="Maximum listing pages to traverse.",
    )
    args = parser.parse_args()

    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    session = build_session()
    urls = load_all_product_urls(session, max_pages=args.max_pages)
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

    write_json(records, outdir / "extreme-tennis.json")
    write_csv(records, outdir / "extreme-tennis.csv")
    summary = summarize(records)
    (outdir / "extreme-tennis-summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
