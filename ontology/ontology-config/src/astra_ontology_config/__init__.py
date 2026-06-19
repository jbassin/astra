"""astra-ontology-config — owns `config.kdl`, the consolidated astra config inventory.

The data file is the source of truth; this package just pins its path and delegates
loading to `astra_config`. Every py subsystem reads config via:

    from astra_ontology_config import load
    cfg = load()
"""

from __future__ import annotations

from pathlib import Path

from astra_config import Config, load_config

# src/astra_ontology_config/__init__.py → ontology-config/config.kdl
CONFIG_KDL_PATH = (Path(__file__).resolve().parents[2] / "config.kdl").resolve()


def load() -> Config:
    """Parse this package's `config.kdl` into the typed `Config`."""
    return load_config(CONFIG_KDL_PATH)
