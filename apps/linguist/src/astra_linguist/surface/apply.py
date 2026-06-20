"""Apply reviewed corrections back to `defs.yaml` (the G1 write-back).

    uv run python -m astra_linguist.surface.apply --candidates data/2026-6-8.candidates.json

Reads a surfacer candidates file (after you've triaged it in `review_tui --candidates`),
takes the **accepted `confirm`s** (`decision == "accept"`), and appends each `span` as a
mistranscription fragment under its canonical key in `defs.yaml` — idempotent, minimal-diff
(per G1: apply via CLI, then commit the `defs.yaml` change as a PR). Accepted `new` entities
aren't `defs.yaml` material (they belong in the lexicon/akasha corpus); accepted `reject`s
just affirm the judge. The human accept is the gate, so the confidence floor isn't applied.

Pure — no LLM, no network. The fragment/idempotency logic lives in `..corrections` and is
unit-tested there; this is the thin CLI + selection over the reviewed file.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from ..corrections import DEFS_PATH, add_correction
from .surface import load_candidates


def accepted_confirms(payload: dict) -> list[dict]:
    """The accepted `confirm` candidates from a reviewed surfacer payload."""
    return [
        r
        for r in payload.get("candidates", [])
        if r.get("decision") == "accept"
        and r.get("verdict") == "confirm"
        and r.get("suggested_canonical")
    ]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Apply accepted confirms back to defs.yaml (G1).")
    ap.add_argument(
        "--candidates", type=Path, required=True, help="a reviewed {date}.candidates.json"
    )
    ap.add_argument("--defs", type=Path, default=DEFS_PATH)
    args = ap.parse_args(argv)

    confirms = accepted_confirms(load_candidates(args.candidates))
    if not confirms:
        print("No accepted confirms to apply (triage with review_tui --candidates first).")
        return 0

    added = skipped = 0
    for r in confirms:
        canonical, span = str(r["suggested_canonical"]), str(r["span"])
        result = add_correction(canonical, span, args.defs)
        if result.added:
            print(f"  + {canonical}: add  - {result.fragment}   (from {span!r})")
            added += 1
        else:
            print(f"  · skip {span!r} → {canonical!r}: {result.reason}")
            skipped += 1
    print(f"\napplied {added}, skipped {skipped} → {args.defs}")
    if added:
        print("review the defs.yaml diff and commit it as a PR.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
