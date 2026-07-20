"""Spell-effect item join + rule extraction (spec 0030 D30-35, round 4).

Every main-list spell can reference a "Spell Effect: X" item (the Foundry
pf2e system's own mechanism for applying a spell's lasting rider — buffs,
resistances, speed changes, …) via an inline
``@UUID[Compendium.pf2e.spell-effects.Item.<Name>]`` markup token in its
``description``. Round 1-3 never looked at these tokens at all; round 4's
whole buff-population fix (D30-36) depends on joining them.

**The join** (re-derived, real corpus): 510 spell-effect items, unique names;
222 main-list spells carry >=1 ref in their base (non-heightened) description,
263 refs total, all 263 resolve by item name (0 unresolved) — see the build
record for the independent verification. 20 spells carry >1 DISTINCT ref
name (multi-effect merge, below).

**The rule extraction** turns an effect item's ``system.rules`` array into an
:class:`EffectProfile` — atoms (FlatModifier/TempHP/Resistance/Weakness/
BaseSpeed/DamageDice, by selector class) plus tags (every other rule key,
predicate-gated atoms that couldn't resolve, BattleForm's whole-profile
suppression). ``@item.level`` (and its sibling ``@spell.rank``) expressions
are always evaluated at the SPELL's own base rank — never the effect item's
own ``system.level.value`` field, which disagrees with the spell's rank on
29/263 real joined pairs (stale/heightened-variant effect items)."""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from typing import Any

# ---------------------------------------------------------------------------
# Ref discovery + the name index
# ---------------------------------------------------------------------------

#: Bracket-bounded, colon-tolerant (effect names read "Spell Effect: X") — a
#: naive `[\w -]+` character class matches ZERO of these (the colon kills it);
#: `[^\]]+` simply captures everything up to the closing bracket.
EFFECT_REF_RE = re.compile(r"@UUID\[Compendium\.pf2e\.spell-effects\.Item\.([^\]]+)\]")


def find_effect_refs(description_html: str) -> list[str]:
    """Every effect-item name referenced in this (already heightened-stripped)
    description, in corpus order, WITH duplicates (multi-ref merge decides
    what to do with repeats)."""
    return EFFECT_REF_RE.findall(description_html or "")


def build_effect_index(effect_docs: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """name -> raw effect item dict, over the whole spell-effects pack (510
    items, unique names — verified, real corpus)."""
    index: dict[str, dict[str, Any]] = {}
    for d in effect_docs:
        name = d.get("name")
        if name:
            index[name] = d
    return index


# ---------------------------------------------------------------------------
# Multi-effect merge (D30-35: "base-variant only") — 20 real spells carry >1
# distinct ref name. No single spec-pinned algorithm covers all 20 shapes;
# this is an engineer judgment call (build-record-documented, round-3 Haste
# precedent) built from the real 20-spell census:
#
# - an "Effect: X Immunity" marker sibling alongside a "Spell Effect: X" one
#   (Shield, Guidance) is dropped outright — not a mechanical variant;
# - a plain unqualified name ("X") sibling alongside qualified ones ("X
#   (Success)", "X (8 hours)", "X (3rd Rank)", …) is the base — degree-split
#   pairs keep the FAILURE-row per D30-35, and an unqualified sibling IS that
#   failure/default row (Draw Ire's "(Success)" bonus is additive-on-success,
#   the unqualified text is what applies otherwise); duration/rank-heightened
#   variants ("(8 hours)", "(24 hours)", "(3rd Rank)", "(9th level)") are
#   excluded from the base profile the same way;
# - with NO unqualified sibling, a set of "(Failure)"/"(Success)"/"(Critical
#   Failure)"/"(Critical Success)" qualified names keeps the FAILURE-labeled
#   one (preferring an exact "(Failure)" over a "(Failure or Critical
#   Failure)"-style compound over a bare "(Critical Failure)");
# - otherwise (no unqualified sibling, no degree label) it's a genuine
#   choice-of-N fan (Animal Form's 13 shapes, Dinosaur/Plant Form, Element
#   Embodied, Holy Host's 2 allies, Bone Flense's Damage/Reaction split) —
#   tagged, no chosen effect (profile suppressed for this spell, same
#   treatment as BattleForm).
# ---------------------------------------------------------------------------

_DEGREE_WORDS = ("critical failure", "failure", "critical success", "success")
_TRAILING_PAREN_RE = re.compile(r"\(([^)]*)\)\s*$")


@dataclass(frozen=True)
class EffectSelection:
    chosen_name: str | None
    dropped_names: list[str]
    merge_kind: str | None  # None | "degree-split" | "duration-or-rank-variant" |
    #                         "immunity-marker" | "choice-fan"


def _qualifier(name: str) -> str | None:
    m = _TRAILING_PAREN_RE.search(name)
    return m.group(1) if m else None


def _is_degree_qualifier(q: str) -> bool:
    ql = q.lower()
    return any(w in ql for w in _DEGREE_WORDS)


def _failure_preference(qualifier: str) -> int:
    ql = qualifier.lower()
    if ql == "failure":
        return 0
    if "failure" in ql and "critical" not in ql:
        return 1
    if "failure" in ql:
        return 2  # "critical failure" / "failure or critical failure"
    return 3  # a pure success-only qualifier


def select_effect_name(ref_names: list[str]) -> EffectSelection:
    unique = list(dict.fromkeys(ref_names))
    if len(unique) <= 1:
        return EffectSelection(unique[0] if unique else None, [], None)

    immunity = [n for n in unique if n.startswith("Effect: ") and n.endswith("Immunity")]
    non_immunity = [n for n in unique if n not in immunity]
    if immunity and len(non_immunity) == 1:
        return EffectSelection(non_immunity[0], immunity, "immunity-marker")
    if immunity and non_immunity:
        unique = non_immunity  # drop the marker(s), keep resolving the rest

    quals = {n: _qualifier(n) for n in unique}
    unqualified = [n for n in unique if quals[n] is None]
    degree_named = [n for n in unique if (q := quals[n]) and _is_degree_qualifier(q)]

    if unqualified:
        chosen = unqualified[0]
        dropped = [n for n in unique if n != chosen]
        kind = "degree-split" if degree_named else ("duration-or-rank-variant" if dropped else None)
        return EffectSelection(chosen, dropped, kind)

    if degree_named:
        chosen = sorted(degree_named, key=lambda n: (_failure_preference(quals[n] or ""), n))[0]
        return EffectSelection(chosen, [n for n in unique if n != chosen], "degree-split")

    return EffectSelection(None, unique, "choice-fan")


# ---------------------------------------------------------------------------
# `@item.level`/`@spell.rank` expression evaluation — always at the SPELL's
# base rank, never the effect item's own `system.level.value` (29/263 real
# joined pairs disagree).
# ---------------------------------------------------------------------------

#: Markers that mean "this value can only be resolved at Foundry runtime" —
#: `@actor.*` (a live actor's own derived stats), `@item.badge`/`@item.origin`
#: (runtime item-instance state), `@item.flags...rulesSelections` and the
#: mustache `{item|flags...}` template form (a player's own in-session
#: choice), `@weapon.*` (the wielded weapon at cast time).
_RUNTIME_MARKERS = ("@actor.", "@item.badge", "@item.origin", "@item.flags", "@weapon.", "{")

_SAFE_CHARSET_RE = re.compile(r"^[\w\s.,()+\-*/]+$")


def _gte(a: float, b: float) -> bool:
    return a >= b


def _lte(a: float, b: float) -> bool:
    return a <= b


def _gt(a: float, b: float) -> bool:
    return a > b


def _lt(a: float, b: float) -> bool:
    return a < b


def _btwn(a: float, lo: float, hi: float) -> bool:
    return lo <= a <= hi


def _ternary(cond: bool, a: float, b: float) -> float:
    return a if cond else b


def _when(cond: bool, val: float) -> tuple[bool, float]:
    return (cond, val)


def _match(*whens: tuple[bool, float]) -> float:
    for cond, val in whens:
        if cond:
            return val
    return 0.0


def _clamped(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


_SAFE_NAMESPACE: dict[str, Any] = {
    "gte": _gte,
    "lte": _lte,
    "gt": _gt,
    "lt": _lt,
    "btwn": _btwn,
    "ternary": _ternary,
    "when": _when,
    "match": _match,
    "floor": math.floor,
    "ceil": math.ceil,
    "clamped": _clamped,
    "max": max,
    "min": min,
}


def evaluate_at_base_rank(raw_value: Any, base_rank: int) -> tuple[float | None, bool]:
    """``(value, unresolved)``. A plain numeric value passes straight
    through; ``None`` (the one valueless real FlatModifier) returns
    ``(None, False)`` — absent, not unresolved; a formula string is evaluated
    at ``base_rank`` when it covers the ternary family (``ternary(gte(...),
    a, b)``) or the closed-form arithmetic family (``2*@item.level``,
    ``ceil(...)``, ``clamped(...)``, ``match(when(...), ...)``); a
    runtime-only shape flags ``unresolved=True``."""
    if isinstance(raw_value, bool):
        return (1.0 if raw_value else 0.0), False
    if isinstance(raw_value, (int, float)):
        return float(raw_value), False
    if raw_value is None:
        return None, False
    s = str(raw_value).strip()
    if not s:
        return None, False
    try:
        return float(s), False
    except ValueError:
        pass
    if any(marker in s for marker in _RUNTIME_MARKERS) or "rulesSelections" in s:
        return None, True
    substituted = s.replace("@item.level", str(base_rank)).replace("@spell.rank", str(base_rank))
    if "@" in substituted or "{" in substituted or "__" in substituted:
        return None, True
    if not _SAFE_CHARSET_RE.match(substituted):
        return None, True
    try:
        result = eval(substituted, {"__builtins__": {}}, dict(_SAFE_NAMESPACE))  # noqa: S307
    except Exception:
        return None, True
    if isinstance(result, (bool, tuple)):
        return None, True
    try:
        return float(result), False
    except (TypeError, ValueError):
        return None, True


# ---------------------------------------------------------------------------
# Predicate evaluation — level-family (`parent:level`/`item:level` gte/lte/
# gt/lt) resolved at base rank; anything else tags the atom `conditional`
# rather than emitting a valued atom (D30-35).
# ---------------------------------------------------------------------------

_LEVEL_PREDICATE_SUBJECTS = frozenset({"parent:level", "item:level", "self:level"})
_LEVEL_PREDICATE_OPS = {"gte": _gte, "lte": _lte, "gt": _gt, "lt": _lt}


def evaluate_predicate(predicate: list[Any] | None, base_rank: int) -> tuple[bool | None, bool]:
    """``(passes, is_level_family)``. Empty/absent predicate: ``(True,
    True)`` (trivially satisfied). A predicate list where EVERY entry is a
    single-key ``{op: [subject, threshold]}`` level-family comparison
    resolves to a real boolean, ``is_level_family=True``. Anything else
    (roll-option strings, ``{"or": [...]}`` compounds, non-level subjects)
    returns ``(None, False)`` — the caller tags the atom ``conditional``."""
    if not predicate:
        return True, True
    result = True
    for p in predicate:
        if not isinstance(p, dict) or len(p) != 1:
            return None, False
        op, args = next(iter(p.items()))
        if not isinstance(op, str) or op not in _LEVEL_PREDICATE_OPS:
            return None, False
        if not (isinstance(args, list) and len(args) == 2):
            return None, False
        subject, threshold = args
        if subject not in _LEVEL_PREDICATE_SUBJECTS or not isinstance(threshold, (int, float)):
            return None, False
        op_fn = _LEVEL_PREDICATE_OPS[op]
        result = result and op_fn(base_rank, threshold)
    return result, True


# ---------------------------------------------------------------------------
# Rule-key -> atom extraction. FlatModifier/TempHP/Resistance/Weakness/
# BaseSpeed/DamageDice are the "atom" families (D30-35's explicit list, plus
# DamageDice — a documented widening: a numeric per-strike damage rider is
# exactly as extractable as a FlatModifier, and without it several
# hostile-shaped effect-only spells — Bone Flense among them — would carry
# zero atoms at all and be indistinguishable from a true tag-only effect).
# Every other rule key becomes a bare `rule:<Key>` tag. BattleForm suppresses
# the WHOLE atom set for its effect (D30-35) and is tagged `battle-form`.
# ---------------------------------------------------------------------------

_ATOM_RULE_KEYS = frozenset(
    {"FlatModifier", "TempHP", "Resistance", "Weakness", "BaseSpeed", "DamageDice"}
)


def _selector_list(raw: Any) -> list[str]:
    """Fan out array selectors (71/333 FlatModifiers carry one) — a single
    rule entry with `selector: [a, b, c]` becomes one atom PER selector."""
    if raw is None:
        return ["(none)"]
    if isinstance(raw, list):
        return [str(v) for v in raw] or ["(none)"]
    return [str(raw)]


@dataclass(frozen=True)
class EffectProfile:
    effect_name: str
    base_rank: int
    atoms: dict[str, float] = field(default_factory=dict)
    tags: list[str] = field(default_factory=list)
    resistance_choice_of_energy: bool = False
    duration_class: str | None = None  # conditions.DurationClass value, structured (not prose)
    dropped_variant_names: list[str] = field(default_factory=list)
    merge_kind: str | None = None
    has_valueless_rule: bool = False


def _structured_duration_class(effect_doc: dict[str, Any]) -> str | None:
    """Structured duration (the effect ITEM's own `system.duration`, not
    prose) -> `conditions.DurationClass` value string. Mirrors
    `conditions.classify_duration`'s bucket boundaries against the numeric
    (value, unit) pair instead of parsing prose."""
    from .conditions import DurationClass  # noqa: PLC0415 — avoid a module cycle at import time

    duration = effect_doc.get("system", {}).get("duration") or {}
    unit = duration.get("unit")
    value = duration.get("value")
    if unit in (None, "unlimited", "encounter") or value in (None, ""):
        return DurationClass.LONG.value if unit in ("unlimited",) else DurationClass.INSTANT.value
    try:
        n = float(value)
    except (TypeError, ValueError):
        return None
    if unit == "rounds":
        return DurationClass.ROUND.value if n <= 1 else DurationClass.MINUTE.value
    if unit == "minutes":
        return DurationClass.MINUTE.value
    if unit in ("hours", "days"):
        return DurationClass.LONG.value
    return DurationClass.INSTANT.value


def build_effect_profile(
    effect_name: str, effect_doc: dict[str, Any], base_rank: int
) -> EffectProfile:
    rules = (effect_doc.get("system") or {}).get("rules") or []
    atoms: dict[str, float] = {}
    tags: list[str] = []
    resistance_choice = False
    has_valueless = False

    is_battle_form = any(r.get("key") == "BattleForm" for r in rules)
    if is_battle_form:
        return EffectProfile(
            effect_name=effect_name,
            base_rank=base_rank,
            atoms={},
            tags=["battle-form"],
            duration_class=_structured_duration_class(effect_doc),
        )

    for rule in rules:
        key = rule.get("key")
        if key not in _ATOM_RULE_KEYS:
            if key:
                tags.append(f"rule:{key}")
            continue

        predicate_ok, is_level_family = evaluate_predicate(rule.get("predicate"), base_rank)
        if is_level_family and predicate_ok is False:
            continue  # gated OFF at this base rank (mystic armor's saves atom @ r1)
        conditional = not is_level_family

        if key in ("Resistance", "Weakness"):
            type_field = rule.get("type")
            types = type_field if isinstance(type_field, list) else [type_field]
            value, unresolved = evaluate_at_base_rank(rule.get("value"), base_rank)
            for t in types:
                t_str = str(t) if t is not None else "untyped"
                if "{" in t_str:
                    resistance_choice = True
                    tags.append(f"resistance-choice-of-energy:{key.lower()}")
                    continue
                label = f"{key.lower()}:{t_str}"
                if unresolved:
                    tags.append(f"expr-unresolved:{label}")
                elif value is None:
                    has_valueless = True
                elif conditional:
                    tags.append(f"conditional:{label}")
                else:
                    atoms[label] = atoms.get(label, 0.0) + value
            continue

        if key == "BaseSpeed":
            selector = str(rule.get("selector") or "speed")
            value, unresolved = evaluate_at_base_rank(rule.get("value"), base_rank)
            label = f"speed:{selector}"
            if unresolved:
                tags.append(f"expr-unresolved:{label}")
            elif value is None:
                has_valueless = True
            elif conditional:
                tags.append(f"conditional:{label}")
            else:
                atoms[label] = atoms.get(label, 0.0) + value
            continue

        if key == "TempHP":
            value, unresolved = evaluate_at_base_rank(rule.get("value"), base_rank)
            label = "temp-hp"
            if unresolved:
                tags.append(f"expr-unresolved:{label}")
            elif value is None:
                has_valueless = True
            elif conditional:
                tags.append(f"conditional:{label}")
            else:
                atoms[label] = atoms.get(label, 0.0) + value
            continue

        if key == "DamageDice":
            selector = str(rule.get("selector") or "damage")
            # DamageDice usually adds a `diceNumber` (a dice-COUNT rider, not
            # a flat value) — evaluate the same expr family, at base rank.
            raw_dice = rule.get("diceNumber", rule.get("value"))
            value, unresolved = evaluate_at_base_rank(raw_dice, base_rank)
            label = f"damage-dice:{selector}"
            if unresolved:
                tags.append(f"expr-unresolved:{label}")
            elif value is None:
                has_valueless = True
            elif conditional:
                tags.append(f"conditional:{label}")
            else:
                atoms[label] = atoms.get(label, 0.0) + value
            continue

        # FlatModifier — the dominant rule (333 real instances: 253 int, 79
        # str-expr, 1 null). Array selectors fan out (71/333).
        for selector in _selector_list(rule.get("selector")):
            value, unresolved = evaluate_at_base_rank(rule.get("value"), base_rank)
            label = f"modifier:{selector}"
            if unresolved:
                tags.append(f"expr-unresolved:{label}")
            elif value is None:
                has_valueless = True
            elif conditional:
                tags.append(f"conditional:{label}")
            else:
                atoms[label] = atoms.get(label, 0.0) + value

    return EffectProfile(
        effect_name=effect_name,
        base_rank=base_rank,
        atoms=atoms,
        tags=sorted(set(tags)),
        resistance_choice_of_energy=resistance_choice,
        duration_class=_structured_duration_class(effect_doc),
        has_valueless_rule=has_valueless,
    )


def join_effects(
    description_html: str,
    base_rank: int,
    effect_index: dict[str, dict[str, Any]] | None,
) -> EffectProfile | None:
    """The full D30-35 join: find every effect ref in this (heightened-
    stripped) description, resolve the multi-effect merge, and build the
    chosen effect's profile. ``None`` when there's no ref at all, or the
    index wasn't supplied (tests running fixture-only)."""
    if not effect_index:
        return None
    refs = find_effect_refs(description_html)
    if not refs:
        return None
    selection = select_effect_name(refs)
    if selection.chosen_name is None:
        # A pure choice-fan (or an unresolvable multi-ref set) — no single
        # profile to build; still record the fact a join was attempted via a
        # dedicated tag-only, atom-less profile so callers can see it.
        return EffectProfile(
            effect_name=refs[0],
            base_rank=base_rank,
            tags=["effect-choice-fan"],
            dropped_variant_names=selection.dropped_names,
            merge_kind=selection.merge_kind,
        )
    effect_doc = effect_index.get(selection.chosen_name)
    if effect_doc is None:
        return EffectProfile(
            effect_name=selection.chosen_name,
            base_rank=base_rank,
            tags=["effect-ref-unresolved"],
        )
    profile = build_effect_profile(selection.chosen_name, effect_doc, base_rank)
    if selection.dropped_names:
        return EffectProfile(
            effect_name=profile.effect_name,
            base_rank=profile.base_rank,
            atoms=profile.atoms,
            tags=profile.tags,
            resistance_choice_of_energy=profile.resistance_choice_of_energy,
            duration_class=profile.duration_class,
            dropped_variant_names=selection.dropped_names,
            merge_kind=selection.merge_kind,
            has_valueless_rule=profile.has_valueless_rule,
        )
    return profile
