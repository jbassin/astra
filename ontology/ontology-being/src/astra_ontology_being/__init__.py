"""astra-ontology-being — owns `being.kdl` + the generated `being.canonical.json`.

The data file is the source of truth; this package pins its path and delegates the
typed read to `astra_ontology`:

    from astra_ontology_being import load
    being = load()

`just ontology-gen` writes the JSON that TS (`@astra/ontology`) reads, and
`just ontology-check` fails when it is stale.
"""

from __future__ import annotations

from pathlib import Path

from astra_ontology import Being, load_being

# src/astra_ontology_being/__init__.py → ontology-being/{being.kdl, being.canonical.json}
_DATA_DIR = Path(__file__).resolve().parents[2]
BEING_KDL_PATH = (_DATA_DIR / "being.kdl").resolve()
CANONICAL_JSON_PATH = (_DATA_DIR / "being.canonical.json").resolve()


def load() -> Being:
    """Parse this package's `being.kdl` into the typed `Being`."""
    return load_being(BEING_KDL_PATH)
