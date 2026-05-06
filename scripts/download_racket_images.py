#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import mimetypes
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CSV_PATH = ROOT / "data" / "unified-rackets" / "unified-rackets.csv"
DEFAULT_JSON_PATH = ROOT / "data" / "unified-rackets" / "unified-rackets.json"
DEFAULT_PUBLIC_DIR = ROOT / "public" / "racket-images"
DEFAULT_MANIFEST_PATH = ROOT / "data" / "racket-images-manifest.json"

USER_AGENT = "padel-portal-image-sync/0.1"
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".svg"}
CONTENT_TYPE_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/avif": ".avif",
    "image/svg+xml": ".svg",
}


@dataclass(frozen=True)
class ImageJob:
    row_index: int
    unified_id: str
    canonical_name: str
    source_url: str
    destination_stem: str


@dataclass
class ImageResult:
    row_index: int
    unified_id: str
    canonical_name: str
    source_url: str
    local_image_url: str | None
    status: str
    error: str = ""
    bytes: int = 0


def slugify(value: str, fallback: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    slug = re.sub(r"-{2,}", "-", slug)
    return (slug or fallback)[:80].strip("-") or fallback


def is_remote_url(value: str) -> bool:
    parsed = urlparse(value)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def is_local_public_url(value: str, public_path: str) -> bool:
    normalized_public_path = public_path.rstrip("/") + "/"
    return value.startswith(normalized_public_path)


def source_extension(url: str) -> str | None:
    suffix = Path(urlparse(url).path).suffix.lower()
    if suffix in ALLOWED_EXTENSIONS:
        return suffix
    return None


def extension_from_content_type(content_type: str | None) -> str:
    if not content_type:
        return ".jpg"
    media_type = content_type.split(";", 1)[0].strip().lower()
    if media_type in CONTENT_TYPE_EXTENSIONS:
        return CONTENT_TYPE_EXTENSIONS[media_type]
    guessed = mimetypes.guess_extension(media_type)
    if guessed and guessed.lower() in ALLOWED_EXTENSIONS:
        return guessed.lower()
    return ".jpg"


def read_csv_rows(csv_path: Path) -> tuple[list[dict[str, Any]], list[str]]:
    with csv_path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        return list(reader), list(reader.fieldnames or [])


def write_csv_rows(rows: list[dict[str, Any]], fieldnames: list[str], csv_path: Path) -> None:
    with csv_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def write_json_rows(rows: list[dict[str, Any]], json_path: Path) -> None:
    json_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")


def build_jobs(rows: list[dict[str, Any]], public_path: str, force: bool) -> list[ImageJob]:
    jobs: list[ImageJob] = []
    seen_urls: set[str] = set()
    for index, row in enumerate(rows):
        source_url = str(row.get("image_url") or "").strip()
        if not source_url or is_local_public_url(source_url, public_path) or not is_remote_url(source_url):
            continue
        if source_url in seen_urls and not force:
            continue
        seen_urls.add(source_url)
        unified_id = str(row.get("unified_id") or f"row-{index + 1}")
        canonical_name = str(row.get("canonical_name") or unified_id)
        url_hash = hashlib.sha1(source_url.encode("utf-8")).hexdigest()[:10]
        name_slug = slugify(canonical_name, unified_id)
        jobs.append(
            ImageJob(
                row_index=index,
                unified_id=unified_id,
                canonical_name=canonical_name,
                source_url=source_url,
                destination_stem=f"{slugify(unified_id, f'row-{index + 1}')}-{name_slug}-{url_hash}",
            )
        )
    return jobs


def build_already_local_results(rows: list[dict[str, Any]], public_path: str) -> list[ImageResult]:
    results: list[ImageResult] = []
    for index, row in enumerate(rows):
        image_url = str(row.get("image_url") or "").strip()
        if not image_url or not is_local_public_url(image_url, public_path):
            continue
        unified_id = str(row.get("unified_id") or f"row-{index + 1}")
        canonical_name = str(row.get("canonical_name") or unified_id)
        results.append(
            ImageResult(
                row_index=index,
                unified_id=unified_id,
                canonical_name=canonical_name,
                source_url=image_url,
                local_image_url=image_url,
                status="already_local",
            )
        )
    return results


def destination_for_existing_file(public_dir: Path, public_path: str, stem: str) -> tuple[Path, str] | None:
    for candidate in public_dir.glob(f"{stem}.*"):
        if candidate.suffix.lower() in ALLOWED_EXTENSIONS and candidate.is_file():
            return candidate, f"{public_path.rstrip('/')}/{candidate.name}"
    return None


def download_one(job: ImageJob, public_dir: Path, public_path: str, timeout_seconds: int, force: bool) -> ImageResult:
    existing = destination_for_existing_file(public_dir, public_path, job.destination_stem)
    if existing and not force:
        destination, local_url = existing
        return ImageResult(
            row_index=job.row_index,
            unified_id=job.unified_id,
            canonical_name=job.canonical_name,
            source_url=job.source_url,
            local_image_url=local_url,
            status="reused",
            bytes=destination.stat().st_size,
        )

    request = Request(
        job.source_url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "image/avif,image/webp,image/png,image/jpeg,image/svg+xml,image/*,*/*;q=0.8",
        },
    )
    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            content_type = response.headers.get("content-type")
            extension = source_extension(job.source_url) or extension_from_content_type(content_type)
            payload = response.read()
    except (HTTPError, URLError, TimeoutError, OSError) as exc:
        return ImageResult(
            row_index=job.row_index,
            unified_id=job.unified_id,
            canonical_name=job.canonical_name,
            source_url=job.source_url,
            local_image_url=None,
            status="failed",
            error=str(exc),
        )

    if not payload:
        return ImageResult(
            row_index=job.row_index,
            unified_id=job.unified_id,
            canonical_name=job.canonical_name,
            source_url=job.source_url,
            local_image_url=None,
            status="failed",
            error="empty response body",
        )

    destination = public_dir / f"{job.destination_stem}{extension}"
    destination.write_bytes(payload)
    return ImageResult(
        row_index=job.row_index,
        unified_id=job.unified_id,
        canonical_name=job.canonical_name,
        source_url=job.source_url,
        local_image_url=f"{public_path.rstrip('/')}/{destination.name}",
        status="downloaded",
        bytes=len(payload),
    )


def apply_results_to_rows(
    rows: list[dict[str, Any]],
    results: list[ImageResult],
    strict_local: bool,
) -> None:
    local_by_source_url = {
        result.source_url: result.local_image_url
        for result in results
        if result.local_image_url and is_remote_url(result.source_url)
    }
    failed_source_urls = {
        result.source_url
        for result in results
        if result.status == "failed" and is_remote_url(result.source_url)
    }
    for row in rows:
        image_url = str(row.get("image_url") or "").strip()
        if image_url in local_by_source_url:
            row["image_url"] = local_by_source_url[image_url]
        elif strict_local and image_url in failed_source_urls:
            row["image_url"] = ""

    for result in results:
        if result.local_image_url:
            rows[result.row_index]["image_url"] = result.local_image_url
        elif strict_local:
            rows[result.row_index]["image_url"] = ""


def sync_unified_racket_images(
    csv_path: Path = DEFAULT_CSV_PATH,
    json_path: Path = DEFAULT_JSON_PATH,
    public_dir: Path = DEFAULT_PUBLIC_DIR,
    public_path: str = "/racket-images",
    manifest_path: Path = DEFAULT_MANIFEST_PATH,
    workers: int = 8,
    timeout_seconds: int = 20,
    limit: int | None = None,
    force: bool = False,
    strict_local: bool = False,
    dry_run: bool = False,
) -> dict[str, Any]:
    if not csv_path.exists():
        raise FileNotFoundError(f"Unified CSV not found: {csv_path}")

    rows, fieldnames = read_csv_rows(csv_path)
    if "image_url" not in fieldnames:
        raise ValueError(f"CSV does not include an image_url column: {csv_path}")

    public_dir.mkdir(parents=True, exist_ok=True)
    jobs = build_jobs(rows, public_path, force)
    already_local_results = build_already_local_results(rows, public_path)
    if limit is not None:
        jobs = jobs[:limit]

    results: list[ImageResult] = []
    started_at = time.time()
    if not dry_run and jobs:
        with ThreadPoolExecutor(max_workers=max(1, workers)) as executor:
            futures = [
                executor.submit(download_one, job, public_dir, public_path, timeout_seconds, force)
                for job in jobs
            ]
            for future in as_completed(futures):
                results.append(future.result())
    else:
        results = [
            ImageResult(
                row_index=job.row_index,
                unified_id=job.unified_id,
                canonical_name=job.canonical_name,
                source_url=job.source_url,
                local_image_url=None,
                status="pending",
            )
            for job in jobs
        ]

    results.extend(already_local_results)
    results.sort(key=lambda result: result.row_index)
    if not dry_run:
        apply_results_to_rows(rows, results, strict_local)
        write_csv_rows(rows, fieldnames, csv_path)
        if json_path.exists():
            write_json_rows(rows, json_path)

    summary = {
        "csv_path": str(csv_path),
        "json_path": str(json_path),
        "public_dir": str(public_dir),
        "public_path": public_path,
        "total_rows": len(rows),
        "jobs": len(jobs),
        "already_local": sum(1 for result in results if result.status == "already_local"),
        "downloaded": sum(1 for result in results if result.status == "downloaded"),
        "reused": sum(1 for result in results if result.status == "reused"),
        "failed": sum(1 for result in results if result.status == "failed"),
        "strict_local": strict_local,
        "dry_run": dry_run,
        "elapsed_seconds": round(time.time() - started_at, 2),
        "results": [result.__dict__ for result in results],
    }
    if not dry_run:
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    return summary


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Download unified racket images into the Next.js public directory.")
    parser.add_argument("--csv", type=Path, default=DEFAULT_CSV_PATH, help="Unified rackets CSV path.")
    parser.add_argument("--json", type=Path, default=DEFAULT_JSON_PATH, help="Unified rackets JSON path.")
    parser.add_argument("--public-dir", type=Path, default=DEFAULT_PUBLIC_DIR, help="Destination directory for downloaded images.")
    parser.add_argument("--public-path", default="/racket-images", help="Public URL prefix used in image_url.")
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST_PATH, help="Download manifest path.")
    parser.add_argument("--workers", type=int, default=8, help="Concurrent download workers.")
    parser.add_argument("--timeout-seconds", type=int, default=20, help="Per-image timeout.")
    parser.add_argument("--limit", type=int, default=None, help="Limit downloads for testing.")
    parser.add_argument("--force", action="store_true", help="Redownload files even if a matching local file exists.")
    parser.add_argument("--strict-local", action="store_true", help="Blank image_url when an image cannot be downloaded.")
    parser.add_argument("--dry-run", action="store_true", help="List work without downloading or rewriting files.")
    parser.add_argument("--fail-on-error", action="store_true", help="Exit with code 1 when one or more downloads fail.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    summary = sync_unified_racket_images(
        csv_path=args.csv,
        json_path=args.json,
        public_dir=args.public_dir,
        public_path=args.public_path,
        manifest_path=args.manifest,
        workers=args.workers,
        timeout_seconds=args.timeout_seconds,
        limit=args.limit,
        force=args.force,
        strict_local=args.strict_local,
        dry_run=args.dry_run,
    )
    printable = {key: value for key, value in summary.items() if key != "results"}
    print(json.dumps(printable, ensure_ascii=False, indent=2))
    if args.fail_on_error and summary["failed"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
