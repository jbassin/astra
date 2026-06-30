"""Seed / regen `entity.kdl` from the three committed sources (host-run, idempotent).

    uv run python -m astra_ontology_entity.seed          # regen entity.kdl (merge-safe)
    uv run python -m astra_ontology_entity.seed --check   # CI drift check (no write)

Sources: the akasha wiki snapshot ∪ the `defs.kdl` correction vocabulary ∪ the faerrin
player-characters in ontology-being. Re-seed is a non-clobbering merge — a curated
(`source=manual`) entity is never overwritten. Telemetry is wired from day one
(`astra.heartwood`); a host run may not reach the in-cluster collector (non-blocking).
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter

from astra_lexicon import load_defs
from astra_observe import get_logger, get_meter, init_telemetry, shutdown
from astra_ontology import (
    Entity,
    merge_seed,
    parse_entities,
    seed_entities,
    serialize_entities,
)
from astra_ontology_being import load

from . import ENTITY_KDL_PATH, SNAPSHOT_PATH


def build_registry() -> tuple[list[Entity], str]:
    """Seed from the committed sources, merge over any existing curated registry, and
    return the (entities, serialized KDL). Does not write."""
    snapshot = json.loads(SNAPSHOT_PATH.read_text(encoding="utf-8"))
    fresh = seed_entities(snapshot, load_defs(), load())
    existing = parse_entities(ENTITY_KDL_PATH) if ENTITY_KDL_PATH.exists() else []
    merged = merge_seed(fresh, existing)
    # serialize_entities sorts; re-parse the sorted text so the summary matches the file.
    text = serialize_entities(merged)
    return merged, text


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Seed/regen the entity.kdl registry.")
    ap.add_argument("--check", action="store_true", help="drift check only (exit 1 if stale)")
    args = ap.parse_args(argv)

    init_telemetry("astra.heartwood")
    try:
        log = get_logger("astra.heartwood")
        meter = get_meter("astra.heartwood")

        entities, text = build_registry()
        by_kind = Counter(e.kind for e in entities)
        linked = sum(1 for e in entities if e.page is not None)
        unlinked = len(entities) - linked

        seeded = meter.create_counter(
            "astra.heartwood.entities_seeded", description="entities seeded"
        )
        for kind, n in by_kind.items():
            seeded.add(n, {"kind": str(kind)})
        meter.create_counter("astra.heartwood.pages_linked").add(linked)
        meter.create_counter("astra.heartwood.pages_unlinked").add(unlinked)

        summary = ", ".join(
            f"{k or 'unclassified'}={n}" for k, n in sorted(by_kind.items(), key=str)
        )
        log.info(
            "entity registry: %d entities (%s); %d linked / %d unlinked",
            len(entities),
            summary,
            linked,
            unlinked,
        )
        print(f"entity.kdl: {len(entities)} entities — {summary}")
        print(f"  pages: {linked} linked, {unlinked} unlinked")

        if args.check:
            current = (
                ENTITY_KDL_PATH.read_text(encoding="utf-8") if ENTITY_KDL_PATH.exists() else ""
            )
            if current != text:
                print(
                    "DRIFT: entity.kdl is stale vs a fresh seed — run the seed + commit.",
                    file=sys.stderr,
                )
                return 1
            print("entity.kdl is up to date.")
            return 0

        ENTITY_KDL_PATH.write_text(text, encoding="utf-8")
        print(f"wrote {ENTITY_KDL_PATH}")
        return 0
    finally:
        shutdown()  # console_script exit → flush the run's spans/metrics/logs


if __name__ == "__main__":
    raise SystemExit(main())
