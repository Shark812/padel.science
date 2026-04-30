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

import requests


SITEMAP_URL = "https://www.padelful.com/sitemap.xml"
RACKET_PREFIX = "https://www.padelful.com/en/rackets/"
DEFAULT_DELAY_SECONDS = 0.03
REQUEST_TIMEOUT = 30
URL_PATTERN = re.compile(r"<loc>(https://www\.padelful\.com/en/rackets/[^<]+)</loc>")
JSON_LD_PATTERN = re.compile(
    r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>',
    re.DOTALL | re.IGNORECASE,
)
METRIC_PATTERN = re.compile(
    r'text-sm font-medium text-neutral-700">([^<]+)</span>\s*'
    r'<span class="text-sm font-bold tabular-nums text-neutral-800">([^<]+)</span>',
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
    xml_text = fetch_text(session, SITEMAP_URL)
    urls = URL_PATTERN.findall(xml_text)
    excluded_urls = {
        "https://www.padelful.com/en/rackets",
        "https://www.padelful.com/en/rackets/compare",
    }
    filtered = [
        url
        for url in urls
        if url.startswith(RACKET_PREFIX)
        and "/compare/" not in url
        and "/brands/" not in url
        and url not in excluded_urls
    ]
    return list(dict.fromkeys(filtered))


def parse_float(value: str | None) -> float | None:
    if not value:
        return None
    return float(value)


def parse_json_ld(page_html: str) -> dict[str, Any]:
    for raw_json in JSON_LD_PATTERN.findall(page_html):
        try:
            parsed = json.loads(raw_json)
        except json.JSONDecodeError:
            continue
        if parsed.get("@type") == "Product":
            return parsed
    return {}


def extract_metrics(page_html: str) -> dict[str, float]:
    metric_name_map = {
        "Power": "power",
        "Control": "control",
        "Rebound": "rebound",
        "Maneuverability": "maneuverability",
        "Sweet spot": "sweet_spot",
    }
    metrics: dict[str, float] = {}
    pretty_html = page_html.replace("><", ">\n<")
    seen_labels: set[str] = set()
    for label, raw_value in METRIC_PATTERN.findall(pretty_html):
        label = html.unescape(label).strip()
        raw_value = html.unescape(raw_value).strip()
        key = metric_name_map.get(label)
        if not key or label in seen_labels:
            continue
        seen_labels.add(label)
        metrics[key] = float(raw_value)
    return metrics


def slug_from_url(url: str) -> str:
    return url.rstrip("/").rsplit("/", 1)[-1]


def parse_product(session: requests.Session, url: str) -> dict[str, Any]:
    page_html = fetch_text(session, url)
    product_json = parse_json_ld(page_html)
    metrics = extract_metrics(page_html)
    review = product_json.get("review", {}) if isinstance(product_json, dict) else {}
    rating = review.get("reviewRating", {}) if isinstance(review, dict) else {}
    brand = product_json.get("brand", {}) if isinstance(product_json.get("brand"), dict) else {}

    return {
        "source_portal": "padelful",
        "source_url": url,
        "slug": slug_from_url(url),
        "name": product_json.get("name"),
        "brand": brand.get("name"),
        "description": product_json.get("description"),
        "published_at": review.get("datePublished"),
        "overall_rating": parse_float(str(rating.get("ratingValue"))) if rating.get("ratingValue") is not None else None,
        "power": metrics.get("power"),
        "control": metrics.get("control"),
        "rebound": metrics.get("rebound"),
        "maneuverability": metrics.get("maneuverability"),
        "sweet_spot": metrics.get("sweet_spot"),
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
        "with_overall_rating": filled("overall_rating"),
        "with_power": filled("power"),
        "with_control": filled("control"),
        "with_rebound": filled("rebound"),
        "with_maneuverability": filled("maneuverability"),
        "with_sweet_spot": filled("sweet_spot"),
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Scrape Padelful racket review data from the English portal."
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=DEFAULT_DELAY_SECONDS,
        help=f"Delay between product requests in seconds. Default: {DEFAULT_DELAY_SECONDS}",
    )
    parser.add_argument(
        "--outdir",
        default="data/padelful-en-full",
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

    write_json(records, outdir / "padelful.json")
    write_csv(records, outdir / "padelful.csv")
    summary = summarize(records)
    (outdir / "padelful-summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
