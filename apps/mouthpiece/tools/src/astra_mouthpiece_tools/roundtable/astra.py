"""The ``THE ASTRA`` block: the other games set in the GM's shared meta-setting.

Rendered deterministically from ``being.kdl`` (the same loader as the roster): every
campaign whose ``world`` is one of ``astra-worlds``, except the show itself, with its world,
edition, GM and player characters. The roundtable's dossier agent and script writer both get
it, so the wiki pages those games left behind (front matter ``campaigns: [<slug>]``) read as
part of the same cosmos rather than as outside lore.
"""

from __future__ import annotations

import unicodedata
from pathlib import Path

from astra_akasha_backend.corpus import CONTENT_DIR
from astra_ontology.models import Campaign, Role
from astra_ontology_being import BEING_KDL_PATH, load_being

GM_CLASS = "gm"
EDITIONS = {"pathfinder_2e": "Pathfinder 2e", "dnd_5e": "D&D 5e"}


def _fold(name: str) -> str:
    """'Færrin' and 'faerrin' fold to the same key."""
    name = name.casefold().replace("æ", "ae")
    return "".join(c for c in unicodedata.normalize("NFKD", name) if c.isalnum())


def world_names(content_dir: Path = CONTENT_DIR) -> dict[str, str]:
    """being.kdl world slug → the wiki's spelling, from the ``Geography/`` folder names."""
    geo = content_dir / "Geography"
    if not geo.is_dir():
        return {}
    return {_fold(p.name): p.name for p in geo.iterdir() if p.is_dir()}


def _pc(role: Role, names: dict[str, str]) -> str:
    who = names.get(role.player, role.player.capitalize())
    cls = f", {role.character_class}" if role.character_class else ""
    sentences = [d if d.endswith((".", "!", "?")) else f"{d}." for d in role.descriptions]
    desc = f": {' '.join(sentences)}" if sentences else ""
    return f"{role.character} ({who}{cls}){desc}"


def _campaign(c: Campaign, names: dict[str, str], worlds: dict[str, str]) -> str:
    world = worlds.get(_fold(c.world), c.world.capitalize())
    edition = EDITIONS.get(c.edition, c.edition)
    kind = f"the GM's campaign {c.number}" if c.number else "a one-shot or short game"
    gm = next((r for r in c.roles if r.character_class == GM_CLASS), None)
    gm_part = f", run by {names.get(gm.player, gm.player.capitalize())}" if gm else ""
    head = f"- {c.name} (wiki tag `{c.slug}`): {kind}, {edition}, set on {world}{gm_part}."
    pcs = [_pc(r, names) for r in c.roles if r.character_class != GM_CLASS]
    return head + ("\n  Characters: " + "; ".join(pcs) if pcs else "")


def build_astra_block(
    show: str, path: Path | str = BEING_KDL_PATH, content_dir: Path = CONTENT_DIR
) -> str:
    """The block, or ``""`` when the show is unknown or has no sibling games."""
    being = load_being(path)
    me = next((c for c in being.campaigns if c.slug == show), None)
    astra = set(being.astra_worlds)
    if me is None or me.world not in astra:
        return ""
    others = [c for c in being.campaigns if c.slug != show and c.world in astra]
    if not others:
        return ""
    # The GM's numbered campaigns first, in order; then the rest as being.kdl lists them.
    others.sort(key=lambda c: (c.number is None, c.number or 0))
    names = {p.slug: p.name for p in being.players}
    worlds = world_names(content_dir)
    here = worlds.get(_fold(me.world), me.world.capitalize())
    intro = (
        f"THE ASTRA: {me.name} is set on {here}, one world of the Astra, the GM's shared "
        "meta-setting. These other games were played in the same Astra, mostly by the same "
        "players, so what happened in them is part of this campaign's cosmos: its gods, "
        "powers, organizations and history. The wiki pages they left behind carry their tag "
        "in the front matter (`campaigns: [<tag>]`); each world's places sit under "
        "`Geography/<World>/`. They count as evidence from this world, not outside lore."
    )
    return "\n".join([intro, *(_campaign(c, names, worlds) for c in others)])
