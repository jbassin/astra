"""astra-ontology-entity — owns `entity.kdl` (the in-world noun registry).

The data file is the source of truth; this package pins its path and the three
committed seed sources, and delegates the typed model + seeding to `astra_ontology`:

    from astra_ontology_entity import ENTITY_KDL_PATH, load_entities
    entities = load_entities()
"""

from __future__ import annotations

from pathlib import Path

from astra_ontology import Entity, parse_entities

# src/astra_ontology_entity/__init__.py → ontology-entity/entity.kdl
_PKG_DIR = Path(__file__).resolve().parents[2]
ENTITY_KDL_PATH = (_PKG_DIR / "entity.kdl").resolve()

# Repo root: ontology-entity → ontology → <root>
_REPO_ROOT = _PKG_DIR.parents[1]
#: The committed akasha wiki snapshot (read as data, not imported).
SNAPSHOT_PATH = (
    _REPO_ROOT / "apps" / "akasha-backend" / "snapshot" / "akasha-snapshot.json"
).resolve()


def load_entities() -> list[Entity]:
    """Parse this package's `entity.kdl` into the typed entity list."""
    return parse_entities(ENTITY_KDL_PATH)
