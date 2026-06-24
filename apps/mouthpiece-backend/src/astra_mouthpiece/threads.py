"""Cross-session "running threads" (optional) — ported from caster `script/threads.ts`.

Inside jokes, bits, grudges, predictions, and recurring characters the hosts have
built up over past episodes. Persisted to a small JSON store and rendered into the
script prompt (`threads_block`) so the hosts can drop callbacks WITHOUT explaining
them. `extract_threads` mines a finished episode; `merge_threads` dedups + caps.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from astra_llm import LlmClient, ToolCallRequest, ToolSpec

from .models import HostConfig, Script, Thread

_KINDS = {"joke", "bit", "grudge", "prediction", "character"}


def _is_thread(v: Any) -> bool:
    return (
        isinstance(v, dict)
        and isinstance(v.get("text"), str)
        and v["text"].strip() != ""
        and v.get("kind") in _KINDS
    )


def _normalize(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", "", s.lower())).strip()


def load_threads(path: Path | str) -> list[Thread]:
    """Read the running-threads store; tolerant — missing/garbage → []."""
    p = Path(path)
    if not p.exists():
        return []
    try:
        raw = json.loads(p.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return []
    if not isinstance(raw, list):
        return []
    return [Thread(text=t["text"].strip(), kind=t["kind"]) for t in raw if _is_thread(t)]


def save_threads(path: Path | str, threads: list[Thread]) -> None:
    """Persist threads as pretty JSON (trailing newline, matching JSON.stringify)."""
    data = [t.model_dump() for t in threads]
    Path(path).write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


DEFAULT_MAX_THREADS = 40


def merge_threads(
    existing: list[Thread], incoming: list[Thread], max_threads: int = DEFAULT_MAX_THREADS
) -> list[Thread]:
    """Append new threads, dedup by normalized text, keep the most recent `max`."""
    seen = {_normalize(t.text) for t in existing}
    merged = list(existing)
    for t in incoming:
        key = _normalize(t.text)
        if key == "" or key in seen:
            continue
        seen.add(key)
        merged.append(t)
    return [] if max_threads <= 0 else merged[-max_threads:]


def format_threads(threads: list[Thread]) -> str:
    """Render the running-threads block injected into the script prompt. Empty → ""."""
    if not threads:
        return ""
    lines = [f"- {t.text} [{t.kind}]" for t in threads]
    body = "\n".join(lines)
    return (
        "RUNNING THREADS — inside references, bits, and grudges from past episodes that\n"
        "these two already share. Drop a FEW of them naturally as callbacks, WITHOUT explaining\n"
        "them to the listener; don't force them and don't gloss them.\n"
        f"{body}"
    )


# --- extraction (mine a finished episode for new threads) --------------------

THREADS_TOOL_NAME = "record_running_threads"

_THREADS_DESC = (
    "Record the running threads from this episode worth carrying into future "
    "episodes. Call this exactly once."
)
_THREADS_ITEMS_DESC = (
    "Three to seven running threads: inside jokes or bits the hosts coined, a "
    "grudge or bold prediction one of them staked out, or a recurring character "
    "they clearly love or love to hate. NOT one-off plot facts — only things with "
    "legs as a future callback."
)
_THREAD_TEXT_DESC = "A short reference the hosts could drop unexplained in a later episode."

threads_tool = ToolSpec(
    name=THREADS_TOOL_NAME,
    description=_THREADS_DESC,
    input_schema={
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "threads": {
                "type": "array",
                "description": _THREADS_ITEMS_DESC,
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "text": {"type": "string", "description": _THREAD_TEXT_DESC},
                        "kind": {
                            "type": "string",
                            "enum": ["joke", "bit", "grudge", "prediction", "character"],
                            "description": "What kind of running thread this is.",
                        },
                    },
                    "required": ["text", "kind"],
                },
            },
        },
        "required": ["threads"],
    },
)


def build_threads_system_prompt(hosts: HostConfig) -> str:
    return f"""You just heard a finished recap episode by two friends — {hosts.a.name}
and {hosts.b.name} — talking about a Pathfinder 2e session at their tavern table.
Identify the RUNNING THREADS worth carrying into FUTURE episodes: inside
jokes or bits they coined, a grudge or a bold prediction one of them staked out, a
recurring character they clearly love or love to hate. Three to seven of them. Each must
be something they could reference again later WITHOUT explaining it — it has legs as a
callback. Do NOT include one-off plot facts, or anything that only made sense this
episode. Record them by calling the tool exactly once."""


def build_threads_user_content(script: Script) -> str:
    body = "\n".join(f"{t.speaker}: {t.text}" for t in script.turns)
    return f"EPISODE: {script.title}\n\n{body}"


def _parse_threads(raw: Any) -> list[Thread]:
    if not isinstance(raw, dict):
        return []
    arr = raw.get("threads")
    if not isinstance(arr, list):
        return []
    return [Thread(text=t["text"].strip(), kind=t["kind"]) for t in arr if _is_thread(t)]


def extract_threads(
    client: LlmClient, script: Script, hosts: HostConfig, *, model: str | None = None
) -> list[Thread]:
    """Mine a finished script for running threads (one tool call)."""
    kwargs: dict[str, Any] = {
        "system": build_threads_system_prompt(hosts),
        "user_content": build_threads_user_content(script),
        "tool": threads_tool,
    }
    if model is not None:
        kwargs["model"] = model
    return _parse_threads(client.call_tool(ToolCallRequest(**kwargs)))
