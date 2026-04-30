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

import requests


SITEMAP_URL = "https://padelzoom.es/pala-sitemap.xml"
DEFAULT_DELAY_SECONDS = 0.03
REQUEST_TIMEOUT = 30
SITEMAP_NS = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
JSON_LD_PATTERN = re.compile(
    r'<script type="application/ld\+json">(.*?)</script>',
    re.DOTALL | re.IGNORECASE,
)
SCORE_INLINE_PATTERN = re.compile(
    r"<span>\s*(Potencia|Control|Salida bola|Manejabilidad|Punto dulce)\s*:\s*([0-9]+(?:\.[0-9]+)?)\s*</span>",
    re.DOTALL | re.IGNORECASE,
)
TOTAL_PATTERN = re.compile(
    r'<span>\s*Total\s*</span>.*?<span>\s*([0-9]+(?:\.[0-9]+)?)\s*</span>',
    re.DOTALL | re.IGNORECASE,
)
SPEC_PATTERN = re.compile(
    r"<p><b>\s*(Tacto|Forma|Peso)\s*:\s*</b>\s*([^<]+)</p>",
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
        }
    )
    return session


def fetch_text(session: requests.Session, url: str) -> str:
    response = session.get(url, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    return response.text


def load_racket_urls(session: requests.Session) -> list[str]:
    xml_text = fetch_text(session, SITEMAP_URL)
    root = ET.fromstring(xml_text)
    urls = [loc.text for loc in root.findall("sm:url/sm:loc", SITEMAP_NS) if loc.text]
    return list(dict.fromkeys(urls))


def parse_float(value: str | None) -> float | None:
    if not value:
        return None
    value = value.strip().replace(",", ".")
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


def extract_scores(page_html: str) -> dict[str, float]:
    score_name_map = {
        "Potencia": "power",
        "Control": "control",
        "Salida bola": "ball_output",
        "Manejabilidad": "maneuverability",
        "Punto dulce": "sweet_spot",
    }
    scores: dict[str, float] = {}
    for label, raw_value in SCORE_INLINE_PATTERN.findall(page_html):
        key = score_name_map.get(html.unescape(label).strip())
        if not key:
            continue
        parsed = parse_float(raw_value)
        if parsed is not None:
            scores[key] = parsed

    total_match = TOTAL_PATTERN.search(page_html)
    if total_match:
        parsed_total = parse_float(total_match.group(1))
        if parsed_total is not None:
            scores["total"] = parsed_total
    return scores


def extract_specs(page_html: str) -> dict[str, str]:
    spec_name_map = {
        "Tacto": "feel_es",
        "Forma": "shape_es",
        "Peso": "weight_raw",
    }
    specs: dict[str, str] = {}
    for label, raw_value in SPEC_PATTERN.findall(page_html):
        key = spec_name_map.get(html.unescape(label).strip())
        if not key:
            continue
        specs[key] = html.unescape(raw_value).strip()
    return specs


def slug_from_url(url: str) -> str:
    return url.rstrip("/").rsplit("/", 1)[-1]


def parse_product(session: requests.Session, url: str) -> dict[str, Any]:
    page_html = fetch_text(session, url)
    product_json = parse_json_ld(page_html)
    scores = extract_scores(page_html)
    specs = extract_specs(page_html)

    brand = product_json.get("brand", {}) if isinstance(product_json.get("brand"), dict) else {}
    review = product_json.get("review", {}) if isinstance(product_json.get("review"), dict) else {}
    review_rating = review.get("reviewRating", {}) if isinstance(review.get("reviewRating"), dict) else {}
    offers = product_json.get("offers", {}) if isinstance(product_json.get("offers"), dict) else {}

    brand_name = brand.get("name") if isinstance(brand, dict) else product_json.get("brand")

    return {
        "source_portal": "padelzoom",
        "source_url": url,
        "slug": slug_from_url(url),
        "name": product_json.get("name"),
        "brand": brand_name,
        "currency": offers.get("priceCurrency"),
        "price_low_eur": parse_float(str(offers.get("lowPrice"))) if offers.get("lowPrice") not in (None, "") else None,
        "price_high_eur": parse_float(str(offers.get("highPrice"))) if offers.get("highPrice") not in (None, "") else None,
        "overall_rating": parse_float(str(review_rating.get("ratingValue"))) if review_rating.get("ratingValue") not in (None, "") else None,
        "power": scores.get("power"),
        "control": scores.get("control"),
        "ball_output": scores.get("ball_output"),
        "maneuverability": scores.get("maneuverability"),
        "sweet_spot": scores.get("sweet_spot"),
        "total": scores.get("total"),
        "feel_es": specs.get("feel_es"),
        "shape_es": specs.get("shape_es"),
        "weight_raw": specs.get("weight_raw"),
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
        "overall_rating",
        "power",
        "control",
        "ball_output",
        "maneuverability",
        "sweet_spot",
        "total",
        "feel_es",
        "shape_es",
        "weight_raw",
    ]
    summary = {"products": len(records)}
    for field in summary_fields:
        summary[f"with_{field}"] = filled(field)
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Scrape PadelZoom racket scores and specs from the Spanish portal."
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=DEFAULT_DELAY_SECONDS,
        help=f"Delay between product requests in seconds. Default: {DEFAULT_DELAY_SECONDS}",
    )
    parser.add_argument(
        "--outdir",
        default="data/padelzoom-es-full",
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

    write_json(records, outdir / "padelzoom.json")
    write_csv(records, outdir / "padelzoom.csv")
    summary = summarize(records)
    (outdir / "padelzoom-summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
