"""assay — quantitative spell power scoring for PF2e homebrew (0030 round 1).

Reads the codex Foundry spell-pack snapshot (read-only), extracts damage-axis
features per spell, fits a log-linear rank+facet budget model, and scores a
homebrew spell against it. See ``thoughts/shared/research/2026-07-19-assay-
spell-power-0030-thoughts.md`` for the locked design.
"""

from __future__ import annotations
