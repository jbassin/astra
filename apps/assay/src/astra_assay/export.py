"""Codex export artifact (spec 0030 D30-38, round 4).

``assay export-codex`` builds the cross-track CONTRACT JSON consumed by
codex's `EntityPage` Assay block (Track B, D30-39/40) —
``apps/codex/data/assay/spell-power.json`` in the real deploy, but this
Track (A) writes it ONLY to ``apps/assay/out/spell-power.json``; the
orchestrator places it into codex's data dir at integration time (never
write into ``apps/codex`` from this side).

**Determinism** (D30-38): ``json.dumps(..., sort_keys=True)``, no
timestamps, ``schemaVersion: 1``; comparables in the engine's own
``(-similarity, name)`` order (`comparables.top_comparables`'s existing
sort — nothing extra needed here).

**Entries keyed by codex id** (``spell/<slug>``), one per FILE (never
``remaster==true`` filtering — every main-list spell file gets an entry,
including the 389 never-remastered ones; "non-@legacy" is a codex-side id
concern the orchestrator reconciles at integration, D30-41). **Variant
collapse** (34 real multi-row slugs): a file that produced more than one
``SpellFeatures`` row (an overlay/manual-scaling variant family) collapses
to ONE entry — primary = the non-variant row if one exists, else the
2-action variant, else the first by variant label — others ride under
``variants[]``.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from . import buffs, ledger, pricing, summons
from . import comparables as comparables_mod
from .extract import ExtractResult, SkipRecord, SpellFeatures, load_spell_json

SCHEMA_VERSION = 1

#: D30-38's curated reason-code map (the P13 `formatFacetValue` lesson — raw
#: internal ledger prose NEVER crosses to Track B; a stable typed code does).
#: Anything not listed here (dynamic formula-rejection strings, unforeseen
#: shapes) buckets to `FALLBACK_REASON_CODE`, never leaks verbatim.
REASON_CODE_MAP: dict[str, str] = {
    "long-cast (out of combat-damage scope)": "long-cast",
    "non-literal formula (@item.rank arithmetic)": "non-literal-formula",
    "summon": "summon",
    "wall/terrain": "wall-terrain",
    "teleport/utility": "teleport-utility",
    "effect-item payload": "effect-item-payload",
    "utility/no-mechanical-payload": "utility",
    "low-confidence extraction": "low-confidence",
    "routing-ambiguous": "ambiguous",
    "raw-modifier-only (not priced — D30-5 restricts severity to condition tiers)": (
        "unpriced-modifier"
    ),
    "no-priceable-effect": "no-mechanical-payload",
    "extraction edge case": "extraction-edge-case",
    "overlay-all-flavor-only": "flavor-only",
    "manual-scaling-base-extraction-failed": "extraction-edge-case",
}
FALLBACK_REASON_CODE = "other"
NO_COMPARABLE_PROFILE = "no-comparable-profile"
CANTRIP_TOO_THIN = "cantrip-too-thin"


def reason_code_for(raw_reason: str) -> str:
    return REASON_CODE_MAP.get(raw_reason, FALLBACK_REASON_CODE)


def _slug_for(file: str) -> str:
    """D30-38: `ComparableProfile` gains `file`->slug — a pack file's
    basename IS `sluggify(name)` (the codex P1 finding, 0 disagreements over
    28,636 real docs), so the slug is simply the file stem."""
    return Path(file).stem


def _codex_id(slug: str) -> str:
    return f"spell/{slug}"


def _matches_to_json(matches: list[comparables_mod.ComparableMatch]) -> list[dict[str, Any]]:
    return [{"id": _codex_id(_slug_for(m.file)), "name": m.name, "rank": m.rank} for m in matches]


@dataclass
class ExportReport:
    entry_count: int = 0
    kind_counts: dict[str, int] = field(default_factory=dict)
    population_counts: dict[str, int] = field(default_factory=dict)
    unmatched_ids: list[str] = field(default_factory=list)
    variant_collapse_count: int = 0


def _quantitative_fields(
    row: SpellFeatures,
    ladder: pricing.LadderFit,
    cantrip_ladder: pricing.CantripLadderFit,
) -> dict[str, Any]:
    active = cantrip_ladder if row.is_cantrip else ladder
    structural = active.structural_target_range(row) * pricing.action_multiplier(row.action_bucket)
    entry: dict[str, Any] = {"kind": "quantitative", "rank": row.rank, "ev": row.ev}
    has_hostile_condition = any(ci.tier is not None for ci in row.condition_instances)
    entry["population"] = "hostile" if has_hostile_condition else None
    if row.is_cantrip:
        budget = cantrip_ladder.budget() * structural
        entry["budget"] = budget
        entry["verdict"] = f"budget fraction {row.ev / budget:.2f}" if budget > 0 else "n/a"
    else:
        budget = ladder.budget(row.rank) * structural
        entry["budget"] = budget
        rank_equiv = (
            pricing.rank_equivalent(row.ev / structural, ladder) if structural else float("nan")
        )
        if math.isnan(rank_equiv):
            entry["verdict"] = "n/a"
        else:
            residual = rank_equiv - row.rank
            entry["residualRanks"] = residual
            if residual > 0.5:
                entry["verdict"] = f"{residual:+.2f} ranks HOT"
            elif residual < -0.5:
                entry["verdict"] = f"{residual:+.2f} ranks COLD"
            else:
                entry["verdict"] = "in band"
    return entry


def _attach_hostile_comparables(
    entry: dict[str, Any],
    row: SpellFeatures,
    ladder: pricing.LadderFit,
    hostile_corpus: list[comparables_mod.ComparableProfile],
) -> None:
    if row.is_cantrip:
        return
    profile = comparables_mod.build_profile(row, ladder)
    matches = comparables_mod.top_comparables(profile, hostile_corpus, k=5, exclude_name=row.name)
    if not comparables_mod.has_usable_comparables(matches):
        return
    res = comparables_mod.comparables_for(profile, hostile_corpus, k=5, exclude_name=row.name)
    entry["comparables"] = _matches_to_json(res.matches)
    entry["rankRange"] = [res.rank_min, res.rank_max]


def _build_entry_for_row(
    row: SpellFeatures,
    *,
    ladder: pricing.LadderFit,
    cantrip_ladder: pricing.CantripLadderFit,
    hostile_corpus: list[comparables_mod.ComparableProfile],
    buff_corpus: list[comparables_mod.ComparableProfile],
    is_summon_trait: bool,
    raw_description: str,
) -> dict[str, Any]:
    reason = ledger.classify_row(row)
    entry: dict[str, Any]

    if row.ev > 0.0:
        entry = _quantitative_fields(row, ladder, cantrip_ladder)
        has_hostile_condition = any(ci.tier is not None for ci in row.condition_instances)
        if has_hostile_condition:
            _attach_hostile_comparables(entry, row, ladder, hostile_corpus)
    elif reason is None:
        # A hostile condition-control row (Stage-B scored, ev==0) — D30-23's
        # recommended tool is comparables, not the superseded fitted score.
        entry = {"rank": row.rank, "population": "hostile"}
        if row.is_cantrip:
            entry["kind"] = "ledger"
            entry["reasonCode"] = CANTRIP_TOO_THIN
        else:
            profile = comparables_mod.build_profile(row, ladder)
            matches = comparables_mod.top_comparables(
                profile, hostile_corpus, k=5, exclude_name=row.name
            )
            if comparables_mod.has_usable_comparables(matches):
                res = comparables_mod.comparables_for(
                    profile, hostile_corpus, k=5, exclude_name=row.name
                )
                entry["kind"] = "comparables"
                entry["comparables"] = _matches_to_json(res.matches)
                entry["rankRange"] = [res.rank_min, res.rank_max]
            else:
                entry["kind"] = "ledger"
                entry["reasonCode"] = NO_COMPARABLE_PROFILE
    elif reason == "beneficial-effect":
        entry = {"rank": row.rank, "population": "beneficial"}
        if buffs.is_buff_comparable_candidate(row):
            profile = buffs.build_buff_profile(row)
            matches = comparables_mod.top_comparables(
                profile, buff_corpus, k=5, exclude_name=row.name
            )
            if comparables_mod.has_usable_comparables(matches):
                res = comparables_mod.comparables_for(
                    profile, buff_corpus, k=5, exclude_name=row.name
                )
                entry["kind"] = "buff-comparables"
                entry["comparables"] = _matches_to_json(res.matches)
                entry["rankRange"] = [res.rank_min, res.rank_max]
            else:
                entry["kind"] = "ledger"
                entry["reasonCode"] = NO_COMPARABLE_PROFILE
        else:
            entry["kind"] = "ledger"
            entry["reasonCode"] = NO_COMPARABLE_PROFILE
    else:
        entry = {
            "rank": row.rank,
            "kind": "ledger",
            "population": None,
            "reasonCode": reason_code_for(reason),
        }

    if is_summon_trait:
        band = summons.summon_band(row.rank, raw_description)
        if band is not None:
            entry["summonBand"] = {
                "baseLevel": band.base_level,
                "curveLevel": band.curve_level,
                "delta": band.delta,
            }
        if entry.get("population") is None:
            entry["population"] = "summon"
    return entry


def _build_entry_for_skip(
    skip: SkipRecord,
    *,
    raw_doc: dict[str, Any],
    is_summon_trait: bool,
    raw_description: str,
) -> dict[str, Any]:
    reason = ledger.classify_unpriced_skip(raw_doc, skip.reason)
    rank = int((raw_doc.get("system", {}).get("level") or {}).get("value", 0))
    entry: dict[str, Any] = {
        "rank": rank,
        "kind": "ledger",
        "population": None,
        "reasonCode": reason_code_for(reason),
    }
    if is_summon_trait:
        band = summons.summon_band(rank, raw_description)
        if band is not None:
            entry["summonBand"] = {
                "baseLevel": band.base_level,
                "curveLevel": band.curve_level,
                "delta": band.delta,
            }
        entry["population"] = "summon"
    return entry


def _pick_primary(rows: list[SpellFeatures]) -> tuple[SpellFeatures, list[SpellFeatures]]:
    non_variant = [r for r in rows if not r.is_variant]
    if non_variant:
        primary = non_variant[0]
    else:
        two_action = [r for r in rows if r.action_bucket.value == "2"]
        by_label = sorted(rows, key=lambda r: r.variant_label or "")
        primary = two_action[0] if two_action else by_label[0]
    others = [r for r in rows if r is not primary]
    return primary, others


def build_export(
    extract_result: ExtractResult,
    spells_dir: Path,
    ladder: pricing.LadderFit,
    cantrip_ladder: pricing.CantripLadderFit,
    hostile_corpus: list[comparables_mod.ComparableProfile],
    buff_corpus: list[comparables_mod.ComparableProfile],
) -> tuple[dict[str, Any], ExportReport]:
    rows_by_file: dict[str, list[SpellFeatures]] = {}
    for r in extract_result.rows:
        rows_by_file.setdefault(r.file, []).append(r)
    skips_by_file: dict[str, list[SkipRecord]] = {}
    for s in extract_result.skipped:
        skips_by_file.setdefault(s.file, []).append(s)

    doc_cache: dict[str, dict[str, Any]] = {}

    def _doc(file: str) -> dict[str, Any]:
        if file not in doc_cache:
            doc_cache[file] = load_spell_json(spells_dir / file)
        return doc_cache[file]

    def _summon_info(file: str) -> tuple[bool, str]:
        doc = _doc(file)
        sysd = doc.get("system", {})
        traits = (sysd.get("traits") or {}).get("value") or []
        is_summon = "summon" in [str(t).lower() for t in traits]
        description = (sysd.get("description") or {}).get("value", "") or ""
        return is_summon, description

    entries: dict[str, Any] = {}
    report = ExportReport()

    all_files = sorted(set(rows_by_file) | set(skips_by_file))
    for file in all_files:
        slug = _slug_for(file)
        codex_id = _codex_id(slug)
        is_summon_trait, raw_description = _summon_info(file)

        if file in rows_by_file:
            rows = rows_by_file[file]
            primary, others = _pick_primary(rows)
            entry = _build_entry_for_row(
                primary,
                ladder=ladder,
                cantrip_ladder=cantrip_ladder,
                hostile_corpus=hostile_corpus,
                buff_corpus=buff_corpus,
                is_summon_trait=is_summon_trait,
                raw_description=raw_description,
            )
            if others:
                report.variant_collapse_count += 1
                variants = []
                for o in sorted(others, key=lambda r: r.variant_label or r.name):
                    v_entry = _build_entry_for_row(
                        o,
                        ladder=ladder,
                        cantrip_ladder=cantrip_ladder,
                        hostile_corpus=hostile_corpus,
                        buff_corpus=buff_corpus,
                        is_summon_trait=is_summon_trait,
                        raw_description=raw_description,
                    )
                    v_entry["label"] = o.variant_label or o.name
                    variants.append(v_entry)
                entry["variants"] = variants
        else:
            entry = _build_entry_for_skip(
                skips_by_file[file][0],
                raw_doc=_doc(file),
                is_summon_trait=is_summon_trait,
                raw_description=raw_description,
            )

        entries[codex_id] = entry
        report.kind_counts[entry["kind"]] = report.kind_counts.get(entry["kind"], 0) + 1
        pop = entry.get("population")
        pop_key = pop if pop is not None else "null"
        report.population_counts[pop_key] = report.population_counts.get(pop_key, 0) + 1

    report.entry_count = len(entries)
    report.unmatched_ids = _find_unmatched_ids(entries)
    artifact = {"schemaVersion": SCHEMA_VERSION, "entries": entries}
    return artifact, report


def _find_unmatched_ids(entries: dict[str, Any]) -> list[str]:
    """W-D's "unmatched ids" self-consistency check: every `comparables[].id`
    a comparable-bearing entry cites (top-level AND inside `variants[]`) must
    resolve to a REAL entry in this SAME artifact — every corpus profile's
    `file` comes from a real extracted `SpellFeatures.file`, which always has
    its own entry, so this is provably empty; a non-empty result means the
    slug derivation drifted (STOP, not silently ship a dangling id)."""
    unmatched: set[str] = set()
    for entry in entries.values():
        for sub in (entry, *entry.get("variants", [])):
            for c in sub.get("comparables", []):
                if c["id"] not in entries:
                    unmatched.add(c["id"])
    return sorted(unmatched)


def dump_export(artifact: dict[str, Any]) -> str:
    return json.dumps(artifact, sort_keys=True, indent=2) + "\n"
