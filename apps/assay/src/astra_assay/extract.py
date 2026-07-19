"""Per-spell feature extraction (design doc §1/§3) — every extractor trap handled.

Reads one Foundry spell JSON (``system.*``) and produces either a
``SpellFeatures`` row (damage-bearing, fit-eligible) or a ``SkipRecord`` (out
of round-1 scope, with a reason for the report's skip ledger). The traps this
module has to handle, all census-verified against the real corpus:

1. Damage dicts keyed by random Foundry IDs (not ``"0"``) — iterate ``.values()``.
2. ``kinds`` distinguishes damage vs healing *within one entry* — branch, never
   sum a healing-only entry as damage.
3. ``system.overlays`` variant-cast data — the base ``damage`` field is only one
   variant, so any spell with non-empty overlays is excluded wholesale.
4. Variable cast times (``"1 to 3"``, ``"2 or 3"``, ``"1 or 2"``, the malformed
   ``"2 to 2 rounds"``) need a canonical action-cost bucket; long-cast times
   (1 minute+) are excluded from the combat-damage fit entirely.
5. Range strings defeating a naive ``\\d+ feet`` regex: commas, bare numbers,
   miles, ``touch``/``self``/empty, ``varies``/``planetary``.
6. Flat formulas, and ``applyMod`` (add +4, flag) — delegated to ``dice.py`` plus
   the applyMod bump here.
7. ``category`` — ``persistent``/``splash`` entries are carried as separate
   feature columns, never summed into the main damage EV.
"""

from __future__ import annotations

import json
import re
from enum import StrEnum
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from .dice import parse_formula

#: Damage types treated as "rarely resisted" per the design doc §3 predictor —
#: force/spirit/mental/vitality/void, plus untyped/empty (no resistance keys off
#: these in the pf2e system).
RARE_DAMAGE_TYPES = frozenset({"force", "spirit", "mental", "vitality", "void", "untyped", ""})

#: Cast times bucketed as "long-cast" — excluded from the combat-damage fit when
#: they carry damage (§1 trap 4; census-verified: exactly 1 such spell, Bandit's
#: Doom, in the whole main-slot corpus — the doc's "likely ~0" prediction held).
LONG_CAST_TIMES = frozenset({"1 minute", "5 minutes", "10 minutes", "30 minutes", "1 hour"})

_CONDITION_UUID_RE = re.compile(r"conditionitems\.Item\.\w+")
_MILE_RE = re.compile(r"^([\d,]+)\s*[\s-]*mile", re.IGNORECASE)
_LEADING_NUMBER_RE = re.compile(r"^([\d,]+)")
_EXACT_FEET_RE = re.compile(r"^[\d,]+\s*feet$")


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


class SpellFeatures(BaseModel):
    name: str
    source_id: str
    file: str
    rank: int
    is_cantrip: bool

    ev: float
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

    action_raw: str
    action_numeric: float | None
    action_bucket: ActionBucket
    action_flagged: bool

    range_raw: str
    range_feet: float | None
    range_bucket: RangeBucket
    range_flagged: bool

    condition_ref: bool
    sustained: bool
    has_duration: bool
    incapacitation: bool

    rarity: str
    rarity_flag: bool
    traditions: list[str]

    # Heightening (interval-type only; degenerate `type: null` / `fixed`+empty-levels
    # and non-matching keys all collapse to None here) — used only by the V2 held-out
    # validation gate (project +k ranks, never a fit predictor).
    heightening_interval: int | None
    heightening_delta_ev: float | None


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


def extract_spell(data: dict[str, Any], file: str) -> SpellFeatures | SkipRecord:
    """One spell JSON → a fit-eligible row, or a skip record with a reason."""
    name = data.get("name", "<unnamed>")
    source_id = data.get("_id", "<no-id>")
    sysd = data.get("system", {})

    def skip(reason: str) -> SkipRecord:
        return SkipRecord(name=name, source_id=source_id, file=file, reason=reason)

    overlays = sysd.get("overlays") or {}
    if overlays:
        return skip("overlay-variant")

    traits_node = sysd.get("traits") or {}
    traits = traits_node.get("value") or []
    is_cantrip = "cantrip" in traits

    damage = sysd.get("damage") or {}
    plain: list[tuple[float, str]] = []
    plain_keys: set[str] = set()
    persistent: list[tuple[float, str]] = []
    splash: list[tuple[float, str]] = []
    apply_mod_flag = False
    rejected_reasons: list[str] = []
    saw_damage_kind_entry = False

    for key, entry in damage.items():  # random-ID keys (§1 trap 1) — never index "0" directly
        kinds = entry.get("kinds") or []
        if "damage" not in kinds:
            continue  # healing-only entry within a dual-kind dict (§1 trap 2)
        saw_damage_kind_entry = True
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
        if category == "persistent":
            persistent.append((ev, dtype))
        elif category == "splash":
            splash.append((ev, dtype))
        else:
            plain.append((ev, dtype))
            plain_keys.add(key)

    if not saw_damage_kind_entry:
        return skip("no-damage-kind-entry")
    if not plain:
        if rejected_reasons:
            return skip("; ".join(sorted(set(rejected_reasons))))
        return skip("no-plain-damage-entry (persistent/splash only)")

    time_raw = (sysd.get("time") or {}).get("value", "")
    if time_raw in LONG_CAST_TIMES:
        return skip(f"long-cast time ({time_raw!r})")

    ev = sum(v for v, _ in plain)
    persistent_ev = sum(v for v, _ in persistent)
    splash_ev = sum(v for v, _ in splash)
    damage_types = sorted({t for _, t in plain})
    damage_type_class = _classify_damage_types(plain)

    has_attack_trait = "attack" in traits
    defense = sysd.get("defense") or {}
    save = defense.get("save")
    has_save = bool(save)
    save_basic = bool(has_save and save.get("basic"))
    save_statistic = save.get("statistic") if has_save else None
    defense_passive = bool(defense.get("passive"))

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

    action_numeric, action_bucket, action_flagged = normalize_action_time(time_raw)

    range_raw = (sysd.get("range") or {}).get("value", "")
    range_feet, range_bucket, range_flagged = parse_range(range_raw)

    description = (sysd.get("description") or {}).get("value", "")
    condition_ref = bool(_CONDITION_UUID_RE.search(description))

    duration = sysd.get("duration") or {}
    sustained = bool(duration.get("sustained"))
    has_duration = bool((duration.get("value") or "").strip())

    incapacitation = "incapacitation" in traits
    rarity = traits_node.get("rarity", "common")
    rarity_flag = rarity != "common"
    traditions = traits_node.get("traditions") or []

    level = (sysd.get("level") or {}).get("value", 0)  # trust level.value over folder path

    heightening_interval, heightening_delta_ev = _extract_heightening(sysd, plain_keys)

    return SpellFeatures(
        name=name,
        source_id=source_id,
        file=file,
        rank=int(level),
        is_cantrip=is_cantrip,
        ev=ev,
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
        action_raw=time_raw,
        action_numeric=action_numeric,
        action_bucket=action_bucket,
        action_flagged=action_flagged,
        range_raw=range_raw,
        range_feet=range_feet,
        range_bucket=range_bucket,
        range_flagged=range_flagged,
        condition_ref=condition_ref,
        sustained=sustained,
        has_duration=has_duration,
        incapacitation=incapacitation,
        rarity=rarity,
        rarity_flag=rarity_flag,
        traditions=list(traditions),
        heightening_interval=heightening_interval,
        heightening_delta_ev=heightening_delta_ev,
    )


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
    """Extract every main-slot spell JSON under ``spells_dir``."""
    from .snapshot import iter_spell_files

    rows: list[SpellFeatures] = []
    skipped: list[SkipRecord] = []
    for path in iter_spell_files(spells_dir):
        data = load_spell_json(path)
        rel = str(path.relative_to(spells_dir))
        result = extract_spell(data, rel)
        if isinstance(result, SkipRecord):
            skipped.append(result)
        else:
            rows.append(result)
    return ExtractResult(rows=rows, skipped=skipped)
