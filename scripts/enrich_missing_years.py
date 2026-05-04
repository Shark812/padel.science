#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import ssl
import sys
import time
from dataclasses import dataclass
from html import unescape
from typing import Iterable
from urllib.parse import parse_qs, quote_plus, unquote, urlparse
from urllib.request import Request, urlopen

import psycopg2
from psycopg2.extras import RealDictCursor


YEAR_RE = re.compile(r"\b(20[0-3][0-9])\b")
TAG_RE = re.compile(r"<[^>]+>")
SCRIPT_STYLE_RE = re.compile(r"<(script|style)[^>]*>.*?</\\1>", re.IGNORECASE | re.DOTALL)
WHITESPACE_RE = re.compile(r"\s+")
TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.IGNORECASE | re.DOTALL)

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


@dataclass
class Candidate:
    year: int
    confidence: int
    source: str
    evidence_url: str | None
    evidence: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Enrich missing racket years from sources and official domains.")
    parser.add_argument("--db-url", dest="db_url", default=None, help="PostgreSQL connection string.")
    parser.add_argument("--limit", type=int, default=200, help="Max missing rackets to process.")
    parser.add_argument("--apply", action="store_true", help="Persist updates into app.rackets.year.")
    parser.add_argument("--min-confidence", type=int, default=70, help="Minimum confidence to accept a candidate.")
    parser.add_argument("--sleep-ms", type=int, default=250, help="Sleep between network requests.")
    return parser.parse_args()


def get_connection(db_url: str | None):
    if db_url:
        return psycopg2.connect(db_url)
    return psycopg2.connect("postgresql://padel:padel@localhost:5432/padel")


def ensure_log_table(conn) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS app.racket_year_enrichment_log (
                id BIGSERIAL PRIMARY KEY,
                racket_id BIGINT NOT NULL REFERENCES app.rackets(id) ON DELETE CASCADE,
                unified_id TEXT NOT NULL,
                previous_year INTEGER,
                proposed_year INTEGER,
                accepted BOOLEAN NOT NULL,
                confidence_score SMALLINT NOT NULL,
                source_method TEXT NOT NULL,
                evidence_url TEXT,
                evidence_text TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
    conn.commit()


def fetch_url(url: str, timeout_sec: int = 12) -> str | None:
    ctx = ssl.create_default_context()
    req = Request(url, headers={"User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.8"})
    try:
        with urlopen(req, timeout=timeout_sec, context=ctx) as resp:
            raw = resp.read()
            charset = resp.headers.get_content_charset() or "utf-8"
            return raw.decode(charset, errors="ignore")
    except Exception:
        return None


def clean_text(html: str) -> tuple[str, str]:
    title_match = TITLE_RE.search(html)
    title = unescape(TAG_RE.sub(" ", title_match.group(1))).strip() if title_match else ""
    without_script = SCRIPT_STYLE_RE.sub(" ", html)
    text = unescape(TAG_RE.sub(" ", without_script))
    text = WHITESPACE_RE.sub(" ", text).strip()
    return title, text


def extract_year_counts(text: str) -> dict[int, int]:
    counts: dict[int, int] = {}
    for match in YEAR_RE.findall(text):
        year = int(match)
        counts[year] = counts.get(year, 0) + 1
    return counts


def candidate_from_name(canonical_name: str) -> Candidate | None:
    years = [int(y) for y in YEAR_RE.findall(canonical_name)]
    if not years:
        return None
    year = max(years)
    return Candidate(
        year=year,
        confidence=95,
        source="canonical_name",
        evidence_url=None,
        evidence=f"name:{canonical_name}",
    )


def candidate_from_page(url: str, html: str, source_tag: str) -> Candidate | None:
    title, text = clean_text(html)
    title_counts = extract_year_counts(title)
    body_counts = extract_year_counts(text)

    if not body_counts and not title_counts:
        return None

    combined: dict[int, int] = {}
    for year, count in body_counts.items():
        combined[year] = combined.get(year, 0) + count
    for year, count in title_counts.items():
        combined[year] = combined.get(year, 0) + (count * 2)

    best_year = max(combined.items(), key=lambda x: (x[1], x[0]))[0]
    mentions = combined[best_year]

    if mentions >= 4:
        confidence = 88
    elif mentions >= 3:
        confidence = 82
    elif mentions >= 2:
        confidence = 76
    else:
        confidence = 68

    return Candidate(
        year=best_year,
        confidence=confidence,
        source=source_tag,
        evidence_url=url,
        evidence=f"mentions={mentions}; title={title[:120]}",
    )


def extract_ddg_result_urls(html: str, official_domain: str, max_urls: int = 3) -> list[str]:
    urls: list[str] = []
    for token in re.findall(r'href="([^"]+)"', html):
        if "duckduckgo.com/l/?" not in token:
            continue
        parsed = urlparse(token)
        q = parse_qs(parsed.query)
        if "uddg" not in q:
            continue
        url = unquote(q["uddg"][0])
        host = (urlparse(url).hostname or "").lower()
        if host == official_domain or host.endswith(f".{official_domain}"):
            if url not in urls:
                urls.append(url)
        if len(urls) >= max_urls:
            break
    return urls


def candidate_from_official_domain(official_domain: str, brand_name: str, model_name: str, sleep_ms: int) -> Candidate | None:
    query = f'site:{official_domain} "{model_name}" {brand_name} padel'
    ddg_url = f"https://duckduckgo.com/html/?q={quote_plus(query)}"
    html = fetch_url(ddg_url)
    if not html:
        return None

    result_urls = extract_ddg_result_urls(html, official_domain=official_domain, max_urls=3)
    best: Candidate | None = None
    for url in result_urls:
        time.sleep(sleep_ms / 1000)
        page_html = fetch_url(url)
        if not page_html:
            continue
        cand = candidate_from_page(url, page_html, source_tag="official_domain_search")
        if not cand:
            continue
        if not best or (cand.confidence, cand.year) > (best.confidence, best.year):
            best = cand
    return best


def iter_source_urls(source_urls_json: dict | None) -> Iterable[str]:
    if not source_urls_json:
        return []
    urls = []
    for _, url in source_urls_json.items():
        if isinstance(url, str) and url.startswith("http"):
            urls.append(url)
    return urls


def pick_best(candidates: list[Candidate]) -> Candidate | None:
    if not candidates:
        return None
    return sorted(candidates, key=lambda c: (c.confidence, c.year), reverse=True)[0]


def process_row(row: dict, min_confidence: int, sleep_ms: int) -> Candidate | None:
    candidates: list[Candidate] = []

    by_name = candidate_from_name(row["canonical_name"])
    if by_name:
        candidates.append(by_name)

    source_urls = list(iter_source_urls(row.get("source_urls_json")))
    for url in source_urls[:5]:
        time.sleep(sleep_ms / 1000)
        html = fetch_url(url)
        if not html:
            continue
        cand = candidate_from_page(url, html, source_tag="source_page")
        if cand:
            candidates.append(cand)

    if not candidates and row.get("official_domain"):
        cand = candidate_from_official_domain(
            official_domain=row["official_domain"],
            brand_name=row["brand_name"],
            model_name=row["canonical_name"],
            sleep_ms=sleep_ms,
        )
        if cand:
            candidates.append(cand)

    best = pick_best(candidates)
    if not best:
        return None
    if best.confidence < min_confidence:
        return None
    return best


def main() -> int:
    args = parse_args()
    conn = get_connection(args.db_url)
    ensure_log_table(conn)

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """
            SELECT
                r.id,
                r.unified_id,
                r.canonical_name,
                r.year,
                r.source_urls_json,
                b.name AS brand_name,
                d.official_domain
            FROM app.rackets r
            JOIN app.brands b ON b.id = r.brand_id
            LEFT JOIN app.brand_official_domains d ON d.brand_id = b.id
            WHERE r.year IS NULL
            ORDER BY r.reliability_score DESC, r.source_count DESC, r.canonical_name ASC
            LIMIT %s
            """,
            (args.limit,),
        )
        rows = cur.fetchall()

    processed = 0
    proposed = 0
    applied = 0
    unresolved = 0

    with conn.cursor() as cur:
        for row in rows:
            processed += 1
            best = process_row(row, min_confidence=args.min_confidence, sleep_ms=args.sleep_ms)
            if not best:
                unresolved += 1
                cur.execute(
                    """
                    INSERT INTO app.racket_year_enrichment_log (
                        racket_id, unified_id, previous_year, proposed_year,
                        accepted, confidence_score, source_method, evidence_url, evidence_text
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (row["id"], row["unified_id"], row["year"], None, False, 0, "none", None, "no_candidate"),
                )
                continue

            proposed += 1
            accepted = bool(args.apply)
            if accepted:
                cur.execute("UPDATE app.rackets SET year = %s WHERE id = %s", (best.year, row["id"]))
                applied += 1

            cur.execute(
                """
                INSERT INTO app.racket_year_enrichment_log (
                    racket_id, unified_id, previous_year, proposed_year,
                    accepted, confidence_score, source_method, evidence_url, evidence_text
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    row["id"],
                    row["unified_id"],
                    row["year"],
                    best.year,
                    accepted,
                    best.confidence,
                    best.source,
                    best.evidence_url,
                    best.evidence,
                ),
            )

    conn.commit()

    summary = {
        "mode": "apply" if args.apply else "dry-run",
        "processed_missing_rows": processed,
        "proposed_years": proposed,
        "applied_updates": applied,
        "no_candidate_rows": unresolved,
        "min_confidence": args.min_confidence,
        "limit": args.limit,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
