#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_INPUT_DIR = ROOT / "public" / "racket-images"
DEFAULT_OUTPUT_DIR = ROOT / "public" / "racket-images-bg-removed-batch-tool"
DEFAULT_TEMP_DIR = ROOT / "data" / "tmp" / "batch_bg_remover_input_png"
DEFAULT_SUMMARY_PATH = ROOT / "data" / "debug-images" / "batch_bg_remover_trial_summary.json"
DEFAULT_TOOL_PROCESSOR = ROOT / "tools" / "batch_bg_remover" / "src" / "bg_remover" / "processor.py"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run gohard-lab/batch_bg_remover on local images with separate output folder.",
    )
    parser.add_argument("--input-dir", type=Path, default=DEFAULT_INPUT_DIR)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--temp-dir", type=Path, default=DEFAULT_TEMP_DIR)
    parser.add_argument("--summary-path", type=Path, default=DEFAULT_SUMMARY_PATH)
    parser.add_argument("--tool-processor", type=Path, default=DEFAULT_TOOL_PROCESSOR)
    parser.add_argument(
        "--extensions",
        default=".webp",
        help="Comma-separated extensions to include (default: .webp).",
    )
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--keep-temp", action="store_true")
    return parser.parse_args()


def import_tool_processor(processor_path: Path):
    if not processor_path.exists():
        raise FileNotFoundError(f"Tool processor not found: {processor_path}")
    tool_root = processor_path.parent
    if str(tool_root) not in sys.path:
        sys.path.insert(0, str(tool_root))
    from processor import process_images  # type: ignore

    return process_images


def normalize_extensions(raw_extensions: str) -> set[str]:
    values = {value.strip().lower() for value in raw_extensions.split(",") if value.strip()}
    normalized = {value if value.startswith(".") else f".{value}" for value in values}
    return normalized or {".webp"}


def collect_images(input_dir: Path, extensions: set[str], limit: int | None) -> list[Path]:
    files = [
        path
        for path in sorted(input_dir.iterdir())
        if path.is_file() and path.suffix.lower() in extensions
    ]
    if limit is not None:
        files = files[:limit]
    return files


def convert_to_png_staging(source_images: list[Path], staging_dir: Path) -> list[Path]:
    from PIL import Image

    if staging_dir.exists():
        shutil.rmtree(staging_dir)
    staging_dir.mkdir(parents=True, exist_ok=True)

    staged: list[Path] = []
    for image_path in source_images:
        staged_path = staging_dir / f"{image_path.stem}.png"
        with Image.open(image_path) as image:
            image.convert("RGBA").save(staged_path, format="PNG")
        staged.append(staged_path)
    return staged


def main() -> None:
    args = parse_args()
    input_dir: Path = args.input_dir.resolve()
    output_dir: Path = args.output_dir.resolve()
    temp_dir: Path = args.temp_dir.resolve()
    summary_path: Path = args.summary_path.resolve()
    processor_path: Path = args.tool_processor.resolve()
    extensions = normalize_extensions(args.extensions)

    if not input_dir.exists():
        raise FileNotFoundError(f"Input directory not found: {input_dir}")

    process_images = import_tool_processor(processor_path)
    source_images = collect_images(input_dir, extensions, args.limit)
    if not source_images:
        raise RuntimeError(f"No matching files found in {input_dir} for {sorted(extensions)}")

    staged_images = convert_to_png_staging(source_images, temp_dir)

    progress_state = {"last_pct": -1}

    def progress_callback(current: int, total: int) -> None:
        pct = int((current / total) * 100)
        if pct // 5 != progress_state["last_pct"] // 5:
            progress_state["last_pct"] = pct
            print(f"[batch_bg_remover] {current}/{total} ({pct}%)")

    output_dir.mkdir(parents=True, exist_ok=True)
    success = process_images([str(temp_dir)], str(output_dir), progress_callback=progress_callback)

    if not success:
        raise RuntimeError("batch_bg_remover returned no processed files.")

    produced_png = sorted(output_dir.glob("*_rmbg.png"))
    expected_names = {f"{path.stem}_rmbg.png" for path in staged_images}
    produced_names = {path.name for path in produced_png}
    missing_outputs = sorted(expected_names - produced_names)

    summary: dict[str, Any] = {
        "tool": "gohard-lab/batch_bg_remover",
        "input_dir": str(input_dir),
        "output_dir": str(output_dir),
        "temp_dir": str(temp_dir),
        "extensions": sorted(extensions),
        "requested_count": len(source_images),
        "produced_count": len(produced_png),
        "missing_output_count": len(missing_outputs),
        "missing_outputs": missing_outputs[:200],
    }

    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))

    if not args.keep_temp and temp_dir.exists():
        shutil.rmtree(temp_dir)


if __name__ == "__main__":
    main()
