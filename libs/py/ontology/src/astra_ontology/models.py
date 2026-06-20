"""Typed ontology-being schema — the SAME field set + snake_case keys as
`libs/ts/ontology` (Zod), so `canonical_json()` is byte-identical across languages
(the Phase-1 parity gate). `player_id` is the preserved dice FK (Decision F)."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class _Base(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Player(_Base):
    slug: str
    name: str
    player_id: int  # load-bearing dice-history FK — preserve verbatim
    snowflakes: list[str]
    aliases: list[str]  # recording-user-id aliases (roster.ts)
    is_dm: bool
    is_admin: bool
    color: str  # identity hex (aether theme.scss set, I5)


class Role(_Base):
    """A player's seat in one campaign — a PC, or the GM (`character == "Gamemaster"`)."""

    player: str  # player slug
    character: str
    character_class: str | None = None
    descriptions: list[str] = []


class Campaign(_Base):
    slug: str
    name: str
    edition: str
    main: bool
    roles: list[Role]


class HostLines(_Base):
    """A weal-host's `host_says` flavor banks, keyed by roll goodness (mouth/host.rs).

    Empty for bankless hosts (knife/master). Lifted into the ontology per 0009 K8 so
    identity + voice live together; weal-bot reads these via the ontology accessor.
    """

    crit: list[str] = []
    good: list[str] = []
    okay: list[str] = []
    bad: list[str] = []
    fumble: list[str] = []


class WealHost(_Base):
    """A weal-bot Discord message-send identity (mouth/host.rs) — distinct from a persona."""

    slug: str
    name: str
    color: str
    avatar: str
    lines: HostLines = Field(default_factory=HostLines)


class PodcastPersona(_Base):
    """A mouthpiece roundtable host (caster) — distinct from a weal-host."""

    slug: str
    name: str
    voice_id: str
    voice_name: str
    persona: str


class Being(_Base):
    players: list[Player]
    guest_color: str
    campaigns: list[Campaign]
    weal_hosts: list[WealHost]
    podcast_personas: list[PodcastPersona]
