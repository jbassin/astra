"""Buff-spell comparables + prior anchors (spec 0030 D30-36, round 4).

Round 3 shipped comparables for HOSTILE effect spells only ("beneficial-buff
comparables/pricing" was explicitly out of scope, §3). D30-36 builds the
mirror-image population for BENEFICIAL spells — reusing `comparables.py`'s
generic similarity engine wholesale (it was already atom-vector + structural-
coordinate generic, never condition-specific) rather than duplicating it.

**Population (CONSTRUCTIVE — the draft's "round-3 beneficial" bucket alone
missed the mass, per the spec's headline blocker):** every row `ledger.
classify_row` routes to `"beneficial-effect"` — which, after this round's
`ledger.py`/`extract.py` changes, is now the UNION of:

1. round-3's own beneficial-condition rows (a real `condition_ref`, every
   instance non-priceable/non-graduated — Invisible, Quickened, …);
2. raw-modifier-only rows (`status_modifiers` present, no condition ref at
   all) that pass D30-22's hostility routing beneficial — Heroism,
   Protection;
3. effect-ref-bearing rows PROMOTED out of the round 1-3 skip ledger (D30-35's
   join gave `extract.py` a real priceable signal it never had before),
   routed through the SAME D30-22 test — Mystic Armor, Invisibility's own
   effect item, Mountain Resilience, False Vitality, Sure Strike, Resist
   Energy, Blur, and 8 hostile-shaped promoted rows that correctly stay OUT
   of this bucket (Blood Vendetta, Fungal Infestation, …).

See the build record for the re-derived split counts vs. the spec's
pre-promotion estimates (81/19/65/89 — a draft-era measurement the fix is
EXPECTED to move, not a locked pin)."""

from __future__ import annotations

import re
from dataclasses import dataclass

from . import comparables as comparables_mod
from . import ledger
from .extract import SpellFeatures

BUFF_POPULATION_REASON = "beneficial-effect"

#: `ComparableProfile.atom_vector` namespace for a beneficial-but-non-
#: priceable condition instance (Invisible, Quickened, …) — distinct from
#: the hostile engine's `tier:` prefix so the two atom spaces never collide
#: if a row somehow carried both (none in the real corpus do).
_TAG_PREFIX = "tag:"

_STAT_KEYWORD_MAP: tuple[tuple[str, str], ...] = (
    ("attack", "modifier:attack"),
    ("perception", "modifier:perception"),
    ("saving throw", "modifier:saving-throw"),
    ("save", "modifier:saving-throw"),
    ("skill", "modifier:skill-check"),
    ("armor class", "modifier:ac"),
    ("speed", "modifier:speed"),
)

_NON_WORD_RE = re.compile(r"[^a-z0-9]+")


def _normalize_modifier_stat(target_stat: str) -> str:
    """Collapse `StatusModifier`'s free-text `target_stat` prose ("attack
    rolls", "Perception checks", "AC", …) into the SAME selector-class
    namespace the effect join already uses (`modifier:attack`, `modifier:
    perception`, …) — a small, documented keyword map, not a fitted
    classifier. An unrecognized stat still gets its own stable slug key
    (never silently dropped)."""
    t = target_stat.lower().strip()
    if t == "ac":
        return "modifier:ac"
    for keyword, label in _STAT_KEYWORD_MAP:
        if keyword in t:
            return label
    slug = _NON_WORD_RE.sub("-", t).strip("-")[:40]
    return f"modifier:{slug or 'unknown'}"


def build_buff_atom_vector(row: SpellFeatures) -> dict[str, float]:
    """D30-36's buff atom vector: the joined effect's atoms (already
    selector-namespaced by `effects.py`) + the row's own raw status
    modifiers (normalized into the same namespace) + a unit tag atom per
    beneficial/non-priceable condition instance (Invisible, Quickened, …) —
    concatenated flat, mirroring `comparables.build_atom_vector`'s tier-
    aggregate concatenation trick."""
    atoms: dict[str, float] = {}
    if row.effect_profile is not None:
        for k, v in row.effect_profile.atoms.items():
            atoms[k] = atoms.get(k, 0.0) + v
        if row.effect_profile.resistance_choice_of_energy:
            # A mustache-templated resistance type (Resist Energy's own
            # shape — the player picks the energy at cast time, so there's
            # no concrete `resistance:<type>` atom) is still real
            # comparable signal: a unit atom marking "this buff grants a
            # choice-of-energy resistance", distinct from a concrete type.
            atoms["resistance:choice-of-energy"] = (
                atoms.get("resistance:choice-of-energy", 0.0) + 1.0
            )
    for m in row.status_modifiers:
        try:
            delta = abs(float(m.delta))
        except ValueError:
            continue
        key = _normalize_modifier_stat(m.target_stat)
        atoms[key] = atoms.get(key, 0.0) + delta
    for ci in row.condition_instances:
        # D30-36 — EVERY condition instance on a buff-population row becomes
        # a tag atom, not just the tier=None (non-priceable) ones: the
        # condition-tier table doesn't distinguish "this condition applies
        # to the CASTER as a beneficial side effect" (Sure Strike's own
        # Concealed/Hidden, tier=T1) from a real hostile rider — a beneficial
        # row reaching this point already passed D30-22's hostility routing,
        # so any condition instance it carries is, by construction, part of
        # its OWN buff shape, priceable-tier or not.
        key = f"{_TAG_PREFIX}{ci.condition}"
        atoms[key] = atoms.get(key, 0.0) + 1.0
    return atoms


def build_buff_profile(row: SpellFeatures) -> comparables_mod.ComparableProfile:
    """Buffs never carry a damage EV band (D30-36: "no pricing — the
    tombstone stands") — `ev_band` is always `None`, so the hostile engine's
    band-mismatch structural coordinate degenerates to "both sides bandless,
    skip the coordinate" for every buff-vs-buff comparison (never a
    mismatch, since the population is buff-only by the firewall below)."""
    return comparables_mod.ComparableProfile(
        name=row.name,
        rank=row.rank,
        is_cantrip=row.is_cantrip,
        atom_vector=build_buff_atom_vector(row),
        action_bucket=row.action_bucket,
        effective_target=row.effective_target,
        range_bucket=row.range_bucket,
        ev_band=None,
        incapacitation=row.incapacitation,
        file=row.file,
    )


def is_buff_population_row(row: SpellFeatures) -> bool:
    return ledger.classify_row(row) == BUFF_POPULATION_REASON


def is_buff_comparable_candidate(row: SpellFeatures) -> bool:
    """D30-36's comparables-corpus gate: population membership AND a
    non-empty atom vector (some rows — e.g. a promoted effect-join row whose
    only rule content is tag-only, like a bare `RollOption`/`Note` effect —
    carry zero comparable signal; they stay in the buff CATALOG/ledger but
    can't meaningfully be compared)."""
    return is_buff_population_row(row) and bool(build_buff_atom_vector(row))


def build_buff_corpus(rows: list[SpellFeatures]) -> list[comparables_mod.ComparableProfile]:
    """The beneficial-vs-beneficial comparables population — a hard firewall
    (D30-36): this corpus NEVER mixes with the hostile-effect corpus, and
    `top_comparables`/`comparables_for` are called with ONLY this list, never
    the combined one."""
    return [build_buff_profile(r) for r in rows if is_buff_comparable_candidate(r)]


# ---------------------------------------------------------------------------
# Prior-card buff section (D30-36: "pack-curve anchors ... labeled priors")
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class PackCurvePoint:
    rank: int
    value: float


@dataclass(frozen=True)
class PackCurveAnchor:
    label: str
    effect_name: str
    atom_key: str
    points: list[PackCurvePoint]
    note: str


#: D30-36's three named pack-curve anchors — real spell-effect items, real
#: FlatModifier/Resistance rule expressions, re-evaluated at a handful of
#: illustrative ranks (the spell's own heightened tiers where known). This is
#: DOCUMENTATION, not a fit: every value is the SAME `effects.
#: build_effect_profile` evaluation the join itself uses, just run at more
#: than one rank to show the curve. Heroism's base-rank profile carries +1
#: (the D30-1..3 damage-ladder-style "evaluate once, at base rank" rule,
#: unchanged) — the +2/+3 heightened tiers live ONLY in this card, by design.
_PACK_CURVE_SPECS: tuple[tuple[str, str, tuple[int, ...]], ...] = (
    ("Spell Effect: Heroism", "modifier:attack", (3, 6, 9)),
    ("Spell Effect: Mystic Armor", "modifier:ac", (1, 4, 6, 10)),
    ("Spell Effect: Mountain Resilience", "resistance:physical", (5, 6, 8, 10)),
)
_PACK_CURVE_LABELS = {
    "Spell Effect: Heroism": "Heroism — attack/save/skill/Perception status bonus",
    "Spell Effect: Mystic Armor": "Mystic Armor — AC item bonus",
    "Spell Effect: Mountain Resilience": "Mountain Resilience — physical resistance",
}


def build_pack_curve_anchors(
    effect_index: dict[str, dict],
) -> list[PackCurveAnchor]:
    from . import effects  # noqa: PLC0415 — avoid a needless import at module load

    out: list[PackCurveAnchor] = []
    for effect_name, atom_key, ranks in _PACK_CURVE_SPECS:
        doc = effect_index.get(effect_name)
        if doc is None:
            continue
        points: list[PackCurvePoint] = []
        for rank in ranks:
            profile = effects.build_effect_profile(effect_name, doc, rank)
            value = profile.atoms.get(atom_key)
            if value is not None:
                points.append(PackCurvePoint(rank=rank, value=value))
        if points:
            out.append(
                PackCurveAnchor(
                    label=_PACK_CURVE_LABELS.get(effect_name, effect_name),
                    effect_name=effect_name,
                    atom_key=atom_key,
                    points=points,
                    note=(
                        "the base-rank row above carries only the FIRST point below — "
                        "heightened tiers live in this card only, by design (D30-36)"
                    ),
                )
            )
    return out


# ---------------------------------------------------------------------------
# W-B — leave-one-out neighbor spot-check (mirrors report2.validate_v_a_loo)
# ---------------------------------------------------------------------------

#: The W-B REMASTER-NAMED roster (spec's own list — the draft named two
#: spells that don't exist in the pack, corrected per the status header:
#: stoneskin/false life -> Mountain Resilience/False Vitality).
ROSTER_W_B: tuple[str, ...] = (
    "Heroism",
    "Mystic Armor",
    "Invisibility",
    "Haste",
    "Resist Energy",
    "Sure Strike",
    "Mountain Resilience",
    "False Vitality",
    "Blur",
    "Protection",
)


@dataclass(frozen=True)
class BuffLooResult:
    name: str
    own_rank: int | None
    neighbor_names: list[str]
    neighbor_ranks: list[int]
    note: str = ""


def validate_w_b_loo(
    roster: tuple[str, ...], corpus: list[comparables_mod.ComparableProfile]
) -> list[BuffLooResult]:
    """W-B: qualitative neighbor-spot recording only (spec: "±1 median-rank
    rate REPORTED, not gated — the round-3 V-A lesson") — no pass/fail gate,
    just the LOO top-5 for each roster spell, human-inspectable."""
    by_name = {p.name: p for p in corpus}
    out: list[BuffLooResult] = []
    for name in roster:
        target = by_name.get(name)
        if target is None:
            out.append(BuffLooResult(name, None, [], [], note="not in the buff comparables corpus"))
            continue
        matches = comparables_mod.top_comparables(target, corpus, k=5, exclude_name=name)
        if not matches:
            out.append(BuffLooResult(name, target.rank, [], [], note="no comparables returned"))
            continue
        out.append(
            BuffLooResult(
                name=name,
                own_rank=target.rank,
                neighbor_names=[m.name for m in matches],
                neighbor_ranks=[m.rank for m in matches],
            )
        )
    return out
