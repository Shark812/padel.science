#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
import time
from pathlib import Path
from typing import Any, Callable

import scrape_extreme_tennis as extreme_tennis
import scrape_padelful as padelful
import scrape_padelreference as padelreference
import scrape_padelzoom as padelzoom
import scrape_pala_hack as pala_hack
import build_unified_rackets as unified_builder


ROOT = Path(__file__).resolve().parent.parent
STATE_DIR = ROOT / "data" / "source-state"
LATEST_REPORT_PATH = STATE_DIR / "latest-incremental-report.json"


def load_json_records(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8"))


def load_seen_urls(path: Path) -> set[str]:
    if not path.exists():
        return set()
    payload = json.loads(path.read_text(encoding="utf-8"))
    return set(payload.get("seen_urls", []))


def write_seen_urls(path: Path, urls: set[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"seen_urls": sorted(urls)}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def persist_source_records(
    module: Any,
    records: list[dict[str, Any]],
    outdir: Path,
    base_name: str,
) -> None:
    outdir.mkdir(parents=True, exist_ok=True)
    module.write_json(records, outdir / f"{base_name}.json")
    module.write_csv(records, outdir / f"{base_name}.csv")
    summary = module.summarize(records)
    (outdir / f"{base_name}-summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def append_new_records(
    module: Any,
    base_name: str,
    outdir: Path,
    load_urls: Callable[[], list[str]],
    parse_url: Callable[[str], dict[str, Any]],
    delay_seconds: float,
) -> dict[str, Any]:
    json_path = outdir / f"{base_name}.json"
    state_path = STATE_DIR / f"{base_name}-seen-urls.json"
    records = load_json_records(json_path)
    known_urls = {record.get("source_url") for record in records if record.get("source_url")}
    seen_urls = load_seen_urls(state_path)
    if seen_urls:
        seen_urls |= known_urls
    else:
        seen_urls = set(known_urls)
    current_urls = list(dict.fromkeys(load_urls()))
    new_urls = [url for url in current_urls if url not in seen_urls]
    added_records = 0
    failed_urls: list[str] = []

    print(f"\n=== {base_name} ===")
    print(
        json.dumps(
            {
                "known_urls": len(known_urls),
                "seen_urls": len(seen_urls),
                "current_urls": len(current_urls),
                "new_urls": len(new_urls),
            }
        )
    )

    for index, url in enumerate(new_urls, start=1):
        print(f"[{index}/{len(new_urls)}] {url}")
        try:
            records.append(parse_url(url))
            added_records += 1
        except Exception as exc:  # pragma: no cover
            print(f"  ! error: {exc}")
            failed_urls.append(url)
        if index < len(new_urls):
            time.sleep(delay_seconds)

    write_seen_urls(state_path, set(current_urls))
    if added_records > 0:
        persist_source_records(module, records, outdir, base_name)
    return {
        "source": base_name,
        "known_urls_before": len(known_urls),
        "seen_urls_before": len(seen_urls),
        "current_urls": len(current_urls),
        "new_urls": len(new_urls),
        "added_records": added_records,
        "failed_new_urls": failed_urls,
    }


def main() -> None:
    reports: list[dict[str, Any]] = []

    # PadelReference EN
    pr_preset = padelreference.LANGUAGE_PRESETS["en"]
    pr_session = padelreference.build_session(pr_preset["accept_language"])
    pr_outdir = ROOT / "data" / "padelreference-en-full"
    reports.append(
        append_new_records(
            module=padelreference,
            base_name="padelreference",
            outdir=pr_outdir,
            load_urls=lambda: padelreference.load_product_urls(
                pr_session,
                sitemap_url=pr_preset["sitemap_url"],
                product_path_fragment=pr_preset["product_path_fragment"],
            ),
            parse_url=lambda url: padelreference.parse_product(
                pr_session,
                url,
                product_path_fragment=pr_preset["product_path_fragment"],
                spec_aliases=pr_preset["spec_aliases"],
                html_spec_aliases=pr_preset["html_spec_aliases"],
                expert_notes_label=pr_preset["expert_notes_label"],
                rating_labels=pr_preset["rating_labels"],
                tech_sheet_marker=pr_preset["description_tech_sheet_marker"],
                stop_markers=pr_preset["description_stop_markers"],
            ),
            delay_seconds=padelreference.DEFAULT_DELAY_SECONDS,
        )
    )

    # Extreme Tennis
    et_session = extreme_tennis.build_session()
    et_outdir = ROOT / "data" / "extreme-tennis-en-full"
    reports.append(
        append_new_records(
            module=extreme_tennis,
            base_name="extreme-tennis",
            outdir=et_outdir,
            load_urls=lambda: extreme_tennis.load_all_product_urls(et_session, max_pages=50),
            parse_url=lambda url: extreme_tennis.parse_product(et_session, url),
            delay_seconds=extreme_tennis.DEFAULT_DELAY_SECONDS,
        )
    )

    # Padelful
    pf_session = padelful.build_session()
    pf_outdir = ROOT / "data" / "padelful-en-full"
    reports.append(
        append_new_records(
            module=padelful,
            base_name="padelful",
            outdir=pf_outdir,
            load_urls=lambda: padelful.load_racket_urls(pf_session),
            parse_url=lambda url: padelful.parse_product(pf_session, url),
            delay_seconds=padelful.DEFAULT_DELAY_SECONDS,
        )
    )

    # Pala Hack
    ph_session = pala_hack.build_session()
    ph_outdir = ROOT / "data" / "pala-hack-en-full"
    reports.append(
        append_new_records(
            module=pala_hack,
            base_name="pala-hack",
            outdir=ph_outdir,
            load_urls=lambda: pala_hack.load_racket_urls(ph_session),
            parse_url=lambda url: pala_hack.parse_product(ph_session, url),
            delay_seconds=pala_hack.DEFAULT_DELAY_SECONDS,
        )
    )

    # PadelZoom
    pz_session = padelzoom.build_session()
    pz_outdir = ROOT / "data" / "padelzoom-es-full"
    reports.append(
        append_new_records(
            module=padelzoom,
            base_name="padelzoom",
            outdir=pz_outdir,
            load_urls=lambda: padelzoom.load_racket_urls(pz_session),
            parse_url=lambda url: padelzoom.parse_product(pz_session, url),
            delay_seconds=padelzoom.DEFAULT_DELAY_SECONDS,
        )
    )

    added_records_total = sum(item["added_records"] for item in reports)
    did_rebuild_unified = added_records_total > 0
    if did_rebuild_unified:
        unified_builder.main()
    report = {
        "sources": reports,
        "new_urls_total": sum(item["new_urls"] for item in reports),
        "added_records_total": added_records_total,
        "did_rebuild_unified": did_rebuild_unified,
    }
    LATEST_REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    LATEST_REPORT_PATH.write_text(
        json.dumps(report, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    sys.path.insert(0, str(ROOT / "scripts"))
    main()
