"""The typed entity registry (heartwood Phase 1, Deliverable C).

A registry of in-world *nouns* (people/places/things) — the targets heartwood
resolves transcript mentions against. Seeded (not forked) from three committed
sources: the akasha wiki snapshot, the `defs.kdl` correction vocabulary, and the
faerrin player-characters in ontology-being. Persisted as a typed KDL file
(`entity.kdl`); Python-only (no Zod twin, no canonical-JSON parity — a Python
round-trip test guards stability instead).

    entity "Ichel" kind="person" page="Org/Radiant Arms/People/Ichel" {
        alias "Y'shell"
        source "akasha"
        source "defs"
    }
"""

from __future__ import annotations

from pathlib import Path
from typing import Annotated, Any, Literal

from astra_config.kdl import Arg, Children, Prop, decode, kdl_quote, load_kdl
from astra_lexicon import fold_for_match
from pydantic import BaseModel, ConfigDict

from .models import Being

EntityKind = Literal["person", "place", "org", "deity", "phenomenon", "creature", "item"]

#: Top-level akasha folders that map directly to a kind (Org is special-cased:
#: a path containing `People` is a person, else an org). Folders not listed here
#: (Rules, Timeline, the root index) are mechanical/non-noun and NOT seeded.
_FOLDER_KIND: dict[str, EntityKind] = {
    "Divinity": "deity",
    "Geography": "place",
    "Phenomena": "phenomenon",
    "Bestiary": "creature",
}


class Entity(BaseModel):
    """One in-world noun. `kind`/`page` may be null (a known-but-unclassified or
    unwritten entity); `being` marks a player character (the wiki-write boundary)."""

    model_config = ConfigDict(extra="forbid")

    canonical: Annotated[str, Arg()]  # the canonical display name; the entity's identity
    kind: Annotated[EntityKind | None, Prop()] = None
    page: Annotated[str | None, Prop()] = None  # akasha path-key if a page exists, else None
    #: ontology-being player slug if this is a PC (boundary marker)
    being: Annotated[str | None, Prop()] = None
    #: alternate names + known ASR garbles
    aliases: Annotated[list[str], Children("alias")] = []
    #: provenance: akasha | defs | being | manual
    sources: Annotated[list[str], Children("source")] = []


class _EntityFile(BaseModel):
    """`entity.kdl`: a list of `entity` nodes (other top-level nodes are ignored)."""

    entities: Annotated[list[Entity], Children("entity")] = []


# ── KDL serialization (Python-only; no cross-language parity) ────────────────
def parse_entities(path: str | Path) -> list[Entity]:
    """Parse `entity.kdl` → the validated entity list."""
    return decode(_EntityFile, load_kdl(path)).entities


def serialize_entities(entities: list[Entity]) -> str:
    """Serialize entities to deterministic KDL (sorted by canonical) — stable commit."""
    lines: list[str] = []
    for e in sorted(entities, key=lambda x: (x.canonical.casefold(), x.canonical)):
        head = f"entity {kdl_quote(e.canonical)}"
        if e.kind is not None:
            head += f" kind={kdl_quote(e.kind)}"
        if e.page is not None:
            head += f" page={kdl_quote(e.page)}"
        if e.being is not None:
            head += f" being={kdl_quote(e.being)}"
        lines.append(head + " {")
        lines.extend(f"    alias {kdl_quote(a)}" for a in e.aliases)
        lines.extend(f"    source {kdl_quote(s)}" for s in e.sources)
        lines.append("}")
    return "\n".join(lines) + "\n"


# ── seeding ──────────────────────────────────────────────────────────────────
def _union(a: list[str], b: list[str]) -> list[str]:
    """Order-stable union (a first), de-duplicated."""
    return list(dict.fromkeys([*a, *b]))


def _akasha_entities(pages: list[dict[str, Any]]) -> list[Entity]:
    out: list[Entity] = []
    for p in pages:
        segs = [s for s in str(p.get("path", "")).split("/") if s]
        if not segs:
            continue
        top = segs[0]
        # Display name: a `.../index` page names its parent folder.
        disp = segs[:-1] if segs[-1] == "index" else segs
        if not disp:
            continue
        canonical = disp[-1]
        if top == "Org":
            kind: EntityKind | None = "person" if "People" in segs else "org"
        else:
            kind = _FOLDER_KIND.get(top)
        if kind is None:  # Rules / Timeline / unknown → not a noun, skip
            continue
        aliases = list((p.get("frontmatter") or {}).get("aliases") or [])
        out.append(
            Entity(
                canonical=canonical,
                kind=kind,
                page=str(p["path"]),
                aliases=aliases,
                sources=["akasha"],
            )
        )
    return out


def _defs_entities(defs: dict[str, list[str]]) -> list[Entity]:
    return [Entity(canonical=c, aliases=list(v), sources=["defs"]) for c, v in defs.items()]


def _being_entities(being: Being) -> list[Entity]:
    # Inline the faerrin filter (matches `faerrin_campaign_slugs`) to avoid importing
    # the package __init__ from here — entity is imported *by* __init__.
    faerrin = {c.slug for c in being.campaigns if c.world == "faerrin"}
    out: list[Entity] = []
    seen: set[str] = set()
    for c in being.campaigns:
        if c.slug not in faerrin:
            continue
        for r in c.roles:
            if r.character == "Gamemaster":
                continue
            key = fold_for_match(r.character)
            if key in seen:  # same PC name across campaigns → seed once
                continue
            seen.add(key)
            out.append(
                Entity(canonical=r.character, kind="person", being=r.player, sources=["being"])
            )
    return out


def _merge(a: Entity, b: Entity) -> Entity:
    """Merge `b` into `a` (a's identity wins): fill null fields, union alias/source."""
    return Entity(
        canonical=a.canonical,
        kind=a.kind or b.kind,
        page=a.page or b.page,
        being=a.being or b.being,
        aliases=_union(a.aliases, b.aliases),
        sources=_union(a.sources, b.sources),
    )


def seed_entities(
    snapshot: dict[str, Any] | list[dict[str, Any]],
    defs: dict[str, list[str]],
    being: Being,
) -> list[Entity]:
    """Pure seed: akasha pages ∪ defs canonicals ∪ faerrin PCs, strict-deduped by fold.

    akasha is added first, so its `page`+`kind` are authoritative; defs and being
    contribute alias/source unions (and the `being` PC marker). Unification is by
    *exact fold* — the strictest reading of the strict seed-dedup threshold (§5.3.4):
    distinct entities are never merged; only case/diacritic/ligature variants collapse.
    """
    pages = snapshot.get("pages", []) if isinstance(snapshot, dict) else snapshot
    groups: dict[str, Entity] = {}
    order: list[str] = []

    def add(e: Entity) -> None:
        key = fold_for_match(e.canonical)
        if not key:
            return
        if key in groups:
            groups[key] = _merge(groups[key], e)
        else:
            groups[key] = e
            order.append(key)

    for e in _akasha_entities(pages):
        add(e)
    for e in _defs_entities(defs):
        add(e)
    for e in _being_entities(being):
        add(e)

    return [groups[k] for k in order]


def merge_seed(fresh: list[Entity], existing: list[Entity]) -> list[Entity]:
    """Re-seed = non-clobbering merge: a curated (`source=manual`) entity's identity
    (kind/page/being/canonical) is never overwritten by seed-derived values; its
    alias/source sets still accrue new auto-derived members. Curated entities with no
    fresh counterpart survive; auto-only entities absent from a fresh seed are dropped
    (their source no longer produces them). The invariant: re-seed never loses a human edit.
    """
    by_fold_existing = {fold_for_match(e.canonical): e for e in existing}
    out: list[Entity] = []
    fresh_folds: set[str] = set()

    for f in fresh:
        key = fold_for_match(f.canonical)
        fresh_folds.add(key)
        prior = by_fold_existing.get(key)
        if prior is not None and "manual" in prior.sources:
            # Manual identity wins; still absorb any newly auto-derived aliases/sources.
            out.append(
                Entity(
                    canonical=prior.canonical,
                    kind=prior.kind,
                    page=prior.page,
                    being=prior.being,
                    aliases=_union(prior.aliases, f.aliases),
                    sources=_union(prior.sources, f.sources),
                )
            )
        else:
            out.append(f)

    # Curated entities the fresh seed didn't produce (hand-added) are preserved.
    out.extend(
        e
        for e in existing
        if "manual" in e.sources and fold_for_match(e.canonical) not in fresh_folds
    )
    return out
