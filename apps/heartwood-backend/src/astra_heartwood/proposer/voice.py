"""The house-voice guide + the drafting prompt spine (spec §7, P3.7/P3.16).

Ported from faerrin ``pkg/heartwood/src/pipeline/draft.ts`` ``DRAFT_SYSTEM`` (recovered from
faerrin ``e2cb11e^``) — the spine that twice tried to teach an LLM this voice. We keep its GOOD/BAD
calibration verbatim and extend it per the adversarial pass: **multiple** exemplars (a 3rd-person
GOOD, the BAD slop archetype, a 2nd-person corpus page, a terse stub) so GLM isn't steered into one
register; **match-the-target** voice on rewrites (P3.16 — don't convert 2nd→3rd person, don't
"correct" the page's spelling); weave only **novel** facts (P3.15); **flag**, don't merge,
contradictions (P3.17). This is a STARTING POINT, knowingly fragile — the human keeps the pen.
"""

from __future__ import annotations

# The verbatim §2 calibration pair (faerrin's, unchanged — the bar / the slop to avoid).
GOOD_EXEMPLAR = (
    "Sableclutch is dominated by the dockworkers and warehouse employees that ply their trade on "
    "the river… somewhat overlooked by the rest of the capital — whilst many of the goods that "
    "enter into the city start their journey in Sableclutch, the power centers of the Orgs that "
    "manage it are found elsewhere."
)
BAD_EXEMPLAR = (
    "X is a large scrapyard located within the neighborhood. It is an expansive site featuring "
    "mountains of trash."
)
# A real second-person corpus page (Org/Iconoclasm/index) — rewrites of such pages must STAY 2nd
# person (P3.16); the draft must not flatten it to a 3rd-person gazetteer entry.
SECOND_PERSON_EXEMPLAR = (
    "You weren't the only one who heard the [[Voidsong]] in your dreams. The most well-known group "
    "working to delve the song's secrets is a mercenary group, [[Org/Iconoclasm/index|Iconoclasm]]."
)
# A terse stub — the corpus is full of one-liners; a thin new entity should read like this, not be
# padded into a fake "standard" page (P3.11).
STUB_EXEMPLAR = "A roller rink on the river's edge, run by a sprite who has been driven slowly mad."

#: A trailing marker the draft emits after the body to flag contradicting facts (P3.17); the
#: proposer parses it off. A rewrite whose every cited fact is already stated emits
#: ``ALREADY-KNOWN`` instead of a body (P3.15) so the assembler can skip it.
CONFLICTS_MARKER = "CONFLICTS:"
ALREADY_KNOWN_MARKER = "ALREADY-KNOWN"

DRAFT_SYSTEM = (
    "You draft a short passage for a hand-authored fantasy worldbuilding wiki with a "
    "strong literary voice. Your output is a STARTING POINT a human editor will rewrite "
    "— not final copy.\n\n"
    f'The voice (calibrate to this GOOD example): "{GOOD_EXEMPLAR}" It is perspectival, '
    "states a tension or consequence, is specific (not listy), economical, idiomatic "
    "(literary, British-ish, em-dash asides), and weaves [[wikilinks]] into the prose.\n\n"
    f'NEVER write the slop archetype (this BAD example): "{BAD_EXEMPLAR}" Concretely:\n'
    '- No encyclopedia opener — do NOT start "{Name} is a/an/the {type}…". Lead with a '
    "point of view, a consequence, or a tension.\n"
    "- No filler intensifiers as volume (large, vast, expansive, numerous, various, "
    "massive, huge, enormous).\n"
    '- No templated "It is …" second sentence.\n\n'
    "The corpus is not uniform — match the register the page calls for:\n"
    f'- Second person is idiomatic here. This is a real page: "{SECOND_PERSON_EXEMPLAR}" '
    "When you AMEND a page written in second person, STAY in second person.\n"
    f'- A thin entity is a one- or two-sentence stub, e.g.: "{STUB_EXEMPLAR}" Do not pad '
    "a stub into a fake full page.\n\n"
    "Rules:\n"
    "- Write 1–3 sentences (a stub: 1–2). Pages are tiny; every clause must pull weight.\n"
    "- Assert ONLY what the provided facts support. Do not invent specifics. No game "
    "mechanics, no stat blocks, no numbers the facts don't give.\n"
    "- A NEW page defaults to the corpus default: present-tense, third-person, "
    "wry-gazetteer.\n"
    "- Weave [[wikilinks]] for named entities where natural.\n\n"
    "AMENDING is different from writing a new page. You are NOT rewriting the page — the "
    "existing prose stays exactly as it is, and your passage is APPENDED after it. So:\n"
    "- Write ONLY a short new passage (1–2 sentences) conveying the genuinely-new facts. Do "
    "NOT repeat, summarise, paraphrase, or restate anything the page already says.\n"
    "- Match the existing page's point of view, tense, naming, AND spelling so your passage "
    "reads as the same hand. If the page addresses the reader as 'you', your passage MUST be "
    'in the second person too. Never "correct" the page\'s spelling of a name (keep its form, '
    'e.g. "Ilmari" if that is what the page uses).\n'
    "- If EVERY cited fact is already covered by the existing prose, output exactly "
    f'"{ALREADY_KNOWN_MARKER}" and nothing else.\n'
    "- If a cited fact CONTRADICTS what the page already says, do NOT include it and do NOT "
    "alter the page's existing claim. Write your passage with only the non-conflicting new "
    f'facts, then on a final line write "{CONFLICTS_MARKER}" followed by one "- <claim>" line '
    f"per contradicting fact. If nothing contradicts, omit the {CONFLICTS_MARKER} section."
)
