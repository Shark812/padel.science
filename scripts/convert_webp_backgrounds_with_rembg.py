#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_INPUT_DIR = ROOT / "public" / "racket-images"
DEFAULT_SUMMARY_PATH = ROOT / "data" / "debug-images" / "webp_bg_conversion_summary.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Remove background from local .webp images using rembg and overwrite originals.",
    )
    parser.add_argument("--input-dir", type=Path, default=DEFAULT_INPUT_DIR)
    parser.add_argument("--summary-path", type=Path, default=DEFAULT_SUMMARY_PATH)
    parser.add_argument("--model", default="isnet-general-use")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument(
        "--skip-existing-alpha",
        action="store_true",
        help="Skip files that already contain an alpha channel.",
    )
    parser.add_argument("--webp-quality", type=int, default=82)
    parser.add_argument("--webp-alpha-quality", type=int, default=92)
    parser.add_argument("--webp-method", type=int, default=6)
    parser.add_argument("--lossless", action="store_true", help="Encode output WebP in lossless mode.")
    return parser.parse_args()


def has_alpha_channel(image: Any) -> bool:
    bands = image.getbands()
    return "A" in bands


def collect_webp_files(input_dir: Path, limit: int | None) -> list[Path]:
    files = sorted(path for path in input_dir.iterdir() if path.is_file() and path.suffix.lower() == ".webp")
    if limit is not None:
        files = files[:limit]
    return files


def main() -> None:
    args = parse_args()
    input_dir = args.input_dir.resolve()
    summary_path = args.summary_path.resolve()

    if not input_dir.exists():
        raise FileNotFoundError(f"Input directory not found: {input_dir}")

    from PIL import Image
    from rembg import new_session, remove

    files = collect_webp_files(input_dir, args.limit)
    if not files:
        summary = {
            "tool": "rembg",
            "model": args.model,
            "input_dir": str(input_dir),
            "requested_count": 0,
            "processed_count": 0,
            "skipped_count": 0,
            "error_count": 0,
            "errors": [],
            "webp_quality": args.webp_quality,
            "webp_alpha_quality": args.webp_alpha_quality,
            "webp_method": args.webp_method,
            "lossless": args.lossless,
        }
        summary_path.parent.mkdir(parents=True, exist_ok=True)
        summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return

    session = new_session(args.model)

    processed = 0
    skipped = 0
    errors: list[dict[str, str]] = []

    for index, src_path in enumerate(files, start=1):
        try:
            with Image.open(src_path) as source_image:
                source_rgba = source_image.convert("RGBA")
                if args.skip_existing_alpha and has_alpha_channel(source_image):
                    skipped += 1
                    continue

                removed = remove(source_rgba, session=session)
                if not isinstance(removed, Image.Image):
                    from io import BytesIO

                    removed = Image.open(BytesIO(removed)).convert("RGBA")
                else:
                    removed = removed.convert("RGBA")

                temp_path = src_path.with_suffix(".webp.tmp")
                removed.save(
                    temp_path,
                    format="WEBP",
                    quality=args.webp_quality,
                    alpha_quality=args.webp_alpha_quality,
                    lossless=args.lossless,
                    method=args.webp_method,
                )
                temp_path.replace(src_path)
                processed += 1

            if index == 1 or index % 25 == 0 or index == len(files):
                pct = int((index / len(files)) * 100)
                print(f"[webp-rembg] {index}/{len(files)} ({pct}%)")

        except Exception as exc:  # pragma: no cover
            errors.append({"file": src_path.name, "error": str(exc)})
            print(f"[webp-rembg] error on {src_path.name}: {exc}")

    summary = {
        "tool": "rembg",
        "model": args.model,
        "input_dir": str(input_dir),
        "requested_count": len(files),
        "processed_count": processed,
        "skipped_count": skipped,
        "error_count": len(errors),
        "errors": errors[:100],
        "webp_quality": args.webp_quality,
        "webp_alpha_quality": args.webp_alpha_quality,
        "webp_method": args.webp_method,
        "lossless": args.lossless,
    }
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
