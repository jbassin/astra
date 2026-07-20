"""Unit tests for the round-2 condition extraction core (spec 0030 D30-2/D30-4/
D30-5/D30-8b) — the four attribution rules, tier lookup, duration
classification, and coverage arithmetic in isolation from spell JSON parsing.
"""

from __future__ import annotations

from astra_assay.conditions import (
    AttributionRule,
    DurationClass,
    Tier,
    classify_duration,
    condition_tier,
    coverage_weight,
    split_degree_sections,
)


def test_condition_tier_flat() -> None:
    assert condition_tier("Paralyzed", None, DurationClass.ROUND) == Tier.T4
    assert condition_tier("Prone", None, DurationClass.INSTANT) == Tier.T2
    assert condition_tier("Dazzled", None, DurationClass.INSTANT) == Tier.T1


def test_condition_tier_beneficial_excluded() -> None:
    assert condition_tier("Invisible", None, DurationClass.MINUTE) is None
    assert condition_tier("Quickened", None, DurationClass.MINUTE) is None


def test_condition_tier_valued_promotion() -> None:
    assert condition_tier("Frightened", 1, DurationClass.INSTANT) == Tier.T2
    assert condition_tier("Frightened", 2, DurationClass.INSTANT) == Tier.T3
    assert condition_tier("Frightened", 3, DurationClass.INSTANT) == Tier.T3
    # unvalued default-1 (D30-2a)
    assert condition_tier("Frightened", None, DurationClass.INSTANT) == Tier.T2


def test_condition_tier_slowed_duration_promotion() -> None:
    """Slowed 1 is T2 at a short duration but promotes to T3 at ~1-minute+
    (spec tier sketch: "slowed 1 ≥1 min" is T3)."""
    assert condition_tier("Slowed", 1, DurationClass.ROUND) == Tier.T2
    assert condition_tier("Slowed", 1, DurationClass.MINUTE) == Tier.T3
    assert condition_tier("Slowed", 1, DurationClass.LONG) == Tier.T3
    assert condition_tier("Slowed", 2, DurationClass.ROUND) == Tier.T3  # value alone is enough


def test_classify_duration_prose_first() -> None:
    assert classify_duration("for 1 round", "1 minute") == DurationClass.ROUND
    assert classify_duration("for 4 rounds", "") == DurationClass.MINUTE
    assert classify_duration("for 1 minute", "") == DurationClass.MINUTE
    assert classify_duration("permanently", "") == DurationClass.LONG


def test_classify_duration_field_fallback() -> None:
    """No prose duration in the instance's own section — fall back to the
    spell-level `duration.value` field (D30-2c)."""
    assert classify_duration("no duration text here", "1 minute") == DurationClass.MINUTE
    assert classify_duration("no duration text here", "") == DurationClass.INSTANT
    assert classify_duration("no duration text here", "1 round") == DurationClass.ROUND


def test_coverage_weight_fail_only() -> None:
    """fail-only ≈ 0.55 with the default crit-fail=1.5 severity (D30-4)."""
    w = coverage_weight(frozenset({"failure", "critical-failure"}))
    assert w == 0.10 * 1.5 + 0.40 * 1.0
    assert abs(w - 0.55) < 1e-9


def test_coverage_weight_doubled_crit_fail() -> None:
    w_default = coverage_weight(frozenset({"critical-failure"}))
    w_doubled = coverage_weight(frozenset({"critical-failure"}), crit_fail_doubled=True)
    assert w_doubled > w_default


def test_split_degree_sections_partial() -> None:
    """A 3-of-4-degree spell (no Critical Success) — dehydrate's shape."""
    html = (
        "<p>preamble</p><hr />"
        "<p><strong>Success</strong> nothing.</p>"
        "<p><strong>Failure</strong> Enfeebled 1.</p>"
        "<p><strong>Critical Failure</strong> Enfeebled 2.</p>"
    )
    ds = split_degree_sections(html)
    assert set(ds.sections) == {"success", "failure", "critical-failure"}
    assert "critical-success" not in ds.sections


def test_split_degree_sections_none() -> None:
    ds = split_degree_sections("<p>no degree markup at all</p>")
    assert ds.sections == {}
    assert "no degree markup" in ds.preamble


def test_attribution_rule_values_distinct() -> None:
    # sanity: every rule the extractor emits is a distinct, stable string
    # (round-tripped through JSON in SpellFeatures.condition_instances).
    values = {r.value for r in AttributionRule}
    assert len(values) == len(list(AttributionRule))
