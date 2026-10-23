"""Repo-wide pytest setup.

Point config's data root at this checkout, so every data path in config.kdl resolves
inside the tree under test: the same files on a developer host as in CI, never the live
data root (`data.root` in config.kdl). Set ASTRA_DATA_ROOT yourself to test against
other data.
"""

import os
from pathlib import Path

os.environ.setdefault("ASTRA_DATA_ROOT", str(Path(__file__).resolve().parent))
