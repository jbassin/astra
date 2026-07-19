"""Extractor-trap tests — one fixture per §1 census trap, real corpus provenance
(committed copies of real Foundry spell JSONs; see apps/codex/fixtures for the
precedent of committing corpus provenance). No test in this file reads the
gitignored snapshot — every fixture is a small file under tests/fixtures/.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from astra_assay.extract import (
    ActionBucket,
    DamageTypeClass,
    RangeBucket,
    SkipRecord,
    SpellFeatures,
    TargetingClass,
    _extract_heightening,
    extract_spell,
    load_spell_json,
    normalize_action_time,
    parse_range,
)

FIXTURES = Path(__file__).parent / "fixtures"


def load(name: str) -> dict:
    return load_spell_json(FIXTURES / name)


def extract(name: str) -> SpellFeatures | SkipRecord:
    return extract_spell(load(name), name)


def test_random_id_damage_keys_ice_storm() -> None:
    """Ice Storm's damage dict has one random-ID key and one "0" key — both
    entries (2d8 bludgeoning + 2d8 cold) must be summed via .values()."""
    r = extract("ice-storm.json")
    assert isinstance(r, SpellFeatures)
    assert r.ev == pytest.approx(9.0 + 9.0)  # 2d8 avg 9 each
    assert r.sustained is True
    assert r.has_duration is True
    assert r.area_type == "burst"
    assert r.targeting_class == TargetingClass.AOE_SAVE
    assert r.save_basic is True
    assert r.action_bucket == ActionBucket.THREE


def test_random_id_single_key_dragon_turret() -> None:
    r = extract("dragon-turret.json")
    assert isinstance(r, SpellFeatures)
    assert r.ev == pytest.approx(13 * 4.5)  # 13d8
    assert r.area_type == "cylinder"
    assert r.damage_type_class == DamageTypeClass.RARE  # untyped
    assert r.rarity_flag is True  # uncommon
    assert r.rank == 10


def test_dual_kind_and_overlay_heal() -> None:
    """Heal's single damage entry carries kinds=[damage,healing] AND the spell
    has variant-cast overlays — overlay exclusion wins, no EV is computed."""
    r = extract("heal.json")
    assert isinstance(r, SkipRecord)
    assert r.reason == "overlay-variant"


def test_overlay_variant_ignition() -> None:
    r = extract("ignition.json")
    assert isinstance(r, SkipRecord)
    assert r.reason == "overlay-variant"


def test_overlay_variant_elemental_breath() -> None:
    r = extract("elemental-breath.json")
    assert isinstance(r, SkipRecord)
    assert r.reason == "overlay-variant"


def test_overlay_variant_telekinetic_projectile_attack_cantrip() -> None:
    """Attack-cantrip trait extraction is exercised even though this spell is
    ultimately overlay-excluded (three damage-type variants)."""
    r = extract("telekinetic-projectile.json")
    assert isinstance(r, SkipRecord)
    assert r.reason == "overlay-variant"


def test_overlay_present_even_with_flat_formula_execute() -> None:
    """Execute's overlays don't touch the formula (only damage type/name), but
    overlay exclusion is still wholesale per the design doc."""
    r = extract("execute.json")
    assert isinstance(r, SkipRecord)
    assert r.reason == "overlay-variant"


def test_no_damage_kind_entries_enervation() -> None:
    """Enervation's damage dict is empty — all damage is prose-only @Damage
    rolls, out of round-1 structured-extraction scope."""
    r = extract("enervation.json")
    assert isinstance(r, SkipRecord)
    assert r.reason == "no-damage-kind-entry"


def test_no_damage_kind_entries_disguise_magic() -> None:
    r = extract("disguise-magic.json")
    assert isinstance(r, SkipRecord)
    assert r.reason == "no-damage-kind-entry"


def test_degenerate_heightening_absent_type_enervation() -> None:
    """Enervation's heightening.damage is {} with no "type" key at all — treat
    as absent, not a crash."""
    sysd = load("enervation.json")["system"]
    interval, delta = _extract_heightening(sysd, plain_keys=set())
    assert interval is None
    assert delta is None


def test_degenerate_heightening_fixed_empty_levels_disguise_magic() -> None:
    sysd = load("disguise-magic.json")["system"]
    assert sysd["heightening"]["type"] == "fixed"
    assert sysd["heightening"]["levels"] == {}
    interval, delta = _extract_heightening(sysd, plain_keys=set())
    assert interval is None
    assert delta is None


def test_heightening_absent_key_dragon_turret() -> None:
    """Dragon Turret has no "heightening" key in system at all."""
    sysd = load("dragon-turret.json")["system"]
    assert "heightening" not in sysd
    interval, delta = _extract_heightening(sysd, plain_keys={"EOjlR2U7ZKBcz8lK"})
    assert interval is None
    assert delta is None


def test_flat_formula_devour_life() -> None:
    r = extract("devour-life.json")
    assert isinstance(r, SpellFeatures)
    assert r.ev == 60.0


def test_multi_entry_and_comma_range_cataclysm() -> None:
    """Cataclysm sums 6 plain-damage entries into one EV and its "1,000 feet"
    range must survive comma-stripping."""
    r = extract("cataclysm.json")
    assert isinstance(r, SpellFeatures)
    assert r.ev == pytest.approx(6 * 3 * 5.5)  # 6 entries of 3d10 (avg 5.5) each
    assert r.range_feet == 1000.0
    assert r.range_bucket == RangeBucket.GT120
    assert r.damage_type_class == DamageTypeClass.COMMON  # acid/bludg/cold/elec/fire


def test_fireball_baseline_and_interval_heightening() -> None:
    r = extract("fireball.json")
    assert isinstance(r, SpellFeatures)
    assert r.ev == pytest.approx(21.0)  # 6d6
    assert r.heightening_interval == 1
    assert r.heightening_delta_ev == pytest.approx(7.0)  # 2d6
    assert r.range_bucket == RangeBucket.GT120
    assert r.range_feet == 500.0


def test_apply_mod_and_persistent_ancient_dust() -> None:
    r = extract("ancient-dust.json")
    assert isinstance(r, SpellFeatures)
    assert r.apply_mod_flag is True
    assert r.ev == pytest.approx(4.0)  # formula "0" + applyMod +4
    assert r.has_persistent is True
    assert r.persistent_ev == pytest.approx(1.0)
    assert r.save_basic is False
    assert r.rarity_flag is True
    assert r.is_cantrip is True


def test_folder_level_mismatch_funeral_flames() -> None:
    """Funeral Flames sits under a rank-2 folder but system.level.value is 1 —
    trust level.value. (It also has no structured damage — skip either way.)"""
    data = load("funeral-flames.json")
    assert data["system"]["level"]["value"] == 1
    r = extract("funeral-flames.json")
    assert isinstance(r, SkipRecord)
    assert r.reason == "no-damage-kind-entry"


# --- normalize_action_time -------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "expected_numeric", "expected_bucket", "expected_flagged"),
    [
        ("1", 1.0, ActionBucket.ONE, False),
        ("2", 2.0, ActionBucket.TWO, False),
        ("3", 3.0, ActionBucket.THREE, False),
        ("reaction", None, ActionBucket.REACTION, False),
        ("1 to 3", 2.0, ActionBucket.TWO, False),
        ("2 or 3", 2.0, ActionBucket.TWO, False),
        ("1 or 2", 1.5, ActionBucket.ONE_HALF, False),
        ("2 to 2 rounds", 2.0, ActionBucket.TWO, True),
    ],
)
def test_normalize_action_time(raw, expected_numeric, expected_bucket, expected_flagged) -> None:
    numeric, bucket, flagged = normalize_action_time(raw)
    assert numeric == expected_numeric
    assert bucket == expected_bucket
    assert flagged == expected_flagged


# --- parse_range -------------------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "expected_feet", "expected_bucket", "expected_flagged"),
    [
        ("", 0.0, RangeBucket.TOUCH_SELF, False),
        ("touch", 0.0, RangeBucket.TOUCH_SELF, False),
        ("self", 0.0, RangeBucket.TOUCH_SELF, False),
        ("30 feet", 30.0, RangeBucket.LE30, False),
        ("60 feet", 60.0, RangeBucket.LE60, False),
        ("120 feet", 120.0, RangeBucket.LE120, False),
        ("500 feet", 500.0, RangeBucket.GT120, False),
        ("1,000 feet", 1000.0, RangeBucket.GT120, False),
        ("120", 120.0, RangeBucket.LE120, True),  # bare number, flagged
        ("planetary", None, RangeBucket.PLANETARY_UNLIMITED, False),
        ("unlimited", None, RangeBucket.PLANETARY_UNLIMITED, False),
        ("1 mile", None, RangeBucket.PLANETARY_UNLIMITED, False),
        ("your Speed", None, RangeBucket.VARIES, True),
        ("varies", None, RangeBucket.VARIES, True),
        ("60 feet (see text)", 60.0, RangeBucket.LE60, True),
    ],
)
def test_parse_range(raw, expected_feet, expected_bucket, expected_flagged) -> None:
    feet, bucket, flagged = parse_range(raw)
    assert feet == expected_feet
    assert bucket == expected_bucket
    assert flagged == expected_flagged
