"""Saved script passes, so a failed `session_script` resumes instead of paying again.

`generate_script` saves Pass A's transcript, and each Pass B segment's tool output once it
parses, to `<session dir>/script-cache/`. Each file is named by a hash of the whole request
that produced it: the pass, the model, `max_tokens`, the system prompt and the user content.
The user content carries the cleaned transcript, the digest, the grounding or brief, the
roster and the continuity, so a change to any input or prompt misses the cache and calls the
model again. A Pass B segment's text comes from Pass A, so a new Pass A misses every Pass B
entry too.

The cache only resumes a failed run. `session_script` clears it after it writes
`script.json`, so a deliberate re-run with the same inputs gets a fresh script.
"""

from __future__ import annotations

import hashlib
import json
import shutil
from collections.abc import Mapping
from dataclasses import dataclass, field
from functools import cache
from pathlib import Path

from astra_observe import get_meter
from astra_sessions import atomic_write_text
from opentelemetry.metrics import Counter

#: The cache's dir name inside the session dir.
SCRIPT_CACHE_DIR = "script-cache"

#: Part of every key; bump it when the key's inputs change shape.
PASS_KEY_VERSION = 1


@cache
def _pass_cache_counter() -> Counter:
    """Script passes reused from the cache (hit) or sent to the model (miss), by pass."""
    return get_meter("astra.mouthpiece").create_counter(
        "astra.mouthpiece.script.pass_cache",
        description="script passes reused from the pass cache (hit) or called (miss)",
    )


def pass_key(
    kind: str, *, model: str | None, max_tokens: int, system: str, user_content: str
) -> str:
    """The content hash naming one saved pass (``kind`` is ``"a"`` or ``"b"``)."""
    payload = json.dumps(
        {
            "v": PASS_KEY_VERSION,
            "pass": kind,
            "model": model,
            "max_tokens": max_tokens,
            "system": system,
            "user": user_content,
        },
        sort_keys=True,
        ensure_ascii=False,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:24]


@dataclass
class ScriptPassCache:
    """One session's saved passes under ``root``. ``ScriptPassCache(None)`` saves nothing
    and never hits, for callers without a session dir."""

    root: Path | None
    #: What this instance served: pass -> hit / miss counts, for the span and the log.
    counts: dict[str, int] = field(default_factory=dict)

    def _count(self, kind: str, outcome: str) -> None:
        if self.root is None:
            return
        name = f"pass_{kind}_{outcome}"
        self.counts[name] = self.counts.get(name, 0) + 1
        _pass_cache_counter().add(1, {"pass": kind, "outcome": outcome})

    def _path(self, kind: str, key: str, suffix: str) -> Path | None:
        return None if self.root is None else self.root / f"pass-{kind}.{key}.{suffix}"

    def get_text(self, key: str) -> str | None:
        """Pass A's saved transcript for ``key``, or None."""
        path = self._path("a", key, "txt")
        text = path.read_text(encoding="utf-8") if path is not None and path.is_file() else None
        self._count("a", "miss" if not text else "hit")
        return text or None

    def put_text(self, key: str, text: str) -> None:
        path = self._path("a", key, "txt")
        if path is not None:
            path.parent.mkdir(parents=True, exist_ok=True)
            atomic_write_text(path, text)

    def get_tool(self, key: str) -> dict[str, object] | None:
        """A Pass B segment's saved tool output for ``key``, or None."""
        path = self._path("b", key, "json")
        raw: object = None
        if path is not None and path.is_file():
            try:
                raw = json.loads(path.read_text(encoding="utf-8"))
            except ValueError:
                raw = None
        hit = isinstance(raw, dict)
        self._count("b", "hit" if hit else "miss")
        return raw if hit else None

    def put_tool(self, key: str, raw: Mapping[str, object]) -> None:
        path = self._path("b", key, "json")
        if path is not None:
            path.parent.mkdir(parents=True, exist_ok=True)
            atomic_write_text(path, json.dumps(raw, ensure_ascii=False))

    def clear(self) -> None:
        """Delete every saved pass (after the script is written)."""
        if self.root is not None:
            shutil.rmtree(self.root, ignore_errors=True)
