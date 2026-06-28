"""Stage 1 — the dedicated filter pass (spec §6).

A keep-when-in-doubt LLM classification over the session: segment the transcript into
contiguous scene-sized windows, classify each keep/drop via ``call_structured``, and
assemble (a) the kept context (input to Stage 2) and (b) a human-reviewable dropped-span
audit trail. The model + client are injectable (Dagster-free) so this tests with a stub —
no key, no network — mirroring chronicle's ``chronicle_llm``.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from astra_linguist.models import FormattedLine, Transcript

from .llm import StructuredClient, default_model, real_client
from .models import DroppedSpan, _Base
from .prompts import FILTER_SYSTEM

# Scene-sized windows; classify calls batched under a word budget; small verdict output.
FILTER_WINDOW_TURNS = 20
FILTER_CHUNK_WORDS = 12_000
FILTER_MAX_TOKENS = 8_000

_SAMPLE_CHARS = 240


class WindowVerdict(_Base):
    """The per-window keep/drop classification the filter LLM emits."""

    window_id: int
    decision: Literal["keep", "drop"]
    category: Literal["in_world", "ooc", "combat", "play_by_play"]
    reason: str


class _FilterVerdicts(_Base):
    """The forced-tool output wrapper (a verdict per window)."""

    verdicts: list[WindowVerdict]


@dataclass(frozen=True)
class Window:
    window_id: int
    lines: list[FormattedLine]


@dataclass(frozen=True)
class FilterResult:
    kept_text: str  # kept windows rendered as "Speaker: text" — the Stage-2 input
    dropped: list[DroppedSpan]
    windows_total: int
    windows_kept: int
    windows_dropped: int


def _render(lines: list[FormattedLine]) -> str:
    return "\n".join(f"{ln.user.name}: {ln.text}" for ln in lines)


def segment(transcript: Transcript, *, size: int = FILTER_WINDOW_TURNS) -> list[Window]:
    """Split the transcript into contiguous windows of ``size`` turns (1-based ids)."""
    script = transcript.script
    return [
        Window(window_id=i + 1, lines=script[start : start + size])
        for i, start in enumerate(range(0, len(script), size))
    ]


def _word_count(window: Window) -> int:
    return sum(len(ln.text.split()) for ln in window.lines)


def _batch(windows: list[Window], *, max_words: int = FILTER_CHUNK_WORDS) -> list[list[Window]]:
    """Greedily group windows into classify calls bounded by a word budget."""
    batches: list[list[Window]] = []
    cur: list[Window] = []
    cur_words = 0
    for w in windows:
        wc = _word_count(w)
        if cur and cur_words + wc > max_words:
            batches.append(cur)
            cur, cur_words = [], 0
        cur.append(w)
        cur_words += wc
    if cur:
        batches.append(cur)
    return batches


def _render_windows(batch: list[Window]) -> str:
    return "\n\n".join(f"[W{w.window_id}]\n{_render(w.lines)}" for w in batch)


def classify(windows: list[Window], *, client: StructuredClient, model: str) -> list[WindowVerdict]:
    """Classify every window keep/drop, chunking the input under the word budget."""
    verdicts: list[WindowVerdict] = []
    for batch in _batch(windows):
        out = client.call_structured(
            _FilterVerdicts,
            system=FILTER_SYSTEM,
            user_content=_render_windows(batch),
            model=model,
            max_tokens=FILTER_MAX_TOKENS,
            tool_name="record_window_verdicts",
            tool_description="Record a keep/drop verdict for every window.",
        )
        verdicts.extend(out.verdicts)
    return verdicts


def _to_dropped(v: WindowVerdict, sample: str) -> DroppedSpan | None:
    """A DroppedSpan for a genuinely-dropped window; None if it should be kept.

    Guards the contradiction (decision=drop but category=in_world) toward keeping — a real
    noun must never be silently dropped.
    """
    if v.category == "in_world":
        return None
    return DroppedSpan(category=v.category, sample=sample, reason=v.reason)


def filter_session(
    transcript: Transcript,
    *,
    client: StructuredClient | None = None,
    model: str | None = None,
    window_turns: int = FILTER_WINDOW_TURNS,
) -> FilterResult:
    """Run the Stage-1 filter: kept context + the dropped-span audit trail."""
    windows = segment(transcript, size=window_turns)
    client = client if client is not None else real_client()
    model = model if model is not None else default_model()
    by_id = {v.window_id: v for v in classify(windows, client=client, model=model)}

    kept_lines: list[FormattedLine] = []
    dropped: list[DroppedSpan] = []
    for w in windows:
        v = by_id.get(w.window_id)
        # keep-when-in-doubt: a missing verdict or a "keep" decision keeps the window.
        ds = None if (v is None or v.decision == "keep") else _to_dropped(v, _sample(w))
        if ds is None:
            kept_lines.extend(w.lines)
        else:
            dropped.append(ds)

    return FilterResult(
        kept_text=_render(kept_lines),
        dropped=dropped,
        windows_total=len(windows),
        windows_kept=len(windows) - len(dropped),
        windows_dropped=len(dropped),
    )


def _sample(window: Window) -> str:
    text = _render(window.lines)
    return text if len(text) <= _SAMPLE_CHARS else text[:_SAMPLE_CHARS].rstrip() + "…"
