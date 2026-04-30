#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import html
import json
import re
import time
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

import requests


SITEMAP_INDEX_URL = "https://pala-hack.com/sitemap.xml"
RACKET_PREFIX = "https://pala-hack.com/en/padel-rackets/"
DEFAULT_DELAY_SECONDS = 0.03
REQUEST_TIMEOUT = 30
SITEMAP_NS = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
JSON_LD_PATTERN = re.compile(
    r'<script type="application/ld\+json">(.*?)</script>',
    re.DOTALL | re.IGNORECASE,
)
SCORE_BLOCK_PATTERN = re.compile(
    r"02\. Score(.*?)03\. Specs",
    re.DOTALL | re.IGNORECASE,
)
SCORE_ITEM_PATTERN = re.compile(
    r"<span>\s*([^:<]+):\s*([0-9]+(?:\.[0-9]+)?)\s*</span>",
    re.DOTALL | re.IGNORECASE,
)
SPEC_ITEM_PATTERN = re.compile(
    r"<li>\s*<span>\s*([^<]+?)\s*</span>\s*"
    r'<span class="text-inside-custom-specification">\s*:\s*([^<]+?)\s*</span>\s*</li>',
    re.DOTALL | re.IGNORECASE,
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


def load_racket_urls(session: requests.Session) -> list[str]:
    index_xml = fetch_text(session, SITEMAP_INDEX_URL)
    root = ET.fromstring(index_xml)
    sitemap_urls = [
        loc.text
        for loc in root.findall("sm:sitemap/sm:loc", SITEMAP_NS)
        if loc.text and "/pala-sitemap" in loc.text
    ]

    urls: list[str] = []
    for sitemap_url in sitemap_urls:
        sitemap_xml = fetch_text(session, sitemap_url)
        sitemap_root = ET.fromstring(sitemap_xml)
        urls.extend(
            [
                loc.text
                for loc in sitemap_root.findall("sm:url/sm:loc", SITEMAP_NS)
                if loc.text and loc.text.startswith(RACKET_PREFIX)
            ]
        )

    return list(dict.fromkeys(urls))


def parse_float(value: str | None) -> float | None:
    if not value:
        return None
    try:
        return float(value)
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


def normalize_image_url(image: Any, page_url: str) -> str | None:
    if isinstance(image, list):
        image = image[0] if image else None
    if not image or not isinstance(image, str):
        return None
    return urljoin(page_url, image.strip())


def extract_scores(page_html: str) -> dict[str, float]:
    score_name_map = {
        "Maneuverability": "maneuverability",
        "Control": "control",
        "Power": "power",
        "Sweet Spot": "sweet_spot",
        "Ball Output": "ball_output",
        "Total": "total",
    }
    match = SCORE_BLOCK_PATTERN.search(page_html)
    if not match:
        return {}

    scores: dict[str, float] = {}
    for label, raw_value in SCORE_ITEM_PATTERN.findall(match.group(1)):
        key = score_name_map.get(html.unescape(label).strip())
        if not key:
            continue
        parsed = parse_float(raw_value.strip())
        if parsed is not None:
            scores[key] = parsed
    return scores


def extract_specs(page_html: str) -> dict[str, str]:
    spec_name_map = {
        "Player Type": "player_type",
        "Racket shape": "shape",
        "Player level": "level",
        "Racket balance": "balance",
        "Racket feel": "feel",
        "Racket surface": "surface",
        "Game type": "game_type",
        "Season": "season",
        "Core material": "core_material",
        "Face material": "face_material",
        "Frame material": "frame_material",
        "Racket finish": "racket_finish",
    }
    specs: dict[str, str] = {}
    for label, raw_value in SPEC_ITEM_PATTERN.findall(page_html):
        key = spec_name_map.get(html.unescape(label).strip())
        if not key:
            continue
        specs[key] = html.unescape(raw_value).strip()
    return specs


def slug_from_url(url: str) -> str:
    return url.rstrip("/").rsplit("/", 1)[-1]


def brand_slug_from_url(url: str) -> str:
    parts = url.rstrip("/").split("/")
    return parts[-2] if len(parts) >= 2 else ""


def parse_product(session: requests.Session, url: str) -> dict[str, Any]:
    page_html = fetch_text(session, url)
    product_json = parse_json_ld(page_html)
    scores = extract_scores(page_html)
    specs = extract_specs(page_html)

    brand = product_json.get("brand", {}) if isinstance(product_json.get("brand"), dict) else {}
    review = product_json.get("review", {}) if isinstance(product_json.get("review"), dict) else {}
    review_rating = review.get("reviewRating", {}) if isinstance(review.get("reviewRating"), dict) else {}
    offers = product_json.get("offers", {}) if isinstance(product_json.get("offers"), dict) else {}

    return {
        "source_portal": "pala-hack",
        "source_url": url,
        "slug": slug_from_url(url),
        "brand_slug": brand_slug_from_url(url),
        "name": product_json.get("name"),
        "brand": brand.get("name"),
        "image_url": normalize_image_url(product_json.get("image"), url),
        "description": product_json.get("description"),
        "availability": offers.get("availability"),
        "currency": offers.get("priceCurrency"),
        "price_low_eur": parse_float(str(offers.get("lowPrice"))) if offers.get("lowPrice") is not None else None,
        "price_high_eur": parse_float(str(offers.get("highPrice"))) if offers.get("highPrice") is not None else None,
        "overall_rating": parse_float(str(review_rating.get("ratingValue"))) if review_rating.get("ratingValue") is not None else None,
        "power": scores.get("power"),
        "control": scores.get("control"),
        "maneuverability": scores.get("maneuverability"),
        "sweet_spot": scores.get("sweet_spot"),
        "ball_output": scores.get("ball_output"),
        "total": scores.get("total"),
        "player_type": specs.get("player_type"),
        "shape": specs.get("shape"),
        "level": specs.get("level"),
        "balance": specs.get("balance"),
        "feel": specs.get("feel"),
        "surface": specs.get("surface"),
        "game_type": specs.get("game_type"),
        "season": specs.get("season"),
        "core_material": specs.get("core_material"),
        "face_material": specs.get("face_material"),
        "frame_material": specs.get("frame_material"),
        "racket_finish": specs.get("racket_finish"),
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

    summary_fields = [
        "name",
        "brand",
        "image_url",
        "overall_rating",
        "power",
        "control",
        "maneuverability",
        "sweet_spot",
        "ball_output",
        "total",
        "shape",
        "level",
        "balance",
        "feel",
        "surface",
        "season",
        "core_material",
        "face_material",
        "frame_material",
        "racket_finish",
    ]
    summary = {"products": len(records)}
    for field in summary_fields:
        summary[f"with_{field}"] = filled(field)
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Scrape English Pala Hack racket scores and specs."
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=DEFAULT_DELAY_SECONDS,
        help=f"Delay between product requests in seconds. Default: {DEFAULT_DELAY_SECONDS}",
    )
    parser.add_argument(
        "--outdir",
        default="data/pala-hack-en-full",
        help="Output directory for exported files.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Optional maximum number of product pages to scrape.",
    )
    args = parser.parse_args()

    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    session = build_session()
    urls = load_racket_urls(session)
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

    write_json(records, outdir / "pala-hack.json")
    write_csv(records, outdir / "pala-hack.csv")
    summary = summarize(records)
    (outdir / "pala-hack-summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
