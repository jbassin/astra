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

from .extract import RangeBucket, SkipRecord, SpellFeatures

_TELEPORT_RE = re.compile(
    r"\bteleport|\bdimension door\b|\bplane shift\b|\btranslocat", re.IGNORECASE
)
_WALL_RE = re.compile(r"\bwall of\b|\bwall\b.{0,20}\bcreates?\b", re.IGNORECASE)
_SPELL_EFFECTS_RE = re.compile(r"Compendium\.pf2e\.spell-effects")
_SUMMON_TRAIT_RE = re.compile(r"^summon\s", re.IGNORECASE)

#: D30-22's beneficial-side target-prose signal ("self/touch/willing-or-ally
#: target prose"). "Hostile" qualifiers veto it outright.
_FRIENDLY_TARGET_RE = re.compile(r"\b(self|yourself|willing|ally|allies)\b", re.IGNORECASE)
_HOSTILE_TARGET_RE = re.compile(r"\b(enemy|enemies|unwilling|hostile creature)\b", re.IGNORECASE)
_PLAIN_CREATURE_COUNT_RE = re.compile(r"^\d+\s+creatures?$", re.IGNORECASE)

#: The four degree keys treated as "not a graduated degree-of-success outcome"
#: for D30-22's "all-unconditional degrees" test — `on-hit` (an attack-roll
#: spell's single hit branch) reads the same as `unconditional` here (neither
#: is a save-outcome ladder).
_NON_GRADUATED_DEGREES = frozenset({"unconditional", "on-hit"})


def _is_friendly_target(row: SpellFeatures) -> bool:
    """D30-22's beneficial target-prose test. **Engineer judgment (S1 build
    record):** the spec's literal "self/touch/willing-or-ally" wording is a
    strict substring match on none of Haste's real target text ("1
    creature", range 30 ft — no literal "willing"/"ally" word at all), yet
    Haste is a mandated-beneficial fixture. Resolved via PF2e's own design
    convention: a spell with NO save/attack-roll/prose-save/hostile-area
    signal (already ruled out by the caller before this runs) that targets a
    plain "N creature(s)" is, by construction, a cooperative buff — PF2e
    never ships an unconditional, ungated debuff on an arbitrary target.
    Touch/self range is the clean case; a hostile-qualified target ("each
    enemy", "unwilling creature") still vetoes it."""
    target = row.target_raw or ""
    if _HOSTILE_TARGET_RE.search(target):
        return False
    if row.range_bucket == RangeBucket.TOUCH_SELF:
        return True
    if _FRIENDLY_TARGET_RE.search(target):
        return True
    return bool(_PLAIN_CREATURE_COUNT_RE.match(target.strip()))


def classify_hostility(row: SpellFeatures) -> str:
    """D30-22 — per-ROW hostility routing (overlay variants can differ; each
    variant row carries its own `has_save`/`condition_instances`/etc., so no
    extra plumbing is needed beyond calling this per row).

    Hostile is checked FIRST and short-circuits: Belittling Boast's empty
    `range.value` string parses to `RangeBucket.TOUCH_SELF` (see
    `extract.parse_range`), which — if the beneficial check ran first —
    would wrongly read as "touch/self" beneficial targeting. Its
    `hostile_area_phrase` flag ("Each creature that becomes Frightened...")
    must win before the touch-self signal is ever consulted."""
    hostile_signal = (
        row.has_save or row.has_attack_trait or row.has_prose_save or row.hostile_area_phrase
    )
    if hostile_signal:
        return "hostile"

    all_unconditional = all(ci.degree in _NON_GRADUATED_DEGREES for ci in row.condition_instances)
    if all_unconditional and _is_friendly_target(row):
        return "beneficial"

    # Ambiguous bucket (review F13 gate-integrity guard): resolve toward
    # hostile only when a tiered condition sits at a real graduated degree
    # (some save-like structure exists even though no save/attack/prose-save
    # signal was found); otherwise this is a genuine "routing-ambiguous"
    # ledger case, named in the build record.
    any_tiered_conditional = any(
        ci.tier is not None and ci.degree not in _NON_GRADUATED_DEGREES
        for ci in row.condition_instances
    )
    return "hostile" if any_tiered_conditional else "ambiguous"


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
        # D30-22: a tier-priceable condition instance exists, but tier
        # assignment alone no longer implies "route hostile" — the explicit
        # per-row hostility classification decides.
        hostility = classify_hostility(row)
        if hostility == "hostile":
            return None  # condition-only control spell — scored via Stage B
        if hostility == "beneficial":
            return "beneficial-effect"
        return "routing-ambiguous"
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
