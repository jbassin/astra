"""astra-ontology-entity — owns `entity.kdl` (the in-world noun registry).

The data file is the source of truth; its path and the akasha snapshot it seeds from
come from config (`data.entity-registry`, `data.akasha-snapshot`). This package
delegates the typed model + seeding to `astra_ontology`:

    from astra_ontology_entity import ENTITY_KDL_PATH, load_entities
    entities = load_entities()
"""

from __future__ import annotations

from pathlib import Path

from astra_config import load_config
from astra_ontology import Entity, parse_entities

_DATA = load_config().data
#: The entity registry (config `data.entity-registry`).
ENTITY_KDL_PATH = Path(_DATA.entity_registry)
#: The committed akasha wiki snapshot (read as data, not imported).
SNAPSHOT_PATH = Path(_DATA.akasha_snapshot) / "akasha-snapshot.json"


def load_entities() -> list[Entity]:
    """Parse the `entity.kdl` registry into the typed entity list."""
    return parse_entities(ENTITY_KDL_PATH)


# Imported last: resolve.py does `from . import load_entities`, so this must follow it.
from .resolve import reload_registry, resolve  # noqa: E402

__all__ = [
    "ENTITY_KDL_PATH",
    "SNAPSHOT_PATH",
    "load_entities",
    "reload_registry",
    "resolve",
]
