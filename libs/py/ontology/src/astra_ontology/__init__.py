"""astra-ontology — typed reader over ontology-being's KDL (the META truth store).

    from astra_ontology import load_being
    being = load_being(path)
    {p.slug: p.player_id for p in being.players}     # preserved dice FKs

The walk is explicit (named field reads, not a generic dict-ify) so the output shape
is pinned and matches `libs/ts/ontology` byte-for-byte via `canonical_json()`.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from astra_config.kdl import load_document

from .entity import (
    Entity,
    EntityKind,
    merge_seed,
    parse_entities,
    seed_entities,
    serialize_entities,
)
from .models import Being, Campaign, HostLines, Player, PodcastPersona, Role, WealHost

__all__ = [
    "Being",
    "Campaign",
    "Entity",
    "EntityKind",
    "HostLines",
    "Player",
    "PodcastPersona",
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


def _children(node: Any, name: str) -> list[Any]:
    return [c for c in node.children if c.name == name]


def _scalar(node: Any, name: str, default: Any = None) -> Any:
    found = _children(node, name)
    if found and list(found[0].args):
        return found[0].args[0]
    return default


def _arg_list(node: Any, name: str) -> list[str]:
    found = _children(node, name)
    return [str(a) for a in found[0].args] if found else []


def _player(node: Any) -> Player:
    return Player(
        slug=str(node.args[0]),
        name=str(_scalar(node, "name")),
        player_id=int(_scalar(node, "player-id")),
        snowflakes=_arg_list(node, "snowflakes"),
        aliases=_arg_list(node, "aliases"),
        is_dm=bool(_scalar(node, "is-dm", False)),
        is_admin=bool(_scalar(node, "is-admin", False)),
        color=str(_scalar(node, "color")),
    )


def _role(node: Any) -> Role:
    props = dict(node.properties)
    klass = props.get("class")
    return Role(
        player=str(props["player"]),
        character=str(props["character"]),
        character_class=str(klass) if klass is not None else None,
        descriptions=[str(c.args[0]) for c in _children(node, "desc") if list(c.args)],
    )


def _campaign(node: Any) -> Campaign:
    return Campaign(
        slug=str(node.args[0]),
        name=str(_scalar(node, "name")),
        edition=str(_scalar(node, "edition")),
        main=bool(_scalar(node, "main", False)),
        world=str(_scalar(node, "world")),
        roles=[_role(r) for r in _children(node, "role")],
    )


def _host_lines(node: Any) -> HostLines:
    found = _children(node, "lines")
    if not found:
        return HostLines()
    block = found[0]

    def bank(goodness: str) -> list[str]:
        return [str(c.args[0]) for c in _children(block, goodness) if list(c.args)]

    return HostLines(
        crit=bank("crit"),
        good=bank("good"),
        okay=bank("okay"),
        bad=bank("bad"),
        fumble=bank("fumble"),
    )


def _weal_host(node: Any) -> WealHost:
    return WealHost(
        slug=str(node.args[0]),
        name=str(_scalar(node, "name")),
        color=str(_scalar(node, "color")),
        avatar=str(_scalar(node, "avatar")),
        lines=_host_lines(node),
    )


def _persona(node: Any) -> PodcastPersona:
    return PodcastPersona(
        slug=str(node.args[0]),
        name=str(_scalar(node, "name")),
        voice_id=str(_scalar(node, "voice-id")),
        voice_name=str(_scalar(node, "voice-name")),
        persona=str(_scalar(node, "persona")),
    )


def load_being(path: str | Path) -> Being:
    """Parse `being.kdl` → the validated `Being` truth store."""
    doc = load_document(path)
    players: list[Player] = []
    campaigns: list[Campaign] = []
    weal_hosts: list[WealHost] = []
    personas: list[PodcastPersona] = []
    guest_color = ""

    for node in doc.nodes:
        if node.name == "player":
            players.append(_player(node))
        elif node.name == "campaign":
            campaigns.append(_campaign(node))
        elif node.name == "weal-host":
            weal_hosts.append(_weal_host(node))
        elif node.name == "podcast-persona":
            personas.append(_persona(node))
        elif node.name == "guest-color":
            guest_color = str(node.args[0])

    return Being(
        players=players,
        guest_color=guest_color,
        campaigns=campaigns,
        weal_hosts=weal_hosts,
        podcast_personas=personas,
    )


def canonical_json(being: Being) -> str:
    """Stable JSON (sorted keys, 2-space indent) — the cross-language parity artifact."""
    return json.dumps(being.model_dump(), sort_keys=True, ensure_ascii=False, indent=2) + "\n"


def faerrin_campaign_slugs(being: Being) -> set[str]:
    """The campaign slugs set in the `faerrin` world — heartwood ingests only these.

    Phase-2 note: session→campaign matching must *skip* session slugs absent from
    being.kdl (an unmapped slug is not faerrin, never a crash).
    """
    return {c.slug for c in being.campaigns if c.world == "faerrin"}
