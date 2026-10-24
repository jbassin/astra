"""Repo-wide pytest setup.

Point config's two data roots inside the tree under test, so pytest reads the same files
on a developer host as in CI and never the live data:

- ASTRA_DATA_ROOT (`data.root`, each service's own state paths) → this checkout.
- ASTRA_CONTENT_ROOT (`data.content-root`, the published datasets the bots commit to the
  astra-data repo) → the checked-in fixture `fixtures/astra-data`, a small slice laid out
  like astra-data. The code repo tracks none of the real datasets.

Set either variable yourself to test against other data.

It also imports the `dagster` library before collection. The code location directory
`dagster/` has no `__init__.py`, so pytest's importlib mode names its tests `dagster.tests.*`;
if the library is not imported yet, pytest imports that directory as a namespace package named
`dagster`, and every `dg.*` lookup in those tests fails (as `pytest dagster` alone did).

It loads observe's pytest plugin, so every test can take the `telemetry_capture` fixture
(in-memory spans, metrics and logs; see `astra_observe.testing`).
"""

import os
from pathlib import Path

import dagster  # noqa: F401 -- see the docstring: claims the name before pytest does

pytest_plugins = ["astra_observe.pytest_plugin"]

_ROOT = Path(__file__).resolve().parent
os.environ.setdefault("ASTRA_DATA_ROOT", str(_ROOT))
os.environ.setdefault("ASTRA_CONTENT_ROOT", str(_ROOT / "fixtures" / "astra-data"))
