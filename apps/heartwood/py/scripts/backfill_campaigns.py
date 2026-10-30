"""Backfill each akasha page's `campaigns` frontmatter from heartwood's published history.

One-off: pages published before heartwood stamped `campaigns` carry none. Rules and the
replay are in `astra_heartwood.agent.campaign_backfill`. Run from a code checkout against
your own astra-data clone (it refuses to write into the live clone, config
`data.content-root`); the run records are read from config `heartwood.artifacts-path`. Do
not set `ASTRA_DATA_ROOT` or `ASTRA_CONTENT_ROOT` for this command: they move both paths.

    uv run python apps/heartwood/py/scripts/backfill_campaigns.py <astra-data-root> --dry-run
    uv run python apps/heartwood/py/scripts/backfill_campaigns.py <astra-data-root>

`--dry-run` reads only and prints the summary; it may point at the live clone. Running it
twice changes nothing the second time.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from astra_config import load_config
from astra_heartwood.agent.campaign_backfill import backfill


def main() -> int:
    cfg = load_config()
    parser = argparse.ArgumentParser(description="Backfill akasha pages' campaigns frontmatter.")
    parser.add_argument("root", type=Path, help="an astra-data clone (not the live one)")
    parser.add_argument(
        "--artifacts",
        type=Path,
        default=Path(cfg.heartwood.artifacts_path),
        help="heartwood run records (default: config heartwood.artifacts-path)",
    )
    parser.add_argument("--dry-run", action="store_true", help="print the summary, write nothing")
    args = parser.parse_args()
    try:
        report = backfill(
            args.root,
            args.artifacts,
            write=not args.dry_run,
            forbidden=Path(cfg.data.content_root),
        )
    except ValueError as exc:
        print(f"backfill-campaigns: {exc}", file=sys.stderr)
        return 2
    print("\n".join(report.lines()))
    verb = "would change" if args.dry_run else "changed"
    print(f"backfill-campaigns: {verb} {len(report.changed)} page(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
