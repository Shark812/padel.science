#!/usr/bin/env python3
from __future__ import annotations

import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = [
    ("scrape_padelreference.py", ["--lang", "en", "--outdir", str(ROOT / "data/padelreference-en-full")]),
    ("scrape_extreme_tennis.py", ["--outdir", str(ROOT / "data/extreme-tennis-en-full")]),
    ("scrape_padelful.py", ["--outdir", str(ROOT / "data/padelful-en-full")]),
    ("scrape_pala_hack.py", ["--outdir", str(ROOT / "data/pala-hack-en-full")]),
    ("scrape_padelzoom.py", ["--outdir", str(ROOT / "data/padelzoom-es-full")]),
    ("build_unified_rackets.py", ["--outdir", str(ROOT / "data/unified-rackets")]),
    ("download_racket_images.py", []),
]


def run_step(script_name: str, extra_args: list[str]) -> None:
    script_path = ROOT / "scripts" / script_name
    command = [sys.executable, str(script_path), *extra_args]
    print(f"\n=== Running {script_name} ===")
    subprocess.run(command, check=True, cwd=ROOT)


def main() -> None:
    for script_name, extra_args in SCRIPTS:
        run_step(script_name, extra_args)


if __name__ == "__main__":
    main()
