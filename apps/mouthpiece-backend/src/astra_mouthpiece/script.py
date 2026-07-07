"""Stage 3 — script: digest + grounding → a tavern-tone roundtable `Script`.

The TWO-PASS (the crux, ported from caster `script/index.ts`): Pass A `call_text`
(free-text "raw imperfect transcript" — keeps the model out of the clean-podcast
attractor) → Pass B `call_tool` (protective "dressing" into structured turns,
forbidden to polish). Raw `libs/py/llm`, no dspy (H1); the verbatim prompts carry
the craft. The `max_tokens→raise` guard + prompt caching come free from the client.
"""

from __future__ import annotations

from typing import Any

from astra_llm import LlmClient, TextRequest, ToolCallRequest

from .models import GroundingEntry, HostConfig, Script, ScriptTurn, SessionDigest, SpeakerId
from .prompts import (
    build_dressing_system_prompt,
    build_dressing_user_content,
    build_improv_system_prompt,
    build_script_system_prompt,
    build_script_user_content,
)
from .schemas import script_tool

#: A 30-40 minute episode is a large output; give the model ample room (M12).
DEFAULT_SCRIPT_MAX_TOKENS = 32_000

#: Max words of Pass A transcript fed to a single Pass B typesetting call. Pass B emits a
#: whole segment as one structured tool call; GLM's structured output is reliable up to a
#: few thousand words but stalls typesetting a full long-episode transcript (6k+ words —
#: it hung indefinitely). So a long Pass A is typeset in word-bounded SEGMENTS and the
#: turns concatenated. A transcript at or below this size is a single segment — one Pass B
#: call, behaviourally unchanged.
PASS_B_CHUNK_WORDS = 2_200


class ScriptParseError(ValueError):
    """Raised when the model's tool input doesn't match the expected script shape."""


def _parse_turn(value: Any, i: int) -> ScriptTurn:
    if not isinstance(value, dict):
        raise ScriptParseError(f"turns[{i}] must be an object")
    speaker = value.get("speaker")
    if speaker not in ("A", "B", "C"):
        raise ScriptParseError(f'turns[{i}].speaker must be "A", "B", or "C"')
    text = value.get("text")
    if not isinstance(text, str) or text.strip() == "":
        raise ScriptParseError(f"turns[{i}].text must be a non-empty string")
    turn = ScriptTurn(speaker=speaker, text=text)
    emotion = value.get("emotion")
    if isinstance(emotion, str) and emotion.strip() != "":
        turn.emotion = emotion
    return turn


def parse_script(session_id: str, raw: Any, hosts: HostConfig) -> Script:
    """Validate the model's tool input into a Script, attaching session_id + hosts.

    Unlike faerrin (which could read `hosts` from the tool output), astra always
    carries the hosts from ontology-being, so they are passed in, not echoed back.
    """
    if not isinstance(raw, dict):
        raise ScriptParseError("tool input must be an object")
    title = raw.get("title")
    if not isinstance(title, str) or title.strip() == "":
        raise ScriptParseError("title must be a non-empty string")
    turns_raw = raw.get("turns")
    if not isinstance(turns_raw, list) or len(turns_raw) == 0:
        raise ScriptParseError("turns must be a non-empty array")
    return Script(
        session_id=session_id,
        title=title,
        hosts=hosts,
        turns=[_parse_turn(t, i) for i, t in enumerate(turns_raw)],
    )


def _text_req(system: str, user_content: str, model: str | None, max_tokens: int) -> TextRequest:
    req = TextRequest(user_content=user_content, system=system, max_tokens=max_tokens)
    if model is not None:
        req.model = model
    return req


def _tool_req(
    system: str, user_content: str, model: str | None, max_tokens: int
) -> ToolCallRequest:
    kwargs: dict[str, Any] = {
        "system": system,
        "user_content": user_content,
        "tool": script_tool,
        "max_tokens": max_tokens,
    }
    if model is not None:
        kwargs["model"] = model
    return ToolCallRequest(**kwargs)


def _split_transcript(transcript: str, max_words: int) -> list[str]:
    """Split a raw "Name: utterance" transcript into segments of <= max_words, breaking
    only on line (turn) boundaries — never mid-utterance. Always returns >= 1 segment (a
    single oversized turn becomes its own segment)."""
    lines = [ln for ln in transcript.splitlines() if ln.strip()]
    if not lines:
        return [transcript]
    segments: list[str] = []
    cur: list[str] = []
    cur_words = 0
    for ln in lines:
        w = len(ln.split())
        if cur and cur_words + w > max_words:
            segments.append("\n".join(cur))
            cur, cur_words = [], 0
        cur.append(ln)
        cur_words += w
    if cur:
        segments.append("\n".join(cur))
    return segments


def generate_two_pass(
    client: LlmClient,
    digest: SessionDigest,
    grounding: list[GroundingEntry],
    hosts: HostConfig,
    *,
    model: str | None = None,
    max_tokens: int = DEFAULT_SCRIPT_MAX_TOKENS,
    continuity_block: str = "",
) -> Script:
    """Pass A (free-text improv) → Pass B (structured dressing, no polishing).

    A long Pass A transcript is dressed in word-bounded SEGMENTS (`PASS_B_CHUNK_WORDS`):
    GLM's structured tool output stalls typesetting a full long-episode transcript at once,
    so each segment gets its own Pass B call and the turns are concatenated (the title
    comes from the first segment). A short transcript is one segment — a single Pass B call,
    unchanged."""
    user_content = build_script_user_content(
        digest.synopsis, digest.session_id, digest.beats, grounding, continuity_block
    )
    # Pass A — raw, imperfect plaintext transcript.
    transcript = client.call_text(
        _text_req(build_improv_system_prompt(hosts), user_content, model, max_tokens)
    )
    # Pass B — protective dressing into structured turns (no polishing), per segment.
    title = ""
    turns: list[ScriptTurn] = []
    for i, segment in enumerate(_split_transcript(transcript, PASS_B_CHUNK_WORDS)):
        raw = client.call_tool(
            _tool_req(
                build_dressing_system_prompt(hosts),
                build_dressing_user_content(segment),
                model,
                max_tokens,
            )
        )
        part = parse_script(digest.session_id, raw, hosts)
        if i == 0:
            title = part.title
        turns.extend(part.turns)
    return Script(session_id=digest.session_id, title=title, hosts=hosts, turns=turns)


def generate_one_shot(
    client: LlmClient,
    digest: SessionDigest,
    grounding: list[GroundingEntry],
    hosts: HostConfig,
    *,
    model: str | None = None,
    max_tokens: int = DEFAULT_SCRIPT_MAX_TOKENS,
    continuity_block: str = "",
) -> Script:
    """Legacy one-shot path (the A/B `two_pass=False` arm) — forced tool only."""
    raw = client.call_tool(
        _tool_req(
            build_script_system_prompt(hosts),
            build_script_user_content(
                digest.synopsis,
                digest.session_id,
                digest.beats,
                grounding,
                continuity_block,
            ),
            model,
            max_tokens,
        )
    )
    return parse_script(digest.session_id, raw, hosts)


def generate_script(
    client: LlmClient,
    digest: SessionDigest,
    grounding: list[GroundingEntry],
    hosts: HostConfig,
    *,
    two_pass: bool = True,
    model: str | None = None,
    max_tokens: int = DEFAULT_SCRIPT_MAX_TOKENS,
    continuity_block: str = "",
    sharpen: bool = False,
) -> Script:
    """Generate a two-host script from a digest. Two-pass by default (the crux);
    `two_pass=False` is the one-shot legacy path used for the golden A/B. With
    `sharpen`, run a focused per-host voice pass afterward (one call per host)."""
    gen = generate_two_pass if two_pass else generate_one_shot
    script = gen(
        client,
        digest,
        grounding,
        hosts,
        model=model,
        max_tokens=max_tokens,
        continuity_block=continuity_block,
    )
    if sharpen:
        from .sharpen import sharpen_voices  # lazy: sharpen imports parse_script from here

        script = sharpen_voices(client, script, hosts, model=model, max_tokens=max_tokens)
    return script


# Speaker ids in the current (two-host) roster, for callers that need to iterate them.
SPEAKERS: tuple[SpeakerId, ...] = ("A", "B")
