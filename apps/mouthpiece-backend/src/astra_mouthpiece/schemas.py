"""The forced-tool input schemas — ported verbatim from caster `*/schema.ts`.

The model returns these shapes (camelCase keys, matching the committed faerrin
`out/*.digest.json` / `*.script.json` fixtures); `digest.parse_digest` /
`script.parse_script` validate them into the snake_case Pydantic models. The
description text is byte-identical to faerrin (the model sees it); only the
Python source line-wrapping differs.
"""

from __future__ import annotations

from astra_llm import ToolSpec

# ── distill ──────────────────────────────────────────────────────────────────

DISTILL_TOOL_NAME = "record_session_digest"

_DISTILL_DESC = (
    "Record the distilled, in-world story of this play session as an ordered list "
    "of beats, plus a short synopsis and samples of the out-of-character table talk "
    "you discarded. Call this exactly once with the full result."
)
_BEATS_DESC = (
    "The session's in-world events in narrative order. Exclude out-of-character "
    "table talk (scheduling, technical issues, off-topic banter, rules lookups)."
)
_SIGNIFICANCE_DESC = (
    "Why this beat MATTERED: the stakes, tension, or consequences — what "
    "was at risk, what it changed, why the table leaned in. Give the recap "
    "hosts something to react to and weigh, not just a fact to restate."
)
_DETAILS_DESC = (
    "Concrete, vivid texture worth talking about: a clutch or catastrophic "
    "dice roll, a bold or disastrous decision, a striking image, an emotional "
    "turn, a memorable in-character line. Short fragments, grounded in what "
    "actually happened — do not invent color the transcript doesn't support."
)
_TONE_DESC = (
    'The emotional register of the beat in a word or two (e.g. "tense", '
    '"triumphant", "grim", "comedic", "bittersweet").'
)
_TABLE_ANGLE_DESC = (
    "What the hosts recapping this beat over drinks would ARGUE or rib "
    "each other about: the contested or questionable call, the bold/dumb "
    "decision, the read one of them would defend and another would mock. A "
    "seed for table friction — grounded in what happened, not invented drama. "
    "One sentence."
)
_WIKI_REFS_DESC = (
    "Proper nouns (factions, places, people, concepts) a setting wiki "
    "would likely have an entry for, for later grounding."
)
_DISCARDED_DESC = (
    "A few short verbatim samples of the out-of-character table talk you "
    "filtered out, so a human can sanity-check the filtering."
)
_SYNOPSIS_DESC = "One or two sentences framing what happened in this session, in-world."
_CHARACTERS_DESC = "In-world character names involved (as they appear in the transcript)."

distill_tool = ToolSpec(
    name=DISTILL_TOOL_NAME,
    description=_DISTILL_DESC,
    input_schema={
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "synopsis": {"type": "string", "description": _SYNOPSIS_DESC},
            "beats": {
                "type": "array",
                "description": _BEATS_DESC,
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "order": {
                            "type": "integer",
                            "description": "1-based position of this beat in the session.",
                        },
                        "summary": {
                            "type": "string",
                            "description": "What happened in this beat, in-world.",
                        },
                        "significance": {"type": "string", "description": _SIGNIFICANCE_DESC},
                        "details": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": _DETAILS_DESC,
                        },
                        "tone": {"type": "string", "description": _TONE_DESC},
                        "tableAngle": {"type": "string", "description": _TABLE_ANGLE_DESC},
                        "characters": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": _CHARACTERS_DESC,
                        },
                        "locations": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Locations involved in this beat.",
                        },
                        "wikiRefs": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": _WIKI_REFS_DESC,
                        },
                    },
                    "required": [
                        "order",
                        "summary",
                        "significance",
                        "details",
                        "tone",
                        "tableAngle",
                        "characters",
                        "locations",
                        "wikiRefs",
                    ],
                },
            },
            "discarded": {
                "type": "array",
                "items": {"type": "string"},
                "description": _DISCARDED_DESC,
            },
        },
        "required": ["synopsis", "beats", "discarded"],
    },
)


# ── script ───────────────────────────────────────────────────────────────────

SCRIPT_TOOL_NAME = "record_script"

_SCRIPT_DESC = (
    "Record the finished two-host podcast script as an episode title plus an "
    "ordered list of spoken turns shared between the two hosts (a conversation, not "
    "a fixed rotation). Call this exactly once with the full script."
)
_TITLE_DESC = (
    "A short, evocative title for THIS episode that the hosts could announce. "
    "Give the episode's own title ONLY — do NOT prefix or suffix it with the "
    "campaign/arc name or the session date; those are stored and displayed "
    'separately. Good: "The Canary in the Ballroom". Bad: "Through a Song, '
    'Darkly — The Canary in the Ballroom".'
)
_TURNS_DESC = (
    "The dialogue in spoken order. Each turn is one host speaking. Write "
    "natural, conversational lines — not narration or stage directions. The "
    "two hosts should genuinely share the floor, unevenly; avoid a rigid "
    "A-B-A-B rotation, but mostly they take turns and finish their thoughts. "
    "Vary turn length hard (long riffs next to one-word reactions); most lines "
    "are plain talk, not a punchline per turn."
)
_SPEAKER_DESC = "A = Host A (the Recapper, Bram), B = Host B (the grounded foil, Maeve)."
_TEXT_DESC = (
    "What this host says, as it should be spoken aloud. Punctuate for prosody: "
    "an ellipsis for a trailing-off or hesitation, an em-dash for an abrupt cut, "
    "ALL-CAPS on a word for emphasis. You may embed inline ElevenLabs v3 audio "
    "tags in square brackets to direct delivery — these are a non-exhaustive "
    "guide, infer similar ones: direction ([happy], [excited], [annoyed], "
    "[thoughtful], [whisper], [deadpan]), non-verbal ([laughing], [chuckles], "
    "[sighs], [exhales sharply], [inhales deeply], [clears throat], [short pause], "
    "[long pause]); reach for an overlap tag ([interrupts], [overlapping]) only on "
    "the rare line where one host genuinely cuts in. Place a tag right where the "
    "delivery shifts; use them sparingly. Everything outside the brackets must be "
    "plain speakable words."
)

script_tool = ToolSpec(
    name=SCRIPT_TOOL_NAME,
    description=_SCRIPT_DESC,
    input_schema={
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "title": {"type": "string", "description": _TITLE_DESC},
            "turns": {
                "type": "array",
                "description": _TURNS_DESC,
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "speaker": {
                            "type": "string",
                            "enum": ["A", "B"],
                            "description": _SPEAKER_DESC,
                        },
                        "text": {"type": "string", "description": _TEXT_DESC},
                    },
                    "required": ["speaker", "text"],
                },
            },
        },
        "required": ["title", "turns"],
    },
)
