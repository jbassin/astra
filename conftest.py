"""Repo-wide pytest setup.

Point config's two data roots inside the tree under test, so pytest reads the same files
on a developer host as in CI and never the live data:

- ASTRA_DATA_ROOT (`data.root`, each service's own state paths) → this checkout.
- ASTRA_CONTENT_ROOT (`data.content-root`, the published datasets the bots commit to the
  astra-data repo) → the checked-in fixture `fixtures/astra-data`, a small slice laid out
  like astra-data. The code repo tracks none of the real datasets.

Set either variable yourself to test against other data.
"""

import os
from pathlib import Path

_ROOT = Path(__file__).resolve().parent
os.environ.setdefault("ASTRA_DATA_ROOT", str(_ROOT))
os.environ.setdefault("ASTRA_CONTENT_ROOT", str(_ROOT / "fixtures" / "astra-data"))
