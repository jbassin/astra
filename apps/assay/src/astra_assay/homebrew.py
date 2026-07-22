"""Homebrew adapter — the vendored `run_balance` 176-spell conversion set
(``vendor/run_balance/pf2e_converted_spells/all_spells_pf2e.json``, bespoke
schema documented in ``vendor/run_balance/plan.md``'s "Output JSON schema")
onto the Foundry ``system`` shape ``extract.py``/``cli.py``'s ``assay score``
already reads — AND the canonical, committed, hand-editable store that
adapter output seeds ONE TIME.

**Architecture (round 3):** ``apps/assay/homebrew/spells/<slug>.json`` is
now the single source of truth for the 176 homebrew spells going forward
(committed; eventual consumers: codex ingest, possibly a Foundry compendium
module). The vendored bespoke schema is provenance-only from here on —
nothing downstream of the store reads it. Three subcommands (registered in
``cli.py``, mirroring its subparser pattern):

    uv run assay seed-homebrew        # ONE-TIME: vendor -> the committed store (refuses to
                                       #   overwrite an existing file without --force)
    uv run assay score-homebrew       # reads the STORE (never converts from vendor) ->
                                       #   out/homebrew/scores.json (gitignored, reproducible)
    uv run assay homebrew-revisions   # diffs the store against a fresh vendor re-conversion ->
                                       #   apps/assay/homebrew/revisions.md (committed)

A single spell's canonical file also scores through the existing
``uv run assay score --spell <path>`` (its ``flags`` key is inert to
extraction — see ``test_homebrew.py``'s round-trip test).

**Design constraints this module works under** (see the per-function
docstrings for the reasoning):

- The bespoke schema has NO structured damage — dice expressions are parsed
  out of free-text ``description``/``successTiers`` prose (en-dash/unicode
  minus tolerant, matching the fixes ``conditions.py`` already carries for
  the official corpus).
- Plain-English condition mentions ("frightened 2", "off-guard") are
  promoted to the real ``@UUID[Compendium.pf2e.conditionitems.Item.X]{X N}``
  markup the extractor keys on (README's "condition markup contract") —
  the vocabulary is ``conditions.ALL_CONDITION_NAMES``/``VALUED_CONDITION_NAMES``,
  the SAME source of truth the official-corpus extractor uses.
- Every mapping decision that can't be represented structurally (a defense
  string with an un-modeled qualifier, an unparseable area/range shape, a
  non-damage heightening text, …) is recorded as a per-spell adapter
  warning — never silently dropped.
- Scoring reuses ``export.build_entry_for_row`` — the SAME assembly
  ``assay export-codex`` runs per official spell (quantitative verdict /
  comparables range / buff comparables / typed ledger) — so this module
  never re-implements the scoring mechanism and never shells out per spell.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from astra_observe import get_tracer

from . import comparables, conditions, export, ledger, pricing
from .extract import (
    LONG_CAST_TIMES,
    ActionBucket,
    SkipRecord,
    extract_spell,
    normalize_action_time,
)
from .extract import parse_range as _extract_parse_range

APP_ROOT = Path(__file__).resolve().parents[2]  # src/astra_assay/homebrew.py -> apps/assay
VENDOR_SPELLS_PATH = (
    APP_ROOT / "vendor" / "run_balance" / "pf2e_converted_spells" / "all_spells_pf2e.json"
)
#: The canonical, COMMITTED, hand-editable store (round 3) — never under
#: out/. `apps/assay/homebrew/` is a plain data directory (distinct from
#: this MODULE's own path, `apps/assay/src/astra_assay/homebrew.py` — no
#: filesystem collision), sibling to `vendor/`/`results/`/`out/`.
HOMEBREW_DIR = APP_ROOT / "homebrew"
HOMEBREW_STORE_DIR = HOMEBREW_DIR / "spells"
HOMEBREW_REVISIONS_PATH = HOMEBREW_DIR / "revisions.md"
OUT_DIR = APP_ROOT / "out"
HOMEBREW_OUT_DIR = OUT_DIR / "homebrew"
HOMEBREW_SCORES_PATH = HOMEBREW_OUT_DIR / "scores.json"
#: The upstream commit the store was seeded from (`vendor/run_balance/
#: VENDORED.md`) — stamped into every seeded doc's `flags.assay.seededFrom`.
_VENDOR_REPO = "run_balance"
_VENDOR_COMMIT = "efc8e310210a2577411c62ee95f09a58ef79f164"
#: Duplicated from ``cli.py`` deliberately (not imported): ``cli.py`` imports
#: THIS module to register the new subcommands, so a `from .cli import ...`
#: here would be a cli<->homebrew import cycle. These are one-line Path
#: joins, cheap to keep in sync (both point at the same committed
#: ``results/`` artifacts ``assay price`` writes).
RESULTS_DIR = APP_ROOT / "results"
FITTED_PARAMS_PATH = RESULTS_DIR / "fitted-params.json"
COMPARABLES_CORPUS_PATH = RESULTS_DIR / "comparables-corpus.json"
BUFF_CORPUS_PATH = RESULTS_DIR / "buff-comparables-corpus.json"

_tracer = get_tracer("astra.assay")


# ---------------------------------------------------------------------------
# Small shared helpers
# ---------------------------------------------------------------------------

_SLUG_STRIP_RE = re.compile(r"[^a-z0-9]+")


def _slugify(name: str) -> str:
    slug = _SLUG_STRIP_RE.sub("-", name.lower()).strip("-")
    return slug or "spell"


def _pseudo_id(slug: str) -> str:
    """A stable, deterministic 16-char pseudo-``_id`` (Foundry-shaped, never
    read by the extractor — cosmetic/provenance only, ``source_id`` defaults
    to ``"<no-id>"`` when absent)."""
    return "hb" + hashlib.sha1(slug.encode("utf-8")).hexdigest()[:14]


def _dice_to_formula(dice_text: str) -> str:
    """Normalize a captured dice expression (``"1d8 – 4"``, ``"10d6"``,
    ``"2d4+1"``) into the ASCII ``NdM``/``NdM+K`` shape ``dice.parse_formula``
    expects."""
    normalized = "".join("-" if ch in "−–—" else ch for ch in dice_text)
    return re.sub(r"\s+", "", normalized)


_UUID_TAG_RE = re.compile(r"@UUID\[[^\]]+\](?:\{[^}]+\})?")


# ---------------------------------------------------------------------------
# Condition promotion — the README's "condition markup contract", but this
# module writes the markup itself instead of relying on a human author.
# ---------------------------------------------------------------------------

#: The vendor set is nominally Remaster terminology throughout (`plan.md`:
#: "off-guard (not flat-footed)") but 1/176 (Reset) slipped a legacy term in
#: anyway — matched and canonicalized rather than silently missed.
_CONDITION_ALIASES: dict[str, str] = {
    "flat-footed": "Off-Guard",
    "flatfooted": "Off-Guard",
    "flat footed": "Off-Guard",
}
_COND_NAMES_BY_LEN = sorted(
    set(conditions.ALL_CONDITION_NAMES) | set(_CONDITION_ALIASES), key=len, reverse=True
)
_COND_ALT_PATTERN = "|".join(re.escape(n) for n in _COND_NAMES_BY_LEN)
_COND_MENTION_RE = re.compile(rf"\b({_COND_ALT_PATTERN})\b(?:\s+(\d+))?", re.IGNORECASE)
#: Splits text around any pre-existing `@UUID[...]{...}` tag (capturing
#: group keeps the tag in the split result) — this module never actually
#: feeds already-tagged text back through itself, but staying correct
#: regardless is cheap: only the non-tag pieces are ever re-scanned for a
#: condition mention, so a display label like `{Frightened 2}` can never be
#: double-promoted.
_UUID_TAG_SPLIT_RE = re.compile(r"(@UUID\[[^\]]+\](?:\{[^}]+\})?)")
_CANON_BY_LOWER = {n.lower(): n for n in conditions.ALL_CONDITION_NAMES}
_CANON_BY_LOWER.update({k.lower(): v for k, v in _CONDITION_ALIASES.items()})
#: A negated mention ("is NOT Blinded", "cannot become Frightened") must not
#: be promoted — tagging it would fabricate a real `ConditionInstance` the
#: extractor treats as actually applying (found live: Glitterdust's own
#: Success text, "but is not Blinded", straight from the vendor prose).
#: Checked against a short window immediately before the match.
_NEGATION_RE = re.compile(
    r"\b(?:not|never|without|cannot|can't|isn't|doesn't|won't)\s*$", re.IGNORECASE
)
_NEGATION_WINDOW = 30


def promote_conditions(text: str) -> tuple[str, list[str]]:
    """Rewrite plain-English condition mentions in `text` into
    `@UUID[Compendium.pf2e.conditionitems.Item.X]{X N}` markup — longest-name
    match, case-insensitive, valued (a following number becomes the value)
    and unvalued forms both handled, negated mentions left untouched.
    Returns `(new_text, promoted_labels)`."""
    promoted: list[str] = []

    def _sub(m: re.Match[str]) -> str:
        prefix = m.string[max(0, m.start() - _NEGATION_WINDOW) : m.start()]
        if _NEGATION_RE.search(prefix):
            return m.group(0)
        canon = _CANON_BY_LOWER[m.group(1).lower()]
        num = m.group(2)
        if canon in conditions.VALUED_CONDITION_NAMES and num is not None:
            label = f"{canon} {num}"
            promoted.append(label)
            return f"@UUID[Compendium.pf2e.conditionitems.Item.{canon}]{{{label}}}"
        promoted.append(canon)
        tag = f"@UUID[Compendium.pf2e.conditionitems.Item.{canon}]{{{canon}}}"
        # A flat (unvalued) condition never consumes a trailing number as its
        # own value — re-emit it as plain text after the tag rather than
        # silently swallowing it (it wasn't ours to consume).
        return f"{tag} {num}" if num is not None else tag

    pieces = _UUID_TAG_SPLIT_RE.split(text)
    for i in range(0, len(pieces), 2):  # odd indices are pre-existing tags — never rescanned
        pieces[i] = _COND_MENTION_RE.sub(_sub, pieces[i])
    return "".join(pieces), promoted


def _residual_condition_words(description_html: str) -> list[str]:
    """Defensive self-check (should rarely fire, given `promote_conditions`
    runs over every text segment below) — a bare condition word surviving
    outside any `@UUID[...]` tag would otherwise silently underscore per the
    README's own documented trap. Deliberately-unpromoted NEGATED mentions
    ("is not Blinded") are not a gap — excluded the same way
    `promote_conditions` itself skips them."""
    stripped = _UUID_TAG_RE.sub("", description_html)
    hits = []
    for name in _COND_NAMES_BY_LEN:
        for m in re.finditer(rf"\b{re.escape(name)}\b", stripped, re.IGNORECASE):
            prefix = stripped[max(0, m.start() - _NEGATION_WINDOW) : m.start()]
            if not _NEGATION_RE.search(prefix):
                hits.append(name)
                break
    return hits


# ---------------------------------------------------------------------------
# Damage extraction — NO structured damage in the bespoke schema; parsed out
# of the chosen prose section by dice-expression regex.
# ---------------------------------------------------------------------------

#: PF2e Remaster damage-type vocabulary actually load-bearing for the
#: extractor's `damage_type_class`/comparables atom axis — plus a couple of
#: pre-Remaster synonyms the vendor prose occasionally slips in (`psychic`
#: for `mental`, legacy `positive`/`negative` for `vitality`/`void`).
_DAMAGE_TYPES = frozenset(
    {
        "acid",
        "bludgeoning",
        "cold",
        "electricity",
        "fire",
        "force",
        "mental",
        "piercing",
        "poison",
        "slashing",
        "sonic",
        "spirit",
        "vitality",
        "void",
    }
)
_DAMAGE_TYPE_ALIASES = {
    "psychic": "mental",
    "positive": "vitality",
    "negative": "void",
    "necrotic": "void",
    "radiant": "vitality",
}
_DICE_TOKEN = r"\d+d\d+(?:\s?[+−–—-]\s?\d+)?"
_DICE_DAMAGE_RE = re.compile(
    rf"({_DICE_TOKEN})\s*(?:("
    + "|".join(sorted(_DAMAGE_TYPES | set(_DAMAGE_TYPE_ALIASES), key=len, reverse=True))
    + r")\s+)?damage",
    re.IGNORECASE,
)
_HEAL_RE = re.compile(rf"regains?\s+({_DICE_TOKEN})\s*(?:HP|hit\s+points?)", re.IGNORECASE)


#: The reversed shape: "...takes full damage (2d4 force)." / "double damage
#: (4d4 force)" / "damage (2d8 fire + 2d8 mental, rounded down)" — a
#: parenthetical AFTER the word "damage" instead of a dice-then-type-then-
#: "damage" run (real corpus: Antimagic Shroud, Attraction, Tag, Temporal
#: Threshold/Discharge, Deja Vu — 7 spells, verified via corpus scan).
#: `+`/`,`-separated components inside the parens each get their own dice
#: check (Tag's "2d8 fire + 2d8 mental" is two components in one paren).
_DAMAGE_PAREN_RE = re.compile(r"damage\s*\(([^)]*)\)", re.IGNORECASE)
_PAREN_COMPONENT_SPLIT_RE = re.compile(r"[+,]")
_PAREN_DICE_RE = re.compile(rf"({_DICE_TOKEN})\s*([a-z]+)?", re.IGNORECASE)


def _extract_damage_dice(text: str) -> list[tuple[str, str]]:
    """Every `<dice> [<type>] damage` mention in `text` -> `(formula, type)`
    pairs (both the `NdM damage` and `damage (NdM type)` shapes); `type` is
    `"untyped"` when no recognized damage-type word sits with the dice."""
    out: list[tuple[str, str]] = []
    for m in _DICE_DAMAGE_RE.finditer(text):
        formula = _dice_to_formula(m.group(1))
        word = (m.group(2) or "").lower()
        dtype = _DAMAGE_TYPE_ALIASES.get(word, word)
        out.append((formula, dtype if dtype in _DAMAGE_TYPES else "untyped"))
    for m in _DAMAGE_PAREN_RE.finditer(text):
        for component in _PAREN_COMPONENT_SPLIT_RE.split(m.group(1)):
            dm = _PAREN_DICE_RE.search(component)
            if not dm:
                continue
            formula = _dice_to_formula(dm.group(1))
            word = (dm.group(2) or "").lower()
            dtype = _DAMAGE_TYPE_ALIASES.get(word, word)
            out.append((formula, dtype if dtype in _DAMAGE_TYPES else "untyped"))
    return out


#: Self-inflicted-cost phrasing (the vendor's own words, real 5-spell
#: population: "deal 4d6 void damage to yourself" (Extra Motivation),
#: "you take 1d6 mental damage" / "you take 2d10... and 2d10 mental damage"
#: (Lesser Wish/Hellforging/Take Me Instead) — plus the two more variants a
#: real spell could plausibly use ("to itself", "damage to you", covering a
#: reflexive-caster or self-summon-directed cost) that don't currently
#: appear in this vendor set but match the same shape.
_SELF_DAMAGE_ANCHOR_RE = re.compile(
    r"\byou take\b|\bdamage to (?:yourself|itself)\b|\bdamage to you\b", re.IGNORECASE
)
#: "Roll 1d8 on the following table..." (Monstrous Copy: Eye Stalks) —
#: everything from this phrase onward is a numbered effect-table listing,
#: not the spell's own direct output; only ONE real spell in the vendor set
#: uses this shape (verified via corpus scan), but the pattern generalizes.
_TABLE_ROLL_ANCHOR_RE = re.compile(
    r"\broll\s+\d+d\d+\s+on\s+the\s+following\s+table\b", re.IGNORECASE
)


def _split_self_and_output_dice(text: str) -> tuple[list[tuple[str, str]], list[tuple[str, str]]]:
    """Paragraph-level self-damage exclusion. A self-damage anchor anywhere
    in a paragraph marks EVERY dice mention in that SAME paragraph as
    self-directed — the vendor corpus's own convention: a self-damage
    clause is narrated as its own paragraph/sentence run, and a telescoped
    continuation (Lesser Wish: "you take 1d6 mental damage. The third, 2d6
    mental damage." — the second sentence never repeats "you take") shares
    that paragraph without re-anchoring. Paragraphs with no anchor are
    entirely output damage — this is why the exclusion must be scoped to
    the paragraph, never the whole spell (a "mixed" spell like Solar Rebuke,
    whose real enemy damage sits in an ISOLATED `successTiers` string with
    no self-damage anchor at all, is untouched by construction)."""
    self_pairs: list[tuple[str, str]] = []
    output_pairs: list[tuple[str, str]] = []
    for para in re.split(r"\n\s*\n", text):
        pairs = _extract_damage_dice(para)
        if not pairs:
            continue
        if _SELF_DAMAGE_ANCHOR_RE.search(para):
            self_pairs.extend(pairs)
        else:
            output_pairs.extend(pairs)
    return self_pairs, output_pairs


def _build_damage(spell: dict[str, Any]) -> tuple[dict[str, dict[str, Any]], bool, list[str]]:
    """Choose the ONE prose section that represents the spell's base
    structured formula, matching the real corpus's own convention: a
    basic-save spell's `system.damage` is the FAILURE-tier (full) amount
    (success/crit-success/crit-failure are derived by the game engine from
    the `basic` flag, never separate entries — see `fireball.json`); an
    attack-roll spell's is the on-hit (SUCCESS-tier) amount (crit doubles
    automatically). Falls back to the raw description when the preferred
    tier has no dice (Falling Star's shape: the dice only live in the lead-in
    narrative, `successTiers` is all prose-only "half/full/double damage").
    A pure-healing spell (`"regains NdM(+K) HP"`, no damage dice found at
    all) recovers as a single `kinds:["healing"]` entry, D30-8(ii)'s 1:1
    healing-vs-damage-budget convention.

    Two exclusions run before dice are counted toward EV, both real-corpus
    findings from the orchestrator's batch review: a roll-on-a-table
    listing (Monstrous Copy: Eye Stalks) is not the spell's own direct
    output, and a self-inflicted-cost clause (Extra Motivation, Lesser
    Wish, Hellforging, Take Me Instead) is a price paid by the CASTER, not
    an effect on the target — neither belongs in `system.damage`."""
    warnings: list[str] = []
    defense_raw = (spell.get("defense") or "").lower()
    is_attack = "spell attack roll" in defense_raw
    success_tiers = spell.get("successTiers") or {}
    description = spell.get("description") or ""

    section = ""
    if success_tiers:
        preferred, fallback = (
            ("success", "criticalSuccess")
            if is_attack
            else (
                "failure",
                "criticalFailure",
            )
        )
        candidate = success_tiers.get(preferred) or success_tiers.get(fallback) or ""
        # `_extract_damage_dice` (not the bare `_DICE_DAMAGE_RE` pattern) —
        # must also recognize the "damage (NdM type)" reversed shape
        # (Antimagic Shroud's "takes full damage (2d4 force)"), else this
        # falls through to the full `description` and a self-damage/table
        # anchor elsewhere in that longer text can wrongly taint real
        # output damage that happens to share its paragraph.
        if candidate and _extract_damage_dice(candidate):
            section = candidate
    if not section:
        section = description

    table_match = _TABLE_ROLL_ANCHOR_RE.search(section)
    if table_match:
        warnings.append("table-roll spell — table-entry dice excluded from EV")
        section = section[: table_match.start()]

    self_pairs, dice_pairs = _split_self_and_output_dice(section)
    if self_pairs:
        excluded = ", ".join(f"{formula} {dtype}" for formula, dtype in self_pairs)
        warnings.append(
            f"excluded {len(self_pairs)} self-directed damage dice from EV ({excluded}) — "
            "a cost paid by the caster, not the spell's output"
        )

    if not dice_pairs:
        heal_match = _HEAL_RE.search(description)
        if heal_match:
            formula = _dice_to_formula(heal_match.group(1))
            return (
                {
                    "0": {
                        "applyMod": False,
                        "category": None,
                        "formula": formula,
                        "kinds": ["healing"],
                        "materials": [],
                        "type": "vitality",
                    }
                },
                True,
                warnings,
            )
        return {}, False, warnings

    entries: dict[str, dict[str, Any]] = {}
    for i, (formula, dtype) in enumerate(dice_pairs):
        entries[str(i)] = {
            "applyMod": False,
            "category": None,
            "formula": formula,
            "kinds": ["damage"],
            "materials": [],
            "type": dtype,
        }
    return entries, False, warnings


# ---------------------------------------------------------------------------
# Defense — free-text -> {"save": {"basic": bool, "statistic": str}} | None
# (attack-roll spells carry `defense: null` + the `attack` trait, matching
# `hydraulic-push.json`'s real shape) — 21 distinct raw values observed
# across the 176 (incl. `None`), enumerated in the module tests.
# ---------------------------------------------------------------------------

_SAVE_STATS = ("will", "fortitude", "reflex")
#: Any of these substrings in the raw defense text signals content beyond
#: the base save/attack shape (a conditional trigger, a second gate, a
#: multi-mode "or") that this adapter does not structurally represent —
#: flagged, never silently dropped.
_DEFENSE_QUALIFIER_RE = re.compile(r"[(;]| or | then |,\s*then\b", re.IGNORECASE)


def _map_defense(raw: str | None) -> tuple[dict[str, Any] | None, bool, list[str]]:
    """Multi-mode/multi-save text ("Reflex save (initial); Fortitude save
    (while within the portal)", "basic Reflex (Control mode) or spell attack
    roll (Attack/Defend modes)") picks whichever keyword occurs FIRST in the
    raw string — not a fixed will/fortitude/reflex/attack priority order —
    and flags the rest via `_DEFENSE_QUALIFIER_RE`."""
    warnings: list[str] = []
    if not raw:
        return None, False, warnings
    lower = raw.lower()

    candidates: list[tuple[int, str]] = []
    idx = lower.find("spell attack roll")
    if idx != -1:
        candidates.append((idx, "attack"))
    for stat in _SAVE_STATS:
        idx = lower.find(stat)
        if idx != -1:
            candidates.append((idx, stat))
    if not candidates:
        warnings.append(
            f"defense text {raw!r} carries no recognized save/attack-roll keyword — "
            "left unmapped (system.defense=null); this spell may score as auto-hit "
            "when it shouldn't"
        )
        return None, False, warnings

    candidates.sort()
    _, winner = candidates[0]
    add_attack_trait = winner == "attack"
    result: dict[str, Any] | None
    if add_attack_trait:
        result = None
    else:
        result = {"save": {"basic": "basic" in lower, "statistic": winner}}

    if _DEFENSE_QUALIFIER_RE.search(raw):
        warnings.append(
            f"defense text has qualifiers beyond the base save/attack shape, not "
            f"structurally represented (only the primary save/attack-roll mapped): {raw!r}"
        )
    return result, add_attack_trait, warnings


# ---------------------------------------------------------------------------
# Range / area
# ---------------------------------------------------------------------------


def _map_range(raw: str | None) -> tuple[str, list[str]]:
    warnings: list[str] = []
    if not raw:
        return "", warnings
    r = raw.strip()
    low = r.lower()
    if low == "self":
        value = "self"
    elif low == "touch":
        value = "touch"
    elif low.startswith("planetary"):
        value = "planetary"
    elif low.startswith("unlimited"):
        value = "unlimited"
    else:
        value = r
    # Verify against assay's own parser (the real mechanism, not a guess) —
    # a flagged/VARIES result means the structural range multiplier can't be
    # looked up for this spell.
    _, bucket, flagged = _extract_parse_range(value)
    if flagged:
        warnings.append(
            f"range text {raw!r} (normalized {value!r}) isn't a shape assay's own range "
            f"parser recognizes — bucketed {bucket.value!r}, may misprice the structural "
            "range multiplier"
        )
    return value, warnings


_AREA_RE = re.compile(
    r"(\d+)-foot(?:-\w+)?\s+(burst|emanation|cone|line|cylinder|cube|square)\b", re.IGNORECASE
)


def _map_area(raw: str | None) -> tuple[dict[str, Any] | None, list[str]]:
    if not raw:
        return None, []
    m = _AREA_RE.search(raw)
    if not m:
        return None, [
            f"area text not structurally parseable, left unmapped (effective-target "
            f"classification falls back to the description's own target-count "
            f"heuristic): {raw!r}"
        ]
    return {"type": m.group(2).lower(), "value": int(m.group(1))}, []


# ---------------------------------------------------------------------------
# Cast / duration
# ---------------------------------------------------------------------------


def _map_cast(cast: dict[str, Any]) -> tuple[str, list[str]]:
    warnings: list[str] = []
    actions = cast.get("actions")
    time_str = cast.get("time")
    if time_str:
        raw_time = str(time_str).strip()
    elif actions is not None:
        raw_time = str(int(actions))
    else:
        raw_time = "2"
        warnings.append("cast.actions and cast.time both null — defaulted to 2 actions")

    # Verify against assay's own bucketer. `normalize_action_time` only
    # recognizes the numeric-action shapes — long-cast strings ("10
    # minutes") are a SEPARATE recognized mechanism in extract.py
    # (`LONG_CAST_TIMES`), so a membership check there first avoids a false
    # positive on every legitimate long-cast spell.
    _, _, flagged = normalize_action_time(raw_time)
    if flagged and raw_time not in LONG_CAST_TIMES:
        warnings.append(
            f"cast time {raw_time!r} isn't a shape assay's own action-time parser "
            "recognizes — defaults to the 2-action structural multiplier"
        )
    return raw_time, warnings


def _map_duration(raw: str | None) -> dict[str, Any]:
    if not raw:
        return {"sustained": False, "value": ""}
    low = raw.lower().strip()
    if low == "instantaneous":
        return {"sustained": False, "value": ""}
    sustained = low.startswith("sustained")
    value = raw
    if sustained:
        value = re.sub(r"^sustained\s+up\s+to\s+", "", raw, flags=re.IGNORECASE).strip()
    return {"sustained": sustained, "value": value}


# ---------------------------------------------------------------------------
# Heightening — only ever feeds the (population-level) V2 validation gate,
# never `assay score`'s per-spell verdict, so best-effort structural mapping
# + an always-present description appendix (assay tolerates the rest).
# ---------------------------------------------------------------------------

_HEIGHTEN_DAMAGE_RE = re.compile(rf"damage\s+increases?\s+by\s+({_DICE_TOKEN})", re.IGNORECASE)
_FIXED_TRIGGER_RE = re.compile(r"^(\d+)(?:st|nd|rd|th)$", re.IGNORECASE)
_PLUS_TRIGGER_RE = re.compile(r"^\+(\d+)$")


def _heighten_damage_delta(text: str) -> str | None:
    m = _HEIGHTEN_DAMAGE_RE.search(text)
    return _dice_to_formula(m.group(1)) if m else None


def _map_heightening(
    heightened: list[dict[str, Any]], base_damage: dict[str, dict[str, Any]]
) -> tuple[dict[str, Any] | None, str, list[str]]:
    """-> (`system.heightening` or None, description-appendix HTML, warnings).
    The appendix is ALWAYS built (mirrors the real corpus, which keeps the
    prose alongside the structured field) and is what
    `conditions.strip_heightened` cuts on — it must start with `<hr />`
    immediately followed by `<p><strong>Heightened`."""
    warnings: list[str] = []
    if not heightened:
        return None, "", warnings

    plus_entries = [h for h in heightened if h["trigger"].startswith("+")]
    fixed_entries = [h for h in heightened if not h["trigger"].startswith("+")]
    base_key = next(iter(base_damage), None)

    structured: dict[str, Any] | None = None
    if plus_entries and fixed_entries:
        warnings.append(
            "mixed '+N' and fixed-rank heightening triggers on the same spell — Foundry "
            "heightening is one shape per spell, not structurally represented (kept as a "
            "description appendix only)"
        )
    elif plus_entries:
        if len(plus_entries) == 1:
            n_match = _PLUS_TRIGGER_RE.match(plus_entries[0]["trigger"])
            delta = _heighten_damage_delta(plus_entries[0]["text"])
            if n_match and delta and base_key is not None:
                structured = {
                    "type": "interval",
                    "interval": int(n_match.group(1)),
                    "damage": {base_key: delta},
                }
            else:
                warnings.append(
                    "interval ('+N') heightening text is not a pure damage bump — kept as "
                    "a description appendix only, not structurally represented"
                )
        else:
            warnings.append(
                "multiple '+N' heightening entries on one spell — kept as a description "
                "appendix only, not structurally represented"
            )
    elif fixed_entries:
        levels: dict[str, dict[str, Any]] = {}
        any_damage = False
        for h in fixed_entries:
            m = _FIXED_TRIGGER_RE.match(h["trigger"].strip())
            if not m:
                warnings.append(
                    f"unrecognized fixed-rank heightening trigger {h['trigger']!r} — "
                    "skipped from the structured shape"
                )
                continue
            delta = _heighten_damage_delta(h["text"])
            if delta and base_key is not None:
                levels[m.group(1)] = {"damage": {base_key: delta}}
                any_damage = True
            else:
                levels[m.group(1)] = {}
        if levels:
            structured = {"type": "fixed", "levels": levels}
        if not any_damage:
            warnings.append(
                "fixed-rank heightening text has no structurally-parseable damage bump "
                "(a non-damage effect, e.g. added targets/area) — kept as a description "
                "appendix only"
            )

    parts = ["<hr />"]
    for h in heightened:
        promoted_text, _ = promote_conditions(h["text"])
        parts.append(
            f"<p><strong>Heightened ({h['trigger']})</strong> "
            f"{html.escape(promoted_text, quote=False)}</p>"
        )
    return structured, "".join(parts), warnings


# ---------------------------------------------------------------------------
# Description assembly
# ---------------------------------------------------------------------------

#: An embedded degree-listing repeated inline in the free-text `description`
#: (10/176 spells — Glitterdust's shape: the same Success/Failure content
#: `successTiers` already carries, restated as narrative prose). Truncated
#: out of the lead-in when `successTiers` is present, both to avoid a
#: redundant HTML restatement and — load-bearing — to avoid double-tagging
#: the SAME condition mention in the unstructured "preamble" region ahead of
#: the real `<strong>Degree</strong>` sections (extract.py's rule (i) can
#: attribute a preamble ref to every degree section whose OWN text contains
#: "is affected"/"affected for" — real but rare in this vendor prose, ~1%,
#: see the module tests).
_EMBEDDED_DEGREE_RE = re.compile(r"\b(?:Critical\s+)?(?:Success|Failure)\s*:", re.IGNORECASE)

_DEGREE_FIELDS = (
    ("criticalSuccess", "Critical Success"),
    ("success", "Success"),
    ("failure", "Failure"),
    ("criticalFailure", "Critical Failure"),
)


def _lead_in_description(description: str, *, has_success_tiers: bool) -> str:
    text = description or ""
    if has_success_tiers:
        m = _EMBEDDED_DEGREE_RE.search(text)
        if m:
            text = text[: m.start()].rstrip()
    return text


def _paragraphs_html(promoted_text: str) -> str:
    text = promoted_text.strip()
    if not text:
        return ""
    out = []
    for para in re.split(r"\n\s*\n", text):
        para = para.strip()
        if not para:
            continue
        out.append(f"<p>{html.escape(para, quote=False).replace(chr(10), '<br />')}</p>")
    return "".join(out)


def _success_tiers_html(success_tiers: dict[str, Any] | None) -> str:
    if not success_tiers:
        return ""
    parts = []
    for key, label in _DEGREE_FIELDS:
        text = success_tiers.get(key)
        if not text:
            continue
        promoted_text, _ = promote_conditions(text)
        parts.append(f"<p><strong>{label}</strong> {html.escape(promoted_text, quote=False)}</p>")
    return "".join(parts)


def _strip_trait_glosses(description_html: str, traits: set[str]) -> str:
    """Drop parenthetical glosses that merely restate a trait the spell
    already carries — "… onlookers (subtle)", "… save (Incapacitation)"
    (stakeholder 2026-07-22: the trait line is the source of truth; the
    inline echo is noise). Only EXACT single-trait parentheticals are
    stripped; anything with more words is real prose and untouched."""
    out = description_html
    for t in traits:
        out = re.sub(rf"\s*\(\s*{re.escape(t)}\s*\)", "", out, flags=re.IGNORECASE)
    return out


# ---------------------------------------------------------------------------
# Top-level conversion
# ---------------------------------------------------------------------------

#: The author's homebrew magic schools (stakeholder 2026-07-22): PF2e Remaster
#: has no school traits, but these are CUSTOM schools from the original 5e
#: system and ride every spell as a custom trait (future codex facet /
#: Foundry-module trait). Sourced from `convertedFromSpiritOf.originalSchool`.
#: STANDARD 5e schools are deliberately NOT carried; the one `D (Divination)`
#: spell, Connection, was assigned `memetics` by the stakeholder (2026-07-22)
#: as a STORE edit — visible in `homebrew/revisions.md`, not baseline-derived.
_HOMEBREW_SCHOOLS = frozenset(
    {
        "antillurgy",
        "chronomancy",
        "gestalt",
        "kosmoturgy",
        "memetics",
        "mercuromancy",
        "planara",
        "seraphic",
    }
)


def _school_trait(spell: dict[str, Any]) -> str | None:
    raw = str((spell.get("convertedFromSpiritOf") or {}).get("originalSchool") or "").lower()
    return raw if raw in _HOMEBREW_SCHOOLS else None


@dataclass
class ConvertedSpell:
    name: str
    slug: str
    foundry: dict[str, Any]
    warnings: list[str] = field(default_factory=list)


def convert_spell(spell: dict[str, Any]) -> ConvertedSpell:
    """One bespoke-schema spell dict (`plan.md`'s "Output JSON schema") ->
    a Foundry-shaped ``ConvertedSpell`` (``.foundry`` is exactly what
    ``extract_spell``/``assay score`` reads) + a warnings list — never
    raises on a mapping gap, always degrades to an unmapped/omitted field
    plus a warning."""
    warnings: list[str] = []
    name = spell["name"]
    slug = _slugify(name)

    rank_raw = spell["rank"]
    is_cantrip = rank_raw == "cantrip"
    level_value = 1 if is_cantrip else int(rank_raw)

    traits = {str(t).lower() for t in (spell.get("traits") or [])}
    if is_cantrip:
        traits.add("cantrip")

    school = _school_trait(spell)
    if school is not None:
        traits.add(school)

    defense_raw = spell.get("defense")
    defense_dict, add_attack_trait, defense_warnings = _map_defense(defense_raw)
    warnings += defense_warnings
    if add_attack_trait:
        if "attack" not in traits:
            warnings.append(
                f"defense text {defense_raw!r} implies an attack-roll spell but the "
                "source traits list lacked 'attack' — added it (required for assay's "
                "targeting_class classification)"
            )
        traits.add("attack")

    damage_entries, is_healing, dmg_warnings = _build_damage(spell)
    warnings += dmg_warnings
    if not damage_entries and not is_healing:
        # Not necessarily a problem (many spells are pure condition/buff/
        # utility effects with zero damage) — but worth a light note so a
        # reviewer scanning warnings can tell "no damage found" apart from
        # "genuinely damage-free by design" only via the routing outcome.
        pass

    cast = spell.get("cast") or {}
    time_value, cast_warnings = _map_cast(cast)
    warnings += cast_warnings

    range_value, range_warnings = _map_range(spell.get("range"))
    warnings += range_warnings

    area_dict, area_warnings = _map_area(spell.get("area"))
    warnings += area_warnings

    duration_dict = _map_duration(spell.get("duration"))

    heightening_dict, heighten_appendix, heighten_warnings = _map_heightening(
        spell.get("heightened") or [], damage_entries
    )
    warnings += heighten_warnings

    has_success_tiers = bool(spell.get("successTiers"))
    lead_in = _lead_in_description(
        spell.get("description") or "", has_success_tiers=has_success_tiers
    )
    lead_in_promoted, _ = promote_conditions(lead_in)
    lead_in_html = _paragraphs_html(lead_in_promoted)
    tiers_html = _success_tiers_html(spell.get("successTiers"))
    description_html = lead_in_html + tiers_html + heighten_appendix
    description_html = _strip_trait_glosses(description_html, traits)

    # Stakeholder policy 2026-07-22 (Remaster has no material components):
    # standard-cast spells carry NO cost — only ritual-shaped long casts
    # ("1 minute"/"10 minutes"/"1 day …") keep a Cost line, mirroring PF2e's
    # own spells-vs-rituals split.
    cost_value = str(spell.get("cost") or "")
    if cost_value and time_value in ("1", "2", "3", "reaction"):
        cost_value = ""

    residual = _residual_condition_words(description_html)
    if residual:
        warnings.append(
            f"condition word(s) {', '.join(residual)} survived promotion with no @UUID "
            "ref — likely an adapter regex gap, would silently score wrong"
        )

    system: dict[str, Any] = {
        "area": area_dict,
        "cost": {"value": cost_value},
        "counteraction": False,
        "damage": damage_entries,
        "defense": defense_dict,
        "description": {"value": description_html},
        "duration": duration_dict,
        "level": {"value": level_value},
        "publication": {"license": "OGL", "remaster": True, "title": "Homebrew (run_balance)"},
        "range": {"value": range_value},
        "requirements": "",
        "rules": [],
        "target": {"value": spell.get("targets") or ""},
        "time": {"value": time_value},
        "traits": {
            "rarity": "common",
            "traditions": sorted(str(t).lower() for t in (spell.get("traditions") or [])),
            "value": sorted(traits),
        },
    }
    if heightening_dict is not None:
        system["heightening"] = heightening_dict

    foundry = {"_id": _pseudo_id(slug), "name": name, "system": system, "type": "spell"}
    return ConvertedSpell(name=name, slug=slug, foundry=foundry, warnings=warnings)


def load_vendored_spells() -> list[dict[str, Any]]:
    if not VENDOR_SPELLS_PATH.exists():
        raise SystemExit(
            f"assay seed-homebrew: vendored spell set not found at {VENDOR_SPELLS_PATH}"
        )
    data = json.loads(VENDOR_SPELLS_PATH.read_text(encoding="utf-8"))
    return data["spell"]


def convert_all() -> list[ConvertedSpell]:
    return [convert_spell(s) for s in load_vendored_spells()]


# ---------------------------------------------------------------------------
# Canonical store seeding (round 3) — a ONE-TIME write of the adapter's own
# output into `apps/assay/homebrew/spells/<slug>.json`, committed. Never
# alters spell content: `seed_homebrew` is byte-faithful to `convert_spell`
# plus a `flags.assay` block (provenance + the adapter warnings generated at
# seed time, since `score-homebrew` no longer re-converts — see
# `homebrew_revisions` for the determinism proof of this claim).
# ---------------------------------------------------------------------------


def _seed_flags(spell: dict[str, Any], warnings: list[str]) -> dict[str, Any]:
    """`flags.assay.seededFrom` is the task's literal shape (repo/commit/
    originalName/convertedName); `adapterWarnings` rides alongside it so a
    human reviewing a store file can see what the adapter flagged at seed
    time without needing to re-run the converter. Both are inert to
    `extract_spell` (it never reads `data["flags"]` — see the module
    docstring / `test_flags_pass_through_extraction_harmlessly`)."""
    original_name = (spell.get("convertedFromSpiritOf") or {}).get("originalName") or spell["name"]
    return {
        "assay": {
            "seededFrom": {
                "repo": _VENDOR_REPO,
                "commit": _VENDOR_COMMIT,
                "originalName": original_name,
                "convertedName": spell["name"],
            },
            "adapterWarnings": list(warnings),
        }
    }


@dataclass
class SeedReport:
    seeded: list[str] = field(default_factory=list)
    skipped_existing: list[str] = field(default_factory=list)
    total_warnings: int = 0


def seed_homebrew(*, force: bool = False, store_dir: Path | None = None) -> SeedReport:
    """Write every vendored spell's Foundry-shaped conversion into the
    canonical store, ONE TIME per file — refuses to overwrite an existing
    file unless `force=True` (the store is hand-editable; a casual re-run
    must never clobber a stakeholder's edit). `store_dir` is overridable for
    tests; production code always uses `HOMEBREW_STORE_DIR`."""
    store_dir = store_dir or HOMEBREW_STORE_DIR
    store_dir.mkdir(parents=True, exist_ok=True)
    report = SeedReport()
    for spell in load_vendored_spells():
        slug = _slugify(spell["name"])
        path = store_dir / f"{slug}.json"
        if path.exists() and not force:
            report.skipped_existing.append(slug)
            continue
        c = convert_spell(spell)
        doc = dict(c.foundry)
        doc["flags"] = _seed_flags(spell, c.warnings)
        path.write_text(json.dumps(doc, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        report.seeded.append(slug)
        report.total_warnings += len(c.warnings)
    return report


def load_homebrew_store(store_dir: Path | None = None) -> list[tuple[str, dict[str, Any]]]:
    """`(slug, doc)` for every canonical-store file, sorted by slug —
    `score-homebrew`'s ONLY read of spell content (no vendor conversion at
    score time, per the round-3 architecture change)."""
    store_dir = store_dir or HOMEBREW_STORE_DIR
    if not store_dir.is_dir() or not any(store_dir.glob("*.json")):
        raise SystemExit(
            f"assay score-homebrew: no canonical store at {store_dir} — "
            "run `assay seed-homebrew` first."
        )
    return [
        (path.stem, json.loads(path.read_text(encoding="utf-8")))
        for path in sorted(store_dir.glob("*.json"))
    ]


# ---------------------------------------------------------------------------
# Revisions report (round 3) — diffs the canonical store against a FRESH
# in-memory re-conversion of the vendored baseline. Read-only: never writes
# to the store, only to `revisions.md`.
# ---------------------------------------------------------------------------


def _strip_flags(doc: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in doc.items() if k != "flags"}


def _get_path(d: dict[str, Any], path: tuple[str, ...]) -> Any:
    cur: Any = d
    for key in path:
        if not isinstance(cur, dict):
            return None
        cur = cur.get(key)
    return cur


#: (human label, system-dict path) — everything the task explicitly names
#: ("formula, range, cast time, description-length delta, etc.") plus the
#: rest of `convert_spell`'s output shape, so a hand-edit anywhere is caught.
_DIFF_FIELDS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("defense", ("defense",)),
    ("area", ("area",)),
    ("range.value", ("range", "value")),
    ("target.value", ("target", "value")),
    ("duration", ("duration",)),
    ("time.value", ("time", "value")),
    ("level.value", ("level", "value")),
    ("heightening", ("heightening",)),
    ("traits.value", ("traits", "value")),
    ("traits.traditions", ("traits", "traditions")),
    ("cost.value", ("cost", "value")),
    ("requirements", ("requirements",)),
)


def diff_spell(store_doc: dict[str, Any], baseline_doc: dict[str, Any]) -> list[str]:
    """Field-level deviation summary between a canonical-store doc (a
    stakeholder may have hand-edited it) and a fresh in-memory re-conversion
    of the vendored baseline. `flags` is stripped from both sides first —
    provenance/diagnostics metadata is never a content deviation (the store
    always carries it, the freshly-converted baseline never does, so a raw
    comparison would falsely flag EVERY spell)."""
    a = _strip_flags(store_doc).get("system") or {}
    b = _strip_flags(baseline_doc).get("system") or {}
    diffs: list[str] = []

    if store_doc.get("name") != baseline_doc.get("name"):
        diffs.append(f"name: {baseline_doc.get('name')!r} -> {store_doc.get('name')!r}")

    def _damage_shape(sysd: dict[str, Any]) -> dict[str, tuple[Any, Any, tuple[Any, ...]]]:
        return {
            k: (v.get("formula"), v.get("type"), tuple(v.get("kinds") or ()))
            for k, v in (sysd.get("damage") or {}).items()
        }

    a_dmg, b_dmg = _damage_shape(a), _damage_shape(b)
    if a_dmg != b_dmg:
        diffs.append(f"damage: {b_dmg!r} -> {a_dmg!r}")

    for label, path in _DIFF_FIELDS:
        av, bv = _get_path(a, path), _get_path(b, path)
        if av != bv:
            diffs.append(f"{label}: {bv!r} -> {av!r}")

    a_desc = ((a.get("description") or {}).get("value")) or ""
    b_desc = ((b.get("description") or {}).get("value")) or ""
    if a_desc != b_desc:
        delta = len(a_desc) - len(b_desc)
        diffs.append(
            f"description: length delta {delta:+d} chars (store={len(a_desc)}, "
            f"baseline={len(b_desc)})"
        )

    return diffs


@dataclass
class SpellDeviation:
    slug: str
    name: str
    fields: list[str]


@dataclass
class RevisionsReport:
    store_count: int
    baseline_count: int
    deviations: list[SpellDeviation]
    missing_from_store: list[str]
    extra_in_store: list[str]


def homebrew_revisions(store_dir: Path | None = None) -> RevisionsReport:
    """Diff the canonical store against a fresh in-memory re-conversion of
    the vendored baseline — never regenerates or overwrites the store
    itself. Right after `seed_homebrew`, this must report 0 deviations
    (the seed's own determinism proof)."""
    store_dir = store_dir or HOMEBREW_STORE_DIR
    baseline_by_slug = {c.slug: c.foundry for c in convert_all()}
    store_by_slug: dict[str, dict[str, Any]] = {}
    if store_dir.is_dir():
        for path in sorted(store_dir.glob("*.json")):
            store_by_slug[path.stem] = json.loads(path.read_text(encoding="utf-8"))

    # Pair store docs to baseline via the seeded provenance flag, falling
    # back to the file stem — a stakeholder RENAME (name + filename) must
    # keep its baseline pairing (and show up as a `name:` deviation), not
    # orphan into missing+extra.
    store_by_baseline_key: dict[str, tuple[str, dict[str, Any]]] = {}
    for stem, doc in store_by_slug.items():
        seeded = ((doc.get("flags") or {}).get("assay") or {}).get("seededFrom") or {}
        key = _slugify(str(seeded.get("convertedName") or "")) or stem
        store_by_baseline_key[key] = (stem, doc)

    deviations: list[SpellDeviation] = []
    for slug, baseline_doc in baseline_by_slug.items():
        hit = store_by_baseline_key.get(slug)
        if hit is None:
            continue
        stem, store_doc = hit
        fields = diff_spell(store_doc, baseline_doc)
        if fields:
            deviations.append(
                SpellDeviation(slug=stem, name=str(store_doc.get("name", stem)), fields=fields)
            )

    return RevisionsReport(
        store_count=len(store_by_slug),
        baseline_count=len(baseline_by_slug),
        deviations=sorted(deviations, key=lambda d: d.name),
        missing_from_store=sorted(set(baseline_by_slug) - set(store_by_baseline_key)),
        extra_in_store=sorted(
            stem for key, (stem, _) in store_by_baseline_key.items() if key not in baseline_by_slug
        ),
    )


def _write_revisions_md(report: RevisionsReport, path: Path) -> None:
    exact = report.store_count - len(report.deviations) - len(report.extra_in_store)
    lines = ["# assay — homebrew canonical-store revisions", ""]
    lines.append(
        "Generated by `uv run assay homebrew-revisions`. Diffs "
        "`apps/assay/homebrew/spells/*.json` (the canonical, hand-editable store) against a "
        "FRESH in-memory re-conversion of the vendored run_balance baseline "
        "(`vendor/run_balance/pf2e_converted_spells/all_spells_pf2e.json`, adapter = "
        "`homebrew.convert_spell`) — never regenerates or overwrites the store itself."
    )
    lines.append("")
    lines.append(
        "**Determinism check:** right after `assay seed-homebrew`, this must read **0 "
        "deviations** (the store is byte-faithful to the adapter's own baseline output, "
        "`flags` provenance aside — see `homebrew.diff_spell`)."
    )
    lines.append("")
    lines.append("## Summary")
    lines.append("")
    lines.append(f"- Baseline spells (vendored): {report.baseline_count}")
    lines.append(f"- Store spells: {report.store_count}")
    lines.append(f"- Matching baseline exactly (0 deviations): {exact}")
    lines.append(f"- Deviating (hand-edited): {len(report.deviations)}")
    lines.append(f"- Missing from store (never seeded): {len(report.missing_from_store)}")
    lines.append(f"- Extra in store (no vendor baseline match): {len(report.extra_in_store)}")
    lines.append("")

    if report.missing_from_store:
        lines.append("## Missing from store")
        lines.append("")
        for slug in report.missing_from_store:
            lines.append(f"- {slug}")
        lines.append("")

    if report.extra_in_store:
        lines.append("## Extra in store (no vendor baseline)")
        lines.append("")
        for slug in report.extra_in_store:
            lines.append(f"- {slug}")
        lines.append("")

    lines.append("## Deviations")
    lines.append("")
    if not report.deviations:
        lines.append("_none_")
        lines.append("")
    else:
        for d in report.deviations:
            lines.append(f"### {d.name} (`{d.slug}`)")
            lines.append("")
            for f in d.fields:
                lines.append(f"- {f}")
            lines.append("")

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


# ---------------------------------------------------------------------------
# Scoring — reuses `export.build_entry_for_row` (the same assembly
# `export-codex` runs per official spell), never re-implements or shells out.
# ---------------------------------------------------------------------------


def _load_ladder_and_corpora() -> tuple[
    pricing.LadderFit,
    pricing.CantripLadderFit,
    list[comparables.ComparableProfile],
    list[comparables.ComparableProfile],
]:
    if not FITTED_PARAMS_PATH.exists():
        raise SystemExit(
            f"assay score-homebrew: no fitted params at {FITTED_PARAMS_PATH} — "
            "run `assay price` first."
        )
    params = json.loads(FITTED_PARAMS_PATH.read_text(encoding="utf-8"))
    if "round2" not in params:
        raise SystemExit("assay score-homebrew: results/fitted-params.json has no round2 params.")
    r2 = params["round2"]
    ladder = pricing.LadderFit(
        intercept=r2["ladder"]["intercept"],
        slope=r2["ladder"]["slope"],
        effective_target_coef=r2["ladder"]["effective_target_coef"],
        range_coef=r2["ladder"]["range_coef"],
        n_obs=r2["ladder"]["n_obs"],
        r_squared=r2["ladder"]["r_squared"],
        excluded_singletons=r2["ladder"]["excluded_singletons"],
    )
    cantrip_ladder = pricing.CantripLadderFit(
        intercept=r2["cantrip_ladder"]["intercept"],
        effective_target_coef=r2["cantrip_ladder"]["effective_target_coef"],
        range_coef=r2["cantrip_ladder"]["range_coef"],
        n_obs=r2["cantrip_ladder"]["n_obs"],
        r_squared=r2["cantrip_ladder"]["r_squared"],
    )
    hostile_corpus: list[comparables.ComparableProfile] = []
    if COMPARABLES_CORPUS_PATH.exists():
        hostile_corpus = [
            comparables.profile_from_json(d)
            for d in json.loads(COMPARABLES_CORPUS_PATH.read_text(encoding="utf-8"))
        ]
    buff_corpus: list[comparables.ComparableProfile] = []
    if BUFF_CORPUS_PATH.exists():
        buff_corpus = [
            comparables.profile_from_json(d)
            for d in json.loads(BUFF_CORPUS_PATH.read_text(encoding="utf-8"))
        ]
    return ladder, cantrip_ladder, hostile_corpus, buff_corpus


def _routing_for(entry: dict[str, Any], *, has_hostile_condition: bool) -> str:
    kind = entry.get("kind")
    if kind == "quantitative":
        return "hybrid" if has_hostile_condition else "quantitative"
    if kind == "comparables":
        return "comparables"
    if kind == "buff-comparables":
        return "buff"
    if kind == "ledger":
        return f"ledger:{entry.get('reasonCode', 'other')}"
    return str(kind)


def score_all(store_dir: Path | None = None) -> list[dict[str, Any]]:
    """Read the CANONICAL STORE (never converts from vendor at score time,
    per the round-3 architecture change — `load_homebrew_store` is the only
    spell-content read here) and score every doc through
    `export.build_entry_for_row`, one Python call per spell, no subprocess.
    `store_dir` is overridable for tests; production code always reads
    `HOMEBREW_STORE_DIR`.

    Per-spell adapter warnings no longer come from a fresh conversion —
    they were recorded once at seed time into `flags.assay.adapterWarnings`
    (see `_seed_flags`) and are read back from the doc itself here.

    Healing rows are NOT scored differently from damage rows — this
    mirrors the official pipeline exactly: `report2.py`'s own
    `_damage_row_kind` labels a healing row `"healing"` but scores it
    through the SAME `has_damage = row.ev > 0.0` / ladder-budget path as
    any other damage row (D30-8(ii)'s declared 1:1 healing-vs-damage-budget
    convention — see `extract.py`'s `is_healing` docstring); `export.
    build_entry_for_row` (reused here) carries no healing distinction of
    its own at all (`entry["kind"]` is `"quantitative"` either way). This
    module adds an `isHealing` field on top (sourced straight from
    `SpellFeatures.is_healing`) purely for scores.json triage segmentation
    — the scoring math itself is untouched, matching official behavior."""
    ladder, cantrip_ladder, hostile_corpus, buff_corpus = _load_ladder_and_corpora()
    results: list[dict[str, Any]] = []
    for slug, data in load_homebrew_store(store_dir):
        sysd = data.get("system") or {}
        description_html = ((sysd.get("description") or {}).get("value")) or ""
        name = str(data.get("name", slug))
        adapter_warnings = list(
            (((data.get("flags") or {}).get("assay") or {}).get("adapterWarnings")) or []
        )
        result = extract_spell(data, f"homebrew/{slug}.json")

        record: dict[str, Any] = {
            "name": name,
            "slug": slug,
            "warnings": adapter_warnings,
            "defense": sysd.get("defense"),
        }

        if isinstance(result, SkipRecord):
            reason_code = export.reason_code_for(ledger.classify_unpriced_skip(data, result.reason))
            record.update(
                {
                    "rank": int((sysd.get("level") or {}).get("value", 0)),
                    "isCantrip": "cantrip" in ((sysd.get("traits") or {}).get("value") or []),
                    "kind": "ledger",
                    "reasonCode": reason_code,
                    "rawSkipReason": result.reason,
                    "actionBucket": None,
                    "isReaction": str((sysd.get("time") or {}).get("value", "")).lower()
                    == "reaction",
                    "isHealing": False,
                    "routing": f"ledger:{reason_code}",
                }
            )
            results.append(record)
            continue

        has_hostile_condition = any(ci.tier is not None for ci in result.condition_instances)
        entry = export.build_entry_for_row(
            result,
            ladder=ladder,
            cantrip_ladder=cantrip_ladder,
            hostile_corpus=hostile_corpus,
            buff_corpus=buff_corpus,
            is_summon_trait=False,
            raw_description=description_html,
        )
        entry["routing"] = _routing_for(entry, has_hostile_condition=has_hostile_condition)
        record.update(entry)
        record["isCantrip"] = result.is_cantrip
        record["actionBucket"] = result.action_bucket.value
        record["isReaction"] = result.action_bucket == ActionBucket.REACTION
        record["isHealing"] = result.is_healing
        results.append(record)
    return results


# ---------------------------------------------------------------------------
# CLI subcommands — mirror cli.py's `cmd_*`/subparser pattern.
# ---------------------------------------------------------------------------


def cmd_seed_homebrew(args: argparse.Namespace) -> None:
    with _tracer.start_as_current_span("assay.seed-homebrew") as span:
        report = seed_homebrew(force=args.force)
        span.set_attribute("assay.seed_homebrew.seeded", len(report.seeded))
        span.set_attribute("assay.seed_homebrew.skipped_existing", len(report.skipped_existing))
        span.set_attribute("assay.seed_homebrew.warnings", report.total_warnings)
        print(
            f"assay seed-homebrew: seeded {len(report.seeded)} spell(s) -> {HOMEBREW_STORE_DIR} "
            f"({report.total_warnings} adapter warnings recorded into flags.assay)"
        )
        if report.skipped_existing:
            suffix = "" if args.force else " (pass --force to overwrite — DESTROYS hand edits)"
            preview = ", ".join(report.skipped_existing[:10])
            more = (
                f", … +{len(report.skipped_existing) - 10} more"
                if len(report.skipped_existing) > 10
                else ""
            )
            print(
                f"  {len(report.skipped_existing)} already present, left untouched{suffix}: "
                f"{preview}{more}"
            )


def cmd_homebrew_revisions(args: argparse.Namespace) -> None:
    with _tracer.start_as_current_span("assay.homebrew-revisions") as span:
        report = homebrew_revisions()
        HOMEBREW_DIR.mkdir(parents=True, exist_ok=True)
        _write_revisions_md(report, HOMEBREW_REVISIONS_PATH)
        span.set_attribute("assay.homebrew_revisions.store_count", report.store_count)
        span.set_attribute("assay.homebrew_revisions.deviations", len(report.deviations))
        span.set_attribute(
            "assay.homebrew_revisions.missing_from_store", len(report.missing_from_store)
        )
        print(
            f"assay homebrew-revisions: {report.store_count} store spells vs "
            f"{report.baseline_count} vendor baseline — {len(report.deviations)} deviation(s), "
            f"{len(report.missing_from_store)} missing from store, "
            f"{len(report.extra_in_store)} extra in store -> {HOMEBREW_REVISIONS_PATH}"
        )


def cmd_score_homebrew(args: argparse.Namespace) -> None:
    with _tracer.start_as_current_span("assay.score-homebrew") as span:
        results = score_all()
        HOMEBREW_OUT_DIR.mkdir(parents=True, exist_ok=True)
        HOMEBREW_SCORES_PATH.write_text(
            json.dumps(results, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )

        tally: dict[str, int] = {}
        for r in results:
            top = str(r["routing"]).split(":", 1)[0]
            tally[top] = tally.get(top, 0) + 1
        total_warnings = sum(len(r["warnings"]) for r in results)
        n_with_warnings = sum(1 for r in results if r["warnings"])

        span.set_attribute("assay.score_homebrew.spells", len(results))
        span.set_attribute("assay.score_homebrew.warnings", total_warnings)
        for k, v in tally.items():
            span.set_attribute(f"assay.score_homebrew.routing.{k}", v)

        print(f"assay score-homebrew: {len(results)} spells scored -> {HOMEBREW_SCORES_PATH}")
        print(f"  routing tally: {dict(sorted(tally.items()))}")
        print(f"  adapter warnings: {total_warnings} across {n_with_warnings} spells")
        print()
        header = f"{'name':<40} {'rank':>4}  {'routing':<24} verdict / range"
        print(header)
        print("-" * len(header))
        for r in sorted(results, key=lambda x: str(x["name"])):
            routing = str(r["routing"])
            if routing in ("quantitative", "hybrid"):
                extra = r.get("verdict", "")
            elif routing in ("comparables", "buff"):
                rr = r.get("rankRange")
                extra = f"range {rr[0]}-{rr[1]}" if rr else "no usable comparables"
            else:
                extra = ""
            rank_label = "cantrip" if r.get("isCantrip") else str(r.get("rank", ""))
            print(f"{str(r['name'])[:40]:<40} {rank_label:>4}  {routing:<24} {extra}")


def register_subparsers(sub: argparse._SubParsersAction) -> None:
    p_seed = sub.add_parser(
        "seed-homebrew",
        help=(
            "ONE-TIME seed: vendored run_balance 176 -> the committed canonical store "
            "apps/assay/homebrew/spells/<slug>.json (never overwrites an existing file "
            "without --force)"
        ),
    )
    p_seed.add_argument(
        "--force",
        action="store_true",
        help="overwrite existing store files (DESTROYS hand edits) — off by default",
    )
    p_seed.set_defaults(func=cmd_seed_homebrew)

    p_score = sub.add_parser(
        "score-homebrew",
        help=(
            "score every spell in the canonical homebrew store (never converts from "
            "vendor) -> out/homebrew/scores.json"
        ),
    )
    p_score.set_defaults(func=cmd_score_homebrew)

    p_revisions = sub.add_parser(
        "homebrew-revisions",
        help=(
            "diff the canonical homebrew store against a fresh vendor re-conversion -> "
            "apps/assay/homebrew/revisions.md"
        ),
    )
    p_revisions.set_defaults(func=cmd_homebrew_revisions)
