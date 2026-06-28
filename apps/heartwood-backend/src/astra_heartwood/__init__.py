"""heartwood-backend (0020) — the akasha setting-wiki maintainer.

Phase 2 is a **read-only extraction engine**: it ingests one linguist-corrected
transcript (faerrin-world only), filters out OOC/combat/play-by-play, extracts atomic
noun-facts, resolves each against the Phase-1 entity registry, and emits a structured
per-session facts artifact. No prose, no corpus writes, no review surface (Phases 3-5).

Spec: thoughts/astra/specs/0020-heartwood-phase2-extraction-spec.md
"""

from __future__ import annotations

__all__ = ["__version__"]

__version__ = "0.0.0"
