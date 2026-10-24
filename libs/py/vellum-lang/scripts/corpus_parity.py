"""Whole-corpus parity check (`just vellum-parity`, `just vellum-parity-live`).

The conformance corpus (`fixtures/vellum/`) pins both parsers to committed `.meta.json`
files. This check covers the content we actually ship: it runs the Python
`canonical_meta_json` and the TS `canonicalMetaJson` on every `.vellum` file under each
`--dir` and fails when any file's two strings differ.

    uv run python libs/py/vellum-lang/scripts/corpus_parity.py --dir <dir> [--dir <dir> ...]

The TS half is `libs/ts/vellum-lang/scripts/dump-meta.ts`, run once with node over the
whole file list. Run from the repo root (the just recipes do). Reads only.
"""

from __future__ import annotations

import argparse
import difflib
import json
import subprocess
import sys
from pathlib import Path

from astra_config import find_repo_root
from astra_vellum_lang import canonical_meta_json

_ROOT = find_repo_root(Path(__file__))
_NODE = [
    "node",
    "--import",
    str(_ROOT / "libs/ts/vellum-lang/node_modules/tsx/dist/loader.mjs"),
    str(_ROOT / "libs/ts/vellum-lang/scripts/dump-meta.ts"),
]
_MAX_DIFF_LINES = 40


def _vellum_files(dirs: list[Path]) -> list[Path]:
    files: list[Path] = []
    for d in dirs:
        if not d.is_dir():
            sys.exit(f"vellum-parity: {d} is not a directory")
        found = sorted(d.rglob("*.vellum"))
        if not found:
            sys.exit(f"vellum-parity: no .vellum files under {d}")
        files.extend(found)
    return files


def _ts_meta(files: list[Path]) -> dict[str, str]:
    proc = subprocess.run(
        _NODE,
        input=json.dumps([str(f) for f in files]),
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=False,
    )
    if proc.returncode != 0:
        sys.exit(f"vellum-parity: dump-meta.ts failed (exit {proc.returncode}):\n{proc.stderr}")
    return json.loads(proc.stdout)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Compare Python and TS vellum metadata on every .vellum file under --dir."
    )
    parser.add_argument("--dir", action="append", type=Path, required=True)
    args = parser.parse_args()

    files = _vellum_files(args.dir)
    ts = _ts_meta(files)
    divergent: list[Path] = []
    for f in files:
        py_json = canonical_meta_json(f.read_text(encoding="utf-8"))
        ts_json = ts.get(str(f))
        if py_json == ts_json:
            continue
        divergent.append(f)
        diff = difflib.unified_diff(
            (ts_json or "").splitlines(),
            py_json.splitlines(),
            fromfile="ts",
            tofile="py",
            lineterm="",
        )
        print(f"✖ {f}", file=sys.stderr)
        for line in list(diff)[:_MAX_DIFF_LINES]:
            print(f"    {line}", file=sys.stderr)

    dirs = ", ".join(str(d) for d in args.dir)
    print(f"vellum-parity: {len(files)} documents in {dirs}; {len(divergent)} divergent")
    return 1 if divergent else 0


if __name__ == "__main__":
    sys.exit(main())
