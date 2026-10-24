"""assay — PF2e spell power scoring, the canonical homebrew spell store, and the book export.

Reads the codex Foundry spell-pack snapshot (read-only), prices damage and hybrid spells
against a pure-anchored damage ladder, and gives effect spells official comparables and a
rank range. See ``README.md`` for the commands and the specs behind them.
"""

from __future__ import annotations
