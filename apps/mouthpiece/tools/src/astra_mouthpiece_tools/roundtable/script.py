"""The roundtable script: a roundtable-specific Pass A fed the campaign overview and the
dossier (no session transcript), then the unchanged Pass B dressing
(``script.dress_transcript``)."""

from __future__ import annotations

from astra_llm import LlmClient, TextRequest
from astra_mouthpiece.models import HostConfig, Script
from astra_mouthpiece.script import DEFAULT_SCRIPT_MAX_TOKENS, dress_transcript


def build_roundtable_system_prompt(hosts: HostConfig) -> str:
    """Pass A for the prediction special. Same hosts, voices, format and mechanics rules
    as the recap; the material is a mystery file instead of a session transcript."""
    c = hosts.c
    if c is None:
        raise ValueError("the roundtable needs three hosts (a, b, c) — see hosts.py")
    a, b = hosts.a.name, hosts.b.name
    return f"""You are writing down a recorded SPECIAL EPISODE of a podcast about a Pathfinder 2e
campaign: a prediction roundtable. Three co-hosts — {a}, {b}, and {c.name} — are not
recapping a session this time. They are sitting down to work out what is REALLY going on:
the campaign's biggest open mysteries, the who-was-that and why-did-they, the threads
closest to the party. This is a TRANSCRIPT of what was actually said. {a} and {b} are two
old friends who have followed this campaign from the start; {c.name} joined this season,
has played a LOT of Pathfinder, and has heard the recent episodes.

The three co-hosts:
- {a}: {hosts.a.persona}. He makes the big intuitive leaps and falls in love with them.
- {b}: {hosts.b.persona}. She knows the world, remembers where each clue came from, and
  builds the careful case — and then can't resist a wild theory of her own.
- {c.name}: {c.persona}. She asks "wait, where did that come from?" when a theory needs its
  breadcrumb, and asks plainly about any name she hasn't met. She reads the game master's
  craft like a player: what got lingered on, what got introduced and never explained,
  what a GM sets up when they plan to pay it off.

Format: plain text, one line per turn, as
{a}: what they said
{b}: what they said
{c.name}: what they said
Use the hosts' names as the speaker labels. NOTHING else — no headings, no audio tags,
no stage directions, no markdown. Ordinary spoken punctuation only.

BREADCRUMBS FIRST, THEN SPECULATE:
- Below is a MYSTERY FILE: open questions, each with clues (moments from the sessions or
  lines from the campaign wiki) and candidate theories from safe to bold. Every theory
  starts from something that really happened: the hosts name the moment ("when Anzu told
  us...", "that bit on the wiki about...", "back in the Ragged Roost arc...") by its story
  and season, never by a clue number or a date.
- From there they are free to SPECULATE. Predictions need leaps, and the fun of the episode
  is watching them stack clues and jump. They can invent their own theories beyond the
  file's, as long as each one grows from a real moment and the host owns it as a guess
  ("okay, this is pure gut, but..."). Bold and wrong is fine; confidently presented as fact
  is not.
- What really happened in the campaign stays fixed: they never invent an event, a scene,
  or something a character said. Speculation is about what it MEANS and what comes NEXT.
- Avoid lore from outside this campaign. The world is homebrew; published Pathfinder
  setting lore does not apply, and {c.name}'s Pathfinder experience shows up as reading the
  game and the table, not as setting facts.
- When a clue cuts against a favourite theory, someone brings it up and they wrestle
  with it.

How the conversation runs:
- Start mid-conversation with the premise: no session to recap, so they are finally doing
  the theory episode. No "welcome to the show".
- The file has more mysteries than one episode can hold. CHOOSE: go deep on the biggest
  and most personal to the party (roughly seven to nine), and let smaller ones come up only
  when they connect. Let one theory lead naturally into the next mystery. For each: what
  they actually know, the breadcrumbs, two or three competing reads, and where each host
  lands. The best moments are when two mysteries turn out to connect.
- They BUILD on each other ("yes, and"), get excited, talk each other into and out of
  things. Real disagreement is welcome here, as competing theories, but never a pattern
  where one proposes and the other objects every time.
- {c.name} is never wrong about a fact and never corrected; {a} stays the only one who
  misremembers, and {b} gently fixes it.
- End with a lightning round: each host locks in three predictions, a sentence each, with
  how sure they are, so listeners can check back later. Then let it trail off.

NARRATIVE MECHANICS: no dice results, modifiers, DCs or HP. Talk about the story.

QUOTING: retell moments in the hosts' own words. A short verbatim fragment is fine when the
exact wording IS the clue (a strange phrase an NPC used), at most five or six in the
episode, and never announced as a quotation ("quote", "end quote", "and I quote").

LENGTH: this is a long special — roughly 7,000 to 8,000 words (about 45 minutes), never
more than about 8,500. Use the room for depth on each mystery, not for repetition; do not
pad or circle back to restate a theory.

Write the transcript now, and nothing else."""


def build_roundtable_user_content(
    episode_id: str, overview: str, roster: str, dossier_block: str
) -> str:
    roster_part = f"{roster.strip()}\n\n" if roster.strip() else ""
    return f"""SPECIAL EPISODE — {episode_id}

{roster_part}SEASON OVERVIEW (what the hosts already know about the story so far):

{overview.strip()}

---

MYSTERY FILE:

{dossier_block.strip()}"""


def generate_roundtable_script(
    client: LlmClient,
    episode_id: str,
    overview: str,
    roster: str,
    dossier_block: str,
    hosts: HostConfig,
    *,
    model: str | None = None,
    max_tokens: int = DEFAULT_SCRIPT_MAX_TOKENS,
) -> tuple[str, Script]:
    """Pass A (roundtable) → Pass B (unchanged dressing). Returns (raw Pass A, script)."""
    req = TextRequest(
        user_content=build_roundtable_user_content(episode_id, overview, roster, dossier_block),
        system=build_roundtable_system_prompt(hosts),
        max_tokens=max_tokens,
    )
    if model is not None:
        req.model = model
    raw = client.call_text(req)
    return raw, dress_transcript(client, raw, episode_id, hosts, model=model, max_tokens=max_tokens)
