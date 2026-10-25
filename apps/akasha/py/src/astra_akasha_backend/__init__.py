"""astra-akasha-backend — the akasha content store (0007).

Owns the SSOT setting corpus (full-vellum, under ``content/``), and the host-run
snapshot (``uv run akasha-snapshot``) that validates it (via the TS parser, a Node step)
and emits the build-time metadata index + page→page crossref edge list that akasha-frontend
builds the site from and mouthpiece-backend reads for grounding. The snapshot is
metadata-only.
"""

from __future__ import annotations

__all__ = ["__version__"]

__version__ = "0.0.0"
