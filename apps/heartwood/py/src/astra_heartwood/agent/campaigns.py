"""The ``campaigns`` frontmatter field: which campaigns a page draws on.

A page's ``campaigns`` is a list of campaign slugs from ``being.kdl``, oldest first, with no
repeats (vellum-lang parses it as a first-class field). Code sets it, never the model:

- ``write_page`` replaces whatever ``campaigns`` the agent wrote with the list the page
  already had (``set_campaigns``), so a rewrite can neither drop nor invent one;
- ``stamp_campaign`` runs once the agent has finished, before the change-set and
  ``diff.patch`` are written: every page the run created, updated or moved gains the run's
  campaign. The diff, the publish commit and a revert all carry the stamp with the edit.

``campaign_context`` is the agent's ``campaign_context`` input: the session's campaign,
its world, and the current main campaign, read straight from ``being.kdl``.
"""

from __future__ import annotations

import re
from collections.abc import Iterable

from astra_ontology import load_being
from astra_ontology.models import Being
from astra_ontology_being import BEING_KDL_PATH
from astra_vellum_lang import parse_frontmatter, split_frontmatter

from .workspace import Workspace

_FRONTMATTER = re.compile(r"\A---[ \t]*\n(.*?)^---[ \t]*$\n?", re.S | re.M)
_KEY = re.compile(r"^campaigns[ \t]*:")
_PLAIN_SLUG = re.compile(r"[a-z0-9][a-z0-9-]*")


def merge(*lists: Iterable[str]) -> list[str]:
    """Concatenate ``lists`` and drop repeats; each slug keeps its first place."""
    return list(dict.fromkeys(slug for items in lists for slug in items))


def page_campaigns(text: str) -> list[str]:
    """The ``campaigns`` list of page source ``text`` (``[]`` when absent)."""
    return parse_frontmatter(split_frontmatter(text)[0]).campaigns


def _scalar(slug: str) -> str:
    # A JSON string is a valid YAML double-quoted scalar.
    return slug if _PLAIN_SLUG.fullmatch(slug) else '"' + slug.replace('"', '\\"') + '"'


def set_campaigns(text: str, campaigns: list[str]) -> str:
    """``text`` with its frontmatter ``campaigns`` set to ``campaigns`` (removed when empty).

    Returns ``text`` unchanged when it already holds that list. Otherwise the old key (flow
    or block style) is replaced in place by one ``campaigns: [a, b]`` line, or the line is
    appended to the block; every other frontmatter line is kept byte for byte. A page with
    no frontmatter gets a block holding only ``campaigns``.
    """
    campaigns = merge(campaigns)
    if page_campaigns(text) == campaigns:
        return text
    line = f"campaigns: [{', '.join(_scalar(c) for c in campaigns)}]"
    fm = _FRONTMATTER.match(text)
    if fm is None:
        if not campaigns:
            return text
        sep = "" if text.startswith("\n") else "\n"
        return f"---\n{line}\n---\n{sep}{text}"

    block = fm.group(1).removesuffix("\n")
    out: list[str] = []
    placed = skipping = False
    for raw in block.split("\n") if block else []:
        if skipping and (raw[:1] in (" ", "\t", "-") or not raw.strip()):
            continue  # the old value's block-list items
        skipping = False
        if _KEY.match(raw):
            skipping = True
            if campaigns and not placed:
                out.append(line)
                placed = True
            continue
        out.append(raw)
    if campaigns and not placed:
        out.append(line)
    body = "\n".join(out)
    return f"---\n{body}\n---\n{text[fm.end() :]}" if body else f"---\n---\n{text[fm.end() :]}"


def add_campaign(text: str, slug: str) -> str:
    """``text`` with ``slug`` appended to its ``campaigns`` (unchanged if already there)."""
    return set_campaigns(text, merge(page_campaigns(text), [slug]))


def stamp_campaign(ws: Workspace, campaign: str) -> list[str]:
    """Add ``campaign`` to every page the run created, updated or moved; return the paths
    whose bytes changed. Each write goes through the journal, so the change-set's
    categories hold (a write on an existing path keeps its origin)."""
    cs = ws.changeset()
    stamped: list[str] = []
    for path in sorted({*cs.created, *cs.updated, *(m.dst for m in cs.moved)}):
        text = ws.file(path).read_text(encoding="utf-8")
        new = add_campaign(text, campaign)
        if new != text:
            ws.write(path, new)
            stamped.append(path)
    return stamped


def campaign_context(slug: str, being: Being | None = None) -> str:
    """Which campaign session ``slug`` is from, its world, and the current main campaign.

    The main campaign is the first one marked ``main`` in ``being.kdl`` (weal's rule).
    """
    being = being if being is not None else load_being(BEING_KDL_PATH)
    by_slug = {c.slug: c for c in being.campaigns}
    this = by_slug.get(slug)
    main = next((c for c in being.campaigns if c.main), None)
    if this is None:
        head = f"This session is from the campaign `{slug}`."
    elif main is not None and main.slug == slug:
        head = (
            f"This session is from {this.name} (`{slug}`), the current main campaign, "
            f"set in the world `{this.world}`."
        )
    else:
        head = f"This session is from {this.name} (`{slug}`), set in the world `{this.world}`."
    if main is None or main.slug == slug:
        return head
    return (
        f"{head} The current main campaign is {main.name} (`{main.slug}`), set in `{main.world}`."
    )
