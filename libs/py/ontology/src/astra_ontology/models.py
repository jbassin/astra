"""Typed ontology-being schema, the source of truth for its shape: `canonical_json()`
dumps it to `being.canonical.json`, which `libs/ts/ontology` (Zod, the same field set +
snake_case keys) reads and re-checks field for field. `player_id` is the preserved dice
FK.

The `Annotated` markers say where each field sits in `being.kdl` for the shared
decoder (`astra_config.kdl`); an unmarked field is the child node of its kebab name."""

from __future__ import annotations

from typing import Annotated

from astra_config.kdl import Arg, Children, Prop
from pydantic import BaseModel, ConfigDict, Field


class _Base(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Player(_Base):
    slug: Annotated[str, Arg()]
    name: str
    player_id: int  # load-bearing dice-history FK — preserve verbatim
    snowflakes: list[str] = []
    aliases: list[str] = []  # recording-user-id aliases (roster.ts)
    is_dm: bool = False
    is_admin: bool = False
    color: str  # identity hex (aether theme.scss set, I5)


class Role(_Base):
    """A player's seat in one campaign — a PC, or the GM (`character == "Gamemaster"`)."""

    player: Annotated[str, Prop()]  # player slug
    character: Annotated[str, Prop()]
    character_class: Annotated[str | None, Prop("class")] = None
    descriptions: Annotated[list[str], Children("desc")] = []


class Campaign(_Base):
    slug: Annotated[str, Arg()]
    name: str
    edition: str
    main: bool = False
    world: str  # the setting played in (free-form; "faerrin" scopes heartwood ingestion)
    roles: Annotated[list[Role], Children("role")]


class HostLines(_Base):
    """A weal-host's `host_says` flavor banks, keyed by roll goodness (mouth/host.rs).

    Empty for bankless hosts (knife/master). Lifted into the ontology so
    identity + voice live together; weal-bot reads these via the ontology accessor.
    """

    crit: Annotated[list[str], Children("crit")] = []
    good: Annotated[list[str], Children("good")] = []
    okay: Annotated[list[str], Children("okay")] = []
    bad: Annotated[list[str], Children("bad")] = []
    fumble: Annotated[list[str], Children("fumble")] = []


class WealHost(_Base):
    """A weal-bot Discord message-send identity (mouth/host.rs) — distinct from a persona."""

    slug: Annotated[str, Arg()]
    name: str
    color: str
    avatar: str
    lines: HostLines = Field(default_factory=HostLines)


class PodcastPersona(_Base):
    """A mouthpiece roundtable host (caster) — distinct from a weal-host."""

    slug: Annotated[str, Arg()]
    name: str
    #: ElevenLabs voice id (the TTS backend).
    voice_id: str
    voice_name: str
    persona: str


class Being(_Base):
    players: Annotated[list[Player], Children("player")]
    guest_color: str
    campaigns: Annotated[list[Campaign], Children("campaign")]
    weal_hosts: Annotated[list[WealHost], Children("weal-host")]
    podcast_personas: Annotated[list[PodcastPersona], Children("podcast-persona")]
