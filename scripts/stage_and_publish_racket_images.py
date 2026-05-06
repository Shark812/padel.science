#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import mimetypes
import shutil
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
DEFAULT_PUBLIC_PATH = "/racket-images"
DEFAULT_TEMP_ROOT = ROOT / "data" / "tmp" / "racket-image-staging"
DEFAULT_SUMMARY_PATH = ROOT / "data" / "debug-images" / "stage_publish_images_summary.json"
DEFAULT_CACHE_PATH = ROOT / "data" / "source-state" / "image_source_url_map.json"
USER_AGENT = "padel-portal-image-stage-publish/0.1"

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".bmp", ".tif", ".tiff"}
CONTENT_TYPE_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/avif": ".avif",
    "image/bmp": ".bmp",
    "image/tiff": ".tif",
}


@dataclass(frozen=True)
class DownloadItem:
    row_indices: list[int]
    unified_ids: list[str]
    source_url: str
    file_stem: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Download unified images into staging, remove background only when no alpha is present, "
            "optimize to WebP, then publish and update dataset paths."
        )
    )
    parser.add_argument("--csv", type=Path, default=DEFAULT_CSV_PATH)
    parser.add_argument("--json", type=Path, default=DEFAULT_JSON_PATH)
    parser.add_argument("--public-dir", type=Path, default=DEFAULT_PUBLIC_DIR)
    parser.add_argument("--public-path", default=DEFAULT_PUBLIC_PATH)
    parser.add_argument("--temp-root", type=Path, default=DEFAULT_TEMP_ROOT)
    parser.add_argument("--summary-path", type=Path, default=DEFAULT_SUMMARY_PATH)
    parser.add_argument("--cache-path", type=Path, default=DEFAULT_CACHE_PATH)
    parser.add_argument("--timeout-seconds", type=int, default=25)
    parser.add_argument("--quality", type=int, default=82)
    parser.add_argument("--alpha-quality", type=int, default=92)
    parser.add_argument("--method", type=int, default=6)
    parser.add_argument("--lossless", action="store_true")
    parser.add_argument("--model", default="isnet-general-use")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--keep-temp", action="store_true")
    return parser.parse_args()


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


def load_cache(cache_path: Path) -> dict[str, str]:
    if not cache_path.exists():
        return {}
    payload = json.loads(cache_path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        return {}
    return {str(key): str(value) for key, value in payload.items()}


def save_cache(cache_path: Path, mapping: dict[str, str]) -> None:
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(mapping, ensure_ascii=False, indent=2), encoding="utf-8")


def slugify(value: str, fallback: str) -> str:
    import re

    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    slug = re.sub(r"-{2,}", "-", slug)
    return (slug or fallback)[:80].strip("-") or fallback


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


def is_remote_url(value: str) -> bool:
    parsed = urlparse(value)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def local_file_exists_for_url(local_url: str, public_path: str, public_dir: Path) -> bool:
    if not local_url.startswith(f"{public_path.rstrip('/')}/"):
        return False
    filename = local_url.rsplit("/", 1)[-1]
    return (public_dir / filename).exists()


def build_download_items(
    rows: list[dict[str, Any]],
    cache: dict[str, str],
    public_path: str,
    public_dir: Path,
    limit: int | None,
) -> tuple[list[DownloadItem], dict[int, str], int, dict[str, str]]:
    # Returns: items_to_download, row_to_cached_local_url, remote_rows_count, source_to_local_reused
    items: list[DownloadItem] = []
    row_to_cached_local_url: dict[int, str] = {}
    source_to_local_reused: dict[str, str] = {}
    by_source_url: dict[str, DownloadItem] = {}
    remote_rows_count = 0

    for index, row in enumerate(rows):
        source_url = str(row.get("image_url") or "").strip()
        if not source_url or not is_remote_url(source_url):
            continue
        remote_rows_count += 1

        cached_local_url = cache.get(source_url)
        if cached_local_url and local_file_exists_for_url(cached_local_url, public_path, public_dir):
            row_to_cached_local_url[index] = cached_local_url
            continue

        unified_id = str(row.get("unified_id") or f"row-{index + 1}")
        canonical_name = str(row.get("canonical_name") or unified_id)
        url_hash = hashlib.sha1(source_url.encode("utf-8")).hexdigest()[:10]
        file_stem = f"{slugify(unified_id, f'row-{index + 1}')}-{slugify(canonical_name, unified_id)}-{url_hash}"
        existing_local_url = f"{public_path.rstrip('/')}/{file_stem}.webp"
        if local_file_exists_for_url(existing_local_url, public_path, public_dir):
            row_to_cached_local_url[index] = existing_local_url
            source_to_local_reused[source_url] = existing_local_url
            continue

        item = by_source_url.get(source_url)
        if item:
            item.row_indices.append(index)
            item.unified_ids.append(unified_id)
            continue

        by_source_url[source_url] = DownloadItem(
            row_indices=[index],
            unified_ids=[unified_id],
            source_url=source_url,
            file_stem=file_stem,
        )

    items = list(by_source_url.values())
    if limit is not None:
        items = items[:limit]
    return items, row_to_cached_local_url, remote_rows_count, source_to_local_reused


def has_meaningful_alpha(image: Any) -> bool:
    if "A" not in image.getbands():
        return False
    alpha = image.getchannel("A")
    low, high = alpha.getextrema()
    return low < 255 or high < 255


def stage_downloads(items: list[DownloadItem], raw_dir: Path, timeout_seconds: int) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    results: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []

    for idx, item in enumerate(items, start=1):
        request = Request(
            item.source_url,
            headers={
                "User-Agent": USER_AGENT,
                "Accept": "image/avif,image/webp,image/png,image/jpeg,image/svg+xml,image/*,*/*;q=0.8",
            },
        )
        try:
            with urlopen(request, timeout=timeout_seconds) as response:
                payload = response.read()
                content_type = response.headers.get("content-type")
                extension = source_extension(item.source_url) or extension_from_content_type(content_type)
            if not payload:
                raise RuntimeError("empty response body")

            raw_path = raw_dir / f"{item.file_stem}{extension}"
            raw_path.write_bytes(payload)
            results.append(
                {
                    "row_indices": item.row_indices,
                    "unified_ids": item.unified_ids,
                    "source_url": item.source_url,
                    "raw_path": str(raw_path),
                    "file_stem": item.file_stem,
                }
            )
        except (HTTPError, URLError, TimeoutError, OSError, RuntimeError) as exc:
            errors.append({"unified_id": ",".join(item.unified_ids), "source_url": item.source_url, "error": str(exc)})

        if idx == 1 or idx % 50 == 0 or idx == len(items):
            pct = int((idx / max(1, len(items))) * 100)
            print(f"[stage-download] {idx}/{len(items)} ({pct}%)")

    return results, errors


def process_and_publish(
    staged_items: list[dict[str, Any]],
    published_dir: Path,
    public_path: str,
    model: str,
    quality: int,
    alpha_quality: int,
    method: int,
    lossless: bool,
) -> tuple[dict[int, str], dict[str, int], list[dict[str, str]]]:
    from PIL import Image
    from rembg import new_session, remove

    published_dir.mkdir(parents=True, exist_ok=True)
    session = new_session(model)
    source_url_to_local_url: dict[str, str] = {}
    stats = {
        "alpha_passthrough": 0,
        "bg_removed": 0,
        "published": 0,
    }
    errors: list[dict[str, str]] = []

    for idx, item in enumerate(staged_items, start=1):
        raw_path = Path(item["raw_path"])
        row_indices = [int(value) for value in item["row_indices"]]
        file_stem = str(item["file_stem"])
        source_url = str(item["source_url"])
        try:
            with Image.open(raw_path) as source_image:
                source_rgba = source_image.convert("RGBA")
                if has_meaningful_alpha(source_image):
                    final_rgba = source_rgba
                    stats["alpha_passthrough"] += 1
                else:
                    removed = remove(source_rgba, session=session)
                    if not isinstance(removed, Image.Image):
                        from io import BytesIO

                        removed = Image.open(BytesIO(removed)).convert("RGBA")
                    final_rgba = removed.convert("RGBA")
                    stats["bg_removed"] += 1

                temp_path = published_dir / f"{file_stem}.webp.tmp"
                final_path = published_dir / f"{file_stem}.webp"
                final_rgba.save(
                    temp_path,
                    format="WEBP",
                    quality=quality,
                    alpha_quality=alpha_quality,
                    method=method,
                    lossless=lossless,
                )
                temp_path.replace(final_path)
                source_url_to_local_url[source_url] = f"{public_path.rstrip('/')}/{final_path.name}"
                stats["published"] += 1
        except Exception as exc:  # pragma: no cover
            errors.append(
                {
                    "unified_id": ",".join(str(value) for value in item["unified_ids"]),
                    "raw_path": str(raw_path),
                    "error": str(exc),
                }
            )

        if idx == 1 or idx % 50 == 0 or idx == len(staged_items):
            pct = int((idx / max(1, len(staged_items))) * 100)
            print(f"[process-publish] {idx}/{len(staged_items)} ({pct}%)")

    row_to_url: dict[int, str] = {}
    for item in staged_items:
        source_url = str(item["source_url"])
        local_url = source_url_to_local_url.get(source_url)
        if not local_url:
            continue
        for row_index in item["row_indices"]:
            row_to_url[int(row_index)] = local_url

    return row_to_url, stats, errors


def main() -> None:
    args = parse_args()
    csv_path = args.csv.resolve()
    json_path = args.json.resolve()
    public_dir = args.public_dir.resolve()
    temp_root = args.temp_root.resolve()
    summary_path = args.summary_path.resolve()
    cache_path = args.cache_path.resolve()
    public_path = args.public_path

    rows, fieldnames = read_csv_rows(csv_path)
    if "image_url" not in fieldnames:
        raise ValueError(f"CSV does not include image_url column: {csv_path}")

    cache = load_cache(cache_path)
    items, row_to_cached_local_url, remote_rows_count, source_to_local_reused = build_download_items(
        rows=rows,
        cache=cache,
        public_path=public_path,
        public_dir=public_dir,
        limit=args.limit,
    )
    raw_dir = temp_root / "raw"
    if temp_root.exists():
        shutil.rmtree(temp_root)
    raw_dir.mkdir(parents=True, exist_ok=True)

    download_results, download_errors = stage_downloads(items, raw_dir=raw_dir, timeout_seconds=args.timeout_seconds)

    if download_results:
        row_to_url, process_stats, process_errors = process_and_publish(
            staged_items=download_results,
            published_dir=public_dir,
            public_path=public_path,
            model=args.model,
            quality=args.quality,
            alpha_quality=args.alpha_quality,
            method=args.method,
            lossless=args.lossless,
        )
    else:
        row_to_url = {}
        process_stats = {"alpha_passthrough": 0, "bg_removed": 0, "published": 0}
        process_errors = []

    row_to_url.update(row_to_cached_local_url)

    updated_rows = 0
    for row_index, local_url in row_to_url.items():
        if rows[row_index].get("image_url") != local_url:
            rows[row_index]["image_url"] = local_url
            updated_rows += 1

    write_csv_rows(rows, fieldnames, csv_path)
    if json_path.exists():
        write_json_rows(rows, json_path)

    # Refresh cache from rows processed in this run.
    refreshed_cache = dict(cache)
    # Explicit cache updates for rows processed in this run.
    for item in download_results:
        source_url = str(item["source_url"])
        local_url = row_to_url.get(int(item["row_indices"][0]))
        if local_url:
            refreshed_cache[source_url] = local_url
    for item in items:
        if item.row_indices and int(item.row_indices[0]) in row_to_cached_local_url:
            refreshed_cache[item.source_url] = row_to_cached_local_url[int(item.row_indices[0])]
    refreshed_cache.update(source_to_local_reused)
    save_cache(cache_path, refreshed_cache)

    summary = {
        "csv_path": str(csv_path),
        "json_path": str(json_path),
        "public_dir": str(public_dir),
        "temp_root": str(temp_root),
        "remote_rows_seen": remote_rows_count,
        "cached_rows_reused": len(row_to_cached_local_url),
        "requested_downloads": len(items),
        "downloaded": len(download_results),
        "download_error_count": len(download_errors),
        "alpha_passthrough": process_stats["alpha_passthrough"],
        "bg_removed": process_stats["bg_removed"],
        "published": process_stats["published"],
        "publish_error_count": len(process_errors),
        "updated_dataset_rows": updated_rows,
        "cache_path": str(cache_path),
        "cache_size": len(refreshed_cache),
        "quality": args.quality,
        "alpha_quality": args.alpha_quality,
        "method": args.method,
        "lossless": args.lossless,
        "model": args.model,
        "download_errors": download_errors[:100],
        "publish_errors": process_errors[:100],
    }
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))

    if not args.keep_temp and temp_root.exists():
        shutil.rmtree(temp_root)


if __name__ == "__main__":
    main()
