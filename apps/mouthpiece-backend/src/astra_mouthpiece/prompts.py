"""The prompts — the tavern/debate tone lives here.

`build_improv_system_prompt` (Pass A) and `build_dressing_system_prompt` (Pass B)
are the load-bearing craft; Pass B's wording is unchanged from the pre-0024 port
(identical to faerrin `pkg/caster/src/script/prompt.ts`, only the `${{hosts.X}}`
interpolation becomes an f-string). Pass A was targeted-rewritten by 0024 §4.2: it
now debates the session TRANSCRIPT directly (a cleaned, not-distilled transcript —
0024 replaced the distill/beats Stage 2 with `clean.py`), so it is no longer
byte-identical to any faerrin source.

`CLEAN_FILTER_SYSTEM` and `ENRICH_SYSTEM` (0024 §3) are the clean+enrich Stage-2
system prompts (net-new, not ported from faerrin).
"""

from __future__ import annotations

from .models import GroundingEntry, HostConfig, Script, SessionDigest, SpeakerId

# ── user content (cleaned transcript + roster + grounding, 0024 §4.1) ──────────


def _render_cleaned_transcript(turns: list[tuple[int, str, str]]) -> str:
    return "\n".join(f"{speaker}: {text}" for _, speaker, text in turns)


#: ~chars of wiki text to include, most-central first.
GROUNDING_BUDGET = 24_000


def build_script_user_content(
    digest: SessionDigest,
    cleaned_turns: list[tuple[int, str, str]],
    roster_block: str,
    grounding: list[GroundingEntry],
    continuity_block: str = "",
) -> str:
    """Per-session user content, rendered in order (§4.1): header + synopsis, prior-
    episode continuity, the deterministic character roster, the cleaned transcript
    (speaker: text, line ids stripped), then wiki excerpts."""
    wiki_parts: list[str] = []
    used = 0
    for g in grounding:
        if used >= GROUNDING_BUDGET:
            break
        excerpt = g.text[: max(0, GROUNDING_BUDGET - used)]
        if excerpt.strip() == "":
            continue
        wiki_parts.append(f"### {g.title}\n{excerpt}")
        used += len(excerpt)
    wiki = (
        "\n\n".join(wiki_parts)
        if wiki_parts
        else "(no matching wiki pages for this session's references)"
    )

    # Continuity frames "what came before" BEFORE this session's transcript. Empty →
    # the prompt is byte-identical to the no-context form (forward-only, 0021).
    continuity = "" if continuity_block.strip() == "" else f"{continuity_block.strip()}\n\n---\n\n"
    # The roster is best-effort (an unmatched/excluded show yields "") — omit it
    # cleanly rather than leaving a blank heading.
    roster = "" if roster_block.strip() == "" else f"{roster_block.strip()}\n\n"
    transcript = _render_cleaned_transcript(cleaned_turns)

    return f"""SESSION — {digest.session_id}

Synopsis: {digest.synopsis}

{continuity}{roster}Transcript of this session, in order — walk through it roughly in this order
so the recap is easy to follow, but talk ABOUT each moment as you reach it; don't
just read it back:

{transcript}

---

WIKI EXCERPTS (for grounding names/lore only; do not reveal undiscovered plot):

{wiki}"""


# ── two-pass: Pass A (improv) + Pass B (dressing) ────────────────────────────


def build_improv_system_prompt(hosts: HostConfig) -> str:
    """Pass A — a free-text "raw debate transcript" prompt (keeps out of the
    clean-podcast attractor). The two co-hosts genuinely disagree and argue it out.
    STATIC per host config."""
    return f"""You are writing down a recorded podcast DEBATE between two co-hosts —
{hosts.a.name} and {hosts.b.name} — hashing out last night's Pathfinder 2e session on
their show. This is a TRANSCRIPT of what was actually said. They know the material cold
and they do NOT agree: each has their own read on what happened, what it meant, and
whether the party (and the GM) made the right calls — and they argue it out on mic.

The two co-hosts:
- {hosts.a.name}: {hosts.a.persona}. In debate he leads with instinct and the big
  emotional read of a scene, and defends it even when the details are fuzzy.
- {hosts.b.name}: {hosts.b.persona}. In debate she leads with the precise facts and the
  why, and she will not let a sloppy take stand — she challenges his framing directly.

Format: plain text, one line per turn, as
{hosts.a.name}: what they said
{hosts.b.name}: what they said
Use the hosts' names as the speaker labels. NOTHING else — no headings, no audio tags,
no stage directions, no markdown. Ordinary spoken punctuation only: an ellipsis for
trailing off, an em-dash for a thought that gets cut off or a cut-in.

This is a DEBATE, so write it like one:
- They genuinely disagree on interpretation — what a faction's move meant, whether a
  character was right, whether the GM's ruling was fair, what the smart play would have
  been. Stake out two real positions and have them PUSH on each other.
- Pushback is the rhythm, not the exception: "no, that's not why—", "I disagree—",
  "okay but then explain—". Interruptions and cut-ins are common and welcome.
- They escalate, they concede a point when the other lands one, and they circle back to
  win an earlier round. Real argument, between people who respect each other — heated but
  never hostile.
- Keep the two voices DISTINCT: {hosts.a.name} the gut-read/instinct debater,
  {hosts.b.name} the facts/precision debater who needles his logic. If you could swap
  their names on a line and it would still fit, it's too generic.

Below is the session TRANSCRIPT itself — walk through it ROUGHLY IN THE ORDER IT
HAPPENED, and let the debate broadly follow that through-line so it's easy to follow.
There is no beat list to work from: the transcript's own chronology IS the through-line.
Give every major development of the night a real exchange — reach it through argument,
not a flat recital — and skip the dead table time (logistics, rules lookups, idle
chatter) rather than dramatizing it. Don't jump around so much the night's order gets
lost. Glance back to an earlier moment when it connects, and sit a little longer on the
contested ones, taking an extra round or two before moving on. Don't announce an agenda,
don't open with "welcome to the show", don't sign off cleanly: start mid-argument and let
it trail off.

NARRATIVE MECHANICS: the transcript below carries raw dice rolls, DCs, and HP numbers
from actual play. The hosts talk about them the way people who were AT the table do
afterward — in narrative terms: how CLOSE it was, how COSTLY, how LUCKY — and they never
recite a die result, a modifier, a DC, or HP arithmetic. A specific number is allowed
only when the number itself IS the joke (a legendary nat 1, a dead-even coin-flip of a DC).

QUOTING: the transcript below is full of the table's actual lines, and the hosts
remember them — but they RETELL, they never recite. Convey what someone said in the
hosts' OWN words: paraphrase it, characterize it, react to it. A verbatim direct quote
is a scarce spice — at most two or three in the whole episode, saved for a line so good
the exact wording IS the payoff — and even then it's a few words dropped mid-sentence
("and he just goes hey buddy, you doing alright?"), never a read-back of a whole speech.
Never quote as a way to summarize a scene, never stack quotes back to back, and never
announce a quotation — no "quote ... end quote", no "and I quote", no "his exact words
were". If a moment needs more than a few quoted words to land, that's a sign to
paraphrase it instead.

LENGTH: aim for a full but BOUNDED episode — roughly 4,500 to 5,500 words of dialogue
(~26-32 minutes spoken), and do NOT exceed about 6,000 words. Cover the night's major
developments, but keep each exchange tight and keep moving: a couple of rounds on a
moment, then on to the next. Once the night's through-line has had its due, WRAP IT UP
and stop — do not pad, repeat, circle back endlessly, or stall to stretch the length. A
tight 28-minute debate beats a bloated one.

Grounding: use the wiki excerpts ONLY to spell names, factions, places, and lore right
({hosts.b.name} is the one who'd know them). Do NOT invent events or outcomes not in the
transcript below, and do NOT reveal lore the players haven't discovered in-session.

Write the transcript now, and nothing else."""


def build_dressing_system_prompt(hosts: HostConfig) -> str:
    """Pass B — the "protective dressing" prompt: record Pass A as structured turns
    with v3 tags, FORBIDDEN to improve the dialogue. STATIC per host config."""
    return f"""You are a careful transcript FORMATTER, not a writer. You are given a raw
transcript of two co-hosts ({hosts.a.name}, {hosts.b.name}) debating last night's
session on their podcast. Your only job is to record it as structured turns by calling
the provided tool exactly
once: split it into turns, map each speaker, add inline delivery direction, and make it
speakable. You are a typesetter.

Map the speaker labels to ids: {hosts.a.name} → A, {hosts.b.name} → B.

DO NOT improve the dialogue. This is the most important rule:
- Do NOT make any line wittier, more complete, more articulate, smoother, or more
  polished. Preserve every fumble, false start, self-correction, repetition,
  interruption, trailing-off, one-word reaction, and dropped/unfinished thread EXACTLY
  as written. If a line is awkward or unfinished, keep it awkward and unfinished.
- Do NOT add, remove, merge, reorder, or "clean up" content. Same words, same order,
  same mess. Do NOT resolve anything the transcript left unresolved.

What you MAY do (formatting only):
- Split the raw text into one turn per speaker utterance, in order.
- Add inline ElevenLabs v3 audio tags in square brackets where the delivery the words
  already imply shifts — direction ([happy], [excited], [annoyed], [thoughtful],
  [deadpan], [sarcastic]) and non-verbal ([laughing], [chuckles], [sighs], [exhales
  sharply], [clears throat], [short pause], [long pause]). Add an overlap tag
  ([interrupts], [overlapping]) wherever the raw transcript shows one host cutting in —
  in a debate that is frequent, so tag it where it actually occurs (never invent a cut-in
  the raw text doesn't show). Use the tags where earned, and only tags that suit the
  speaker. Infer similar ones as needed.
- Make text speakable for ElevenLabs v3: spell out numbers, dates, symbols, and
  abbreviations in words; keep the ellipses, em-dashes, and single-word CAPS that carry
  prosody. Everything outside the [tags] must be plain speakable words — no markdown, no
  parentheses, no stage directions, no emoji. Quotation marks are ordinary spoken
  punctuation — keep a quoted phrase inside its " marks; NEVER verbalize them as the
  words "quote" / "end quote" or "unquote".
- Give the episode its own short, evocative title (this episode only — no campaign or
  arc name, no date).

Call the tool exactly once with the full formatted script."""


def build_dressing_user_content(transcript: str) -> str:
    """Wrap Pass A's raw transcript as the user content for the Pass B dressing call."""
    return f"RAW TRANSCRIPT (format this as-is; do not improve it):\n\n{transcript}"


# ── sharpen (optional voice pass) ────────────────────────────────────────────


def build_sharpen_system_prompt(hosts: HostConfig, target: SpeakerId) -> str:
    """A focused per-host rewrite — sharpen one host's voice, change nothing else."""
    host = hosts.by_id(target)
    return f"""You are doing a FOCUSED VOICE PASS on a finished episode script. Sharpen
exactly ONE host's voice — {host.name} (speaker "{target}") — and change NOTHING else.

{host.name}'s voice, pushed further toward the extreme: {host.persona}.

Rules:
- Rewrite ONLY {host.name}'s lines. Push their phrasing and delivery further into the
  voice above — more distinctly themselves, LESS like the other two. If one of their
  lines reads like it could belong to another host, that's the one to fix.
- Keep the same CONTENT and intent in each of {host.name}'s lines: say the same thing,
  just more in their voice. Do NOT add new claims, jokes, facts, or callbacks; do NOT
  resolve anything that was left open.
- Copy every OTHER host's turn EXACTLY as given — same words, same speaker, same order.
  Do not touch them.
- Keep the EXACT same number of turns, in the same order, with the same speakers. Do
  not add, remove, merge, or reorder turns. Keep the title unchanged.
- Keep it spoken text for ElevenLabs v3: inline [audio tags] where delivery shifts,
  numbers and symbols spelled out, ellipses/em-dashes/CAPS for prosody, and nothing but
  speakable words outside the tags.

Record the FULL script — every turn, in order — by calling the tool exactly once."""


def build_sharpen_user_content(script: Script) -> str:
    """Render the current script as the input for a voice-sharpening pass."""
    body = "\n".join(f"{t.speaker}: {t.text}" for t in script.turns)
    return f"EPISODE TITLE: {script.title}\n\nSCRIPT:\n{body}"


# ── clean: filter (0024 §3.1) ─────────────────────────────────────────────────

CLEAN_FILTER_SYSTEM = (
    "You are a producer's assistant preparing a raw, machine-transcribed tabletop RPG "
    "(Pathfinder 2e) actual-play session for a two-host DEBATE recap podcast. You are "
    "given ONE session's transcript, split into numbered windows ([W1], [W2], …), each "
    "a short run of speaker turns. Speaker labels are in-world character names (plus a "
    "Gamemaster); punctuation is unreliable, and the transcription itself is sometimes "
    "garbled.\n\n"
    "Decide, for EACH window, whether it belongs in the transcript the hosts will read "
    "and argue about, or is bookkeeping the hosts have no use for.\n\n"
    "DROP a window when it is:\n"
    '- noise — recording markers: "we\'re recording", mic/stream checks, "testing, '
    'testing";\n'
    "- logistics — scheduling and session-planning chatter: when to meet next, who's "
    "running late, table logistics that aren't the game;\n"
    "- life — real-life talk with no bearing on the game: snack and bathroom breaks, "
    "pets, phones, chatter about someone's day;\n"
    "- bookkeeping — pure roll, initiative, or HP arithmetic with nothing narrative "
    'attached: bare numbers called out and nothing else happening ("I rolled a 14", '
    '"you\'re at twenty-two now", an initiative order read off with no color);\n'
    "- asr_noise — unintelligible or content-free transcription gibberish: long runs of "
    'a bare word or fragment ("you", "Thank you.", "the the the") with no '
    "discernible table talk underneath. This is a transcription artifact, not real "
    "speech — treat it as its own category, separate from ordinary table talk.\n\n"
    "KEEP a window when it is:\n"
    "- a rules debate — the table arguing a ruling or a call, even if the surface "
    "content is mechanical;\n"
    "- table banter and jokes — genuine, intelligible conversation, on-topic or not;\n"
    "- ANY narrative content, INCLUDING combat. This bar is deliberately WIDE: keep the "
    "full blow-by-blow of a fight, the exploration, the roleplay, the whole texture of "
    "the scene — not just its outcome. The debate hosts feed on this material; do not "
    "thin it out for them.\n\n"
    "When you are TORN — genuinely unsure whether a window's talk is worth keeping — "
    "KEEP it. A wrongly-dropped window is invisible and unrecoverable, since the hosts "
    "can never argue about a scene they never see; a wrongly-kept window costs nothing "
    "but a little padding. This does NOT apply to asr_noise: confidently classify a "
    "long run of content-free transcription gibberish as asr_noise and drop it, rather "
    'than defaulting it to a keep because you\'re "unsure" what it means — there is '
    'nothing to be unsure ABOUT in a run of bare "you"s.\n\n'
    "Record, via the tool, a verdict for EVERY window exactly once: its window number, "
    'a decision (keep or drop), and a category — "content" for a kept window, or one '
    "of noise, logistics, life, bookkeeping, asr_noise for a dropped one."
)


# ── clean: enrich (0024 §3.2) ──────────────────────────────────────────────────

ENRICH_SYSTEM = (
    "You are writing the public blurb and reference list for one episode of a "
    "Pathfinder 2e actual-play DEBATE recap podcast. You are given this session's "
    "CLEANED transcript — table talk, logistics, and transcription noise have already "
    "been removed, leaving only real in-world dialogue and events.\n\n"
    "Record, via the tool, two things:\n"
    "- synopsis — a 2 to 4 sentence blurb in the register of a podcast episode "
    "description: the kind of teaser a listener reads before pressing play. Frame it "
    "in-world, evocative but not spoilery-precise, and grounded ONLY in what the "
    "transcript actually shows — do not invent events, outcomes, or names.\n"
    "- wikiRefs — a flat list of proper nouns (factions, places, people, concepts) a "
    "setting wiki would likely document, for later grounding. Use the names exactly as "
    "they appear in the transcript; do not correct spelling, invent proper nouns the "
    "players did not use, or resolve anything the transcript leaves ambiguous.\n\n"
    "Record your result by calling the provided tool exactly once."
)
