"""Voice-sharpening (optional) — ported from caster `script/sharpen.ts`.

One focused pass per host, each pushing exactly that host's lines further into
their archetype while copying the rest verbatim — done one host at a time so the
model can't re-average the two voices toward a shared mean. Uses only
`call_tool`. Fails loud if a pass changes the turn count (never quietly shrinks a
paid-for script).
"""

from __future__ import annotations

from typing import Any

from astra_llm import LlmClient, ToolCallRequest

from .models import HostConfig, Script, SpeakerId
from .prompts import build_sharpen_system_prompt, build_sharpen_user_content
from .schemas import script_tool
from .script import DEFAULT_SCRIPT_MAX_TOKENS, ScriptParseError, parse_script

#: One focused pass per host, in order.
SHARPEN_ORDER: tuple[SpeakerId, ...] = ("A", "B")


def sharpen_voices(
    client: LlmClient,
    script: Script,
    hosts: HostConfig,
    *,
    model: str | None = None,
    max_tokens: int = DEFAULT_SCRIPT_MAX_TOKENS,
) -> Script:
    """Refine a finished script with one focused per-host pass; returns the sharpened
    Script (same shape, same turn count)."""
    current = script
    for target in SHARPEN_ORDER:
        kwargs: dict[str, Any] = {
            "system": build_sharpen_system_prompt(hosts, target),
            "user_content": build_sharpen_user_content(current),
            "tool": script_tool,
            "max_tokens": max_tokens,
        }
        if model is not None:
            kwargs["model"] = model
        raw = client.call_tool(ToolCallRequest(**kwargs))
        nxt = parse_script(script.session_id, raw, hosts)
        # A sharpen pass must only rewrite ONE host's lines, never drop/merge turns.
        # Compare to the ORIGINAL count so drift can't accumulate silently across passes.
        if len(nxt.turns) != len(script.turns):
            raise ScriptParseError(
                f'sharpen pass "{target}" changed the turn count '
                f"({len(script.turns)} → {len(nxt.turns)}); discarding."
            )
        current = nxt
    return current
