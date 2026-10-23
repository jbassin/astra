"""Roster — the deterministic `THE TABLE:` block for Pass A (0024 §4.1.3).

Speaker→character mapping already happens upstream of mouthpiece (linguist bills
speakers to character names before writing the canonical transcript), so the roster
is rendered deterministically from `being.kdl` — no LLM call, same loader `hosts.py`
uses. Two rendering special cases (adversarial findings 1–2 against a naive
per-role template):

- every campaign's GM role carries a `class="gm"` and ZERO `desc` children — a
  naive template dangles a trailing colon on 100% of episodes;
- a live PC can have no `character_class` at all (e.g. Arctos, being.kdl:81) — a
  naive template renders the literal string "None".

Unmatched/excluded shows (`show_for_date` returning `None`, or a slug this module
can't find in `being.kdl`) are tolerated: return `""`, the same best-effort posture
as `continuity.py`.
"""

from __future__ import annotations

from pathlib import Path

from astra_ontology.models import Role
from astra_ontology_being import BEING_KDL_PATH, load_being

#: The GM role's `class=` value in every campaign (being.kdl) — no desc, no colon.
GM_CLASS = "gm"


def _player_name(slug: str, names: dict[str, str]) -> str:
    """Display name for a `being.kdl` player slug, capitalized fallback if unknown."""
    return names.get(slug, slug.capitalize())


def _render_role(role: Role, player_name: str) -> str:
    if role.character_class == GM_CLASS:
        # Precedent: campaigns.py:139 excludes GM names from desc rendering too — the
        # GM role never carries a desc, so no trailing colon or empty desc list.
        return f"- {role.character}, played by {player_name}"
    label = (
        f"{role.character} ({role.character_class}, played by {player_name})"
        if role.character_class
        else f"{role.character} (played by {player_name})"
    )
    # descs are full sentences already — join with a space, not "; " (avoids ".;").
    descs = " ".join(role.descriptions)
    return f"- {label}: {descs}"


def build_roster_block(show_slug: str, path: Path | str = BEING_KDL_PATH) -> str:
    """`THE TABLE:` block for the campaign whose `being.kdl` slug is `show_slug`.

    Returns `""` for an unmatched/unknown slug (tolerated, same as continuity).
    """
    being = load_being(path)
    campaign = next((c for c in being.campaigns if c.slug == show_slug), None)
    if campaign is None or not campaign.roles:
        return ""
    names = {p.slug: p.name for p in being.players}
    lines = [_render_role(role, _player_name(role.player, names)) for role in campaign.roles]
    return "THE TABLE:\n" + "\n".join(lines)
