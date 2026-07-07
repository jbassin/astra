"""clean+enrich (0024 §3, S3) unit tests — hermetic, additive-and-unwired.

No live LLM call: `FakeClient` implements the `LlmClient` protocol and computes a
verdict per window from the `[Wn]` markers actually present in a batch's rendered
user content, so it works correctly regardless of how many filter batches the
windows split into.
"""

from __future__ import annotations

import re
from typing import Any

import pytest
from astra_llm import TextRequest, ToolCallRequest
from astra_mouthpiece.clean import (
    FILTER_WINDOW_TURNS,
    KEPT_LINES_FLOOR,
    DegenerateTranscriptError,
    DroppedRange,
    EnrichParseError,
    TranscriptDriftError,
    Turn,
    Window,
    WindowVerdict,
    _collapse_ranges,
    _parse_enrichment,
    apply_kept_ranges,
    assert_no_drift,
    batch_windows,
    clean_session,
    enrich_session,
    parse_filter_verdicts,
    resolve_verdicts,
    segment_turns,
)
from astra_mouthpiece.models import DigestStats, SessionDigest
from astra_mouthpiece.schemas import CLEAN_ENRICH_TOOL_NAME, CLEAN_FILTER_TOOL_NAME
from pydantic import ValidationError

Decide = tuple[str, str]  # (decision, category)


class FakeClient:
    """A stub `LlmClient`. `decide(window_index)` computes each window's verdict from
    the `[Wn]` markers found in the batch's own rendered content, so it is agnostic to
    batching. Enrich calls return a fixed canned (synopsis, wiki_refs)."""

    def __init__(
        self,
        decide: Any = None,
        *,
        synopsis: str = "The party did a thing.",
        wiki_refs: list[str] | None = None,
        enrich_raw: dict[str, Any] | None = None,
    ) -> None:
        self._decide = decide or (lambda _idx: ("keep", "content"))
        self._synopsis = synopsis
        self._wiki_refs = wiki_refs if wiki_refs is not None else ["Wrenford"]
        self._enrich_raw = enrich_raw
        self.calls: list[str] = []
        self.filter_batches: list[str] = []

    def call_text(self, req: TextRequest) -> str:
        raise NotImplementedError

    def call_tool(self, req: ToolCallRequest) -> dict[str, Any]:
        self.calls.append(req.tool.name)
        if req.tool.name == CLEAN_FILTER_TOOL_NAME:
            self.filter_batches.append(req.user_content)
            ids = [int(m) for m in re.findall(r"\[W(\d+)\]", req.user_content)]
            windows = []
            for wid in ids:
                decision, category = self._decide(wid)
                windows.append({"window": wid, "decision": decision, "category": category})
            return {"windows": windows}
        if req.tool.name == CLEAN_ENRICH_TOOL_NAME:
            if self._enrich_raw is not None:
                return self._enrich_raw
            return {"synopsis": self._synopsis, "wikiRefs": self._wiki_refs}
        raise AssertionError(f"unexpected tool {req.tool.name}")


def _turns(
    n: int, *, start_line: int = 1, text: str = "word", speaker: str = "Archie"
) -> list[Turn]:
    return [(start_line + i, speaker, f"{text}{i}") for i in range(n)]


# ── windowing ────────────────────────────────────────────────────────────────────


def test_segment_exact_multiple_of_window_size() -> None:
    turns = _turns(40)
    windows = segment_turns(turns, size=20)
    assert [w.index for w in windows] == [1, 2]
    assert [len(w.turns) for w in windows] == [20, 20]


def test_segment_remainder_window() -> None:
    turns = _turns(45)
    windows = segment_turns(turns, size=20)
    assert [len(w.turns) for w in windows] == [20, 20, 5]


def test_segment_short_transcript_single_window() -> None:
    turns = _turns(7)
    windows = segment_turns(turns, size=20)
    assert len(windows) == 1
    assert len(windows[0].turns) == 7


def test_segment_empty_transcript_no_windows() -> None:
    assert segment_turns([], size=20) == []


def test_default_window_size_is_20() -> None:
    assert FILTER_WINDOW_TURNS == 20


# ── batching ─────────────────────────────────────────────────────────────────────


def test_batch_respects_word_budget() -> None:
    # Each window ~20 turns x 1 word = 20 words. Cap at 45 words -> at most 2
    # windows/batch.
    windows = segment_turns(_turns(100, text="w "), size=20)
    batches = batch_windows(windows, max_words=45)
    assert sum(len(b) for b in batches) == len(windows)
    for b in batches[:-1]:
        assert len(b) <= 2
    # every window appears exactly once, in order
    flat = [w.index for b in batches for w in b]
    assert flat == [w.index for w in windows]


def test_batch_single_batch_when_under_budget() -> None:
    windows = segment_turns(_turns(20), size=20)
    batches = batch_windows(windows, max_words=1_000_000)
    assert len(batches) == 1
    assert batches[0] == windows


# ── verdict parsing (keep-when-in-doubt) ──────────────────────────────────────────


def test_parse_filter_verdicts_skips_malformed_entries() -> None:
    raw = {
        "windows": [
            {"window": 1, "decision": "keep", "category": "content"},
            {"window": 2, "decision": "sideways", "category": "content"},  # bad enum
            {"window": 3, "category": "content"},  # missing decision
            "not-a-dict",
        ]
    }
    verdicts = parse_filter_verdicts(raw)
    assert [v.window for v in verdicts] == [1]


def test_parse_filter_verdicts_non_dict_or_missing_windows_key() -> None:
    assert parse_filter_verdicts("nope") == []
    assert parse_filter_verdicts({}) == []
    assert parse_filter_verdicts({"windows": "nope"}) == []


def test_resolve_verdicts_missing_window_is_none() -> None:
    resolved = resolve_verdicts([WindowVerdict(window=1, decision="keep", category="content")])
    v1 = resolved[1]
    assert v1 is not None
    assert v1.decision == "keep"
    assert resolved.get(2) is None


def test_resolve_verdicts_conflicting_duplicates_resolve_to_none() -> None:
    verdicts = [
        WindowVerdict(window=1, decision="keep", category="content"),
        WindowVerdict(window=1, decision="drop", category="life"),
    ]
    resolved = resolve_verdicts(verdicts)
    assert resolved[1] is None  # ambiguous -> keep-when-in-doubt at collapse time


def test_resolve_verdicts_agreeing_duplicates_resolve_to_a_verdict() -> None:
    verdicts = [
        WindowVerdict(window=1, decision="drop", category="life"),
        WindowVerdict(window=1, decision="drop", category="life"),
    ]
    resolved = resolve_verdicts(verdicts)
    assert resolved[1] is not None
    assert resolved[1].decision == "drop"


def test_malformed_entry_is_kept_end_to_end() -> None:
    # window 1 has a real drop verdict; window 2's entry is malformed (bad category
    # enum) -> parse_filter_verdicts drops it -> resolve_verdicts sees it as missing.
    raw = {
        "windows": [
            {"window": 1, "decision": "drop", "category": "life"},
            {"window": 2, "decision": "drop", "category": "not-a-real-category"},
        ]
    }
    resolved = resolve_verdicts(parse_filter_verdicts(raw))
    v1 = resolved.get(1)
    assert v1 is not None
    assert v1.decision == "drop"
    assert resolved.get(2) is None  # malformed -> missing -> kept downstream


# ── range collapsing ───────────────────────────────────────────────────────────────


def test_collapse_merges_adjacent_keeps_and_uses_real_line_ids() -> None:
    # Two windows of 2 turns each; a gap in line ids proves ranges use real ids, not
    # positions (parse_canonical_transcript skips malformed lines, so ids can diverge
    # from turn count).
    w1 = Window(index=1, turns=[(10, "A", "x"), (11, "B", "y")])
    w2 = Window(index=2, turns=[(20, "A", "z"), (21, "B", "w")])  # gap: 12..19 missing
    resolved: dict[int, WindowVerdict | None] = {
        1: WindowVerdict(window=1, decision="keep", category="content"),
        2: WindowVerdict(window=2, decision="keep", category="content"),
    }
    kept, dropped, dropped_windows = _collapse_ranges([w1, w2], resolved)
    assert kept == [(10, 21)]  # merged across the adjacent kept windows
    assert dropped == []
    assert dropped_windows == 0


def test_collapse_separates_non_adjacent_keeps_across_a_drop() -> None:
    w1 = Window(index=1, turns=[(1, "A", "x"), (2, "B", "y")])
    w2 = Window(index=2, turns=[(3, "A", "z"), (4, "B", "w")])
    w3 = Window(index=3, turns=[(5, "A", "p"), (6, "B", "q")])
    resolved: dict[int, WindowVerdict | None] = {
        1: WindowVerdict(window=1, decision="keep", category="content"),
        2: WindowVerdict(window=2, decision="drop", category="life"),
        3: WindowVerdict(window=3, decision="keep", category="content"),
    }
    kept, dropped, dropped_windows = _collapse_ranges([w1, w2, w3], resolved)
    assert kept == [(1, 2), (5, 6)]
    assert dropped == [DroppedRange(range=(3, 4), category="life")]
    assert dropped_windows == 1


def test_collapse_merges_adjacent_same_category_drops() -> None:
    w1 = Window(index=1, turns=[(1, "A", "x")])
    w2 = Window(index=2, turns=[(2, "A", "y")])
    resolved: dict[int, WindowVerdict | None] = {
        1: WindowVerdict(window=1, decision="drop", category="life"),
        2: WindowVerdict(window=2, decision="drop", category="life"),
    }
    kept, dropped, dropped_windows = _collapse_ranges([w1, w2], resolved)
    assert kept == []
    assert dropped == [DroppedRange(range=(1, 2), category="life")]
    assert dropped_windows == 2


def test_collapse_keeps_when_verdict_missing() -> None:
    w1 = Window(index=1, turns=[(1, "A", "x")])
    kept, dropped, dropped_windows = _collapse_ranges([w1], {})
    assert kept == [(1, 1)]
    assert dropped == []
    assert dropped_windows == 0


def test_collapse_keeps_on_conflicting_duplicate_resolved_to_none() -> None:
    w1 = Window(index=1, turns=[(1, "A", "x")])
    kept, dropped, dropped_windows = _collapse_ranges([w1], {1: None})
    assert kept == [(1, 1)]
    assert dropped == []
    assert dropped_windows == 0


def test_collapse_skips_windows_with_no_turns() -> None:
    empty = Window(index=1, turns=[])
    real = Window(index=2, turns=[(5, "A", "x")])
    kept, dropped, dropped_windows = _collapse_ranges(
        [empty, real], {2: WindowVerdict(window=2, decision="keep", category="content")}
    )
    assert kept == [(5, 5)]
    assert dropped_windows == 0


# ── apply_kept_ranges ────────────────────────────────────────────────────────────


def test_apply_kept_ranges_inclusive_boundaries() -> None:
    turns = [(i, "A", f"t{i}") for i in range(1, 11)]
    kept = apply_kept_ranges(turns, [(3, 5), (8, 8)])
    assert [t[0] for t in kept] == [3, 4, 5, 8]


def test_apply_kept_ranges_empty_ranges_drops_everything() -> None:
    turns = [(1, "A", "x"), (2, "A", "y")]
    assert apply_kept_ranges(turns, []) == []


def test_apply_kept_ranges_is_the_single_assembly_seam() -> None:
    # Both a Stage-2 style and a hypothetical Stage-3 style call use the same helper —
    # prove it's pure and order-preserving over the original turn list.
    turns = [(1, "A", "a"), (5, "B", "b"), (6, "A", "c"), (9, "B", "d")]
    assert apply_kept_ranges(turns, [(1, 1), (5, 6)]) == [turns[0], turns[1], turns[2]]


# ── sanity floor ─────────────────────────────────────────────────────────────────


def test_degenerate_transcript_raises_below_floor() -> None:
    # ~400 turns of near-content-free "you" noise; the fake client drops everything.
    turns = _turns(400, text="you", speaker="Archie")

    def decide(_idx: int) -> Decide:
        return ("drop", "asr_noise")

    client = FakeClient(decide=decide)
    with pytest.raises(DegenerateTranscriptError, match="degenerate ASR"):
        clean_session(client, "sid", turns)


def test_healthy_transcript_passes_the_floor() -> None:
    turns = _turns(400)  # everything kept by default (keep-when-in-doubt / all-keep)
    client = FakeClient()
    digest = clean_session(client, "sid", turns)
    assert digest.stats.kept_lines == 400
    assert digest.stats.lines == 400


def test_floor_boundary_exactly_at_floor_passes() -> None:
    turns = _turns(KEPT_LINES_FLOOR)
    client = FakeClient()
    digest = clean_session(client, "sid", turns)
    assert digest.stats.kept_lines == KEPT_LINES_FLOOR


def test_floor_boundary_one_under_floor_raises() -> None:
    turns = _turns(KEPT_LINES_FLOOR - 1)
    client = FakeClient()
    with pytest.raises(DegenerateTranscriptError):
        clean_session(client, "sid", turns)


# ── enrich parse ─────────────────────────────────────────────────────────────────


def test_parse_enrichment_happy_path() -> None:
    synopsis, wiki_refs = _parse_enrichment(
        {"synopsis": "A tale.", "wikiRefs": ["Wrenford", "The Iridescent Host"]}
    )
    assert synopsis == "A tale."
    assert wiki_refs == ["Wrenford", "The Iridescent Host"]


def test_parse_enrichment_wiki_refs_defaults_to_empty() -> None:
    synopsis, wiki_refs = _parse_enrichment({"synopsis": "A tale."})
    assert wiki_refs == []


def test_parse_enrichment_rejects_missing_synopsis() -> None:
    with pytest.raises(EnrichParseError):
        _parse_enrichment({"wikiRefs": []})


def test_parse_enrichment_rejects_empty_synopsis() -> None:
    with pytest.raises(EnrichParseError):
        _parse_enrichment({"synopsis": "   "})


def test_parse_enrichment_rejects_non_string_wiki_ref() -> None:
    with pytest.raises(EnrichParseError):
        _parse_enrichment({"synopsis": "A tale.", "wikiRefs": ["ok", 5]})


def test_parse_enrichment_rejects_non_object() -> None:
    with pytest.raises(EnrichParseError):
        _parse_enrichment("nope")


def test_enrich_session_uses_call_tool_on_the_cleaned_transcript() -> None:
    turns = [(1, "Archie", "hello there"), (2, "Maeve", "hi")]
    client = FakeClient(synopsis="They met.", wiki_refs=["Archie"])
    synopsis, wiki_refs = enrich_session(client, turns)
    assert client.calls == [CLEAN_ENRICH_TOOL_NAME]
    assert synopsis == "They met."
    assert wiki_refs == ["Archie"]


def test_enrich_session_malformed_output_raises() -> None:
    client = FakeClient(enrich_raw={"synopsis": 5})
    with pytest.raises(EnrichParseError):
        enrich_session(client, [(1, "A", "x")])


# ── clean_session end to end ───────────────────────────────────────────────────────


def test_clean_session_end_to_end_mixed_verdicts() -> None:
    # 20 windows of 20 (400 turns, comfortably above the floor): window 2 dropped
    # (life), every other window kept -> windows 3-20 merge into one trailing range.
    turns = _turns(400)

    def decide(idx: int) -> Decide:
        return ("drop", "life") if idx == 2 else ("keep", "content")

    client = FakeClient(decide=decide, synopsis="A session happened.", wiki_refs=["Wrenford"])
    digest = clean_session(client, "sid.2026-1-1", turns)

    assert digest.session_id == "sid.2026-1-1"
    assert digest.synopsis == "A session happened."
    assert digest.wiki_refs == ["Wrenford"]
    assert digest.stats.lines == 400
    assert digest.stats.windows == 20
    assert digest.stats.dropped_windows == 1
    assert digest.stats.kept_lines == 380  # everything except window 2's 20 turns
    assert digest.kept_ranges == [(1, 20), (41, 400)]
    assert digest.dropped == [DroppedRange(range=(21, 40), category="life")]
    # filter ran once per batch (all 20 windows fit under the word budget -> one call),
    # enrich ran once, in that order.
    assert client.calls == [CLEAN_FILTER_TOOL_NAME, CLEAN_ENRICH_TOOL_NAME]


def test_clean_session_all_kept_single_range() -> None:
    turns = _turns(200)
    client = FakeClient()
    digest = clean_session(client, "sid", turns)
    assert digest.kept_ranges == [(1, 200)]
    assert digest.dropped == []
    assert digest.stats.kept_lines == 200


def test_window_verdict_rejects_bad_category() -> None:
    with pytest.raises(ValidationError):
        WindowVerdict.model_validate(
            {"window": 1, "decision": "keep", "category": "not-a-category"}
        )


# ── Stage-3 re-read drift guard (§4.3) ──────────────────────────────────────────────


def _digest_with_lines(n: int) -> SessionDigest:
    return SessionDigest(
        session_id="sid",
        synopsis="syn",
        kept_ranges=[(1, n)],
        stats=DigestStats(lines=n, kept_lines=n, windows=1, dropped_windows=0),
    )


def test_assert_no_drift_passes_when_line_count_matches() -> None:
    assert_no_drift(_turns(10), _digest_with_lines(10))  # no raise


def test_assert_no_drift_raises_on_line_count_mismatch() -> None:
    # The transcript grew by one line since Stage 2 ran (e.g. a FROM_FAILURE
    # re-execution regenerated it) — kept_ranges would now be stale.
    with pytest.raises(TranscriptDriftError, match="sid"):
        assert_no_drift(_turns(11), _digest_with_lines(10))
