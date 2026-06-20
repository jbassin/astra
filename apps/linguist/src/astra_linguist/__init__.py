"""astra-linguist — transcript processing (0006), the largest pipeline subsystem.

Reads scribe's raw `script.json` and emits the formats downstream needs, as
Python Dagster assets (per-session partitions):
  - formatted_transcript : corrections + speaker-resolve + timestamps → Transcript
  - mouthpiece_context   : campaign-matched LLM context + shibboleth (→ 0008)
  - canonical_transcript : the line-numbered `NNNNNN\\t…` form (→ 0008 + 0011)
  - correction_candidates: a phonetic filter + dspy judge → reviewable defs.yaml edits

It owns *processing* only — wiki pages, auto-linking, and rendering are
akasha-frontend (D4). Speakers + campaigns come from ontology-being (G3).
"""

from __future__ import annotations

__all__ = ["__version__"]

__version__ = "0.0.0"
