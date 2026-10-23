"""Campaign matching + billing + context (P4, port of `campaigns.ts`).

The matching/billing/context LOGIC is linguist's; the campaign DATA is
ontology-being (G3). ontology's `Role{player(slug), character, descriptions}` is
adapted into faerrin's `roles[playerDisplayName] -> CharacterRole[]` view (the
billing/context text bills players by display name, so the slug→name map matters).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from astra_ontology.models import Being

from .models import Transcript

GM_NAMES = frozenset({"Gamemaster", "Dungeon Master"})
# faerrin config.ts `campaign` — kept here as linguist tuning constants.
MATCH_THRESHOLD = 15
TRANSCRIPTION_CONFIDENCE = "85%"


@dataclass(frozen=True)
class CharacterRole:
    """A character a player can be billed as: display name + description facts."""

    name: str
    desc: list[str]


@dataclass(frozen=True)
class CampaignView:
    """faerrin-shaped campaign: roles keyed by player **display name**."""

    name: str
    is_main: bool
    roles: dict[str, list[CharacterRole]]


@dataclass(frozen=True)
class MatchedCampaign:
    campaign: CampaignView
    idx: int  # position in the list → filename prefix
    billing: dict[str, CharacterRole]  # player display name → billed character


def campaign_views(being: Being) -> list[CampaignView]:
    """Adapt ontology-being campaigns into the faerrin role-keyed view."""
    slug_to_name = {player.slug: player.name for player in being.players}
    views: list[CampaignView] = []
    for campaign in being.campaigns:
        roles: dict[str, list[CharacterRole]] = {}
        for role in campaign.roles:
            player = slug_to_name.get(role.player, role.player)
            roles.setdefault(player, []).append(
                CharacterRole(name=role.character, desc=list(role.descriptions))
            )
        views.append(CampaignView(name=campaign.name, is_main=campaign.main, roles=roles))
    return views


def _character_names(campaign: CampaignView) -> list[str]:
    """All non-GM character names — the keyword set for matching."""
    return [
        role.name
        for roles in campaign.roles.values()
        for role in roles
        if role.name not in GM_NAMES
    ]


def match_campaign(
    transcript: Transcript,
    campaigns: list[CampaignView],
    *,
    threshold: int = MATCH_THRESHOLD,
) -> MatchedCampaign | None:
    """First campaign whose character names clear the keyword threshold + its billing."""
    for idx, campaign in enumerate(campaigns):
        keywords = _character_names(campaign)
        hits: dict[str, int] = {kw: 0 for kw in keywords}
        for line in transcript.script:
            for keyword in keywords:
                if keyword in line.text:
                    hits[keyword] += 1

        if sum(hits.values()) < threshold:
            continue

        billing: dict[str, CharacterRole] = {}
        for player, roles in campaign.roles.items():
            best_name: str | None = None
            best = -1
            for role in roles:
                hit = hits.get(role.name, -1)
                if hit > best:
                    best_name, best = role.name, hit
            for role in roles:
                if role.name == best_name or role.name in GM_NAMES:
                    billing[player] = role
                    break
        return MatchedCampaign(campaign=campaign, idx=idx, billing=billing)
    return None


def campaign_filename(matched: MatchedCampaign) -> str:
    """Output stem, e.g. `000.through-a-song-darkly`."""
    ident = "0" if matched.campaign.is_main else "1"
    idx = f"{matched.idx:02d}"
    name = matched.campaign.name.lower().replace(" ", "-").replace(",", "")
    return f"{ident}{idx}.{name}"


def _render_desc(desc: list[str]) -> str:
    """Single fact inline; multiple facts as an indented dash list (faerrin shibboleth)."""
    if len(desc) == 1:
        return desc[0]
    return "".join(f"\n    - {fact}" for fact in desc)


def make_billing(matched: MatchedCampaign) -> str:
    billings = [
        f"The role of {role.name} is played by the player {player}."
        for player, role in matched.billing.items()
    ]
    return "\n".join(["Billing:\n", *billings])


def make_context(matched: MatchedCampaign, date: str) -> str:
    session_kind = (
        f'This is from the main campaign of the game, "{matched.campaign.name}".'
        if matched.campaign.is_main
        else f'This is from a one-shot side story of the game, "{matched.campaign.name}".'
    )
    descs = [
        f"  - {role.name}: {_render_desc(role.desc)}"
        for role in matched.billing.values()
        if role.name not in GM_NAMES
    ]
    # The fixed instruction paragraph — byte-identical to faerrin's template
    # (split across source lines only; the value, incl. internal `\n`, is unchanged).
    paragraph = (
        "The first portion of the transcript is a pre-session chat between the players,"
        " and then it transitions to the\nactual session around when someone says something"
        ' similar to "Do we want to play Pathfinder?" or "Does someone\nwant to do a recap?".'
        ' The session ends when the Gamemaster says somthing similar to "Do we want to call'
        ' it there\nfor the evening?" near the end of the transcript.'
    )
    return (
        "Context:\n\n"
        "This is a transcript of an ongoing ttrpg game in the setting of Faerrin, "
        f"recorded on {date}. The four player characters are:\n"
        f"{chr(10).join(descs)}\n\n"
        f"{session_kind}\n\n"
        f"{paragraph}\n\n"
        "Note: transcription is machine-recorded, with an "
        f"{TRANSCRIPTION_CONFIDENCE} confidence rate.\n"
    )


def to_shibboleth(campaigns: list[CampaignView]) -> dict[str, dict[str, Any]]:
    """Serialize to the shibboleth.json shape (object keyed by campaign name)."""
    return {
        campaign.name: {
            "isMain": campaign.is_main,
            "roles": {
                player: [{"name": role.name, "desc": role.desc} for role in roles]
                for player, roles in campaign.roles.items()
            },
        }
        for campaign in campaigns
    }
