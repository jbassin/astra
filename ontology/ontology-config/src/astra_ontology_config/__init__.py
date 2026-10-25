"""astra-ontology-config — owns `config.kdl`, the consolidated astra config inventory.

The data file is the source of truth; this package pins its path next to the package and
delegates loading to `astra_config`:

    from astra_ontology_config import load
    cfg = load()

Most Python code calls `astra_config.load_config()` directly instead, which finds the same
file from the repo root. Both return the same `Config`.
"""

from __future__ import annotations

from pathlib import Path

from astra_config import Config, load_config

# src/astra_ontology_config/__init__.py → ontology-config/config.kdl
CONFIG_KDL_PATH = (Path(__file__).resolve().parents[2] / "config.kdl").resolve()


def load() -> Config:
    """Parse this package's `config.kdl` into the typed `Config`."""
    return load_config(CONFIG_KDL_PATH)
