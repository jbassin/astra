"""Regenerate the generated ontology artifacts (`just ontology-gen`, `just ontology-check`).

    uv run python scripts/ontology_gen.py           # rewrite every stale artifact
    uv run python scripts/ontology_gen.py --check   # write nothing; exit 1 if one is stale

The artifacts and their sources:
- `ontology/ontology-being/being.canonical.json` from `being.kdl`. Python is the one
  `being.kdl` parser; TS (`@astra/ontology`) reads only this JSON.
- `fixtures/astra-data/entity/entity.kdl`, the test fixture's entity registry, from the
  fixture akasha snapshot, `defs.kdl` and `being.kdl`. The real registry lives in the
  astra-data repo, and heartwood reseeds it there.
- `libs/ts/config/src/config.gen.ts`, the TS config schema (Zod), from the Pydantic config
  models (`astra_config.zodgen`). Pydantic is the one config schema.

This is a build tool, like `check_docs.py`: it sends no telemetry (the seed CLI,
`astra-ontology-entity-seed`, reports heartwood metrics; this does not).
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# The entity package reads its paths from config at import time, so point the content root
# at the checked-in fixture first. Only the fixture registry is generated in this repo.
os.environ["ASTRA_CONTENT_ROOT"] = str(ROOT / "fixtures" / "astra-data")

from astra_config import zodgen  # noqa: E402 -- after the content root is set
from astra_ontology import canonical_json  # noqa: E402 -- as above
from astra_ontology_being import CANONICAL_JSON_PATH, load  # noqa: E402 -- as above
from astra_ontology_entity import ENTITY_KDL_PATH  # noqa: E402 -- as above
from astra_ontology_entity.seed import build_registry  # noqa: E402 -- as above


def artifacts() -> list[tuple[Path, str]]:
    """Each generated artifact's path and the text its sources produce now."""
    return [
        (CANONICAL_JSON_PATH, canonical_json(load())),
        (ENTITY_KDL_PATH, build_registry()[1]),
        (ROOT / zodgen.OUTPUT, zodgen.generate()),
    ]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Regenerate the generated ontology artifacts.")
    ap.add_argument("--check", action="store_true", help="write nothing; exit 1 if stale")
    args = ap.parse_args(argv)

    stale = 0
    for path, text in artifacts():
        name = path.relative_to(ROOT) if path.is_relative_to(ROOT) else path
        current = path.read_text(encoding="utf-8") if path.exists() else None
        if current == text:
            print(f"up to date: {name}")
        elif args.check:
            stale += 1
            print(f"STALE: {name}", file=sys.stderr)
        else:
            path.write_text(text, encoding="utf-8")
            print(f"wrote: {name}")
    if stale:
        print("Run `just ontology-gen` and commit the result.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
