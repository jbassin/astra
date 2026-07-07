"""The forced-tool input schemas.

`script_tool` is ported verbatim from caster `script/schema.ts`: the model returns
this shape (camelCase keys, matching the committed faerrin `*.script.json`
fixtures); `script.parse_script` validates it into the snake_case Pydantic models.
The description text is byte-identical to faerrin (the model sees it); only the
Python source line-wrapping differs.

`clean_filter_tool` / `clean_enrich_tool` (0024 §3) are net-new — not ported from
caster — for the clean+enrich Stage-2 replacement (`clean.py`); camelCase kept for
the same house style (`wikiRefs`).
"""

from __future__ import annotations

from astra_llm import ToolSpec

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


# ── clean: filter (0024 §3.1) ─────────────────────────────────────────────────

CLEAN_FILTER_TOOL_NAME = "record_window_verdicts"

_CLEAN_FILTER_DESC = (
    "Record a keep/drop verdict for every numbered window in this batch. Call this "
    "exactly once with a verdict for each window shown."
)
_WINDOW_DECISION_DESC = (
    "keep to send this window to the podcast hosts; drop to cut it as bookkeeping noise."
)
_WINDOW_CATEGORY_DESC = (
    '"content" for a kept window; for a dropped window, which kind of bookkeeping it '
    "is — noise (recording markers), logistics (scheduling), life (real-life chatter), "
    "bookkeeping (pure roll/initiative/HP arithmetic), or asr_noise (unintelligible/"
    "content-free transcription gibberish)."
)

clean_filter_tool = ToolSpec(
    name=CLEAN_FILTER_TOOL_NAME,
    description=_CLEAN_FILTER_DESC,
    input_schema={
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "windows": {
                "type": "array",
                "description": "One verdict per window shown in this batch.",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "window": {
                            "type": "integer",
                            "description": "The window's [Wn] number.",
                        },
                        "decision": {
                            "type": "string",
                            "enum": ["keep", "drop"],
                            "description": _WINDOW_DECISION_DESC,
                        },
                        "category": {
                            "type": "string",
                            "enum": [
                                "noise",
                                "logistics",
                                "life",
                                "bookkeeping",
                                "asr_noise",
                                "content",
                            ],
                            "description": _WINDOW_CATEGORY_DESC,
                        },
                    },
                    "required": ["window", "decision", "category"],
                },
            },
        },
        "required": ["windows"],
    },
)


# ── clean: enrich (0024 §3.2) ──────────────────────────────────────────────────

CLEAN_ENRICH_TOOL_NAME = "record_session_enrichment"

_CLEAN_ENRICH_DESC = (
    "Record the episode blurb and wiki reference list for this session's cleaned "
    "transcript. Call this exactly once with the full result."
)
_CLEAN_SYNOPSIS_DESC = (
    "A 2 to 4 sentence public episode blurb, in-world and evocative but not "
    "spoilery-precise, grounded only in what the transcript shows."
)
_CLEAN_WIKI_REFS_DESC = (
    "Proper nouns (factions, places, people, concepts) a setting wiki would likely "
    "document, for later grounding — as they appear in the transcript, no fabrication."
)

clean_enrich_tool = ToolSpec(
    name=CLEAN_ENRICH_TOOL_NAME,
    description=_CLEAN_ENRICH_DESC,
    input_schema={
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "synopsis": {"type": "string", "description": _CLEAN_SYNOPSIS_DESC},
            "wikiRefs": {
                "type": "array",
                "items": {"type": "string"},
                "description": _CLEAN_WIKI_REFS_DESC,
            },
        },
        "required": ["synopsis", "wikiRefs"],
    },
)
