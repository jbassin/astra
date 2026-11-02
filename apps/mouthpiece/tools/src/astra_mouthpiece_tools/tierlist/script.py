"""The tier-list script: a tier-list Pass A fed the campaign overview, THE ASTRA and the cast
file (no session transcript), then the unchanged Pass B dressing
(``script.dress_transcript``)."""

from __future__ import annotations

from astra_llm import LlmClient, TextRequest
from astra_mouthpiece.models import HostConfig, Script
from astra_mouthpiece.script import DEFAULT_SCRIPT_MAX_TOKENS, dress_transcript


def _evidence_rules(a: str, b: str, c: str) -> str:
    """The prompt's evidence section: what the cast file and THE ASTRA hold, and what the
    hosts may and may not make up."""
    return f"""THE CAST FILE AND WHAT COUNTS:
- Below is a CAST FILE. It opens with THE WIDER SETTING: notes on the cosmology, powers and
  history the placements lean on. Then come two boards. BOARD ONE lists the villains; BOARD
  TWO lists the campaign's notable NPCs. Each entry gives who they are, what is established
  about them, moments from the sessions or lines from the wiki, the best case for a higher
  tier and for a lower one, what is still unknown, and who they are tied to. The file does
  not rank anyone: the hosts do. A character can sit on both boards.
- THE ASTRA, also below, lists the GM's other games set in the same meta-setting: earlier
  campaigns and one-shots, mostly with these same players. Some characters on the boards
  come from those games, and what happened there is part of this world. {a} and {b}
  bring those games up the way fans of a long series bring up an earlier season; {c} asks
  plainly about any name from them she hasn't met, and they explain who it was.
- Every argument for a placement starts from something that really happened: the hosts name
  the moment ("when she told us...", "that bit on the wiki about...", "back in the first
  campaign...") by its story and season, never by an entry number or a date.
- Opinions are theirs to have: who is scarier, who they would follow anywhere, who they
  were wrong about. What really happened stays fixed: they never invent an event, a scene,
  or something a character said.
- Use only lore from the GM's own world, the Astra: this campaign and the games in THE
  ASTRA. The world is homebrew; published Pathfinder setting lore does not apply, and
  {c}'s Pathfinder experience shows up as reading the game and the table, not as setting
  facts.

"""


def build_tierlist_system_prompt(hosts: HostConfig) -> str:
    """Pass A for the tier-list special. Same hosts, voices, format and mechanics rules as
    the roundtable; the material is a cast file and the episode ranks it on two boards."""
    c = hosts.c
    if c is None:
        raise ValueError("the tier list needs three hosts (a, b, c) — see hosts.py")
    a, b = hosts.a.name, hosts.b.name
    return f"""You are writing down a recorded SPECIAL EPISODE of a podcast about a Pathfinder 2e
campaign: a tier list. Three co-hosts — {a}, {b}, and {c.name} — are not recapping a
session this time. They are ranking the people of the Astra on two boards: first the
VILLAINS, S tier to D tier by how dangerous they are; then ALL THE NOTABLE NPCS, S tier to
D tier by how much the three of them love them. This is a TRANSCRIPT of what was actually
said. {a} and {b} are two old friends who have followed this campaign from the start and
know the GM's earlier games in the same world; {c.name} joined this season, has played a
LOT of Pathfinder, and has heard the recent episodes. The game master will listen.

The three co-hosts:
- {a}: {hosts.a.persona}. He argues from the gut, loves a big entrance, and fights hard
  for his favourites.
- {b}: {hosts.b.persona}. She knows the world, remembers where each moment came from, and
  makes the careful case, and then has one pick nobody saw coming.
- {c.name}: {c.persona}. She asks "wait, who was that?" about any name from the earlier
  games she hasn't met, and asks what a placement is based on. She reads the game
  master's craft like a player: who got the lingering descriptions, who was built up and
  held back, which villain the GM is clearly saving.

Format: plain text, one line per turn, as
{a}: what they said
{b}: what they said
{c.name}: what they said
Use the hosts' names as the speaker labels. NOTHING else — no headings, no audio tags,
no stage directions, no markdown. Ordinary spoken punctuation only.

{_evidence_rules(a, b, c.name)}How the conversation runs:
- Start mid-conversation with the premise: no session to recap, so it is tier-list time,
  two boards. No "welcome to the show".
- The villain board comes first and is finished before the NPC board starts. Each board
  starts empty; a host puts a name up, they say what that character did and why it puts
  them where it does, and the others push back or pile on. Take the names in an order
  that makes good radio, not the file's order, and let one placement lead into the next
  ("if she's A tier then he can't be below her").
- The NPC board is about affection, not power: a harmless shopkeeper can be S tier and a
  mighty ally can land in C. The hosts say why someone got to them.
- They disagree for real about some placements and settle it: one host wins, they meet in
  the middle, or they agree to disagree. Not every placement is a fight, and never a
  pattern where one proposes and the other objects every time. Ties, surprises and a
  last-minute swap are welcome.
- {c.name} is never wrong about a fact and never corrected; {a} stays the only one who
  misremembers, and {b} gently fixes it.
- Close with a quick read-out of both final boards, tier by tier, in one breath each.
  Then let it trail off.

NARRATIVE MECHANICS: no dice results, modifiers, DCs, HP or levels. Talk about the story.

QUOTING: retell moments in the hosts' own words. A short verbatim fragment is fine when the
exact wording IS the point (a line an NPC is known for), at most five or six in the
episode, and never announced as a quotation ("quote", "end quote", "and I quote").

LENGTH: about 6,000 words (about 35 minutes), never more than about 6,500. Spend the room
on the arguments, not on listing names; do not pad or circle back to restate a placement.

Write the transcript now, and nothing else."""


def build_tierlist_user_content(
    episode_id: str, overview: str, roster: str, cast_block: str, astra: str = ""
) -> str:
    roster_part = f"{roster.strip()}\n\n" if roster.strip() else ""
    astra_part = f"{astra.strip()}\n\n" if astra.strip() else ""
    return f"""SPECIAL EPISODE — {episode_id}

{roster_part}{astra_part}SEASON OVERVIEW (what the hosts already know about the story so far):

{overview.strip()}

---

CAST FILE:

{cast_block.strip()}"""


def generate_tierlist_script(
    client: LlmClient,
    episode_id: str,
    overview: str,
    roster: str,
    cast_block: str,
    hosts: HostConfig,
    *,
    astra: str = "",
    model: str | None = None,
    dress_model: str | None = None,
    max_tokens: int = DEFAULT_SCRIPT_MAX_TOKENS,
) -> tuple[str, Script]:
    """Pass A (tier list, on ``model``) → Pass B (unchanged dressing, on ``dress_model``,
    else ``model``). Returns (raw Pass A, script)."""
    req = TextRequest(
        user_content=build_tierlist_user_content(episode_id, overview, roster, cast_block, astra),
        system=build_tierlist_system_prompt(hosts),
        max_tokens=max_tokens,
    )
    if model is not None:
        req.model = model
    raw = client.call_text(req)
    dress = dress_model or model
    return raw, dress_transcript(client, raw, episode_id, hosts, model=dress, max_tokens=max_tokens)
