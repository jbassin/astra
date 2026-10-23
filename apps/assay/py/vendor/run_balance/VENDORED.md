# Vendored: run_balance

Vendored 2026-07-21 from https://github.com/jmnario/run_balance.git @ `efc8e310210a2577411c62ee95f09a58ef79f164`
(submodule `pf2e-spell-creator` from https://github.com/jmnario/pf2e-spell-creator.git @ `46e20a7c3e056e9fe1ce514fb9e55c11d3a224ae`,
inlined — `.git` dirs and `.gitmodules` stripped).

Contents: 176 homebrew 5e spells (`base_spells_5e/`, author Josh Bassin), their PF2e conversions
(`pf2e_converted_spells/`, converted 2026-05-17 by jmnario via the pf2e-spell-creator skill), the
conversion plan (`plan.md`), and the skill + reference tables themselves.

Vendored so assay can score the converted set (adapter: his bespoke schema → the Foundry `system`
shape `assay score` reads). Upstream edits do NOT flow here automatically — re-vendor deliberately.
