"""Effect-spell comparables engine (spec 0030 D30-23) — a deterministic
similarity model over hostile-effect and hybrid spells, no fitted
parameters.

The round-3 stakeholder fork (spec status header) killed the original
generative control-spell fit: the review proved Stage A/B's β's, learned
from *partial* discounts on hybrid trainers, do not extrapolate to justify
a control spell's *entire* budget (round-2 build record's V3′ diagnosis —
Fear/Slow/Synesthesia score cold by 1–4 ranks for exactly this reason).
Comparables sidesteps that failure mode entirely: instead of predicting a
POINT score for an effect spell, it finds the most similar OFFICIAL spells
by mechanical profile and reports their rank RANGE. No regression, no
extrapolation — nearest-neighbor by construction.

**The one formula (D30-23):**

    similarity(a, b) = cosine(atoms_a, atoms_b)
                        × (1 − STRUCTURAL_MISMATCH_PENALTY) ** n_mismatches
                        × (INCAP_MISMATCH_MULTIPLIER if incap flags differ else 1.0)

where the atom vector is the union of per-condition×value weighted atoms
(D30-4/8b coverage×duration weight, via `pricing.instance_weight` — the
SAME weighting already used for Stage A/B, reused here as a similarity
metric rather than a price) and the four tier-aggregate weights
(`pricing.tier_weights`), and structural coordinates are action bucket,
effective-target, range bucket, and EV band (present only on damage-bearing
hybrids — a pure hostile-effect spell vs a hybrid is ITSELF a mismatch on
this coordinate, since a hybrid packs a whole extra damage-EV budget the
condition-only atom vector can't see; two bandless spells skip the
coordinate entirely, since there's nothing to compare).
"""

from __future__ import annotations

import math
import statistics
from dataclasses import dataclass, field

from . import pricing
from .conditions import DurationClass, atom_key
from .extract import ActionBucket, EffectiveTarget, RangeBucket, SpellFeatures

#: D30-23 — declared, not fitted. A "small penalty" per mismatching
#: structural coordinate.
STRUCTURAL_MISMATCH_PENALTY = 0.10
#: D30-23 — declared. Halves similarity when the incapacitation flag differs
#: (an incap spell's real-world power depends heavily on the target's own
#: level in a way a non-incap spell's never does — treated as a hard
#: structural signal, not a soft one).
INCAP_MISMATCH_MULTIPLIER = 0.5

#: EV-band thresholds (fraction of same-rank pure budget) — declared
#: constants, used only to add a coarse damage-magnitude coordinate for
#: hybrid spells; absent (None) for pure condition-control rows (D30-23:
#: "damage EV band if any").
_EV_BAND_LOW = 0.33
_EV_BAND_MID = 0.66

_TIER_PREFIX = "tier:"


@dataclass(frozen=True)
class ComparableProfile:
    name: str
    rank: int
    is_cantrip: bool
    atom_vector: dict[str, float]
    action_bucket: ActionBucket
    effective_target: EffectiveTarget
    range_bucket: RangeBucket
    ev_band: str | None
    incapacitation: bool


def _ev_band(row: SpellFeatures, ladder: pricing.LadderFit) -> str | None:
    if row.ev <= 0.0 or row.is_cantrip:
        return None
    budget = ladder.budget(row.rank)
    if budget <= 0:
        return None
    frac = row.ev / budget
    if frac < _EV_BAND_LOW:
        return "low"
    if frac < _EV_BAND_MID:
        return "mid"
    return "high"


def build_atom_vector(row: SpellFeatures, *, boss_weighted: bool = False) -> dict[str, float]:
    """D30-23's weighted atom vector, BOTH per-condition×value (fine-grained
    identity) AND tier-aggregated (coarse severity-class overlap) —
    concatenated into one flat vector namespace (`tier:` prefix avoids
    collision with any real condition name)."""
    atoms: dict[str, float] = {}
    for ci in row.condition_instances:
        if ci.tier is None:
            continue
        key = atom_key(ci.condition, ci.value)
        w = pricing.instance_weight(
            ci.condition, ci.degree, DurationClass(ci.duration), boss_weighted=boss_weighted
        )
        atoms[key] = atoms.get(key, 0.0) + w
    tiers = pricing.tier_weights(row, boss_weighted=boss_weighted)
    for tier, w in tiers.items():
        if w > 0.0:
            atoms[f"{_TIER_PREFIX}{tier.value}"] = w
    return atoms


def build_profile(row: SpellFeatures, ladder: pricing.LadderFit) -> ComparableProfile:
    return ComparableProfile(
        name=row.name,
        rank=row.rank,
        is_cantrip=row.is_cantrip,
        atom_vector=build_atom_vector(row),
        action_bucket=row.action_bucket,
        effective_target=row.effective_target,
        range_bucket=row.range_bucket,
        ev_band=_ev_band(row, ladder),
        incapacitation=row.incapacitation,
    )


def is_comparable_candidate(row: SpellFeatures) -> bool:
    """D30-23's population gate: any hostile effect OR hybrid spell — i.e. a
    row with at least one hostile-priceable (tier-assigned) condition
    instance. Pure-damage-only rows (no atoms at all) and beneficial/
    ambiguous rows are excluded — nothing meaningful to compare on."""
    return any(ci.tier is not None for ci in row.condition_instances)


def _cosine(a: dict[str, float], b: dict[str, float]) -> float:
    if not a or not b:
        return 0.0
    keys = set(a) | set(b)
    dot = sum(a.get(k, 0.0) * b.get(k, 0.0) for k in keys)
    norm_a = math.sqrt(sum(v * v for v in a.values()))
    norm_b = math.sqrt(sum(v * v for v in b.values()))
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return dot / (norm_a * norm_b)


def similarity(a: ComparableProfile, b: ComparableProfile) -> float:
    """The one documented D30-23 formula — see the module docstring."""
    score = _cosine(a.atom_vector, b.atom_vector)
    mismatches = 0
    if a.action_bucket != b.action_bucket:
        mismatches += 1
    if a.effective_target != b.effective_target:
        mismatches += 1
    if a.range_bucket != b.range_bucket:
        mismatches += 1
    # "damage EV band if any" (D30-23): a pure hostile-effect spell (ev_band
    # None) vs a hybrid carrying real damage (ev_band set) is itself a real
    # structural difference — a hybrid packs a whole extra damage-EV budget
    # on top of the same condition profile, which the atom vector alone
    # can't see (cosine is scale-invariant; two spells sharing the same
    # RELATIVE condition mix look identical to it regardless of how much
    # else is bundled in). Only "both sides carry no damage-magnitude
    # signal at all" skips this coordinate entirely.
    a_has_band = a.ev_band is not None
    b_has_band = b.ev_band is not None
    if a_has_band != b_has_band or (a_has_band and b_has_band and a.ev_band != b.ev_band):
        mismatches += 1
    score *= (1.0 - STRUCTURAL_MISMATCH_PENALTY) ** mismatches
    if a.incapacitation != b.incapacitation:
        score *= INCAP_MISMATCH_MULTIPLIER
    return score


def _non_tier_atoms(profile: ComparableProfile) -> set[str]:
    return {k for k in profile.atom_vector if not k.startswith(_TIER_PREFIX)}


@dataclass(frozen=True)
class ComparableMatch:
    name: str
    rank: int
    similarity: float
    shared_atoms: list[str]
    differing_atoms: list[str]


def top_comparables(
    target: ComparableProfile,
    corpus: list[ComparableProfile],
    *,
    k: int = 5,
    exclude_name: str | None = None,
) -> list[ComparableMatch]:
    """Top-k official comparables by descending similarity, excluding
    `exclude_name` (or `target.name` by default — the leave-one-out gate
    passes the target's own name here when the target IS a corpus member)."""
    excluded = exclude_name if exclude_name is not None else target.name
    target_atoms = _non_tier_atoms(target)
    matches: list[ComparableMatch] = []
    for p in corpus:
        if p.name == excluded:
            continue
        sim = similarity(target, p)
        p_atoms = _non_tier_atoms(p)
        shared = sorted(target_atoms & p_atoms)
        differing = sorted(target_atoms ^ p_atoms)
        matches.append(ComparableMatch(p.name, p.rank, sim, shared, differing))
    matches.sort(key=lambda m: (-m.similarity, m.name))
    return matches[:k]


@dataclass(frozen=True)
class ComparablesResult:
    matches: list[ComparableMatch] = field(default_factory=list)
    rank_min: int = 0
    rank_max: int = 0
    rank_median: float = float("nan")
    r10_extrapolation_warning: bool = False


def comparables_for(
    target: ComparableProfile,
    corpus: list[ComparableProfile],
    *,
    k: int = 5,
    exclude_name: str | None = None,
) -> ComparablesResult:
    """D30-23's induced rank RANGE — min–max of the top-k's ranks, median
    highlighted, never a point score. The r10 extrapolation warning (review
    F9: zero hostile r10 trainers) fires whenever ANY of the top-k ranks is
    9 or 10 — the range touches the thin/unobserved top of the ladder."""
    matches = top_comparables(target, corpus, k=k, exclude_name=exclude_name)
    if not matches:
        return ComparablesResult()
    ranks = [m.rank for m in matches]
    return ComparablesResult(
        matches=matches,
        rank_min=min(ranks),
        rank_max=max(ranks),
        rank_median=statistics.median(ranks),
        r10_extrapolation_warning=any(r >= 9 for r in ranks),
    )


def build_corpus(rows: list[SpellFeatures], ladder: pricing.LadderFit) -> list[ComparableProfile]:
    """Every official row eligible per `is_comparable_candidate` — hostile
    effect (ev=0) AND hybrid (ev>0) rows both included, per D30-23 ("For
    any hostile effect or hybrid spell"). Ledger-only rows (beneficial/
    ambiguous/low-confidence/etc.) are excluded by the caller before this
    runs (see `cli.py`'s corpus-build step, which filters through
    `ledger.classify_row`/`classify_hostility` first)."""
    return [build_profile(r, ladder) for r in rows if is_comparable_candidate(r)]


# ---------------------------------------------------------------------------
# JSON round-trip — `results/comparables-corpus.json` is a committed,
# reproducible artifact (mirrors `fitted-params.json`'s pattern) so
# `assay score` never needs the live snapshot to compare a homebrew spell.
# ---------------------------------------------------------------------------


def profile_to_json(p: ComparableProfile) -> dict:
    return {
        "name": p.name,
        "rank": p.rank,
        "is_cantrip": p.is_cantrip,
        "atom_vector": p.atom_vector,
        "action_bucket": p.action_bucket.value,
        "effective_target": p.effective_target.value,
        "range_bucket": p.range_bucket.value,
        "ev_band": p.ev_band,
        "incapacitation": p.incapacitation,
    }


def profile_from_json(d: dict) -> ComparableProfile:
    return ComparableProfile(
        name=d["name"],
        rank=d["rank"],
        is_cantrip=d["is_cantrip"],
        atom_vector=dict(d["atom_vector"]),
        action_bucket=ActionBucket(d["action_bucket"]),
        effective_target=EffectiveTarget(d["effective_target"]),
        range_bucket=RangeBucket(d["range_bucket"]),
        ev_band=d["ev_band"],
        incapacitation=d["incapacitation"],
    )
