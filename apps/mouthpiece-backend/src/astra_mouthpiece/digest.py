"""Stage 2 — distill: session transcript → `SessionDigest` (ported from caster
`distill/`). LLM via `call_tool` (raw `libs/py/llm`, no dspy — H1); `parse_digest`
validates the tool input, renumbering beats to a contiguous 1-based order.
"""

from __future__ import annotations

from typing import Any

from astra_llm import LlmClient, ToolCallRequest

from .models import Beat, SessionDigest
from .prompts import DISTILL_SYSTEM_PROMPT, build_distill_user_content
from .schemas import distill_tool


class DigestParseError(ValueError):
    """Raised when the model's tool input doesn't match the expected digest shape."""


def _as_string_array(value: Any, ctx: str) -> list[str]:
    if not isinstance(value, list):
        raise DigestParseError(f"{ctx} must be an array")
    out: list[str] = []
    for i, v in enumerate(value):
        if not isinstance(v, str):
            raise DigestParseError(f"{ctx}[{i}] must be a string")
        out.append(v)
    return out


def _parse_beat(value: Any, i: int) -> Beat:
    if not isinstance(value, dict):
        raise DigestParseError(f"beats[{i}] must be an object")
    order = value.get("order")
    if not isinstance(order, (int, float)) or isinstance(order, bool):
        raise DigestParseError(f"beats[{i}].order must be a number")
    summary = value.get("summary")
    if not isinstance(summary, str) or summary.strip() == "":
        raise DigestParseError(f"beats[{i}].summary must be a non-empty string")

    beat = Beat(
        order=int(order),
        summary=summary,
        characters=_as_string_array(value.get("characters", []), f"beats[{i}].characters"),
        locations=_as_string_array(value.get("locations", []), f"beats[{i}].locations"),
        wiki_refs=_as_string_array(value.get("wikiRefs", []), f"beats[{i}].wikiRefs"),
    )
    # Enrichment fields are optional — attach only when usable (M3).
    significance = value.get("significance")
    if isinstance(significance, str) and significance.strip() != "":
        beat.significance = significance
    if value.get("details") is not None:
        details = [
            d for d in _as_string_array(value["details"], f"beats[{i}].details") if d.strip() != ""
        ]
        if details:
            beat.details = details
    tone = value.get("tone")
    if isinstance(tone, str) and tone.strip() != "":
        beat.tone = tone
    table_angle = value.get("tableAngle")
    if isinstance(table_angle, str) and table_angle.strip() != "":
        beat.table_angle = table_angle
    return beat


def parse_digest(session_id: str, raw: Any) -> SessionDigest:
    """Validate the model's tool input into a SessionDigest, attaching session_id.

    Beats are renumbered to a contiguous 1-based order sorted by the model's
    `order`, so downstream code can rely on it regardless of model quirks.
    """
    if not isinstance(raw, dict):
        raise DigestParseError("tool input must be an object")
    synopsis = raw.get("synopsis")
    if not isinstance(synopsis, str):
        raise DigestParseError("synopsis must be a string")
    beats_raw = raw.get("beats")
    if not isinstance(beats_raw, list) or len(beats_raw) == 0:
        raise DigestParseError("beats must be a non-empty array")

    parsed = sorted((_parse_beat(b, i) for i, b in enumerate(beats_raw)), key=lambda b: b.order)
    beats = [b.model_copy(update={"order": idx + 1}) for idx, b in enumerate(parsed)]

    return SessionDigest(
        session_id=session_id,
        synopsis=synopsis,
        beats=beats,
        discarded=_as_string_array(raw.get("discarded", []), "discarded"),
    )


def distill_session(
    client: LlmClient,
    session_id: str,
    date: str,
    turns: list[tuple[int, str, str]],
    *,
    arc_title: str | None = None,
    is_main: bool = False,
    model: str | None = None,
    max_tokens: int | None = None,
) -> SessionDigest:
    """Distill one session into a SessionDigest (filter table talk → ordered beats)."""
    req_kwargs: dict[str, Any] = {
        "system": DISTILL_SYSTEM_PROMPT,
        "user_content": build_distill_user_content(
            session_id, date, turns, arc_title=arc_title, is_main=is_main
        ),
        "tool": distill_tool,
    }
    if model is not None:
        req_kwargs["model"] = model
    if max_tokens is not None:
        req_kwargs["max_tokens"] = max_tokens
    raw = client.call_tool(ToolCallRequest(**req_kwargs))
    return parse_digest(session_id, raw)
