"""Unit tests for the D30-38 codex export artifact (spec 0030 round 4) —
reason-code mapping, the similarity floor (both engines), variant collapse,
and a small on-disk integration exercising `build_export` end-to-end
determinism."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from astra_assay import comparables, export
from astra_assay.extract import (
    ActionBucket,
    DamageTypeClass,
    EffectiveTarget,
    ExtractResult,
    RangeBucket,
    SkipRecord,
    SpellFeatures,
    TargetingClass,
)


def _row(
    name: str, file: str, *, ev: float = 0.0, rank: int = 3, **overrides: Any
) -> SpellFeatures:
    base: dict[str, Any] = dict(
        name=name,
        source_id=name,
        file=file,
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
        condition_ref=False,
        condition_instances=[],
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
    base.update(overrides)
    return SpellFeatures(**base)


def _profile(
    name: str, file: str, rank: int, atoms: dict[str, float]
) -> comparables.ComparableProfile:
    return comparables.ComparableProfile(
        name=name,
        rank=rank,
        is_cantrip=False,
        atom_vector=atoms,
        action_bucket=ActionBucket.TWO,
        effective_target=EffectiveTarget.SINGLE,
        range_bucket=RangeBucket.LE30,
        ev_band=None,
        incapacitation=False,
        file=file,
    )


# ---------------------------------------------------------------------------
# reason_code_for — curated map + fallback.
# ---------------------------------------------------------------------------


def test_reason_code_for_known_reason() -> None:
    assert export.reason_code_for("summon") == "summon"
    assert export.reason_code_for("wall/terrain") == "wall-terrain"


def test_reason_code_for_unknown_reason_falls_back() -> None:
    """Raw internal prose (a dynamic formula-rejection string) never leaks —
    the P13 `formatFacetValue` lesson."""
    assert (
        export.reason_code_for("unrecognized formula shape: 'xyz'") == export.FALLBACK_REASON_CODE
    )


# ---------------------------------------------------------------------------
# Similarity floor (D30-38) — both engines, via `comparables.comparables_for`.
# ---------------------------------------------------------------------------


def test_similarity_floor_empty_shared_atoms_yields_no_comparables() -> None:
    target = _profile("Target", "target.json", 3, {"onlyA": 1.0})
    corpus = [_profile("Other", "other.json", 3, {"onlyB": 1.0})]
    matches = comparables.top_comparables(target, corpus, k=5)
    assert not comparables.has_usable_comparables(matches)
    result = comparables.comparables_for(target, corpus, k=5)
    assert result.matches == []


def test_similarity_floor_real_shared_atom_passes() -> None:
    target = _profile("Target", "target.json", 3, {"shared": 1.0})
    corpus = [_profile("Other", "other.json", 3, {"shared": 1.0})]
    matches = comparables.top_comparables(target, corpus, k=5)
    assert comparables.has_usable_comparables(matches)


# ---------------------------------------------------------------------------
# _pick_primary — variant collapse (D30-38).
# ---------------------------------------------------------------------------


def test_pick_primary_prefers_non_variant_row() -> None:
    base = _row("Avenging Wildwood", "avenging-wildwood.json")
    variant = _row(
        "Avenging Wildwood (Slashing)",
        "avenging-wildwood.json",
        is_variant=True,
        variant_label="Slashing",
    )
    primary, others = export._pick_primary([variant, base])
    assert primary is base
    assert others == [variant]


def test_pick_primary_falls_back_to_two_action_variant() -> None:
    one_action = _row(
        "Force Barrage (1 action)",
        "force-barrage.json",
        is_variant=True,
        variant_label="1 action",
        action_bucket=ActionBucket.ONE,
    )
    two_action = _row(
        "Force Barrage (2 actions)",
        "force-barrage.json",
        is_variant=True,
        variant_label="2 actions",
        action_bucket=ActionBucket.TWO,
    )
    primary, others = export._pick_primary([one_action, two_action])
    assert primary is two_action
    assert others == [one_action]


# ---------------------------------------------------------------------------
# build_export — small on-disk integration: determinism, variant collapse,
# codex id, ledger reason mapping, summon band.
# ---------------------------------------------------------------------------


def _write_spell(dir_: Path, rel: str, doc: dict) -> None:
    path = dir_ / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(doc), encoding="utf-8")


def test_build_export_determinism_and_variant_collapse(tmp_path: Path) -> None:
    spells_dir = tmp_path / "spells"
    _write_spell(
        spells_dir,
        "fireball.json",
        {
            "name": "Fireball",
            "system": {
                "traits": {"value": []},
                "level": {"value": 3},
                "description": {"value": "<p>Boom.</p>"},
            },
        },
    )
    _write_spell(
        spells_dir,
        "summon-fey.json",
        {
            "name": "Summon Fey",
            "system": {
                "traits": {"value": ["summon"]},
                "level": {"value": 1},
                "description": {
                    "value": "<p>You summon a creature that has the fey trait and whose "
                    "level is -1 to fight for you.</p>"
                },
            },
        },
    )

    import astra_assay.pricing as pricing_mod

    ladder = pricing_mod.LadderFit(
        intercept=1.5,
        slope=1.0,
        effective_target_coef={},
        range_coef={},
        n_obs=1,
        r_squared=1.0,
        excluded_singletons=True,
    )
    cantrip_ladder = pricing_mod.CantripLadderFit(
        intercept=1.0, effective_target_coef={}, range_coef={}, n_obs=1, r_squared=1.0
    )

    fireball_row = _row("Fireball", "fireball.json", ev=21.0, rank=3)
    fireball_variant = _row(
        "Fireball (variant)",
        "fireball.json",
        ev=21.0,
        rank=3,
        is_variant=True,
        variant_label="variant",
    )
    extract_result = ExtractResult(
        rows=[fireball_row, fireball_variant],
        skipped=[
            SkipRecord(
                name="Summon Fey",
                source_id="x",
                file="summon-fey.json",
                reason="no-priceable-effect (x)",
            )
        ],
    )

    artifact1, report1 = export.build_export(
        extract_result, spells_dir, ladder, cantrip_ladder, [], []
    )
    artifact2, _ = export.build_export(extract_result, spells_dir, ladder, cantrip_ladder, [], [])
    assert export.dump_export(artifact1) == export.dump_export(artifact2)

    entries = artifact1["entries"]
    assert "spell/fireball" in entries
    assert entries["spell/fireball"]["kind"] == "quantitative"
    assert len(entries["spell/fireball"]["variants"]) == 1
    assert entries["spell/fireball"]["variants"][0]["label"] == "variant"

    assert entries["spell/summon-fey"]["kind"] == "ledger"
    assert entries["spell/summon-fey"]["reasonCode"] == "summon"
    assert entries["spell/summon-fey"]["population"] == "summon"
    assert entries["spell/summon-fey"]["summonBand"] == {
        "baseLevel": -1,
        "curveLevel": -1,
        "delta": 0,
    }

    assert report1.entry_count == 2
    assert report1.variant_collapse_count == 1
