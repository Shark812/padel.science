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
from urllib.parse import urlparse
from xml.etree import ElementTree as ET

import requests


LANGUAGE_PRESETS = {
    "it": {
        "sitemap_url": "https://www.padelreference.com/sitemap_it.xml",
        "product_path_fragment": "/it/racchette-da-padel/p/",
        "accept_language": "it-IT,it;q=0.9,en;q=0.8",
        "spec_aliases": {
            "Marca": "brand_spec",
            "Modello": "model",
            "Forma": "shape",
            "Peso": "weight",
            "Bilanciamento": "balance",
            "Larghezza": "width",
            "Telaio/Facce": "surface",
            "Nucleo": "core",
            "Tecnologie chiave": "technologies",
            "Livello": "level",
        },
        "html_spec_aliases": {
            "Forma": "shape",
            "Schiuma": "foam",
            "Peso": "weight",
            "Superficie": "surface",
            "Rilievo": "texture",
            "Livello di gioco": "level",
            "Tipo di racchetta": "racket_type",
            "Distribuzione del peso": "balance",
            "Sesso": "gender",
        },
        "expert_notes_label": "Expert notes",
        "rating_labels": [
            "Power",
            "Control",
            "Comfort",
            "Maneuverability",
            "Effect",
            "Tolerance",
        ],
        "description_tech_sheet_marker": "Scheda Tecnica",
        "description_stop_markers": [
            "Tecnologia e materiali:",
            "Design e performance:",
            "Padroneggiare il Gioco:",
            "Verdetto",
        ],
    },
    "en": {
        "sitemap_url": "https://www.padelreference.com/sitemap_en.xml",
        "product_path_fragment": "/en/padel-rackets/p/",
        "accept_language": "en-US,en;q=0.9",
        "spec_aliases": {
            "Brand": "brand_spec",
            "Model": "model",
            "Shape": "shape",
            "Weight": "weight",
            "Balance": "balance",
            "Width": "width",
            "Frame/Faces": "surface",
            "Core": "core",
            "Key technologies": "technologies",
            "Level": "level",
        },
        "html_spec_aliases": {
            "Shape": "shape",
            "Foam": "foam",
            "Weight": "weight",
            "Surface": "surface",
            "Texture": "texture",
            "Playing level": "level",
            "Racket type": "racket_type",
            "Weight distribution": "balance",
            "Gender": "gender",
        },
        "expert_notes_label": "Expert notes",
        "rating_labels": [
            "Power",
            "Control",
            "Comfort",
            "Maneuverability",
            "Effect",
            "Tolerance",
        ],
        "description_tech_sheet_marker": "Technical Sheet",
        "description_stop_markers": [
            "Technology and materials:",
            "Design and performance:",
            "Master the Game:",
            "Verdict",
        ],
    },
}

DEFAULT_DELAY_SECONDS = 0.35
REQUEST_TIMEOUT = 30
JSON_LD_PATTERN = re.compile(
    r'<script type="application/ld\+json">\s*(\{.*?\})\s*</script>',
    re.DOTALL | re.IGNORECASE,
)
OG_DESCRIPTION_PATTERN = re.compile(
    r'<meta property="og:description" content="([^"]*)"',
    re.IGNORECASE,
)
META_DESCRIPTION_PATTERN = re.compile(
    r'<meta name="description" content="([^"]*)"',
    re.IGNORECASE,
)
CANONICAL_PATTERN = re.compile(
    r'<link rel="canonical" href="([^"]+)"',
    re.IGNORECASE,
)

def build_session(accept_language: str) -> requests.Session:
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": (
                "Mozilla/5.0 (compatible; PadelResearchBot/0.1; "
                "+https://example.invalid)"
            ),
            "Accept-Language": accept_language,
        }
    )
    return session


def fetch_text(session: requests.Session, url: str) -> str:
    response = session.get(url, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    return response.text


def load_product_urls(
    session: requests.Session,
    sitemap_url: str,
    product_path_fragment: str,
) -> list[str]:
    xml_text = fetch_text(session, sitemap_url)
    root = ET.fromstring(xml_text)
    ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    urls: list[str] = []
    for loc in root.findall(".//sm:url/sm:loc", ns):
        if not loc.text:
            continue
        url = loc.text.strip()
        parsed = urlparse(url)
        if parsed.netloc != "www.padelreference.com":
            continue
        if product_path_fragment in url:
            urls.append(url)
    return urls


def extract_first(pattern: re.Pattern[str], text: str) -> str | None:
    match = pattern.search(text)
    if not match:
        return None
    return html.unescape(match.group(1)).strip()


def decode_json_string(raw_value: str) -> str:
    sanitized = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", " ", raw_value)
    try:
        return html.unescape(json.loads(f'"{sanitized}"')).strip()
    except json.JSONDecodeError:
        return html.unescape(sanitized.replace('\\"', '"').replace("\\/", "/")).strip()


def extract_json_string(raw_json: str, key: str) -> str | None:
    pattern = re.compile(rf'"{re.escape(key)}"\s*:\s*"((?:\\.|[^"\\])*)"', re.DOTALL)
    match = pattern.search(raw_json)
    if not match:
        return None
    return decode_json_string(match.group(1))


def extract_json_string_array(raw_json: str, key: str) -> list[str]:
    array_pattern = re.compile(
        rf'"{re.escape(key)}"\s*:\s*\[(.*?)\]',
        re.DOTALL,
    )
    match = array_pattern.search(raw_json)
    if not match:
        single = extract_json_string(raw_json, key)
        return [single] if single else []

    items = re.findall(r'"((?:\\.|[^"\\])*)"', match.group(1), re.DOTALL)
    return [decode_json_string(item) for item in items]


def parse_json_ld(page_html: str) -> dict[str, Any]:
    match = JSON_LD_PATTERN.search(page_html)
    if not match:
        return {}
    raw_json = match.group(1)

    parsed: dict[str, Any] = {}
    for key in [
        "@context",
        "@type",
        "id",
        "name",
        "description",
        "link",
        "image_link",
        "additional_image_link",
        "availability",
        "price",
        "sale_price",
        "google_product_category",
        "product_type",
        "brand",
        "gtin",
        "identifier_exists",
        "condition",
        "adult",
        "hasVariant",
        "item_group_id",
        "ships_from_country",
    ]:
        parsed[key] = extract_json_string(raw_json, key)

    parsed["image"] = extract_json_string_array(raw_json, "image")
    return parsed


def extract_specs_from_description(
    description: str,
    spec_aliases: dict[str, str],
    tech_sheet_marker: str,
    stop_markers: list[str],
) -> dict[str, str]:
    specs: dict[str, str] = {}
    if tech_sheet_marker not in description:
        return specs

    block = description.split(tech_sheet_marker, 1)[1]
    for marker in stop_markers:
        if marker in block:
            block = block.split(marker, 1)[0]
            break

    labels = list(spec_aliases.keys())
    for index, label in enumerate(labels):
        start = block.find(f"{label}:")
        if start == -1:
            continue
        start += len(label) + 1
        end = len(block)
        for next_label in labels[index + 1 :]:
            next_pos = block.find(f"{next_label}:", start)
            if next_pos != -1 and next_pos < end:
                end = next_pos
        value = block[start:end].strip(" \n\r\t:-")
        if value:
            specs[spec_aliases[label]] = value
    return specs


def strip_tags(text: str) -> str:
    without_tags = re.sub(r"<[^>]+>", " ", text)
    return html.unescape(re.sub(r"\s+", " ", without_tags)).strip()


def extract_specs_from_html(page_html: str, html_spec_aliases: dict[str, str]) -> dict[str, str]:
    pretty_html = page_html.replace("><", ">\n<")
    pattern = re.compile(
        r'<div class="grid items-center grid-cols-2 gap-4">.*?'
        r"<span[^>]*>\s*<div>\s*(.*?)\s*</div>\s*</span>\s*"
        r"<span>\s*(.*?)\s*</span>\s*</div>",
        re.DOTALL | re.IGNORECASE,
    )
    specs: dict[str, str] = {}
    for label_raw, value_raw in pattern.findall(pretty_html):
        label = strip_tags(label_raw)
        value = strip_tags(value_raw)
        key = html_spec_aliases.get(label)
        if key and value:
            specs[key] = value
    return specs


def extract_expert_notes(page_html: str, label: str) -> str | None:
    pretty_html = page_html.replace("><", ">\n<")
    pattern = re.compile(
        rf"<h2[^>]*>\s*{re.escape(label)}\s*</h2>\s*.*?<p[^>]*class=\"text-gray-500\"[^>]*>\s*(.*?)\s*</p>",
        re.DOTALL | re.IGNORECASE,
    )
    match = pattern.search(pretty_html)
    if not match:
        return None
    return strip_tags(match.group(1))


def extract_ratings(page_html: str, rating_labels: list[str]) -> dict[str, int]:
    pretty_html = page_html.replace("><", ">\n<")
    ratings: dict[str, int] = {}
    for label in rating_labels:
        pattern = re.compile(
            rf"<span>\s*{re.escape(label)}\s*</span>\s*<span class=\"font-semibold\">\s*(\d+)\s*</span>",
            re.DOTALL | re.IGNORECASE,
        )
        match = pattern.search(pretty_html)
        if match:
            ratings[label.lower().replace(" ", "_")] = int(match.group(1))
    return ratings


def normalize_slug(url: str) -> str:
    path = urlparse(url).path.rstrip("/")
    return path.rsplit("/", 1)[-1]


def normalize_price(raw_price: str | None) -> float | None:
    if not raw_price:
        return None
    match = re.search(r"(\d+(?:\.\d+)?)", raw_price)
    if not match:
        return None
    return float(match.group(1))


def normalize_weight_grams(raw_weight: str | None) -> int | None:
    if not raw_weight:
        return None
    match = re.search(r"(\d{3})\s*g", raw_weight, re.IGNORECASE)
    if not match:
        return None
    return int(match.group(1))


def parse_product(
    session: requests.Session,
    url: str,
    product_path_fragment: str,
    spec_aliases: dict[str, str],
    html_spec_aliases: dict[str, str],
    expert_notes_label: str,
    rating_labels: list[str],
    tech_sheet_marker: str,
    stop_markers: list[str],
) -> dict[str, Any]:
    response = session.get(url, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    page_html = response.text
    product_json = parse_json_ld(page_html)
    raw_description = html.unescape(product_json.get("description", "")).strip()
    specs = extract_specs_from_html(page_html, html_spec_aliases)
    description_specs = extract_specs_from_description(
        raw_description,
        spec_aliases,
        tech_sheet_marker,
        stop_markers,
    )
    for key, value in description_specs.items():
        specs.setdefault(key, value)
    canonical_url = extract_first(CANONICAL_PATTERN, page_html)
    final_url = response.url
    meta_description = extract_first(META_DESCRIPTION_PATTERN, page_html)
    og_description = extract_first(OG_DESCRIPTION_PATTERN, page_html)
    expert_notes = extract_expert_notes(page_html, expert_notes_label)
    description = raw_description or expert_notes or og_description or meta_description
    ratings = extract_ratings(page_html, rating_labels)

    images = product_json.get("image", [])
    if isinstance(images, str):
        images = [images]

    row: dict[str, Any] = {
        "source_url": url,
        "final_url": final_url,
        "canonical_url": canonical_url,
        "slug": normalize_slug(final_url),
        "product_id": product_json.get("id"),
        "name": product_json.get("name"),
        "brand": product_json.get("brand"),
        "is_product_page": bool(canonical_url and product_path_fragment in canonical_url),
        "availability": product_json.get("availability"),
        "price_eur": normalize_price(product_json.get("price")),
        "sale_price_eur": normalize_price(product_json.get("sale_price")),
        "currency": "EUR" if product_json.get("price") else None,
        "product_type": product_json.get("product_type"),
        "condition": product_json.get("condition"),
        "gtin": product_json.get("gtin") or None,
        "meta_description": meta_description,
        "og_description": og_description,
        "description": description,
        "expert_notes": expert_notes,
        "image_count": len(images),
        "image_urls": images,
        "model": specs.get("model"),
        "shape": specs.get("shape"),
        "foam": specs.get("foam"),
        "weight_raw": specs.get("weight"),
        "weight_g": normalize_weight_grams(specs.get("weight")),
        "balance": specs.get("balance"),
        "width": specs.get("width"),
        "surface": specs.get("surface"),
        "core": specs.get("core"),
        "level": specs.get("level"),
        "racket_type": specs.get("racket_type"),
        "texture": specs.get("texture"),
        "gender": specs.get("gender"),
        "technologies": specs.get("technologies"),
        "brand_from_spec": specs.get("brand_spec"),
        **ratings,
    }
    return row


def write_json(records: list[dict[str, Any]], destination: Path) -> None:
    destination.write_text(
        json.dumps(records, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def write_csv(records: list[dict[str, Any]], destination: Path) -> None:
    if not records:
        destination.write_text("", encoding="utf-8")
        return

    flat_records: list[dict[str, Any]] = []
    for record in records:
        flat = dict(record)
        flat["image_urls"] = json.dumps(record.get("image_urls", []), ensure_ascii=False)
        flat_records.append(flat)

    fieldnames: list[str] = []
    seen: set[str] = set()
    for record in flat_records:
        for key in record.keys():
            if key not in seen:
                seen.add(key)
                fieldnames.append(key)
    with destination.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(flat_records)


def summarize(records: list[dict[str, Any]]) -> dict[str, Any]:
    def filled(field: str) -> int:
        return sum(1 for record in records if record.get(field) not in (None, "", []))

    return {
        "products": len(records),
        "valid_product_pages": sum(1 for record in records if record.get("is_product_page")),
        "with_brand": filled("brand"),
        "with_price": filled("price_eur"),
        "with_shape": filled("shape"),
        "with_weight": filled("weight_g"),
        "with_balance": filled("balance"),
        "with_surface": filled("surface"),
        "with_core": filled("core"),
        "with_level": filled("level"),
        "with_technologies": filled("technologies"),
        "with_expert_notes": filled("expert_notes"),
        "with_power": filled("power"),
        "with_control": filled("control"),
        "with_comfort": filled("comfort"),
        "with_maneuverability": filled("maneuverability"),
        "with_effect": filled("effect"),
        "with_tolerance": filled("tolerance"),
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Scrape product data from PadelReference racket pages."
    )
    parser.add_argument(
        "--lang",
        choices=sorted(LANGUAGE_PRESETS.keys()),
        default="it",
        help="Language/site preset to use.",
    )
    parser.add_argument(
        "--sitemap-url",
        default=None,
        help="Override sitemap URL.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Optional maximum number of product pages to scrape.",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=DEFAULT_DELAY_SECONDS,
        help=f"Delay between product requests in seconds. Default: {DEFAULT_DELAY_SECONDS}",
    )
    parser.add_argument(
        "--outdir",
        default="data/padelreference",
        help="Output directory for exported files.",
    )
    args = parser.parse_args()

    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    preset = LANGUAGE_PRESETS[args.lang]
    sitemap_url = args.sitemap_url or preset["sitemap_url"]
    product_path_fragment = preset["product_path_fragment"]
    session = build_session(preset["accept_language"])
    urls = load_product_urls(session, sitemap_url, product_path_fragment)
    if args.limit is not None:
        urls = urls[: args.limit]

    records: list[dict[str, Any]] = []
    for index, url in enumerate(urls, start=1):
        print(f"[{index}/{len(urls)}] {url}")
        try:
            records.append(
                parse_product(
                    session,
                    url,
                    product_path_fragment,
                    preset["spec_aliases"],
                    preset["html_spec_aliases"],
                    preset["expert_notes_label"],
                    preset["rating_labels"],
                    preset["description_tech_sheet_marker"],
                    preset["description_stop_markers"],
                )
            )
        except Exception as exc:  # pragma: no cover
            print(f"  ! error: {exc}")
        if index < len(urls):
            time.sleep(args.delay)

    write_json(records, outdir / "products.json")
    write_csv(records, outdir / "products.csv")

    summary = summarize(records)
    (outdir / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
