"""Codex export artifact (round 4).

``assay export-codex`` builds the cross-track CONTRACT JSON consumed by
codex's `EntityPage` Assay block (Track B) —
``apps/codex/web/data/assay/spell-power.json`` in the real deploy, but this
Track (A) writes it ONLY to ``apps/assay/py/out/spell-power.json``; the
orchestrator places it into codex's data dir at integration time (never
write into ``apps/codex/web`` from this side).

**Determinism**: ``json.dumps(..., sort_keys=True)``, no
timestamps, ``schemaVersion: 1``; comparables in the engine's own
``(-similarity, name)`` order (`comparables.top_comparables`'s existing
sort — nothing extra needed here).

**Entries keyed by codex id** (``spell/<slug>``), one per FILE (never
``remaster==true`` filtering — every main-list spell file gets an entry,
including the 389 never-remastered ones; "non-@legacy" is a codex-side id
concern the orchestrator reconciles at integration). **Variant
collapse** (34 real multi-row slugs): a file that produced more than one
``SpellFeatures`` row (an overlay/manual-scaling variant family) collapses
to ONE entry — primary = the non-variant row if one exists, else the
2-action variant, else the first by variant label — others ride under
``variants[]``.

Each entry is ``score_to_entry`` over one ``scorer.Scorer.score`` result.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any

from . import comparables as comparables_mod
from .extract import ExtractResult, SkipRecord, SpellFeatures, load_spell_json

if TYPE_CHECKING:
    # scorer.py imports this module's reason codes, so these imports are for typing only.
    from .scorer import Scorer, SpellScore

SCHEMA_VERSION = 1

#: The curated reason-code map (the P13 `formatFacetValue` lesson — raw
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
    "raw-modifier-only (not priced — severity is priced only from condition tiers)": (
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
    """`ComparableProfile` gains `file`->slug — a pack file's
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


def score_to_entry(score: SpellScore) -> dict[str, Any]:
    """The JSON entry for one scored row: the shape codex reads from ``spell-power.json`` and
    ``score-homebrew`` writes per spell."""
    entry: dict[str, Any] = {"rank": score.rank, "kind": score.kind, "population": score.population}
    if score.kind == "quantitative":
        entry["ev"] = score.ev
        entry["budget"] = score.budget
        entry["verdict"] = score.verdict
        if score.residual_ranks is not None:
            entry["residualRanks"] = score.residual_ranks
    if score.comparables is not None:
        entry["comparables"] = _matches_to_json(score.comparables.matches)
        entry["rankRange"] = [score.comparables.rank_min, score.comparables.rank_max]
    if score.reason_code is not None:
        entry["reasonCode"] = score.reason_code
    if score.summon_band is not None:
        entry["summonBand"] = {
            "baseLevel": score.summon_band.base_level,
            "curveLevel": score.summon_band.curve_level,
            "delta": score.summon_band.delta,
        }
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
    scorer: Scorer,
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
            entry = score_to_entry(
                scorer.score(
                    primary, is_summon_trait=is_summon_trait, raw_description=raw_description
                )
            )
            if others:
                report.variant_collapse_count += 1
                variants = []
                for o in sorted(others, key=lambda r: r.variant_label or r.name):
                    v_entry = score_to_entry(
                        scorer.score(
                            o, is_summon_trait=is_summon_trait, raw_description=raw_description
                        )
                    )
                    v_entry["label"] = o.variant_label or o.name
                    variants.append(v_entry)
                entry["variants"] = variants
        else:
            entry = score_to_entry(
                scorer.score_skip(
                    skips_by_file[file][0],
                    _doc(file),
                    is_summon_trait=is_summon_trait,
                    raw_description=raw_description,
                )
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
