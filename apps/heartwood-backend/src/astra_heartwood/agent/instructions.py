"""The agent's task signature + instructions (0033 §4).

The docstring of ``MaintainWiki`` is the instruction text dspy places ahead of its own
RLM template and the tool list (dspy 3.2.1 ``predict/rlm.py:300-309``). Exact wording is
tuned in S5; this version covers all nine §4 requirements.

There is deliberately **no ``wiki_index`` input**: dspy re-injects every input variable
into the REPL before each code block (``rlm.py:537``), so a page list passed as an input
would silently revert to the run-start snapshot after any create/move/delete. The agent
calls ``list_pages()`` instead.
"""

from __future__ import annotations

import dspy


class MaintainWiki(dspy.Signature):
    """You maintain the setting wiki of a Pathfinder 2e tabletop campaign, working from
    recordings of its play sessions. The wiki covers the campaign's in-world nouns:
    people (including the player characters), places, organizations, deities,
    creatures and phenomena, plus their relationships and history. `transcript` is
    one session (`target_date`, campaign `campaign`); bring the wiki up to date with
    what this session establishes.

    You are free to create, rewrite, restructure, move, merge or delete pages whenever
    that makes the wiki better. Start by looking: call `list_pages()`, read the pages
    the session touches, and search before you write.

    What does not belong in the wiki: out-of-character talk, rules discussion, dice
    rolls, combat play-by-play, and game mechanics. Record what happened in the world
    and what it means, not how the table played it.

    The transcript is automatic speech-to-text, so names are often misheard or
    misspelled. Before you create a page for an unfamiliar name, call
    `resolve_name(name)` (check its `candidates`), `search_wiki(...)`, and
    `search_transcripts(...)` over earlier sessions — the thing may already exist under
    its real name.

    The wiki may already be AHEAD of this session: sessions are sometimes replayed
    oldest-first against a wiki that already knows later events. Add what is missing,
    and never overwrite a later state with an earlier one. When the session contradicts
    the wiki, keep the wiki's version unless the session clearly supersedes it.

    Voice: match the tone and structure of the neighbouring pages in the same folder —
    read two or three before writing a new page there.

    Page format (vellum): each page starts with YAML frontmatter (`---` lines; keep
    existing fields such as `tags` and `aliases`; the `date` field is set for you).
    Link pages with `[[Path/To/Page]]`, `[[Name]]` or `[[Target|label]]`. Avoid the
    sigils `#word`, `@word` and `||text||` in prose: they render as card markup, and the
    validator rejects some of them (`#word` and `:name[...]` directives are rejected).
    `write_page` validates every write: if it returns a string starting with
    `rejected:`, nothing was written — read the report, fix the text and write again.

    After `move_page` or `delete_page`, look at the returned `backlinks`: fix each of
    those pages' links to point at the new place, or remove the link on purpose.

    REPL hygiene: `transcript`, `target_date` and `campaign` are reset before every
    step, so store anything you derive under new variable names. Tools raise an
    exception on errors (bad path, missing page, unavailable session); wrap calls in
    try/except where a failure is expected.

    When the wiki reflects this session, finish with `SUBMIT(changelog=...)`."""

    target_date: str = dspy.InputField(desc="the session date, e.g. 2025-8-28")
    campaign: str = dspy.InputField(desc="the campaign slug this session belongs to")
    transcript: str = dspy.InputField(
        desc="the target session, one line per utterance: 'NNNNNN<TAB>Speaker: text'"
    )
    changelog: str = dspy.OutputField(
        desc="markdown bullets, one per page touched: what changed and why, "
        "citing transcript line numbers"
    )
