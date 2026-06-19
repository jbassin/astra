"""astra-akasha-backend — the akasha content store (0007).

Owns the SSOT setting corpus (full-vellum, under ``content/``), and the Dagster
snapshot asset that validates it (via the TS parser, a Node step) and emits the
build-time metadata index + page→page crossref edge list that akasha-frontend
(0011) builds the site from and mouthpiece-backend reads for grounding.

The one-shot faerrin-wiki→vellum converter is TS (``libs/ts/vellum-lang/scripts/
convert-wiki.ts``); the runtime asset here is Python (metadata-only, D2).
"""

from __future__ import annotations

__all__ = ["__version__"]

__version__ = "0.0.0"
