"""astra-ontology — typed reader over ontology-being's KDL (the META truth store).

    from astra_ontology import load_being
    being = load_being(path)
    {p.slug: p.player_id for p in being.players}     # preserved dice FKs

The shared typed decoder (`astra_config.kdl`) maps the KDL onto the models; their
markers pin the shape, which matches `libs/ts/ontology` byte-for-byte via
`canonical_json()`.
"""

from __future__ import annotations

import json
from pathlib import Path

from astra_config.kdl import decode, load_kdl

from .entity import (
    Entity,
    EntityKind,
    merge_seed,
    parse_entities,
    seed_entities,
    serialize_entities,
)
from .models import Being, Campaign, HostLines, Player, PodcastPersona, Role, WealHost
from .resolve import (
    RESOLVE_FLOOR,
    RESOLVE_GAP,
    RESOLVE_K,
    EntityRef,
    Resolution,
    Resolver,
    ResolveStatus,
)

__all__ = [
    "RESOLVE_FLOOR",
    "RESOLVE_GAP",
    "RESOLVE_K",
    "Being",
    "Campaign",
    "Entity",
    "EntityKind",
    "EntityRef",
    "HostLines",
    "Player",
    "PodcastPersona",
    "Resolution",
    "ResolveStatus",
    "Resolver",
    "Role",
    "WealHost",
    "canonical_json",
    "faerrin_campaign_slugs",
    "load_being",
    "merge_seed",
    "parse_entities",
    "seed_entities",
    "serialize_entities",
]


def load_being(path: str | Path) -> Being:
    """Parse `being.kdl` → the validated `Being` truth store (`KdlDecodeError` names the
    node when a required field is missing)."""
    return decode(Being, load_kdl(path))


def canonical_json(being: Being) -> str:
    """Stable JSON (sorted keys, 2-space indent) — the cross-language parity artifact."""
    return json.dumps(being.model_dump(), sort_keys=True, ensure_ascii=False, indent=2) + "\n"


def faerrin_campaign_slugs(being: Being) -> set[str]:
    """The campaign slugs set in the `faerrin` world — heartwood ingests only these.

    Phase-2 note: session→campaign matching must *skip* session slugs absent from
    being.kdl (an unmapped slug is not faerrin, never a crash).
    """
    return {c.slug for c in being.campaigns if c.world == "faerrin"}
