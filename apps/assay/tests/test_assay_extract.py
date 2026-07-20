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
    """Heal's single BASE damage entry carries kinds=[damage,healing], but
    round 2 no longer wholesale-excludes overlay spells (D30-6a) — each
    non-empty-system overlay is deep-merged onto the base and scored per
    variant. The 1-action/touch variant carries NO damage override in its own
    overlay and must inherit the base 1d8 (the D30-6a flagship case)."""
    from astra_assay.extract import extract_spell_variants

    data = load("heal.json")
    variants = extract_spell_variants(data, "heal.json")
    assert len(variants) == 4  # 4 non-empty overlays; heal has no flavor-only ones
    by_label = {v.variant_label: v for v in variants if isinstance(v, SpellFeatures)}

    living = by_label["Heal (vs. Living)"]
    assert living.is_healing is True
    assert living.ev == pytest.approx(12.5)  # 1d8+8
    assert living.action_bucket == ActionBucket.TWO

    touch = by_label["Heal (variant 2)"]
    assert touch.ev == pytest.approx(4.5)  # inherited base 1d8 — no damage override
    assert touch.action_bucket == ActionBucket.ONE
    assert touch.is_healing is False  # dual-kind base entry -> counted as damage, round-1 rule

    undead = by_label["Heal (vs. Undead)"]
    assert undead.ev == pytest.approx(4.5)  # formula inherited, only `kinds` overridden
    assert undead.is_healing is False


def test_overlay_variant_ignition() -> None:
    from astra_assay.extract import extract_spell_variants

    variants = extract_spell_variants(load("ignition.json"), "ignition.json")
    features = [v for v in variants if isinstance(v, SpellFeatures)]
    assert len(features) == len(variants)
    assert all(v.is_variant and v.parent_name == "Ignition" for v in features)


def test_overlay_variant_elemental_breath() -> None:
    """Six damage-type overlay variants, but each shares the SAME base
    description listing all 8 breath-weapon damage tokens together — the
    inline-damage multi-choice guard (>=4 tokens) correctly declines to sum
    them (that would overstate every color's EV ~8x), so each variant is a
    typed skip rather than a mis-scored row."""
    from astra_assay.extract import extract_spell_variants

    variants = extract_spell_variants(load("elemental-breath.json"), "elemental-breath.json")
    assert len(variants) == 6  # six damage-type choices
    skips = [v for v in variants if isinstance(v, SkipRecord)]
    assert len(skips) == len(variants)
    assert all("multi-choice" in v.reason for v in skips)


def test_overlay_variant_telekinetic_projectile_attack_cantrip() -> None:
    """Attack-cantrip trait extraction is exercised on each of the three
    damage-type variants."""
    from astra_assay.extract import extract_spell_variants

    variants = extract_spell_variants(
        load("telekinetic-projectile.json"), "telekinetic-projectile.json"
    )
    assert len(variants) == 3
    features = [v for v in variants if isinstance(v, SpellFeatures)]
    assert len(features) == len(variants)
    assert all(v.has_attack_trait for v in features)


def test_overlay_present_even_with_flat_formula_execute() -> None:
    """Execute's overlays don't touch the formula (only damage type/name) —
    each variant still scores via the shared merged-system extraction path."""
    from astra_assay.extract import extract_spell_variants

    variants = extract_spell_variants(load("execute.json"), "execute.json")
    features = [v for v in variants if isinstance(v, SpellFeatures)]
    assert len(features) == len(variants)
    assert all(v.ev == pytest.approx(70.0) for v in features)  # flat "70" formula, untouched


def test_no_damage_kind_entries_enervation() -> None:
    """Enervation's structured damage dict is empty and its @Damage inline
    tokens are all @item.rank arithmetic — non-literal, stays unscored
    (D30-6c: 11 such cases repo-wide)."""
    r = extract("enervation.json")
    assert isinstance(r, SkipRecord)
    assert r.reason == "non-literal-inline-formula (@item.rank arithmetic)"


def test_no_damage_kind_entries_disguise_magic() -> None:
    """Disguise Magic has no damage and no conditions; its 1-minute cast time
    now surfaces as the more specific long-cast skip reason."""
    r = extract("disguise-magic.json")
    assert isinstance(r, SkipRecord)
    assert r.reason == "long-cast time ('1 minute')"


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
    trust level.value. (It also has no structured damage, conditions, or
    modifiers — a genuine round-2 extraction dead-end either way.)"""
    data = load("funeral-flames.json")
    assert data["system"]["level"]["value"] == 1
    r = extract("funeral-flames.json")
    assert isinstance(r, SkipRecord)
    assert r.reason == "no-priceable-effect (no damage, no conditions, no modifiers)"


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


# ---------------------------------------------------------------------------
# Round-2 effect extraction (D30-2/D30-6) — one fixture per D30-11 trap.
# ---------------------------------------------------------------------------


def test_condition_only_spell_scores_ev_zero_fear() -> None:
    """Fear — 4-degree valued-condition attribution, no damage at all. A
    condition-only control spell is now a scoreable row (ev=0.0), not a
    round-1 skip."""
    r = extract("fear.json")
    assert isinstance(r, SpellFeatures)
    assert r.ev == 0.0
    assert r.confidence == "high"
    by_degree = {(i.degree, i.condition): i for i in r.condition_instances}
    assert by_degree[("success", "Frightened")].value == 1
    assert by_degree[("failure", "Frightened")].value == 2
    assert by_degree[("critical-failure", "Frightened")].value == 3
    assert by_degree[("critical-failure", "Fleeing")].value is None
    assert len(r.condition_instances) == 4


def test_preamble_payload_and_as_failure_synesthesia() -> None:
    """Synesthesia — rule (i): the whole payload (Concealed, Clumsy 3) lives
    in the preamble and is attributed at every degree whose section says
    "affected" (with duration read from THAT section); rule (ii): Critical
    Failure is "As failure, and..." — inherits Concealed+Clumsy and adds its
    own Stunned 2."""
    r = extract("synesthesia.json")
    assert isinstance(r, SpellFeatures)
    by_degree_cond = {(i.degree, i.condition) for i in r.condition_instances}
    assert ("success", "Concealed") in by_degree_cond
    assert ("success", "Clumsy") in by_degree_cond
    assert ("failure", "Concealed") in by_degree_cond
    assert ("failure", "Clumsy") in by_degree_cond
    # rule (ii): critical-failure inherits both preamble conditions AND adds
    # its own Stunned 2.
    assert ("critical-failure", "Concealed") in by_degree_cond
    assert ("critical-failure", "Clumsy") in by_degree_cond
    assert ("critical-failure", "Stunned") in by_degree_cond
    rules = {i.rule for i in r.condition_instances if i.condition == "Stunned"}
    assert rules == {"as-failure"}
    # duration read from the OWNING degree section, not a single spell-wide value.
    success_concealed = next(
        i for i in r.condition_instances if i.degree == "success" and i.condition == "Concealed"
    )
    failure_concealed = next(
        i for i in r.condition_instances if i.degree == "failure" and i.condition == "Concealed"
    )
    assert success_concealed.duration == "round"  # "affected for 1 round"
    assert failure_concealed.duration == "minute"  # "affected for 1 minute"


def test_plain_text_repeat_paralyze() -> None:
    """Paralyze — Failure ref's Paralyzed via @UUID; Critical Failure repeats
    "Paralyzed" as plain text with no ref of its own (rule iii)."""
    r = extract("paralyze.json")
    assert isinstance(r, SpellFeatures)
    crit_fail_paralyzed = next(
        i
        for i in r.condition_instances
        if i.degree == "critical-failure" and i.condition == "Paralyzed"
    )
    assert crit_fail_paralyzed.rule == "plain-repeat"
    failure_paralyzed = next(
        i for i in r.condition_instances if i.degree == "failure" and i.condition == "Paralyzed"
    )
    assert failure_paralyzed.rule == "direct"


def test_preamble_options_not_attributed_command() -> None:
    """Command — the review's flagship negative case: Fleeing/Prone are
    preamble OPTIONS ("you can command the target to... run away... or drop
    Prone"), not applied effects — no degree section says "is affected", so
    rule (i) correctly attributes NOTHING. Command has no priceable damage
    either, so it lands in the skip ledger (V3' allows diagnosed misses)."""
    r = extract("command.json")
    assert isinstance(r, SkipRecord)
    assert r.reason == "no-priceable-effect (no damage, no conditions, no modifiers)"


def test_valued_condition_and_duration_tier_promotion_slow() -> None:
    """Slow — Slowed 1 for 1 round (T2) vs Slowed 1 for 1 minute (T3, the
    spec's duration-promotion rule) vs Slowed 2 (T3 on value alone)."""
    r = extract("slow.json")
    assert isinstance(r, SpellFeatures)
    by_degree = {i.degree: i for i in r.condition_instances}
    assert by_degree["success"].value == 1
    assert by_degree["success"].duration == "round"
    assert by_degree["success"].tier == "T2"
    assert by_degree["failure"].value == 1
    assert by_degree["failure"].duration == "minute"
    assert by_degree["failure"].tier == "T3"  # duration-promoted
    assert by_degree["critical-failure"].value == 2
    assert by_degree["critical-failure"].tier == "T3"


def test_partial_degree_markup_and_persistent_hybrid_dehydrate() -> None:
    """Dehydrate — only 3 of 4 degrees (no Critical Success section at all),
    AND a persistent-category damage entry alongside conditions (a genuine
    hybrid: persistent_ev carries the damage, condition_instances carry the
    Enfeebled rider)."""
    r = extract("dehydrate.json")
    assert isinstance(r, SpellFeatures)
    assert r.has_persistent is True
    assert r.persistent_ev == pytest.approx(3.5)  # 1d6
    assert r.ev == 0.0  # persistent damage never feeds the plain EV
    degrees = {i.degree for i in r.condition_instances}
    assert degrees == {"failure", "critical-failure"}  # no critical-success section


def test_status_modifier_and_unvalued_default_belittling_boast() -> None:
    """Belittling Boast — a raw status/circumstance-modifier capture (D30-2d)
    alongside an UNVALUED Frightened ref on a valued-typed condition
    (defaults to value=1, D30-2a) attributed unconditionally (no save, no
    attack-roll trait — this spell's check is a linked Intimidation macro)."""
    r = extract("belittling-boast.json")
    assert isinstance(r, SpellFeatures)
    assert len(r.status_modifiers) >= 1
    assert any(m.direction in ("penalty", "bonus") for m in r.status_modifiers)
    frightened = next(i for i in r.condition_instances if i.condition == "Frightened")
    assert frightened.value is None  # unvalued ref
    assert frightened.tier == "T2"  # condition_tier defaults unvalued -> 1 -> T2
    assert frightened.degree == "unconditional"
    assert frightened.rule == "default-unconditional"


def test_heightened_block_excluded_from_condition_extraction() -> None:
    """Slow's Heightened(6th) note carries no conditions of its own, but more
    to the point: a condition ref living ONLY in a Heightened block must never
    surface as a base-rank instance (D30-2e, base-text-only pin hygiene)."""
    data = load("slow.json")
    desc = data["system"]["description"]["value"]
    assert "Heightened" in desc  # the fixture genuinely has a heightened block
    r = extract("slow.json")
    assert isinstance(r, SpellFeatures)
    # every extracted instance's degree is one of the three real base-rank
    # degrees — nothing leaked in from the "Heightened (6th)" trailer text.
    assert {i.degree for i in r.condition_instances} <= {"success", "failure", "critical-failure"}


def test_inline_damage_literal_recovery_blazing_armory() -> None:
    """Blazing Armory — no structured damage entry at all, but a literal
    ``@Damage[1d6[fire]]`` inline roll recovers EV 3.5 (D30-6c)."""
    r = extract("blazing-armory.json")
    assert isinstance(r, SpellFeatures)
    assert r.has_structured_damage is False
    assert r.recovery_path == "inline-damage"
    assert r.ev == pytest.approx(3.5)


def test_non_literal_inline_damage_stays_unscored_enervation() -> None:
    """Enervation's inline tokens are ``@item.rank`` arithmetic — the
    non-literal 11-of-58 D30-6c carve-out, still unscored."""
    r = extract("enervation.json")
    assert isinstance(r, SkipRecord)
    assert "non-literal" in r.reason


def test_manual_scaling_family_force_barrage() -> None:
    """Force Barrage — the mechanically-derived scaling family (D30-6b): the
    round-1 wrong-sign outlier (base extraction reads a single 1d4+1 shard at
    the contaminated 2-action bucket) is replaced by three per-action-count
    variants from the hand table."""
    from astra_assay.extract import extract_spell_variants

    variants = extract_spell_variants(load("force-barrage.json"), "force-barrage.json")
    assert len(variants) == 3
    by_action = {v.action_bucket: v for v in variants if isinstance(v, SpellFeatures)}
    assert by_action[ActionBucket.ONE].ev == pytest.approx(3.5)
    assert by_action[ActionBucket.TWO].ev == pytest.approx(7.0)
    assert by_action[ActionBucket.THREE].ev == pytest.approx(10.5)
    assert all(v.recovery_path == "manual-scaling" for v in by_action.values())
    # Hand-verified EV, not an uncertain extraction — stays high-confidence so
    # it scores (ledger.classify_row) rather than diverting to the ledger.
    assert all(v.confidence == "high" for v in by_action.values())


def test_overlay_variant_count_excludes_empty_system_ignition() -> None:
    """Ignition has 2 overlays, 1 with an empty ``system`` (flavor-only,
    D30-6a) — exactly 1 variant row should be produced, not 2."""
    from astra_assay.extract import extract_spell_variants

    data = load("ignition.json")
    assert len(data["system"]["overlays"]) == 2
    variants = extract_spell_variants(data, "ignition.json")
    assert len(variants) == 1


def test_overlay_variant_count_excludes_empty_system_execute() -> None:
    from astra_assay.extract import extract_spell_variants

    data = load("execute.json")
    assert len(data["system"]["overlays"]) == 2
    variants = extract_spell_variants(data, "execute.json")
    assert len(variants) == 1


# ---------------------------------------------------------------------------
# S1 (round 3) — D30-21 payload-restoring fixes + D30-22 routing fixtures,
# real corpus provenance (pf2e-8.3.0 snapshot, committed verbatim).
# ---------------------------------------------------------------------------


def test_sleep_case_fold_and_en_dash_restore_the_full_payload() -> None:
    """Sleep is the flagship D30-21 fixture: its entire Unconscious payload
    (plain-text 'falls unconscious' repeats at Failure/Critical Failure) was
    silently dropped by the case-sensitive rule (iii), AND its Success-row
    '–1 status penalty to Perception checks' used an en-dash the old regex
    never matched. Both fixes land on the same real file."""
    r = extract("sleep.json")
    assert isinstance(r, SpellFeatures)
    by_degree = {i.degree: (i.condition, i.tier) for i in r.condition_instances}
    assert by_degree["failure"] == ("Unconscious", "T4")
    assert by_degree["critical-failure"] == ("Unconscious", "T4")
    assert len(r.status_modifiers) == 1
    mod = r.status_modifiers[0]
    assert mod.delta == "-1"
    assert mod.degree == "success"
    # Sleep structurally has a save, so it was already high-confidence and
    # routed hostile even pre-fix — the fix restores PAYLOAD, not routing.
    assert r.confidence == "high"
    assert r.has_save is True


def test_overwhelming_memory_prose_save_detected() -> None:
    """Overwhelming Memory: `defense.save` is structurally null, but the
    description literally reads 'The target must attempt a Will save.' —
    D30-21d's prose-save detection (review F2/F10: this spell must route
    hostile despite the missing structured save)."""
    r = extract("overwhelming-memory.json")
    assert isinstance(r, SpellFeatures)
    assert r.has_save is False
    assert r.has_prose_save is True
    assert r.prose_save_statistic == "Will"


def test_belittling_boast_hostile_area_phrase_detected() -> None:
    """Belittling Boast: no structured save, empty `range.value` (parses to
    touch-self — the D30-22 trap), but its Demoralize-linked emanation reads
    'Each creature that becomes Frightened...' — the hostile-area-phrase
    flag that must win over the touch-self signal."""
    r = extract("belittling-boast.json")
    assert isinstance(r, SpellFeatures)
    assert r.has_save is False
    assert r.hostile_area_phrase is True
    assert r.range_bucket == RangeBucket.TOUCH_SELF  # the trap, confirmed present


def test_target_raw_extracted_from_system_target() -> None:
    r = extract("overwhelming-memory.json")
    assert isinstance(r, SpellFeatures)
    assert r.target_raw == "1 creature"


# ---------------------------------------------------------------------------
# D30-22 — the four mandated routing fixtures, real corpus, end-to-end
# through ledger.classify_row / classify_hostility.
# ---------------------------------------------------------------------------


def test_routing_belittling_boast_hostile_not_beneficial() -> None:
    from astra_assay import ledger

    r = extract("belittling-boast.json")
    assert isinstance(r, SpellFeatures)
    assert ledger.classify_hostility(r) == "hostile"
    assert ledger.classify_row(r) is None  # scored, not ledgered


def test_routing_overwhelming_memory_hostile() -> None:
    from astra_assay import ledger

    r = extract("overwhelming-memory.json")
    assert isinstance(r, SpellFeatures)
    assert ledger.classify_hostility(r) == "hostile"
    assert ledger.classify_row(r) is None


def test_routing_haste_beneficial() -> None:
    from astra_assay import ledger

    r = extract("haste.json")
    assert isinstance(r, SpellFeatures)
    # Haste's only condition (Quickened) is tier=None (BENEFICIAL_OR_NON_CONTROL)
    # — it never reaches classify_hostility, routing beneficial by the
    # earlier `condition_ref` branch. Assert the OBSERVABLE outcome.
    assert ledger.classify_row(r) == "beneficial-effect"


def test_routing_invisibility_beneficial() -> None:
    """Invisibility's Undetected/Hidden DO carry tier assignments (they're
    real flat-tier conditions in the table) — this fixture exercises the
    classify_hostility path directly, not the tier=None bypass Haste uses."""
    from astra_assay import ledger

    r = extract("invisibility.json")
    assert isinstance(r, SpellFeatures)
    assert any(ci.tier is not None for ci in r.condition_instances)
    assert ledger.classify_hostility(r) == "beneficial"
    assert ledger.classify_row(r) == "beneficial-effect"
