"""Backfill the chronicle artifacts for every already-committed session (NLSpec 0019).

Generates `timeline/episodes/<date>.json` for each campaign-matched session (the 7
shows) via GLM-5.2, then builds `timeline/seasons.json`. Resumable: episode files that
already exist are skipped, so a re-run only fills gaps. Run from the repo root:

    uv run python apps/linguist/scripts/backfill_chronicle.py

This is the one-time S4 backfill; new sessions flow through the Dagster assets
automatically. Unmatched sessions (an older campaign outside the 7 shows) are skipped.
"""

from __future__ import annotations

import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from astra_linguist.chronicle import (
    EPISODES_DIR,
    SEASONS_PATH,
    TIMELINE_DIR,
    chronicle_inputs_hash,
    load_episode_entries,
    show_for_date,
)
from astra_linguist.chronicle_llm import build_chronicle, build_episode_entry
from astra_linguist.surface.surface import load_session

APP_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = APP_ROOT / "data"
WORKERS = 5


def _matched_dates() -> list[str]:
    """Every session that maps to one of the 7 shows, oldest first."""
    dates = [p.stem for p in DATA_DIR.glob("*.json") if not p.name.endswith(".candidates.json")]
    return sorted(d for d in dates if show_for_date(d) is not None)


def _summarize_one(date: str) -> tuple[str, str]:
    out = EPISODES_DIR / f"{date}.json"
    if out.exists():
        return date, "skip"
    transcript = load_session(DATA_DIR / f"{date}.json")
    entry = build_episode_entry(date, transcript)
    out.write_text(entry.model_dump_json(indent=2), encoding="utf-8")
    return date, entry.summary.title


def main() -> int:
    EPISODES_DIR.mkdir(parents=True, exist_ok=True)
    dates = _matched_dates()
    print(f"backfilling {len(dates)} matched session(s) with {WORKERS} workers…", flush=True)

    started = time.time()
    done = 0
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(_summarize_one, d): d for d in dates}
        for fut in as_completed(futures):
            date = futures[fut]
            try:
                _, title = fut.result()
            except Exception as exc:  # noqa: BLE001 — report + continue; re-run fills gaps
                print(f"  FAIL {date}: {exc}", file=sys.stderr, flush=True)
                continue
            done += 1
            print(f"  [{done}/{len(dates)}] {date}: {title}", flush=True)

    entries = load_episode_entries(EPISODES_DIR)
    print(f"episodes on disk: {len(entries)}; grouping seasons…", flush=True)
    chronicle = build_chronicle(entries)
    chronicle.inputs_hash = chronicle_inputs_hash(entries)
    TIMELINE_DIR.mkdir(parents=True, exist_ok=True)
    SEASONS_PATH.write_text(chronicle.model_dump_json(indent=2), encoding="utf-8")

    total_seasons = sum(len(s.seasons) for s in chronicle.shows)
    print(
        f"done in {time.time() - started:.0f}s — {len(chronicle.shows)} shows, "
        f"{total_seasons} seasons, {len(entries)} episodes → {SEASONS_PATH}",
        flush=True,
    )
    for sc in chronicle.shows:
        print(
            f"  {sc.name}: {len(sc.seasons)} season(s), "
            f"{sum(len(s.episode_dates) for s in sc.seasons)} episode(s)"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
