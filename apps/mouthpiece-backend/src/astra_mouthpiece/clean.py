"""Stage 2 — clean + enrich (0024 §3), the distill/beats successor.

A windowed keep/drop OOC filter (heartwood's architecture — `filter.py`, ported here
with mouthpiece's wider D4 bar: combat and all narrative content stay IN) that never
re-emits transcript text (F1 — verdicts + line-id ranges only, deterministic
assembly), plus one enrich call on the cleaned transcript for `synopsis` + flat
`wiki_refs`. LLM via `call_tool` (the old `digest.py` pattern: raw
`LlmClient.call_tool` + hand-rolled parsing, no `call_structured`/dspy — H1).

`apply_kept_ranges` is THE single deterministic assembly function used by both
Stage 2 (the enrich input, here) and Stage 3 (the Pass A input, `assets.py`).
`assert_no_drift` is the Stage-3 re-read guard (§4.3): the canonical transcript is
re-parsed from disk between stages, so a line-count mismatch against
`digest.stats.lines` means it changed underneath the pipeline (e.g. a FROM_FAILURE
re-execution) — never apply stale `kept_ranges` to a different transcript.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from astra_llm import LlmClient, ToolCallRequest
from pydantic import BaseModel, ValidationError

from .models import DigestStats, DroppedRange, SessionDigest
from .prompts import CLEAN_FILTER_SYSTEM, ENRICH_SYSTEM
from .schemas import clean_enrich_tool, clean_filter_tool

# Scene-sized windows; filter calls batched under a word budget (heartwood
# filter.py:22-23); below this many kept lines the session is treated as degenerate
# ASR noise (§3.1 sanity floor) rather than rendered into a garbage episode.
FILTER_WINDOW_TURNS = 20
FILTER_BATCH_WORDS = 12_000
KEPT_LINES_FLOOR = 150

Turn = tuple[int, str, str]  # (line_id, speaker, text) — astra_mouthpiece.linguist_io shape

_Decision = Literal["keep", "drop"]
_Category = Literal["noise", "logistics", "life", "bookkeeping", "asr_noise", "content"]


class DegenerateTranscriptError(RuntimeError):
    """Raised when the cleaned transcript falls below `KEPT_LINES_FLOOR` (§3.1).

    A degenerate ASR session (e.g. the 2026-7-6 ~600x-bare-"you" transcript) must fail
    the asset loudly here, never silently render a near-empty or garbage episode.
    """


class EnrichParseError(ValueError):
    """Raised when the enrich tool's input doesn't match the expected shape."""


class TranscriptDriftError(RuntimeError):
    """Raised when a re-read canonical transcript's line count doesn't match
    `digest.stats.lines` (§4.3 Stage-3 guard).

    The canonical transcript changed between `session_digest` (Stage 2) and
    `session_script` (Stage 3) — e.g. linguist regenerated it across a
    FROM_FAILURE re-execution. `kept_ranges` are line-id ranges into a SPECIFIC
    transcript; applying them to a different one would silently keep/drop the
    wrong lines, so this fails the asset loudly instead.
    """


class WindowVerdict(BaseModel):
    """The per-window keep/drop classification the filter LLM emits.

    `decision` is the only load-bearing field; `category` is observability-only
    (§3.1) — it is never used to override or contradict `decision`.
    """

    window: int
    decision: _Decision
    category: _Category


# ── windowing + batching (mirrors heartwood filter.py:63-90) ───────────────────────


@dataclass(frozen=True)
class Window:
    index: int
    turns: list[Turn]


def segment_turns(turns: list[Turn], *, size: int = FILTER_WINDOW_TURNS) -> list[Window]:
    """Split parsed turns into contiguous, fixed-size windows (1-based indices).

    The last window may be short. An empty `turns` list yields no windows.
    """
    return [
        Window(index=i + 1, turns=turns[start : start + size])
        for i, start in enumerate(range(0, len(turns), size))
    ]


def _word_count(window: Window) -> int:
    return sum(len(text.split()) for _, _, text in window.turns)


def batch_windows(
    windows: list[Window], *, max_words: int = FILTER_BATCH_WORDS
) -> list[list[Window]]:
    """Greedily group windows into filter calls bounded by a word budget."""
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


def _render_window(window: Window) -> str:
    return "\n".join(f"{speaker}: {text}" for _, speaker, text in window.turns)


def _render_batch(batch: list[Window]) -> str:
    return "\n\n".join(f"[W{w.index}]\n{_render_window(w)}" for w in batch)


# ── filter call + verdict parsing (keep-when-in-doubt) ──────────────────────────────


def parse_filter_verdicts(raw: Any) -> list[WindowVerdict]:
    """Validate the filter tool's raw input into `WindowVerdict`s.

    A malformed entry is silently dropped (not raised) — it degrades to a missing
    verdict for its window, which `resolve_verdicts` then keeps (never crashes, never
    drops on a parse failure).
    """
    if not isinstance(raw, dict):
        return []
    entries = raw.get("windows")
    if not isinstance(entries, list):
        return []
    verdicts: list[WindowVerdict] = []
    for entry in entries:
        try:
            verdicts.append(WindowVerdict.model_validate(entry))
        except ValidationError:
            continue
    return verdicts


def resolve_verdicts(verdicts: list[WindowVerdict]) -> dict[int, WindowVerdict | None]:
    """window index -> its verdict, or `None` when missing/duplicated-conflicting.

    `None` is the keep-when-in-doubt signal (heartwood filter.py:142-143 precedent):
    a window with no verdict, or with multiple verdicts that disagree on `decision`,
    resolves to `None` here and is kept by `_decision_for`.
    """
    by_index: dict[int, list[WindowVerdict]] = {}
    for v in verdicts:
        by_index.setdefault(v.window, []).append(v)
    resolved: dict[int, WindowVerdict | None] = {}
    for idx, vs in by_index.items():
        decisions = {v.decision for v in vs}
        resolved[idx] = vs[0] if len(decisions) == 1 else None
    return resolved


def classify_windows(
    windows: list[Window], *, client: LlmClient, model: str | None = None
) -> list[WindowVerdict]:
    """Classify every window keep/drop, batching calls under the word budget."""
    verdicts: list[WindowVerdict] = []
    for batch in batch_windows(windows):
        req_kwargs: dict[str, Any] = {
            "system": CLEAN_FILTER_SYSTEM,
            "user_content": _render_batch(batch),
            "tool": clean_filter_tool,
        }
        if model is not None:
            req_kwargs["model"] = model
        raw = client.call_tool(ToolCallRequest(**req_kwargs))
        verdicts.extend(parse_filter_verdicts(raw))
    return verdicts


def _decision_for(window: Window, resolved: dict[int, WindowVerdict | None]) -> tuple[str, str]:
    """(decision, category) for one window — keep-when-in-doubt on a missing verdict."""
    v = resolved.get(window.index)
    if v is None or v.decision == "keep":
        return "keep", "content"
    return "drop", v.category


# ── range collapsing ─────────────────────────────────────────────────────────────


def _collapse_ranges(
    windows: list[Window], resolved: dict[int, WindowVerdict | None]
) -> tuple[list[tuple[int, int]], list[DroppedRange], int]:
    """Kept windows -> merged inclusive line-id ranges; dropped windows -> a
    per-category audit trail (adjacent same-category drops merged too).

    Ranges are expressed in the actual first/last LINE IDS of each window's turns
    (never turn indices/positions — `parse_canonical_transcript` silently skips
    malformed lines, so a window's line ids can diverge from its turn count).

    Returns (kept_ranges, dropped, dropped_windows_count).
    """
    kept: list[tuple[int, int]] = []
    dropped: list[DroppedRange] = []
    dropped_windows = 0
    # The in-progress run: (decision, category, first_line_id, last_line_id).
    run: tuple[str, str, int, int] | None = None

    def flush(r: tuple[str, str, int, int] | None) -> None:
        if r is None:
            return
        decision, category, start, end = r
        if decision == "keep":
            kept.append((start, end))
        else:
            dropped.append(DroppedRange(range=(start, end), category=category))

    for window in windows:
        if not window.turns:
            continue  # a genuinely empty window (all its raw lines were unparseable)
        decision, category = _decision_for(window, resolved)
        if decision == "drop":
            dropped_windows += 1
        first_id, last_id = window.turns[0][0], window.turns[-1][0]

        if run is not None and run[0] == decision and (decision == "keep" or run[1] == category):
            run = (run[0], run[1], run[2], last_id)
        else:
            flush(run)
            run = (decision, category, first_id, last_id)

    flush(run)
    return kept, dropped, dropped_windows


def apply_kept_ranges(turns: list[Turn], ranges: list[tuple[int, int]]) -> list[Turn]:
    """Deterministic reassembly: every turn whose line id falls inside any inclusive
    range in `ranges`. THE single assembly function for both Stage 2 (the enrich
    input, here) and Stage 3 (the Pass A input, `assets.py`).
    """
    return [t for t in turns if any(lo <= t[0] <= hi for lo, hi in ranges)]


def assert_no_drift(turns: list[Turn], digest: SessionDigest) -> None:
    """Stage-3 re-read guard (§4.3): raise `TranscriptDriftError` unless the
    freshly re-parsed transcript has exactly the line count `digest.stats.lines`
    recorded at Stage 2. Call this BEFORE `apply_kept_ranges` on a re-read
    transcript — a silently-stale `kept_ranges` would keep/drop the wrong lines.
    """
    if len(turns) != digest.stats.lines:
        raise TranscriptDriftError(
            f"session {digest.session_id!r}: the canonical transcript now has "
            f"{len(turns)} line(s) but digest.json recorded {digest.stats.lines} at "
            "Stage 2 — it changed since session_digest ran (e.g. a FROM_FAILURE "
            "re-execution); refusing to apply stale kept_ranges to a different "
            "transcript."
        )


# ── enrich call ──────────────────────────────────────────────────────────────────


def _render_cleaned_transcript(turns: list[Turn]) -> str:
    return "\n".join(f"{speaker}: {text}" for _, speaker, text in turns)


def _parse_enrichment(raw: Any) -> tuple[str, list[str]]:
    if not isinstance(raw, dict):
        raise EnrichParseError("tool input must be an object")
    synopsis = raw.get("synopsis")
    if not isinstance(synopsis, str) or synopsis.strip() == "":
        raise EnrichParseError("synopsis must be a non-empty string")
    wiki_refs_raw = raw.get("wikiRefs", [])
    if not isinstance(wiki_refs_raw, list):
        raise EnrichParseError("wikiRefs must be an array")
    wiki_refs: list[str] = []
    for i, ref in enumerate(wiki_refs_raw):
        if not isinstance(ref, str):
            raise EnrichParseError(f"wikiRefs[{i}] must be a string")
        wiki_refs.append(ref)
    return synopsis, wiki_refs


def enrich_session(
    client: LlmClient, turns: list[Turn], *, model: str | None = None
) -> tuple[str, list[str]]:
    """One forced-tool call on the CLEANED transcript -> (synopsis, wiki_refs)."""
    req_kwargs: dict[str, Any] = {
        "system": ENRICH_SYSTEM,
        "user_content": _render_cleaned_transcript(turns),
        "tool": clean_enrich_tool,
    }
    if model is not None:
        req_kwargs["model"] = model
    raw = client.call_tool(ToolCallRequest(**req_kwargs))
    return _parse_enrichment(raw)


# ── top-level orchestrator ───────────────────────────────────────────────────────


def clean_session(
    client: LlmClient, session_id: str, turns: list[Turn], *, model: str | None = None
) -> SessionDigest:
    """Filter -> sanity floor -> assemble -> enrich -> `SessionDigest` (§3 end to end)."""
    windows = segment_turns(turns)
    verdicts = classify_windows(windows, client=client, model=model)
    resolved = resolve_verdicts(verdicts)
    kept_ranges, dropped, dropped_windows = _collapse_ranges(windows, resolved)
    cleaned_turns = apply_kept_ranges(turns, kept_ranges)

    if len(cleaned_turns) < KEPT_LINES_FLOOR:
        raise DegenerateTranscriptError(
            f"session {session_id!r}: only {len(cleaned_turns)} kept lines "
            f"(floor {KEPT_LINES_FLOOR}) out of {len(turns)} total across "
            f"{len(windows)} windows ({dropped_windows} dropped) — likely a "
            "degenerate ASR transcript; refusing to render a garbage episode from it."
        )

    synopsis, wiki_refs = enrich_session(client, cleaned_turns, model=model)
    stats = DigestStats(
        lines=len(turns),
        kept_lines=len(cleaned_turns),
        windows=len(windows),
        dropped_windows=dropped_windows,
    )
    return SessionDigest(
        session_id=session_id,
        synopsis=synopsis,
        wiki_refs=wiki_refs,
        kept_ranges=kept_ranges,
        dropped=dropped,
        stats=stats,
    )
