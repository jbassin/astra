"""Unit tests for the D30-23 comparables engine — synthetic profiles only
(no real corpus reads; the real-corpus behavior is exercised via
`test_assay_extract.py`'s routing-fixture tests and manual verification in
the S2 build record)."""

from __future__ import annotations

import pytest
from astra_assay import comparables, pricing
from astra_assay.extract import (
    ActionBucket,
    ConditionInstanceOut,
    DamageTypeClass,
    EffectiveTarget,
    RangeBucket,
    SpellFeatures,
    TargetingClass,
)


def _profile(
    name: str,
    rank: int,
    atoms: dict[str, float],
    *,
    action_bucket: ActionBucket = ActionBucket.TWO,
    effective_target: EffectiveTarget = EffectiveTarget.SINGLE,
    range_bucket: RangeBucket = RangeBucket.LE30,
    ev_band: str | None = None,
    incapacitation: bool = False,
) -> comparables.ComparableProfile:
    return comparables.ComparableProfile(
        name=name,
        rank=rank,
        is_cantrip=False,
        atom_vector=atoms,
        action_bucket=action_bucket,
        effective_target=effective_target,
        range_bucket=range_bucket,
        ev_band=ev_band,
        incapacitation=incapacitation,
    )


def _row(name: str, rank: int, ev: float, conditions: list[ConditionInstanceOut]) -> SpellFeatures:
    return SpellFeatures(
        name=name,
        source_id=name,
        file=f"{name}.json",
        rank=rank,
        is_cantrip=False,
        ev=ev,
        has_structured_damage=ev > 0,
        damage_types=["fire"] if ev > 0 else [],
        damage_type_class=DamageTypeClass.COMMON,
        persistent_ev=0.0,
        has_persistent=False,
        splash_ev=0.0,
        has_splash=False,
        apply_mod_flag=False,
        targeting_class=TargetingClass.AOE_SAVE,
        has_attack_trait=False,
        has_save=True,
        save_basic=True,
        save_statistic="will",
        defense_passive=False,
        area_type=None,
        area_value_ft=0.0,
        effective_target=EffectiveTarget.SINGLE,
        action_raw="2",
        action_numeric=2.0,
        action_bucket=ActionBucket.TWO,
        action_flagged=False,
        range_raw="",
        range_feet=0.0,
        range_bucket=RangeBucket.LE30,
        range_flagged=False,
        condition_ref=bool(conditions),
        condition_instances=conditions,
        status_modifiers=[],
        confidence="high",
        sustained=False,
        has_duration=False,
        incapacitation=False,
        rarity="common",
        rarity_flag=False,
        traditions=[],
        recovery_path=None,
        is_variant=False,
        variant_label=None,
        parent_name=None,
        heightening_interval=None,
        heightening_delta_ev=None,
    )


def test_cosine_identical_vectors_is_one() -> None:
    assert comparables._cosine({"a": 1.0, "b": 2.0}, {"a": 1.0, "b": 2.0}) == pytest.approx(1.0)


def test_cosine_orthogonal_vectors_is_zero() -> None:
    assert comparables._cosine({"a": 1.0}, {"b": 1.0}) == 0.0


def test_cosine_empty_vector_is_zero() -> None:
    assert comparables._cosine({}, {"a": 1.0}) == 0.0
    assert comparables._cosine({"a": 1.0}, {}) == 0.0


def test_similarity_identical_profile_is_one() -> None:
    p = _profile("A", 3, {"Frightened@1": 0.2, "tier:T2": 0.2})
    assert comparables.similarity(p, p) == pytest.approx(1.0)


def test_similarity_structural_mismatch_reduces_score() -> None:
    """Same atom vector, differing action bucket — the D30-23 declared
    STRUCTURAL_MISMATCH_PENALTY applies (×0.90 per mismatch, ONE mismatch
    here)."""
    a = _profile("A", 3, {"X": 1.0}, action_bucket=ActionBucket.TWO)
    b = _profile("B", 3, {"X": 1.0}, action_bucket=ActionBucket.THREE)
    sim = comparables.similarity(a, b)
    assert sim == pytest.approx(1.0 - comparables.STRUCTURAL_MISMATCH_PENALTY)


def test_similarity_multiple_mismatches_compound() -> None:
    a = _profile(
        "A",
        3,
        {"X": 1.0},
        action_bucket=ActionBucket.TWO,
        effective_target=EffectiveTarget.SINGLE,
        range_bucket=RangeBucket.LE30,
    )
    b = _profile(
        "B",
        3,
        {"X": 1.0},
        action_bucket=ActionBucket.THREE,
        effective_target=EffectiveTarget.PARTY_SCALE,
        range_bucket=RangeBucket.GT120,
    )
    sim = comparables.similarity(a, b)
    assert sim == pytest.approx((1.0 - comparables.STRUCTURAL_MISMATCH_PENALTY) ** 3)


def test_similarity_incap_mismatch_halves_score() -> None:
    a = _profile("A", 3, {"X": 1.0}, incapacitation=False)
    b = _profile("B", 3, {"X": 1.0}, incapacitation=True)
    sim = comparables.similarity(a, b)
    assert sim == pytest.approx(comparables.INCAP_MISMATCH_MULTIPLIER)


def test_similarity_ev_band_none_vs_set_is_a_mismatch() -> None:
    """A pure hostile-effect spell (ev_band None) vs a hybrid (ev_band set)
    IS a structural mismatch — the fix over the initial "absent never
    penalizes" draft (see the module docstring)."""
    pure = _profile("Pure", 3, {"X": 1.0}, ev_band=None)
    hybrid = _profile("Hybrid", 3, {"X": 1.0}, ev_band="high")
    sim = comparables.similarity(pure, hybrid)
    assert sim == pytest.approx(1.0 - comparables.STRUCTURAL_MISMATCH_PENALTY)


def test_similarity_both_ev_band_none_skips_the_coordinate() -> None:
    a = _profile("A", 3, {"X": 1.0}, ev_band=None)
    b = _profile("B", 3, {"X": 1.0}, ev_band=None)
    assert comparables.similarity(a, b) == pytest.approx(1.0)


def test_similarity_both_ev_band_set_and_differing() -> None:
    a = _profile("A", 3, {"X": 1.0}, ev_band="low")
    b = _profile("B", 3, {"X": 1.0}, ev_band="high")
    sim = comparables.similarity(a, b)
    assert sim == pytest.approx(1.0 - comparables.STRUCTURAL_MISMATCH_PENALTY)


def test_similarity_both_ev_band_set_and_equal_no_penalty() -> None:
    a = _profile("A", 3, {"X": 1.0}, ev_band="high")
    b = _profile("B", 3, {"X": 1.0}, ev_band="high")
    assert comparables.similarity(a, b) == pytest.approx(1.0)


def test_top_comparables_ranks_by_similarity_and_excludes_self() -> None:
    target = _profile("Target", 3, {"Frightened@1": 0.2, "tier:T2": 0.2})
    close = _profile("Close", 4, {"Frightened@1": 0.2, "tier:T2": 0.2})
    far = _profile("Far", 9, {"Stunned@1": 0.3, "tier:T3": 0.3})
    corpus = [target, close, far]
    matches = comparables.top_comparables(target, corpus, k=5)
    assert [m.name for m in matches] == ["Close", "Far"]
    assert matches[0].similarity > matches[1].similarity
    assert "Frightened@1" in matches[0].shared_atoms
    assert all(not a.startswith("tier:") for a in matches[0].shared_atoms)  # tier dims hidden


def test_top_comparables_respects_k() -> None:
    target = _profile("Target", 3, {"X": 1.0})
    corpus = [target] + [_profile(f"C{i}", 3, {"X": 1.0}) for i in range(10)]
    matches = comparables.top_comparables(target, corpus, k=3)
    assert len(matches) == 3


def test_comparables_for_range_and_median() -> None:
    target = _profile("Target", 3, {"X": 1.0})
    corpus = [target] + [_profile(f"C{i}", r, {"X": 1.0}) for i, r in enumerate([2, 4, 6, 8, 10])]
    result = comparables.comparables_for(target, corpus, k=5)
    assert result.rank_min == 2
    assert result.rank_max == 10
    assert result.rank_median == 6
    assert result.r10_extrapolation_warning is True  # touches r10


def test_comparables_for_no_r10_warning_when_range_stays_low() -> None:
    target = _profile("Target", 3, {"X": 1.0})
    corpus = [target] + [_profile(f"C{i}", r, {"X": 1.0}) for i, r in enumerate([1, 2, 3, 4, 5])]
    result = comparables.comparables_for(target, corpus, k=5)
    assert result.r10_extrapolation_warning is False


def test_comparables_for_empty_corpus_returns_default() -> None:
    target = _profile("Target", 3, {"X": 1.0})
    result = comparables.comparables_for(target, [])
    assert result.matches == []
    assert result.rank_min == 0


def test_profile_json_round_trip() -> None:
    p = _profile(
        "A",
        5,
        {"Frightened@1": 0.2, "tier:T2": 0.2},
        ev_band="mid",
        incapacitation=True,
    )
    d = comparables.profile_to_json(p)
    restored = comparables.profile_from_json(d)
    assert restored == p


def test_is_comparable_candidate_requires_a_tiered_instance() -> None:
    hostile = ConditionInstanceOut(
        condition="Frightened",
        value=1,
        degree="failure",
        duration="round",
        rule="direct",
        tier="T2",
    )
    beneficial = ConditionInstanceOut(
        condition="Invisible",
        value=None,
        degree="unconditional",
        duration="minute",
        rule="direct",
        tier=None,
    )
    assert comparables.is_comparable_candidate(_row("Hostile", 3, 0.0, [hostile]))
    assert not comparables.is_comparable_candidate(_row("Buff", 3, 0.0, [beneficial]))
    assert not comparables.is_comparable_candidate(_row("PureDamage", 3, 10.0, []))


def test_build_corpus_filters_and_builds_profiles() -> None:
    hostile = ConditionInstanceOut(
        condition="Frightened",
        value=1,
        degree="failure",
        duration="round",
        rule="direct",
        tier="T2",
    )
    beneficial = ConditionInstanceOut(
        condition="Invisible",
        value=None,
        degree="unconditional",
        duration="minute",
        rule="direct",
        tier=None,
    )
    rows = [
        _row("Hostile", 3, 0.0, [hostile]),
        _row("Buff", 3, 0.0, [beneficial]),
        _row("PureDamage", 3, 10.0, []),
    ]
    ladder = pricing.LadderFit(
        intercept=1.0,
        slope=1.0,
        effective_target_coef={},
        range_coef={},
        n_obs=10,
        r_squared=1.0,
        excluded_singletons=True,
    )
    corpus = comparables.build_corpus(rows, ladder)
    assert [p.name for p in corpus] == ["Hostile"]
