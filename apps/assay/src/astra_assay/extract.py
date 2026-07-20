"""Per-spell feature extraction (design doc §1/§3, spec 0030 D30-2/D30-6) —
every extractor trap handled, round 1 AND round 2.

Reads one Foundry spell JSON (``system.*``) and produces either a
``SpellFeatures`` row (fit/score-eligible — damage-bearing, condition-control,
or both) or a ``SkipRecord`` (a genuine extraction dead-end, with a reason for
the report's skip ledger). Round-1 traps (damage-dict random-ID keys, dual
damage/healing ``kinds``, variable cast times, range-string parsing, flat
formulas, persistent/splash categories) are all still handled — see the
per-function docstrings. Round-2 additions (D30-2/D30-6):

- **Effect extraction** (D30-2): every spell's ``description`` is run through
  ``conditions.extract_condition_instances`` regardless of whether it has
  damage — a condition-only control spell now produces a ``SpellFeatures`` row
  with ``ev=0.0`` rather than a round-1 skip.
- **Overlay recovery** (D30-6a): ``system.overlays`` spells are no longer
  wholesale-excluded — each non-empty-``system`` overlay is deep-merged onto
  the base ``system`` and scored as its own variant row (``is_variant=True``).
  Overlay precedence beats every other recovery path.
- **Manual scaling family** (D30-6b): the mechanically-derived set of
  variable-cast-time + damage + no-overlay spells gets a hand-maintained
  per-action-count EV table, again expanded into variant rows.
- **Inline-@Damage recovery** (D30-6c): spells with no structured
  ``kinds: [damage]`` entry but literal ``@Damage[...]`` markup recover an EV
  from the inline tokens; ``@item.rank``-arithmetic tokens stay unscored.
"""

from __future__ import annotations

import json
import re
from enum import StrEnum
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from . import conditions
from .dice import parse_formula

#: Damage types treated as "rarely resisted" per the design doc §3 predictor —
#: force/spirit/mental/vitality/void, plus untyped/empty (no resistance keys off
#: these in the pf2e system).
RARE_DAMAGE_TYPES = frozenset({"force", "spirit", "mental", "vitality", "void", "untyped", ""})

#: Cast times bucketed as "long-cast" — excluded from the combat-damage fit when
#: they carry damage (§1 trap 4; census-verified: exactly 1 such spell, Bandit's
#: Doom, in the whole main-slot corpus — the doc's "likely ~0" prediction held).
LONG_CAST_TIMES = frozenset({"1 minute", "5 minutes", "10 minutes", "30 minutes", "1 hour"})

_CONDITION_UUID_RE = re.compile(r"@UUID\[Compendium\.pf2e\.conditionitems\.Item\.[^\]]+\]")
_MILE_RE = re.compile(r"^([\d,]+)\s*[\s-]*mile", re.IGNORECASE)
_LEADING_NUMBER_RE = re.compile(r"^([\d,]+)")
_EXACT_FEET_RE = re.compile(r"^[\d,]+\s*feet$")
#: One level of nested brackets — the corpus's inline shape is
#: ``@Damage[<formula>[<types>]]`` or ``...[<formula>[<types>]|opt:val]``.
_INLINE_DAMAGE_RE = re.compile(r"@Damage\[((?:[^\[\]]|\[[^\]]*\])*)\]")
#: A single ``@Damage[...]`` tag can pack MULTIPLE comma-separated
#: formula+type-list pairs, e.g. ``2d8[piercing],2d4[slashing]`` (one entry,
#: two damage components) — this finds each ``formula[types]`` pair, with
#: commas INSIDE a type-list bracket (``[persistent,bleed]``) correctly left
#: alone since they never start a new match.
_INLINE_FORMULA_COMPONENT_RE = re.compile(r"([^,\[\]]+)\[[^\]]*\]")
_TARGET_COUNT_RE = re.compile(r"\btarget(?:s)?\s+up\s+to\s+(\d+)\b", re.IGNORECASE)


def _parse_inline_token(tok: str) -> tuple[bool, float]:
    """One ``@Damage[...]`` capture group → (all-literal, summed EV) across
    its comma-separated ``formula[types]`` components. A trailing
    ``|options:...``/``|traits:...``/``|shortLabel`` suffix is stripped first."""
    body = tok.split("|")[0]
    total = 0.0
    matched_any = False
    for m in _INLINE_FORMULA_COMPONENT_RE.finditer(body):
        formula_part = m.group(1)
        if "@" in formula_part:
            return False, 0.0
        parsed = parse_formula(formula_part)
        if not parsed.ok:
            return False, 0.0
        total += parsed.ev
        matched_any = True
    return (True, total) if matched_any else (False, 0.0)


class DamageTypeClass(StrEnum):
    RARE = "rare"
    COMMON = "common"


class TargetingClass(StrEnum):
    ATTACK_ROLL = "attack-roll"
    AOE_SAVE = "aoe-save"
    SINGLE_TARGET_SAVE = "single-target-save"
    AUTO_HIT = "auto-hit"


class RangeBucket(StrEnum):
    TOUCH_SELF = "touch-self"
    LE30 = "le30"
    LE60 = "le60"
    LE120 = "le120"
    GT120 = "gt120"
    PLANETARY_UNLIMITED = "planetary-unlimited"
    VARIES = "varies"


class ActionBucket(StrEnum):
    ONE = "1"
    ONE_HALF = "1.5"
    TWO = "2"
    THREE = "3"
    REACTION = "reaction"


class EffectiveTarget(StrEnum):
    SINGLE = "single"
    SMALL_MULTI = "small-multi"
    PARTY_SCALE = "party-scale"


class ConditionInstanceOut(BaseModel):
    condition: str
    value: int | None
    degree: str
    duration: str
    rule: str
    tier: str | None


class StatusModifierOut(BaseModel):
    delta: str
    kind: str
    direction: str
    target_stat: str


class SpellFeatures(BaseModel):
    name: str
    source_id: str
    file: str
    rank: int
    is_cantrip: bool

    ev: float
    has_structured_damage: bool = False
    #: D30-8(ii) — this row's `ev` is a healing total, priced 1:1 against the
    #: damage budget (a declared assumption, always flagged downstream).
    is_healing: bool = False
    damage_types: list[str]
    damage_type_class: DamageTypeClass
    persistent_ev: float
    has_persistent: bool
    splash_ev: float
    has_splash: bool
    apply_mod_flag: bool

    targeting_class: TargetingClass
    has_attack_trait: bool
    has_save: bool
    save_basic: bool
    save_statistic: str | None
    defense_passive: bool

    area_type: str | None
    area_value_ft: float
    effective_target: EffectiveTarget = EffectiveTarget.SINGLE

    action_raw: str
    action_numeric: float | None
    action_bucket: ActionBucket
    action_flagged: bool

    range_raw: str
    range_feet: float | None
    range_bucket: RangeBucket
    range_flagged: bool

    #: True when ANY condition instance was extracted (round-1 boolean, kept
    #: for back-compat with the round-1 point-table facet name); the round-2
    #: structured detail lives in ``condition_instances``.
    condition_ref: bool
    condition_instances: list[ConditionInstanceOut] = []
    status_modifiers: list[StatusModifierOut] = []
    #: "high" | "low" — D30-2e: an extraction the four attribution rules
    #: couldn't confidently resolve diverts the spell to the ledger rather
    #: than silently mis-pricing.
    confidence: str = "high"

    sustained: bool
    has_duration: bool
    incapacitation: bool

    rarity: str
    rarity_flag: bool
    traditions: list[str]

    #: D30-6 recovery-path tag — None (plain structured damage / condition-only),
    #: "inline-damage", or "manual-scaling".
    recovery_path: str | None = None
    is_variant: bool = False
    variant_label: str | None = None
    parent_name: str | None = None

    # Heightening (interval-type only; degenerate `type: null` / `fixed`+empty-levels
    # and non-matching keys all collapse to None here) — used only by the V2 held-out
    # validation gate (project +k ranks, never a fit predictor).
    heightening_interval: int | None = None
    heightening_delta_ev: float | None = None


class SkipRecord(BaseModel):
    name: str
    source_id: str
    file: str
    reason: str


class ExtractResult(BaseModel):
    rows: list[SpellFeatures]
    skipped: list[SkipRecord]


def load_spell_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def normalize_action_time(raw: str) -> tuple[float | None, ActionBucket, bool]:
    """Cast-time string → (numeric action count or None for reaction, bucket, flagged)."""
    r = raw.strip()
    if r == "reaction":
        return None, ActionBucket.REACTION, False
    if r in ("1", "2", "3"):
        return float(r), ActionBucket(r), False
    if r == "1 to 3":
        return 2.0, ActionBucket.TWO, False
    if r == "2 or 3":
        return 2.0, ActionBucket.TWO, False
    if r == "1 or 2":
        return 1.5, ActionBucket.ONE_HALF, False
    if r == "2 to 2 rounds":
        # Malformed corpus value (§1 trap 4, ×3) — treat as a 2-action spell, flagged.
        return 2.0, ActionBucket.TWO, True
    # Unrecognized shape (shouldn't occur post long-cast exclusion, but stay defensive):
    # fall back to the 2-action bucket, flagged for the report.
    return None, ActionBucket.TWO, True


def _bucket_for_feet(feet: float) -> RangeBucket:
    if feet <= 30:
        return RangeBucket.LE30
    if feet <= 60:
        return RangeBucket.LE60
    if feet <= 120:
        return RangeBucket.LE120
    return RangeBucket.GT120


def parse_range(raw: str) -> tuple[float | None, RangeBucket, bool]:
    """Range string → (feet or None, bucket, flagged) — §1 trap 5."""
    r = raw.strip()
    if r in ("", "touch", "self"):
        return 0.0, RangeBucket.TOUCH_SELF, False
    if r in ("planetary", "unlimited"):
        return None, RangeBucket.PLANETARY_UNLIMITED, False
    if r in ("varies", "your Speed", "see text"):
        return None, RangeBucket.VARIES, True

    if _MILE_RE.match(r):
        # Mile-scale ranges dwarf the ≤120/>120 feet buckets — fold into the
        # planetary-unlimited bucket rather than a huge numeric outlier.
        return None, RangeBucket.PLANETARY_UNLIMITED, False

    m = _LEADING_NUMBER_RE.match(r)
    stripped = r.replace(",", "")
    if m and ("feet" in r or stripped.isdigit()):
        feet = float(m.group(1).replace(",", ""))
        flagged = not _EXACT_FEET_RE.match(r)  # trailing "(see text)", bare number, etc.
        return feet, _bucket_for_feet(feet), flagged

    # Genuinely unparseable (e.g. "emanation up to 40-feet") — flag, no numeric value.
    return None, RangeBucket.VARIES, True


def _classify_damage_types(entries: list[tuple[float, str]]) -> DamageTypeClass:
    rare_ev = sum(ev for ev, t in entries if t in RARE_DAMAGE_TYPES)
    common_ev = sum(ev for ev, t in entries if t not in RARE_DAMAGE_TYPES)
    return DamageTypeClass.RARE if rare_ev >= common_ev else DamageTypeClass.COMMON


def _classify_effective_target(
    area_type: str | None, area_value_ft: float, description: str
) -> EffectiveTarget:
    """D30-3's effective-target axis: {single, small-multi (small area / 2-3
    targets), party-scale (large area)}. Area-bearing spells split on a 15-ft
    radius/width heuristic (a 10-15ft burst hits a handful; 20ft+ hits a
    room); non-area spells split on an explicit "target up to N" count."""
    if area_type:
        return EffectiveTarget.SMALL_MULTI if area_value_ft <= 15 else EffectiveTarget.PARTY_SCALE
    m = _TARGET_COUNT_RE.search(description or "")
    if m:
        n = int(m.group(1))
        if n <= 1:
            return EffectiveTarget.SINGLE
        if n <= 3:
            return EffectiveTarget.SMALL_MULTI
        return EffectiveTarget.PARTY_SCALE
    return EffectiveTarget.SINGLE


def _is_summon(name: str, traits: list[str]) -> bool:
    """Summons are their own sub-model (out of round-2 scope, §3) — excluded
    from inline-damage recovery even when they carry literal @Damage tokens
    (a summoned creature's whole attack menu, not the spell's own EV)."""
    lname = name.lower()
    return lname.startswith("summon ") or "summon" in [t.lower() for t in traits]


def _deep_merge(base: Any, overlay: Any) -> Any:
    """D30-6a deep-merge-onto-base: overlay's dict-valued keys recurse into
    base's dict values; any other overlay value (incl. explicit ``null`` —
    e.g. Heal-vs-Living's ``defense: null``, a real override, distinct from
    key ABSENCE which means "inherit unchanged") replaces base's value
    wholesale."""
    if not isinstance(overlay, dict):
        return overlay
    result: dict[str, Any] = dict(base) if isinstance(base, dict) else {}
    for k, v in overlay.items():
        if isinstance(v, dict) and isinstance(result.get(k), dict):
            result[k] = _deep_merge(result[k], v)
        else:
            result[k] = v
    return result


def _overlay_variant_data(data: dict[str, Any]) -> list[tuple[dict[str, Any], str]]:
    """Every non-empty-``system`` overlay → (merged spell dict, variant label).
    Empty-``system`` overlays are flavor-only and skipped (D30-6a: 6 such)."""
    sysd = data.get("system", {})
    overlays = sysd.get("overlays") or {}
    base_name = data.get("name", "<unnamed>")
    out: list[tuple[dict[str, Any], str]] = []
    for i, oid in enumerate(sorted(overlays), start=1):
        entry = overlays[oid]
        entry_system = entry.get("system")
        if not entry_system:
            continue
        merged_system = _deep_merge(sysd, entry_system)
        merged_system.pop("overlays", None)
        label = entry.get("name") or f"{base_name} (variant {i})"
        merged_data = {**data, "name": label, "system": merged_system}
        out.append((merged_data, label))
    return out


#: D30-6b — the mechanically-derived scaling family (variable cast time +
#: damage + no overlays; re-derived at build, see the S1 report), keyed by
#: file stem (lowercase, no extension), value = {action count -> hand-verified
#: EV}. Zero-EV action counts (pure-buff casts, e.g. Ibex's Harvest at 1/2
#: actions) are simply omitted — they route to the ledger as beneficial/no
#: priceable-damage rows instead of a spurious log(0).
MANUAL_SCALING_TABLE: dict[str, dict[int, float]] = {
    # 1d4+1 force per shard, +1 shard per additional action (max 3) — the
    # round-1 wrong-sign outlier this table exists to fix.
    "force-barrage": {1: 3.5, 2: 7.0, 3: 10.5},
    # 1d6 at 1 action; 2d6 at 2 AND 3 actions (the 3rd action only extends
    # push/launch distance, not damage).
    "banishing-touch": {1: 3.5, 2: 7.0, 3: 7.0},
    # 1-/2-action modes are pure temp-HP buffs (0 damage, ledgered
    # separately); only the 3-action mode deals damage (2d8 mental, basic
    # Will, to one creature in the emanation while others get temp HP).
    "ibexs-harvest": {3: 9.0},
    # 5d10 mental at both offered action counts (1 or 3 — there is no 2-action
    # mode); the 1-action cast shifts the target's save one degree better,
    # a coverage effect this table does not model precisely (flagged
    # low-confidence).
    "channel-arrogance": {1: 27.5, 3: 27.5},
    # 5d8 slashing constant at 2 or 3 actions; the 3rd action turns it into a
    # 5-ft burst (target-count change, not damage change — see the
    # effective-target override below).
    "mutilate": {2: 22.5, 3: 22.5},
    # 4d6 piercing per target, constant at 2 or 3 actions; the 3rd action adds
    # a second target rather than more damage to one.
    "splinter-volley": {2: 14.0, 3: 14.0},
}

#: (stem, action count) -> effective-target override for the manual-scaling
#: table's 3-action variants that trade the extra action for MORE TARGETS
#: rather than more damage per target.
_MANUAL_SCALING_TARGET_OVERRIDE: dict[tuple[str, int], EffectiveTarget] = {
    ("mutilate", 3): EffectiveTarget.SMALL_MULTI,
    ("splinter-volley", 3): EffectiveTarget.SMALL_MULTI,
}

_ACTION_BUCKET_FOR_COUNT = {1: ActionBucket.ONE, 2: ActionBucket.TWO, 3: ActionBucket.THREE}


def extract_single(
    data: dict[str, Any],
    file: str,
    *,
    is_variant: bool = False,
    variant_label: str | None = None,
    parent_name: str | None = None,
) -> SpellFeatures | SkipRecord:
    """One (possibly overlay-merged) spell ``system`` dict → a row or a typed
    skip. This is the shared core; overlay/manual-scaling dispatch lives in
    ``extract_spell_variants``."""
    name = data.get("name", "<unnamed>")
    source_id = data.get("_id", "<no-id>")
    sysd = data.get("system", {})

    def skip(reason: str) -> SkipRecord:
        return SkipRecord(name=name, source_id=source_id, file=file, reason=reason)

    traits_node = sysd.get("traits") or {}
    traits = traits_node.get("value") or []
    is_cantrip = "cantrip" in traits

    damage = sysd.get("damage") or {}
    plain: list[tuple[float, str]] = []
    plain_keys: set[str] = set()
    persistent: list[tuple[float, str]] = []
    splash: list[tuple[float, str]] = []
    healing: list[tuple[float, str]] = []
    healing_keys: set[str] = set()
    apply_mod_flag = False
    rejected_reasons: list[str] = []

    for key, entry in damage.items():  # random-ID keys (§1 trap 1) — never index "0" directly
        kinds = entry.get("kinds") or []
        is_dmg = "damage" in kinds
        is_heal = "healing" in kinds
        if not is_dmg and not is_heal:
            continue
        parsed = parse_formula(entry.get("formula", ""))
        if not parsed.ok:
            rejected_reasons.append(parsed.reason or "unrecognized formula")
            continue
        ev = parsed.ev
        if entry.get("applyMod"):
            ev += 4.0  # §1 trap 6: applyMod → +4 flat, flagged
            apply_mod_flag = True
        dtype = entry.get("type") or "untyped"
        category = entry.get("category")
        if is_dmg:
            # A dual-kind entry (["damage","healing"], §1 trap 2) is an
            # UNRESOLVED base-template ambiguity — round 1's rule (count as
            # damage) still applies here; overlay variants resolve it to one
            # kind or the other before this loop ever runs (D30-6a).
            if category == "persistent":
                persistent.append((ev, dtype))
            elif category == "splash":
                splash.append((ev, dtype))
            else:
                plain.append((ev, dtype))
                plain_keys.add(key)
        elif is_heal:
            # A pure-healing entry (round-2 recovery, D30-8ii: healing prices
            # 1:1 against the damage budget) — heal/harm's per-variant
            # overlay resolution (D30-6a) is what makes this reachable; a raw
            # dual-kind entry never falls here (is_dmg already claimed it).
            healing.append((ev, dtype))
            healing_keys.add(key)

    has_structured_damage = bool(plain)
    healing_ev = sum(v for v, _ in healing)
    is_healing = bool(healing) and not plain

    time_raw = (sysd.get("time") or {}).get("value", "")
    is_long_cast = time_raw in LONG_CAST_TIMES

    description = (sysd.get("description") or {}).get("value", "") or ""
    base_text = conditions.strip_heightened(description)

    defense = sysd.get("defense") or {}
    save = defense.get("save")
    has_save = bool(save)
    save_basic = bool(has_save and save.get("basic"))
    save_statistic = save.get("statistic") if has_save else None
    defense_passive = bool(defense.get("passive"))
    has_attack_trait = "attack" in traits

    duration = sysd.get("duration") or {}
    duration_value = (duration.get("value") or "").strip()

    cres = conditions.extract_condition_instances(
        base_text,
        spell_duration_value=duration_value,
        has_save=has_save,
        has_attack_trait=has_attack_trait,
    )

    ev = 0.0
    recovery_path: str | None = None
    if plain:
        ev = sum(v for v, _ in plain)
    elif healing:
        # D30-8(ii): healing EV prices 1:1 against the damage budget (a
        # declared assumption, flagged on every such row in the ledger).
        ev = healing_ev
    elif not is_long_cast and not _is_summon(name, traits):
        # Inline-@Damage recovery (D30-6c) — only when there's no structured
        # plain-damage entry, and only for genuinely literal formulas.
        inline_tokens = _INLINE_DAMAGE_RE.findall(base_text)
        if inline_tokens:
            literal_evs = []
            all_literal = True
            for tok in inline_tokens:
                ok, tok_ev = _parse_inline_token(tok)
                if not ok:
                    all_literal = False
                    break
                literal_evs.append(tok_ev)
            if all_literal and literal_evs:
                ev = sum(literal_evs)
                recovery_path = "inline-damage"
            else:
                return skip("non-literal-inline-formula (@item.rank arithmetic)")

    persistent_ev = sum(v for v, _ in persistent)
    splash_ev = sum(v for v, _ in splash)
    damage_types = sorted({t for _, t in plain}) if plain else []
    damage_type_class = _classify_damage_types(plain) if plain else DamageTypeClass.COMMON

    has_priceable_damage = ev > 0.0
    has_conditions = bool(cres.instances)

    if is_long_cast and not has_conditions and not has_priceable_damage:
        return skip(f"long-cast time ({time_raw!r})")
    if not has_priceable_damage and not has_conditions and not cres.modifiers:
        if rejected_reasons:
            return skip("; ".join(sorted(set(rejected_reasons))))
        return skip("no-priceable-effect (no damage, no conditions, no modifiers)")

    if has_attack_trait:
        targeting_class = TargetingClass.ATTACK_ROLL
    elif has_save:
        area = sysd.get("area")
        targeting_class = TargetingClass.AOE_SAVE if area else TargetingClass.SINGLE_TARGET_SAVE
    else:
        targeting_class = TargetingClass.AUTO_HIT

    area = sysd.get("area")
    area_type = area.get("type") if area else None
    area_value_ft = float(area.get("value", 0)) if area else 0.0
    effective_target = _classify_effective_target(area_type, area_value_ft, description)

    action_numeric, action_bucket, action_flagged = normalize_action_time(time_raw)

    range_raw = (sysd.get("range") or {}).get("value", "")
    range_feet, range_bucket, range_flagged = parse_range(range_raw)

    sustained = bool(duration.get("sustained"))
    has_duration = bool(duration_value)

    incapacitation = "incapacitation" in traits
    rarity = traits_node.get("rarity", "common")
    rarity_flag = rarity != "common"
    traditions = traits_node.get("traditions") or []

    level = (sysd.get("level") or {}).get("value", 0)  # trust level.value over folder path

    heightening_interval, heightening_delta_ev = _extract_heightening(
        sysd, plain_keys | healing_keys
    )

    confidence = "low" if cres.low_confidence else "high"

    return SpellFeatures(
        name=name,
        source_id=source_id,
        file=file,
        rank=int(level),
        is_cantrip=is_cantrip,
        ev=ev,
        has_structured_damage=has_structured_damage,
        is_healing=is_healing,
        damage_types=damage_types,
        damage_type_class=damage_type_class,
        persistent_ev=persistent_ev,
        has_persistent=bool(persistent),
        splash_ev=splash_ev,
        has_splash=bool(splash),
        apply_mod_flag=apply_mod_flag,
        targeting_class=targeting_class,
        has_attack_trait=has_attack_trait,
        has_save=has_save,
        save_basic=save_basic,
        save_statistic=save_statistic,
        defense_passive=defense_passive,
        area_type=area_type,
        area_value_ft=area_value_ft,
        effective_target=effective_target,
        action_raw=time_raw,
        action_numeric=action_numeric,
        action_bucket=action_bucket,
        action_flagged=action_flagged,
        range_raw=range_raw,
        range_feet=range_feet,
        range_bucket=range_bucket,
        range_flagged=range_flagged,
        condition_ref=has_conditions,
        condition_instances=[
            ConditionInstanceOut(
                condition=i.condition,
                value=i.value,
                degree=i.degree,
                duration=i.duration.value,
                rule=i.rule.value,
                tier=i.tier.value if i.tier else None,
            )
            for i in cres.instances
        ],
        status_modifiers=[
            StatusModifierOut(
                delta=m.delta, kind=m.kind, direction=m.direction, target_stat=m.target_stat
            )
            for m in cres.modifiers
        ],
        confidence=confidence,
        sustained=sustained,
        has_duration=has_duration,
        incapacitation=incapacitation,
        rarity=rarity,
        rarity_flag=rarity_flag,
        traditions=list(traditions),
        recovery_path=recovery_path,
        is_variant=is_variant,
        variant_label=variant_label,
        parent_name=parent_name,
        heightening_interval=heightening_interval,
        heightening_delta_ev=heightening_delta_ev,
    )


def extract_spell(data: dict[str, Any], file: str) -> SpellFeatures | SkipRecord:
    """Single-result convenience wrapper (used by ``assay score`` and most
    round-1 tests): overlay spells score their FIRST non-empty variant;
    manual-scaling-family spells score their base extraction unmodified (a
    homebrew author scoring one JSON isn't casting per an action-count table).
    Population extraction (``extract_all``) uses ``extract_spell_variants``
    instead, which expands both recovery paths fully."""
    sysd = data.get("system", {})
    overlays = sysd.get("overlays") or {}
    if overlays:
        variants = _overlay_variant_data(data)
        if not variants:
            return SkipRecord(
                name=data.get("name", "<unnamed>"),
                source_id=data.get("_id", "<no-id>"),
                file=file,
                reason="overlay-all-flavor-only",
            )
        merged_data, label = variants[0]
        return extract_single(
            merged_data, file, is_variant=True, variant_label=label, parent_name=data.get("name")
        )
    return extract_single(data, file)


def extract_spell_variants(data: dict[str, Any], file: str) -> list[SpellFeatures | SkipRecord]:
    """Full population-aware dispatch (D30-6a/b): overlay spells expand to
    one row per non-empty variant (overlay precedence beats every other
    recovery path); manual-scaling-family spells expand to one row per
    hand-tabled action count; everything else is a single row/skip."""
    name = data.get("name", "<unnamed>")
    source_id = data.get("_id", "<no-id>")
    sysd = data.get("system", {})
    overlays = sysd.get("overlays") or {}

    if overlays:
        variants = _overlay_variant_data(data)
        if not variants:
            return [
                SkipRecord(
                    name=name, source_id=source_id, file=file, reason="overlay-all-flavor-only"
                )
            ]
        return [
            extract_single(
                merged_data, file, is_variant=True, variant_label=label, parent_name=name
            )
            for merged_data, label in variants
        ]

    stem = Path(file).stem.lower()
    if stem in MANUAL_SCALING_TABLE:
        base_result = extract_single(data, file)
        table = MANUAL_SCALING_TABLE[stem]
        out: list[SpellFeatures | SkipRecord] = []
        if isinstance(base_result, SkipRecord):
            # The hand table exists precisely because these 6 spells' base
            # extraction is structurally wrong (contaminated action bucket) —
            # a skip here means the base pass couldn't even find condition
            # refs; still emit the hand-tabled damage variants.
            base_result = None
        for action_count, ev in sorted(table.items()):
            label = f"{action_count} action" + ("s" if action_count != 1 else "")
            bucket = _ACTION_BUCKET_FOR_COUNT[action_count]
            target_override = _MANUAL_SCALING_TARGET_OVERRIDE.get((stem, action_count))
            if base_result is not None:
                updates: dict[str, Any] = {
                    "name": f"{name} ({label})",
                    "ev": ev,
                    "action_raw": str(action_count),
                    "action_numeric": float(action_count),
                    "action_bucket": bucket,
                    "action_flagged": False,
                    "is_variant": True,
                    "variant_label": label,
                    "parent_name": name,
                    "recovery_path": "manual-scaling",
                    "confidence": "low",
                }
                if target_override is not None:
                    updates["effective_target"] = target_override
                out.append(base_result.model_copy(update=updates))
            else:
                out.append(
                    SkipRecord(
                        name=f"{name} ({label})",
                        source_id=source_id,
                        file=file,
                        reason="manual-scaling-base-extraction-failed",
                    )
                )
        return out

    return [extract_single(data, file)]


def _extract_heightening(
    sysd: dict[str, Any], plain_keys: set[str]
) -> tuple[int | None, float | None]:
    """Interval-type heightening only; degenerate shapes (§1 trap: `type: null`,
    `fixed`+empty-levels) and non-damage-matching entries all collapse to
    ``(None, None)`` — the V2 validation gate skips those spells."""
    heightening = sysd.get("heightening") or {}
    if heightening.get("type") != "interval":
        return None, None
    interval = heightening.get("interval")
    damage_deltas = heightening.get("damage") or {}
    if not interval or not damage_deltas:
        return None, None
    total = 0.0
    matched = False
    for key, formula in damage_deltas.items():
        if key not in plain_keys:
            continue
        parsed = parse_formula(str(formula))
        if parsed.ok:
            total += parsed.ev
            matched = True
    if not matched:
        return None, None
    return int(interval), total


def extract_all(spells_dir: Path) -> ExtractResult:
    """Extract every main-slot spell JSON under ``spells_dir`` (population
    pass — uses ``extract_spell_variants``, so overlay/manual-scaling spells
    contribute multiple rows)."""
    from .snapshot import iter_spell_files

    rows: list[SpellFeatures] = []
    skipped: list[SkipRecord] = []
    for path in iter_spell_files(spells_dir):
        data = load_spell_json(path)
        rel = str(path.relative_to(spells_dir))
        for result in extract_spell_variants(data, rel):
            if isinstance(result, SkipRecord):
                skipped.append(result)
            else:
                rows.append(result)
    return ExtractResult(rows=rows, skipped=skipped)
