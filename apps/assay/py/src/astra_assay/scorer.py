"""The one scorer: applies the committed model to an extracted spell.

``assay score``, ``assay score-homebrew`` and ``assay export-codex`` (and ``assay price``'s
export step) all build one :class:`Scorer` and call :meth:`Scorer.score` per extracted row.
The result, a :class:`SpellScore`, takes one of four kinds:

- ``quantitative``: the row has damage EV. It gets a rank-equivalent verdict (HOT, COLD or in
  band) against the ladder; a cantrip gets a budget fraction instead. A row that also carries
  a hostile condition (a hybrid) gets hostile comparables as well.
- ``comparables``: a hostile effect row (no EV). It gets the top 5 official hostile comparables
  and their rank range.
- ``buff-comparables``: a beneficial-effect row. It gets the top 5 official buff comparables
  and their rank range.
- ``ledger``: everything else, with a typed reason code.

``export.score_to_entry`` turns a :class:`SpellScore` into the JSON entry that codex and
``out/homebrew/scores.json`` carry; ``assay score`` prints it.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any

from . import buffs, ledger, pricing, summons
from . import comparables as comparables_mod
from .artifacts import RESULTS_DIR, ModelArtifacts, load_model_artifacts
from .export import CANTRIP_TOO_THIN, NO_COMPARABLE_PROFILE, reason_code_for
from .extract import SkipRecord, SpellFeatures, extract_spell

#: How many official comparables a score lists.
COMPARABLES_K = 5
#: A residual beyond this many ranks either side reads HOT or COLD.
VERDICT_BAND_RANKS = 0.5


@dataclass(frozen=True)
class SpellScore:
    """One extracted row (or skip) scored against the committed model."""

    kind: str  # quantitative | comparables | buff-comparables | ledger
    rank: int
    population: str | None  # hostile | beneficial | summon | None
    #: Damage EV, the structural budget it is compared to, the verdict text and the residual
    #: in ranks. Set only for ``quantitative`` (``residual_ranks`` not for cantrips).
    ev: float | None = None
    budget: float | None = None
    verdict: str | None = None
    residual_ranks: float | None = None
    #: The comparables (hostile or buff), when the row got usable ones.
    comparables: comparables_mod.ComparablesResult | None = None
    #: The ledger's raw reason (for display) and its stable code (for the export).
    ledger_reason: str | None = None
    reason_code: str | None = None
    summon_band: summons.SummonBand | None = None


def verdict_for_residual(residual: float) -> str:
    if residual > VERDICT_BAND_RANKS:
        return f"{residual:+.2f} ranks HOT"
    if residual < -VERDICT_BAND_RANKS:
        return f"{residual:+.2f} ranks COLD"
    return "in band"


class Scorer:
    """Applies one set of model artifacts to extracted rows."""

    def __init__(self, artifacts: ModelArtifacts) -> None:
        self.artifacts = artifacts

    @classmethod
    def from_results(cls, results_dir: Path = RESULTS_DIR) -> Scorer:
        """A scorer over the committed ``results/`` artifacts."""
        return cls(load_model_artifacts(results_dir))

    @property
    def ladder(self) -> pricing.LadderFit:
        return self.artifacts.ladder

    @property
    def cantrip_ladder(self) -> pricing.CantripLadderFit:
        return self.artifacts.cantrip_ladder

    def score(
        self,
        row: SpellFeatures,
        *,
        is_summon_trait: bool = False,
        raw_description: str = "",
    ) -> SpellScore:
        """Score one extracted row. ``is_summon_trait`` adds the summon band (read from
        ``raw_description``) and the ``summon`` population when no other population applies."""
        reason = ledger.classify_row(row)
        if row.ev > 0.0:
            result = self._quantitative(row)
        elif reason is None:
            result = self._hostile_effect(row)
        elif reason == "beneficial-effect":
            result = self._buff(row, reason)
        else:
            result = SpellScore(
                kind="ledger",
                rank=row.rank,
                population=None,
                ledger_reason=reason,
                reason_code=reason_code_for(reason),
            )
        return _with_summon(result, row.rank, is_summon_trait, raw_description)

    def score_skip(
        self,
        skip: SkipRecord,
        doc: dict[str, Any],
        *,
        is_summon_trait: bool = False,
        raw_description: str = "",
    ) -> SpellScore:
        """A spell the extractor skipped: always a ledger entry."""
        reason = ledger.classify_unpriced_skip(doc, skip.reason)
        rank = int((doc.get("system", {}).get("level") or {}).get("value", 0))
        result = SpellScore(
            kind="ledger",
            rank=rank,
            population=None,
            ledger_reason=reason,
            reason_code=reason_code_for(reason),
        )
        return _with_summon(result, rank, is_summon_trait, raw_description)

    def score_doc(
        self, doc: dict[str, Any], file: str
    ) -> tuple[SpellFeatures | SkipRecord, SpellScore]:
        """Extract one Foundry-shaped spell doc (its first variant, as ``extract_spell`` does)
        and score it. Returns the extraction alongside the score."""
        result = extract_spell(doc, file)
        if isinstance(result, SkipRecord):
            return result, self.score_skip(result, doc)
        return result, self.score(result)

    def _quantitative(self, row: SpellFeatures) -> SpellScore:
        active = self.cantrip_ladder if row.is_cantrip else self.ladder
        structural = active.structural_target_range(row) * pricing.action_multiplier(
            row.action_bucket
        )
        has_hostile_condition = any(ci.tier is not None for ci in row.condition_instances)
        residual: float | None = None
        if row.is_cantrip:
            budget = self.cantrip_ladder.budget() * structural
            verdict = f"budget fraction {row.ev / budget:.2f}" if budget > 0 else "n/a"
        else:
            budget = self.ladder.budget(row.rank) * structural
            rank_equiv = (
                pricing.rank_equivalent(row.ev / structural, self.ladder)
                if structural
                else float("nan")
            )
            if math.isnan(rank_equiv):
                verdict = "n/a"
            else:
                residual = rank_equiv - row.rank
                verdict = verdict_for_residual(residual)
        found = None
        if has_hostile_condition and not row.is_cantrip:
            found = self._comparables(
                comparables_mod.build_profile(row, self.ladder), self.artifacts.hostile_corpus, row
            )
        return SpellScore(
            kind="quantitative",
            rank=row.rank,
            population="hostile" if has_hostile_condition else None,
            ev=row.ev,
            budget=budget,
            verdict=verdict,
            residual_ranks=residual,
            comparables=found,
        )

    def _hostile_effect(self, row: SpellFeatures) -> SpellScore:
        if row.is_cantrip:
            return SpellScore(
                kind="ledger", rank=row.rank, population="hostile", reason_code=CANTRIP_TOO_THIN
            )
        found = self._comparables(
            comparables_mod.build_profile(row, self.ladder), self.artifacts.hostile_corpus, row
        )
        if found is None:
            return SpellScore(
                kind="ledger",
                rank=row.rank,
                population="hostile",
                reason_code=NO_COMPARABLE_PROFILE,
            )
        return SpellScore(
            kind="comparables", rank=row.rank, population="hostile", comparables=found
        )

    def _buff(self, row: SpellFeatures, reason: str) -> SpellScore:
        found = None
        if buffs.is_buff_comparable_candidate(row):
            found = self._comparables(
                buffs.build_buff_profile(row), self.artifacts.buff_corpus, row
            )
        if found is None:
            return SpellScore(
                kind="ledger",
                rank=row.rank,
                population="beneficial",
                ledger_reason=reason,
                reason_code=NO_COMPARABLE_PROFILE,
            )
        return SpellScore(
            kind="buff-comparables", rank=row.rank, population="beneficial", comparables=found
        )

    @staticmethod
    def _comparables(
        profile: comparables_mod.ComparableProfile,
        corpus: list[comparables_mod.ComparableProfile],
        row: SpellFeatures,
    ) -> comparables_mod.ComparablesResult | None:
        """The top comparables (never the row itself, by name), or None below the similarity
        floor."""
        res = comparables_mod.comparables_for(
            profile, corpus, k=COMPARABLES_K, exclude_name=row.name
        )
        return res if res.matches else None


def _with_summon(
    result: SpellScore, rank: int, is_summon_trait: bool, raw_description: str
) -> SpellScore:
    if not is_summon_trait:
        return result
    band = summons.summon_band(rank, raw_description)
    population = result.population if result.population is not None else "summon"
    return replace(result, summon_band=band, population=population)
