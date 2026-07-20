"""Round-2 full-population routing (spec 0030 D30-8) — classify every
extracted row/skip into a scored bucket or a typed unscored-ledger reason.

S1's extraction pass already separates "has a priceable mechanical signal"
(a ``SpellFeatures`` row) from "genuine extraction dead-end" (a
``SkipRecord``, reason string). This module does the round-2-specific work
D30-8 asks for on top of that split:

- **routes SpellFeatures rows** into damage-scoreable / condition-scoreable /
  beneficial-effect (D30-8i) / low-confidence, using only fields already on
  the row (no re-reading the snapshot);
- **sub-classifies the S1 "no-priceable-effect" skip catch-all** into
  summon / wall-terrain / teleport-utility / effect-item-payload / other —
  this DOES need the raw spell JSON (traits/description aren't on
  ``SkipRecord``), so it re-reads each skip's source file once, keyed off the
  ``file`` field S1 already carries.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

from .extract import SkipRecord, SpellFeatures

_TELEPORT_RE = re.compile(
    r"\bteleport|\bdimension door\b|\bplane shift\b|\btranslocat", re.IGNORECASE
)
_WALL_RE = re.compile(r"\bwall of\b|\bwall\b.{0,20}\bcreates?\b", re.IGNORECASE)
_SPELL_EFFECTS_RE = re.compile(r"Compendium\.pf2e\.spell-effects")
_SUMMON_TRAIT_RE = re.compile(r"^summon\s", re.IGNORECASE)


def classify_row(row: SpellFeatures) -> str | None:
    """None = scoreable as-is; otherwise a typed ledger reason.

    ``has_damage`` is checked BEFORE ``confidence`` — a real, hand-verified
    or structurally-extracted EV (manual-scaling's Force Barrage, an
    affliction-contaminated spell's genuine initial-hit damage) is still
    honestly scoreable even when the spell's CONDITION attribution is
    low-confidence; only a spell with NO damage leans entirely on its
    (possibly-unreliable) condition read, where low confidence must gate it."""
    has_damage = row.ev > 0.0
    if has_damage:
        return None  # pure / hybrid / recovered-damage / healing — scored directly
    if row.confidence == "low":
        return "low-confidence extraction"
    hostile_conditions = [ci for ci in row.condition_instances if ci.tier is not None]
    if hostile_conditions:
        return None  # condition-only control spell — scored via Stage B
    if row.condition_ref:
        # every instance is beneficial/non-control (D30-8i: buffs go to the
        # ledger — Stage B's coverage arithmetic is undefined for them).
        return "beneficial-effect"
    if row.status_modifiers:
        # a raw numeric status/circumstance modifier with no condition ref at
        # all — D30-5 restricts severity pricing to the condition-tier table,
        # so a bare modifier has no priced path.
        return "raw-modifier-only (not priced — D30-5 restricts severity to condition tiers)"
    return "no-priceable-effect"  # shouldn't occur (S1 would have skipped it)


def classify_unpriced_skip(data: dict, reason: str) -> str:
    """Sub-classify S1's catch-all skip reasons into the D30-8 typed ledger
    categories, using the raw spell JSON (traits/description)."""
    if "long-cast time" in reason:
        return "long-cast (out of combat-damage scope)"
    if "non-literal-inline-formula" in reason:
        return "non-literal formula (@item.rank arithmetic)"
    if "no-priceable-effect" not in reason:
        return "extraction edge case"

    sysd = data.get("system", {})
    traits_node = sysd.get("traits") or {}
    traits = [str(t) for t in (traits_node.get("value") or [])]
    name = str(data.get("name", ""))
    desc = str((sysd.get("description") or {}).get("value", "") or "")

    if name.lower().startswith("summon ") or any(_SUMMON_TRAIT_RE.match(t) for t in traits):
        return "summon"
    if _WALL_RE.search(name) or ("wall" in traits) or _WALL_RE.search(desc[:200]):
        return "wall/terrain"
    if _TELEPORT_RE.search(desc) or _TELEPORT_RE.search(name):
        return "teleport/utility"
    if _SPELL_EFFECTS_RE.search(desc):
        return "effect-item payload"
    return "utility/no-mechanical-payload"


@dataclass
class LedgerCounts:
    scored_damage: int = 0
    scored_condition: int = 0
    by_reason: dict[str, int] | None = None


def classify_skips(skipped: list[SkipRecord], spells_dir: Path) -> dict[str, str]:
    """skip.file -> typed reason, re-reading each source file at most once."""
    out: dict[str, str] = {}
    cache: dict[str, dict] = {}
    for s in skipped:
        if s.file not in cache:
            path = spells_dir / s.file
            try:
                cache[s.file] = json.loads(path.read_text(encoding="utf-8"))
            except OSError:
                cache[s.file] = {}
        out[f"{s.file}::{s.name}"] = classify_unpriced_skip(cache[s.file], s.reason)
    return out
