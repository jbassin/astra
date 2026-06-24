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


def generate_two_pass(
    client: LlmClient,
    digest: SessionDigest,
    grounding: list[GroundingEntry],
    hosts: HostConfig,
    *,
    model: str | None = None,
    max_tokens: int = DEFAULT_SCRIPT_MAX_TOKENS,
    threads_block: str = "",
) -> Script:
    """Pass A (free-text improv) → Pass B (structured dressing, no polishing)."""
    user_content = build_script_user_content(
        digest.synopsis, digest.session_id, digest.beats, grounding, threads_block
    )
    # Pass A — raw, imperfect plaintext transcript.
    transcript = client.call_text(
        _text_req(build_improv_system_prompt(hosts), user_content, model, max_tokens)
    )
    # Pass B — protective dressing into structured turns (no polishing).
    raw = client.call_tool(
        _tool_req(
            build_dressing_system_prompt(hosts),
            build_dressing_user_content(transcript),
            model,
            max_tokens,
        )
    )
    return parse_script(digest.session_id, raw, hosts)


def generate_one_shot(
    client: LlmClient,
    digest: SessionDigest,
    grounding: list[GroundingEntry],
    hosts: HostConfig,
    *,
    model: str | None = None,
    max_tokens: int = DEFAULT_SCRIPT_MAX_TOKENS,
    threads_block: str = "",
) -> Script:
    """Legacy one-shot path (the A/B `two_pass=False` arm) — forced tool only."""
    raw = client.call_tool(
        _tool_req(
            build_script_system_prompt(hosts),
            build_script_user_content(
                digest.synopsis, digest.session_id, digest.beats, grounding, threads_block
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
    threads_block: str = "",
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
        threads_block=threads_block,
    )
    if sharpen:
        from .sharpen import sharpen_voices  # lazy: sharpen imports parse_script from here

        script = sharpen_voices(client, script, hosts, model=model, max_tokens=max_tokens)
    return script


# Speaker ids in the current (two-host) roster, for callers that need to iterate them.
SPEAKERS: tuple[SpeakerId, ...] = ("A", "B")
