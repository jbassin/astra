"""Round-2 effect extraction (design doc / spec 0030 D30-2, D30-4, D30-5, D30-8b).

This module is the new core of round 2: turning spell `description` prose into
priced condition instances. It owns:

- the condition vocabulary + severity **tier table** (D30-5) — an implementation
  artifact, hand-curated from the PF2e Core Rulebook condition list against the
  real corpus census (``conditions_census.py``-style counts, see the S1 build
  record for per-condition n);
- **degree-section splitting** + the **four explicit attribution rules**
  (D30-2b, review-mandated: positional splitting alone mis-handles synesthesia/
  command/paralyze);
- **duration classification** (D30-2c / D30-8b) — prose first, `duration` field
  fallback;
- the **coverage arithmetic** (D30-4) — fixed outcome-probability weights, not
  fitted.

Everything here is prose-heuristic by nature (natural-language extraction from
HTML). Every instance/spell carries a ``Confidence`` — low confidence diverts a
spell to the unscored ledger (D30-2e) rather than silently mis-pricing.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import StrEnum

# ---------------------------------------------------------------------------
# Condition vocabulary + tier table (D30-5)
# ---------------------------------------------------------------------------


class Tier(StrEnum):
    T1 = "T1"  # minor
    T2 = "T2"  # moderate
    T3 = "T3"  # major
    T4 = "T4"  # fight-ending (incapacitation-gated)


#: Conditions excluded from the hostile-control tier table entirely — either a
#: pure buff/attitude marker (never priced as a hostile rider), an object-only
#: condition, or a damage-rider already carried elsewhere in the pipeline
#: (persistent damage is summed via `persistent_ev`, not a control condition).
BENEFICIAL_OR_NON_CONTROL = frozenset(
    {
        "Quickened",
        "Invisible",
        "Helpful",
        "Friendly",
        "Indifferent",
        "Unfriendly",
        "Observed",
        "Broken",
        "Persistent Damage",
    }
)

#: Flat (unvalued) tier assignments — condition name -> Tier. Names are the
#: bracket-bounded @UUID capture, title-cased as the corpus spells them.
_FLAT_TIER: dict[str, Tier] = {
    "Dazzled": Tier.T1,
    "Deafened": Tier.T1,
    "Fascinated": Tier.T1,
    "Hidden": Tier.T1,
    "Concealed": Tier.T1,
    "Fatigued": Tier.T1,
    "Encumbered": Tier.T1,
    "Wounded": Tier.T1,
    "Off-Guard": Tier.T2,
    "Prone": Tier.T2,
    "Grabbed": Tier.T2,
    "Undetected": Tier.T2,
    "Blinded": Tier.T3,
    "Confused": Tier.T3,
    "Fleeing": Tier.T3,
    "Immobilized": Tier.T3,
    "Restrained": Tier.T3,
    "Paralyzed": Tier.T4,
    "Unconscious": Tier.T4,
    "Controlled": Tier.T4,
    "Petrified": Tier.T4,
    "Dying": Tier.T4,
}

#: Valued conditions — value threshold -> Tier (a value at/above the threshold
#: gets that tier; thresholds checked highest-first). Unvalued refs to a
#: valued-typed condition default to value 1 (D30-2a).
_VALUED_TIER: dict[str, list[tuple[int, Tier]]] = {
    "Frightened": [(2, Tier.T3), (1, Tier.T2)],
    "Sickened": [(3, Tier.T3), (2, Tier.T2), (1, Tier.T1)],
    "Clumsy": [(2, Tier.T3), (1, Tier.T2)],
    "Enfeebled": [(2, Tier.T3), (1, Tier.T2)],
    "Stupefied": [(2, Tier.T3), (1, Tier.T2)],
    "Drained": [(2, Tier.T3), (1, Tier.T2)],
    "Stunned": [(3, Tier.T4), (1, Tier.T3)],
    "Slowed": [(2, Tier.T3), (1, Tier.T2)],  # Slowed 1 promoted to T3 if long-duration, see below
    "Doomed": [(2, Tier.T3), (1, Tier.T2)],
}

#: Within-tier prior offsets (D30-5: "a within-tier prior offset") — a modest
#: relative-severity multiplier applied on top of the tier base weight. 1.0 =
#: tier-typical; hand-judged, reviewed in the build record.
_WITHIN_TIER_OFFSET: dict[str, float] = {
    "Dazzled": 0.85,
    "Deafened": 0.9,
    "Fascinated": 1.1,
    "Hidden": 0.9,
    "Concealed": 0.85,
    "Fatigued": 0.85,
    "Encumbered": 0.8,
    "Wounded": 0.8,
    "Off-Guard": 0.85,
    "Prone": 1.0,
    "Grabbed": 1.05,
    "Undetected": 1.1,
    "Blinded": 1.15,
    "Confused": 1.2,
    "Fleeing": 0.95,
    "Immobilized": 1.0,
    "Restrained": 1.05,
    "Paralyzed": 1.15,
    "Unconscious": 1.05,
    "Controlled": 1.25,
    "Petrified": 1.2,
    "Dying": 1.0,
    "Frightened": 1.0,
    "Sickened": 1.0,
    "Clumsy": 0.95,
    "Enfeebled": 0.95,
    "Stupefied": 1.05,
    "Drained": 1.0,
    "Stunned": 1.1,
    "Slowed": 1.0,
    "Doomed": 1.0,
}


def condition_tier(name: str, value: int | None, duration: DurationClass) -> Tier | None:
    """Condition name (+ value, + owning duration class) -> Tier, or ``None``
    for a condition excluded from hostile pricing (D30-5/D30-8i)."""
    if name in BENEFICIAL_OR_NON_CONTROL:
        return None
    if name in _VALUED_TIER:
        v = value if value is not None else 1
        tier = Tier.T1
        for threshold, t in _VALUED_TIER[name]:
            if v >= threshold:
                tier = t
                break
        else:
            tier = _VALUED_TIER[name][-1][1]
        # Slowed 1 promoted T2->T3 at ~1-minute+ duration (spec tier sketch:
        # "slowed 1 ≥1 min" is T3; short Slowed 1 stays T2).
        if name == "Slowed" and v == 1 and duration in (DurationClass.MINUTE, DurationClass.LONG):
            tier = Tier.T3
        return tier
    return _FLAT_TIER.get(name)


def within_tier_offset(name: str) -> float:
    return _WITHIN_TIER_OFFSET.get(name, 1.0)


# ---------------------------------------------------------------------------
# Duration classification (D30-2c / D30-8b)
# ---------------------------------------------------------------------------


class DurationClass(StrEnum):
    INSTANT = "instant"  # instant/one-shot
    ROUND = "round"  # <=1 round
    MINUTE = "minute"  # ~1 min / sustained (the standard combat horizon)
    LONG = "long"  # hours+


#: D30-8b — declared constants, not fitted.
DURATION_FACTOR: dict[DurationClass, float] = {
    DurationClass.INSTANT: 0.5,
    DurationClass.ROUND: 0.6,
    DurationClass.MINUTE: 1.0,
    DurationClass.LONG: 1.2,
}

_ROUNDS_RE = re.compile(r"\bfor\s+(\d+)\s+rounds?\b", re.IGNORECASE)
_ONE_ROUND_RE = re.compile(r"\bfor\s+1\s+round\b", re.IGNORECASE)
_MINUTE_RE = re.compile(r"\b(\d+)?\s*minutes?\b", re.IGNORECASE)
_HOUR_DAY_RE = re.compile(
    r"\b(hours?|days?|permanently|until\s+(?:the\s+)?spell\s+ends)\b", re.IGNORECASE
)
_UNAFFECTED_RE = re.compile(r"\bunaffected\b", re.IGNORECASE)


def classify_duration(section_text: str, spell_duration_value: str) -> DurationClass:
    """Prose first (the owning degree section's own text), `duration` field
    fallback (D30-2c) — per-degree durations legitimately differ within one
    spell, so this is always evaluated per condition-instance, never once per
    spell."""
    text = section_text or ""
    if _HOUR_DAY_RE.search(text):
        return DurationClass.LONG
    if _MINUTE_RE.search(text) and "minute" in text.lower():
        # "1 minute" is the standard combat horizon; multi-minute prose is rare
        # in spell degree text and folds into the same bucket (no fitted
        # distinction below `long`'s hour+ threshold).
        return DurationClass.MINUTE
    if _ONE_ROUND_RE.search(text):
        return DurationClass.ROUND
    m = _ROUNDS_RE.search(text)
    if m:
        n = int(m.group(1))
        return DurationClass.ROUND if n <= 1 else DurationClass.MINUTE
    if "sustained" in text.lower():
        return DurationClass.MINUTE
    # No prose duration in this instance's own section — fall back to the
    # spell-level `duration.value` field (D30-2c).
    dv = (spell_duration_value or "").strip().lower()
    if not dv:
        return DurationClass.INSTANT
    if "round" in dv:
        return DurationClass.ROUND if "1 round" in dv else DurationClass.MINUTE
    if "minute" in dv:
        return DurationClass.MINUTE
    if any(w in dv for w in ("hour", "day", "permanent", "sustained")):
        return DurationClass.LONG if "sustained" not in dv else DurationClass.MINUTE
    return DurationClass.INSTANT


# ---------------------------------------------------------------------------
# Coverage arithmetic (D30-4) — fixed, not fitted.
# ---------------------------------------------------------------------------

#: Nominal outcome distribution vs an on-level moderate save.
OUTCOME_PROBABILITY = {
    "critical-failure": 0.10,
    "failure": 0.40,
    "success": 0.40,
    "critical-success": 0.10,
}

#: Severity scale, normalized to failure=1.0. crit-fail default 1.5 (2.0 for
#: explicit doubled/worsened text — detected by the caller and passed in).
_SEVERITY_SCALE = {
    "critical-failure": 1.5,
    "failure": 1.0,
    "success": 0.0,  # a plain "failure-only" effect has zero success-row weight
    "critical-success": 0.0,
}


def coverage_weight(degrees_present: frozenset[str], *, crit_fail_doubled: bool = False) -> float:
    """Σ P(outcome) × severity-scale(outcome) over the degrees at which the
    condition instance is actually applied (per D30-2's per-degree
    attribution — an instance only "covers" the degrees it was attributed to).
    fail-only ≈ 0.55 with the default crit-fail=1.5 severity."""
    scale = dict(_SEVERITY_SCALE)
    if crit_fail_doubled:
        scale["critical-failure"] = 2.0
    total = 0.0
    for degree in degrees_present:
        total += OUTCOME_PROBABILITY.get(degree, 0.0) * scale.get(degree, 1.0)
    return total


# ---------------------------------------------------------------------------
# Degree-section splitting + the four attribution rules (D30-2b)
# ---------------------------------------------------------------------------

_COND_UUID_RE = re.compile(
    r"@UUID\[Compendium\.pf2e\.conditionitems\.Item\.([^\]]+)\](?:\{([^}]+)\})?"
)
_DEGREE_HEADING_RE = re.compile(
    r"<strong>\s*(Critical Success|Success|Critical Failure|Failure)\s*</strong>",
    re.IGNORECASE,
)
_HEIGHTENED_SPLIT_RE = re.compile(r"<hr\s*/?>\s*<p>\s*<strong>\s*Heightened", re.IGNORECASE)
#: Affliction stage-progression blocks (poison/disease "Stage 1"/"Stage 2"
#: dosing, e.g. Swarming Wasp Stings) are NOT degree-of-success text — the
#: degree splitter's last section (Critical Failure) otherwise swallows every
#: stage's conditions as if they all applied simultaneously at one degree.
#: Not one of the four attribution rules (D30-2e uncovered shape) — truncate
#: before it and flag low confidence rather than mis-attribute.
_AFFLICTION_STAGE_RE = re.compile(r"<strong>\s*Stage\s+\d+\s*</strong>", re.IGNORECASE)
_AS_FAILURE_RE = re.compile(r"^\s*(?:<p>)?\s*As\s+failure\b", re.IGNORECASE)
_AFFECTED_RE = re.compile(r"\bis\s+affected\b|\baffected\s+for\b", re.IGNORECASE)
_STATUS_MOD_RE = re.compile(
    r"([+-]\s?\d+)\s*[- ](status|circumstance)\s+(penalty|bonus)\s+to\s+"
    r"([A-Za-z][A-Za-z '/]*?)(?=\s+for\s+\d|[.,<]|$)",
    re.IGNORECASE,
)

_DEGREE_ORDER = ("critical-success", "success", "failure", "critical-failure")
_LABEL_TO_KEY = {
    "Critical Success": "critical-success",
    "Success": "success",
    "Failure": "failure",
    "Critical Failure": "critical-failure",
}


def strip_heightened(description_html: str) -> str:
    """Base-text-only (D30-2e / the S1 hygiene rule) — the Heightened block is
    always excluded from extraction."""
    m = _HEIGHTENED_SPLIT_RE.search(description_html)
    return description_html[: m.start()] if m else description_html


@dataclass
class DegreeSections:
    preamble: str
    sections: dict[str, str]  # degree key -> section text, in corpus order


def split_degree_sections(base_text: str) -> DegreeSections:
    matches = list(_DEGREE_HEADING_RE.finditer(base_text))
    if not matches:
        return DegreeSections(preamble=base_text, sections={})
    preamble = base_text[: matches[0].start()]
    sections: dict[str, str] = {}
    for i, m in enumerate(matches):
        key = _LABEL_TO_KEY[m.group(1)]
        end = matches[i + 1].start() if i + 1 < len(matches) else len(base_text)
        # de-dup a repeated heading (shouldn't occur, but stay defensive) by
        # keeping the first occurrence's section.
        sections.setdefault(key, base_text[m.end() : end])
    return DegreeSections(preamble=preamble, sections=sections)


class AttributionRule(StrEnum):
    DIRECT = "direct"  # @UUID ref inside the degree's own section
    PREAMBLE = "preamble"  # rule (i)
    AS_FAILURE = "as-failure"  # rule (ii)
    PLAIN_REPEAT = "plain-repeat"  # rule (iii)
    DEFAULT_FAILURE = "default-failure"  # no degree markup, save exists
    DEFAULT_ON_HIT = "default-on-hit"  # no degree markup, attack-roll spell
    DEFAULT_UNCONDITIONAL = "default-unconditional"  # no degree markup, no save, no attack roll


@dataclass
class ConditionInstance:
    condition: str
    value: int | None
    degree: str  # one of _DEGREE_ORDER, or "on-hit" / "unconditional"
    duration: DurationClass
    rule: AttributionRule
    tier: Tier | None


@dataclass
class StatusModifier:
    delta: str
    kind: str  # "status" | "circumstance"
    direction: str  # "penalty" | "bonus"
    target_stat: str
    degree: str


@dataclass
class ExtractionResult:
    instances: list[ConditionInstance] = field(default_factory=list)
    modifiers: list[StatusModifier] = field(default_factory=list)
    low_confidence: bool = False
    notes: list[str] = field(default_factory=list)


def _find_direct_refs(text: str) -> list[tuple[str, int | None]]:
    out: list[tuple[str, int | None]] = []
    for m in _COND_UUID_RE.finditer(text):
        name = m.group(1)
        disp = m.group(2) or ""
        value = None
        vm = re.search(r"(\d+)\s*$", disp.strip())
        if vm:
            value = int(vm.group(1))
        out.append((name, value))
    return out


_PLAIN_NAME_RE_CACHE: dict[str, re.Pattern[str]] = {}


def _plain_mentions(text: str, name: str) -> bool:
    """A bare condition name in prose, NOT inside an @UUID tag (those are
    already captured by `_find_direct_refs`) — rule (iii)."""
    pattern = _PLAIN_NAME_RE_CACHE.get(name)
    if pattern is None:
        pattern = re.compile(rf"(?<!Item\.){re.escape(name)}\b")
        _PLAIN_NAME_RE_CACHE[name] = pattern
    # Strip UUID tags first so a display label like `{Frightened 2}` (which
    # legitimately contains the name) isn't double-counted as a plain repeat.
    stripped = _COND_UUID_RE.sub("", text)
    return bool(pattern.search(stripped))


def extract_condition_instances(
    description_html: str,
    *,
    spell_duration_value: str,
    has_save: bool,
    has_attack_trait: bool,
) -> ExtractionResult:
    """The D30-2b extraction pass — four explicit attribution rules over the
    degree-split base text (Heightened already excluded by the caller)."""
    result = ExtractionResult()
    base_text = description_html
    affliction_match = _AFFLICTION_STAGE_RE.search(base_text)
    if affliction_match:
        base_text = base_text[: affliction_match.start()]
        result.low_confidence = True
        result.notes.append(
            "affliction stage-progression block excluded — not covered by the "
            "four rules (D30-2e); the spell's true severity lives in the "
            "stage doses, unpriced by this pipeline"
        )
    ds = split_degree_sections(base_text)

    # Status/circumstance modifiers (D30-2d) are captured regardless of
    # degree-markup shape — run this before any early return.
    for m in _STATUS_MOD_RE.finditer(base_text):
        result.modifiers.append(
            StatusModifier(
                delta=m.group(1).replace(" ", ""),
                kind=m.group(2).lower(),
                direction=m.group(3).lower(),
                target_stat=m.group(4).strip(),
                degree="unknown",
            )
        )

    preamble_refs = _find_direct_refs(ds.preamble)

    if not ds.sections:
        # No degree markup: default-failure (save exists) / default-on-hit
        # (attack-roll spell) over refs found anywhere in the base text.
        refs = _find_direct_refs(base_text)
        if not refs:
            return result
        if has_save:
            degree, rule = "failure", AttributionRule.DEFAULT_FAILURE
        elif has_attack_trait:
            degree, rule = "on-hit", AttributionRule.DEFAULT_ON_HIT
        else:
            degree, rule = "unconditional", AttributionRule.DEFAULT_UNCONDITIONAL
        duration = classify_duration(base_text, spell_duration_value)
        for name, value in refs:
            result.instances.append(
                ConditionInstance(
                    condition=name,
                    value=value,
                    degree=degree,
                    duration=duration,
                    rule=rule,
                    tier=condition_tier(name, value, duration),
                )
            )
        return result

    # Track which conditions have been ref'd ANYWHERE in the spell (preamble +
    # every degree's direct refs) for rule (iii)'s "already ref'd elsewhere".
    all_direct_names: set[str] = {n for n, _ in preamble_refs}
    for sect_text in ds.sections.values():
        all_direct_names |= {n for n, _ in _find_direct_refs(sect_text)}

    seen_degrees: dict[str, list[ConditionInstance]] = {}

    for key in _DEGREE_ORDER:
        sect_text = ds.sections.get(key)
        if sect_text is None:
            continue
        instances: list[ConditionInstance] = []

        if _AS_FAILURE_RE.match(sect_text) and "failure" in seen_degrees:
            # Rule (ii): inherit the Failure set (relabeled to this degree),
            # plus this section's own additions.
            for inherited in seen_degrees["failure"]:
                instances.append(
                    ConditionInstance(
                        condition=inherited.condition,
                        value=inherited.value,
                        degree=key,
                        duration=inherited.duration,
                        rule=AttributionRule.AS_FAILURE,
                        tier=inherited.tier,
                    )
                )
            addl_text = _AS_FAILURE_RE.sub("", sect_text, count=1)
            for name, value in _find_direct_refs(addl_text):
                duration = classify_duration(sect_text, spell_duration_value)
                instances.append(
                    ConditionInstance(
                        condition=name,
                        value=value,
                        degree=key,
                        duration=duration,
                        rule=AttributionRule.AS_FAILURE,
                        tier=condition_tier(name, value, duration),
                    )
                )
        else:
            # Rule direct: @UUID refs inside this section.
            direct = _find_direct_refs(sect_text)
            direct_names_here = {n for n, _ in direct}
            duration = classify_duration(sect_text, spell_duration_value)
            for name, value in direct:
                instances.append(
                    ConditionInstance(
                        condition=name,
                        value=value,
                        degree=key,
                        duration=duration,
                        rule=AttributionRule.DIRECT,
                        tier=condition_tier(name, value, duration),
                    )
                )
            # Rule (i): preamble conditions apply at every degree whose
            # section text indicates the target is affected.
            if preamble_refs and _AFFECTED_RE.search(sect_text):
                for name, value in preamble_refs:
                    if name in direct_names_here:
                        continue  # already attributed directly this degree
                    instances.append(
                        ConditionInstance(
                            condition=name,
                            value=value,
                            degree=key,
                            duration=duration,
                            rule=AttributionRule.PREAMBLE,
                            tier=condition_tier(name, value, duration),
                        )
                    )
            # Rule (iii): plain-text repeat of a condition already ref'd
            # elsewhere in the spell (paralyze's crit-fail "Paralyzed for 4
            # rounds" carries no ref of its own).
            already_here = {i.condition for i in instances}
            for name in all_direct_names:
                if name in already_here:
                    continue
                if _plain_mentions(sect_text, name):
                    instances.append(
                        ConditionInstance(
                            condition=name,
                            value=None,
                            degree=key,
                            duration=duration,
                            rule=AttributionRule.PLAIN_REPEAT,
                            tier=condition_tier(name, None, duration),
                        )
                    )

        seen_degrees[key] = instances
        result.instances.extend(instances)

    # Anything referenced only in the preamble but never picked up by rule (i)
    # at any degree (no "is affected" phrasing anywhere) is deliberately left
    # unattributed — the review's command/Fleeing-Prone finding: preamble refs
    # describing OPTIONS, not applied effects, must NOT be priced.
    if preamble_refs and not any(i.rule == AttributionRule.PREAMBLE for i in result.instances):
        result.notes.append(
            "preamble condition refs present but never attributed to a degree "
            "(no 'is affected' phrasing) — treated as descriptive options, not "
            "applied effects, per the review's command precedent"
        )

    # D30-2e: a condition ref exists SOMEWHERE in the text but the four rules
    # produced zero instances AND no explanatory note (the command precedent
    # above always leaves a note when it deliberately declines to attribute a
    # preamble ref) — genuinely unhandled shape, not a deliberate exclusion.
    if _COND_UUID_RE.search(base_text) and not result.instances and not result.notes:
        result.low_confidence = True
        result.notes.append("condition ref present but unresolved by any of the four rules")

    return result
