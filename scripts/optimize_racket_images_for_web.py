#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_IMAGES_DIR = ROOT / "public" / "racket-images"
DEFAULT_CSV_PATH = ROOT / "data" / "unified-rackets" / "unified-rackets.csv"
DEFAULT_JSON_PATH = ROOT / "data" / "unified-rackets" / "unified-rackets.json"
DEFAULT_PUBLIC_PATH = "/racket-images"
DEFAULT_SUMMARY_PATH = ROOT / "data" / "debug-images" / "webp_optimization_summary.json"
SOURCE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Convert local racket images to optimized WebP and update dataset paths.")
    parser.add_argument("--images-dir", type=Path, default=DEFAULT_IMAGES_DIR)
    parser.add_argument("--csv", type=Path, default=DEFAULT_CSV_PATH)
    parser.add_argument("--json", type=Path, default=DEFAULT_JSON_PATH)
    parser.add_argument("--public-path", default=DEFAULT_PUBLIC_PATH)
    parser.add_argument("--summary-path", type=Path, default=DEFAULT_SUMMARY_PATH)
    parser.add_argument("--quality", type=int, default=82)
    parser.add_argument("--alpha-quality", type=int, default=92)
    parser.add_argument("--method", type=int, default=6)
    parser.add_argument("--lossless", action="store_true", help="Use lossless WebP encoding.")
    parser.add_argument("--keep-originals", action="store_true", help="Do not delete original non-webp files.")
    parser.add_argument("--skip-existing-webp", action="store_true", help="Skip recompressing existing .webp files.")
    parser.add_argument("--limit", type=int, default=None)
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


def optimize_images(args: argparse.Namespace) -> dict[str, Any]:
    from PIL import Image

    images_dir = args.images_dir.resolve()
    csv_path = args.csv.resolve()
    json_path = args.json.resolve()
    summary_path = args.summary_path.resolve()
    public_path = args.public_path.rstrip("/")

    if not images_dir.exists():
        raise FileNotFoundError(f"Images directory not found: {images_dir}")
    if not csv_path.exists():
        raise FileNotFoundError(f"CSV not found: {csv_path}")

    files = sorted(
        path for path in images_dir.iterdir() if path.is_file() and path.suffix.lower() in SOURCE_EXTENSIONS
    )
    if args.limit is not None:
        files = files[: args.limit]

    mapping: dict[str, str] = {}
    converted = 0
    recompressed_webp = 0
    deleted_originals = 0
    skipped_webp = 0
    errors: list[dict[str, str]] = []

    for index, src_path in enumerate(files, start=1):
        src_ext = src_path.suffix.lower()
        target_path = src_path.with_suffix(".webp")
        source_url = f"{public_path}/{src_path.name}"
        target_url = f"{public_path}/{target_path.name}"

        if src_ext == ".webp" and args.skip_existing_webp:
            skipped_webp += 1
            mapping[source_url] = target_url
            continue

        try:
            with Image.open(src_path) as image:
                rgba = image.convert("RGBA")
                temp_path = target_path.with_suffix(".webp.tmp")
                rgba.save(
                    temp_path,
                    format="WEBP",
                    quality=args.quality,
                    alpha_quality=args.alpha_quality,
                    method=args.method,
                    lossless=args.lossless,
                )
                temp_path.replace(target_path)

            if src_ext == ".webp":
                recompressed_webp += 1
            else:
                converted += 1
                if not args.keep_originals and src_path.exists():
                    src_path.unlink()
                    deleted_originals += 1

            mapping[source_url] = target_url

        except Exception as exc:  # pragma: no cover
            errors.append({"file": src_path.name, "error": str(exc)})

        if index == 1 or index % 50 == 0 or index == len(files):
            pct = int((index / max(1, len(files))) * 100)
            print(f"[optimize-webp] {index}/{len(files)} ({pct}%)")

    rows, fieldnames = read_csv_rows(csv_path)
    if "image_url" not in fieldnames:
        raise ValueError(f"CSV does not include image_url column: {csv_path}")

    updated_rows = 0
    for row in rows:
        image_url = str(row.get("image_url") or "").strip()
        if image_url in mapping:
            new_url = mapping[image_url]
            if new_url != image_url:
                row["image_url"] = new_url
                updated_rows += 1

    write_csv_rows(rows, fieldnames, csv_path)
    if json_path.exists():
        write_json_rows(rows, json_path)

    total_bytes = sum(path.stat().st_size for path in images_dir.iterdir() if path.is_file())
    summary = {
        "images_dir": str(images_dir),
        "csv_path": str(csv_path),
        "json_path": str(json_path),
        "processed_files": len(files),
        "converted_non_webp_to_webp": converted,
        "recompressed_webp": recompressed_webp,
        "skipped_existing_webp": skipped_webp,
        "deleted_originals": deleted_originals,
        "updated_dataset_rows": updated_rows,
        "error_count": len(errors),
        "errors": errors[:100],
        "quality": args.quality,
        "alpha_quality": args.alpha_quality,
        "method": args.method,
        "lossless": args.lossless,
        "remaining_total_bytes": total_bytes,
        "remaining_total_mb": round(total_bytes / 1024 / 1024, 2),
    }
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    return summary


def main() -> None:
    args = parse_args()
    summary = optimize_images(args)
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
