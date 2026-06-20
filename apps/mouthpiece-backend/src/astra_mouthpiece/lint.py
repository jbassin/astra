""" "Tavern-ness" linter — ported VERBATIM from caster `script/lint.ts` (M9, the
golden A/B gate). Mechanical metrics over a Script quantifying how much it reads
like friends at a tavern table vs. a polished podcast: R1-R4 + R6 (max 10). R5
(room/sensory) retired; R7-R9 are human/LLM-judgment, out of scope here.

Thresholds are PROVISIONAL (set against fixtures, not real episodes). Recalibrate
against the committed faerrin `out/*.script.json` reference outputs before treating
the subtotal as a release blocker — see `tests/test_lint_calibration.py`.
"""

from __future__ import annotations

import math
import re
from typing import Literal

from pydantic import BaseModel

from .models import Script, ScriptTurn, SpeakerId

SPEAKERS: tuple[SpeakerId, ...] = ("A", "B", "C")

_TAG_RE = re.compile(r"\[[^\]]*\]")
_NON_WORD_RE = re.compile(r"[^a-z0-9'\s-]")
_WS_RE = re.compile(r"\s+")


def strip_tags(text: str) -> str:
    """Remove inline ElevenLabs ``[audio tags]`` so they don't count as spoken words."""
    return _TAG_RE.sub(" ", text)


def words(text: str) -> list[str]:
    """Strip inline [audio tags] and tokenize a line into lowercased word tokens."""
    lowered = _NON_WORD_RE.sub(" ", strip_tags(text).lower())
    return [w for w in _WS_RE.split(lowered) if len(w) > 0 and w != "-"]


# --- metric inputs ----------------------------------------------------------

#: Lines that announce the show's structure out loud — the meta-recap tell.
_META_RECAP_PATTERNS: tuple[re.Pattern[str], ...] = tuple(
    re.compile(p)
    for p in (
        r"\bmoving on\b",
        r"\bmoving along\b",
        r"\bnext up\b",
        r"\bnext,",
        r"\blet's get into\b",
        r"\blet's dive\b",
        r"\blet's talk about\b",
        r"\bgetting into\b",
        r"\bbefore we wrap\b",
        r"\bwrap (it|things) up\b",
        r"\bthat's (all|it) for\b",
        r"\bto kick (us|things) off\b",
        r"\bwelcome (back|to the show)\b",
        r"\bin this episode\b",
        r"\bfirst up\b",
        r"\bfirst,",
        r"\bsecond,",
        r"\bthird,",
        r"\bfinally,",
    )
)

_TRAIL_DASH_RE = re.compile(r"[—–-]\s*$")
_TRAIL_ELLIPSIS_RE = re.compile(r"(\.\.\.|…)\s*$")
_ANY_ELLIPSIS_RE = re.compile(r"(\.\.\.|…)")
_MIDLINE_DASH_RE = re.compile(r"[—–]")
_TERMINAL_RE = re.compile(r"[.!?]['\"]?\s*$")

_DISFLUENT_PATTERNS: tuple[re.Pattern[str], ...] = tuple(
    re.compile(p)
    for p in (
        r"\bwait[,—–\s]",
        r"\bno[,—–-]\s",
        r"[—–-]\s*no\b",
        r"\bi mean\b",
        r"\bscratch that\b",
        r"\bor[—–-]",
        r"\bhang on\b",
    )
)


def is_disfluent_turn(text: str) -> bool:
    """Per-turn disfluency / repair signals (interruptions, restarts, trailing off)."""
    t = strip_tags(text).strip()
    if _TRAIL_DASH_RE.search(t):
        return True
    if _TRAIL_ELLIPSIS_RE.search(t):
        return True
    lower = t.lower()
    return any(p.search(lower) for p in _DISFLUENT_PATTERNS)


def is_clean_line(text: str) -> bool:
    """A "clean" line: a complete, punchy, uninterrupted sentence (the quip tell)."""
    t = strip_tags(text).strip()
    if len(t) == 0:
        return False
    if _TRAIL_DASH_RE.search(t) or _ANY_ELLIPSIS_RE.search(t):
        return False
    if _MIDLINE_DASH_RE.search(t):
        return False
    if not _TERMINAL_RE.search(t):
        return False
    return len(words(t)) >= 3


# --- metrics ----------------------------------------------------------------


class LintMetrics(BaseModel):
    turns: int
    #: Mean pairwise Jaccard distance of speakers' top content words (0-1, higher = distinct).
    vocab_spread: float
    #: Stdev of words-per-turn across the whole script (higher = more uneven energy).
    turn_length_stdev: float
    #: Spread (max-min) of the three speakers' mean words-per-turn.
    per_speaker_mean_spread: float
    #: Fraction of turns that announce the show's structure (lower = better).
    meta_recap_ratio: float
    #: Fraction of turns carrying a disfluency/repair signal (higher = better, to a point).
    disfluency_ratio: float
    #: Fraction of turns that are clean complete sentences (lower = better).
    clean_line_ratio: float
    #: Diagnostics (not scored): how evenly the floor is shared.
    floor_gini_turns: float
    floor_gini_words: float


_STOPWORDS: frozenset[str] = frozenset(
    {
        "the",
        "a",
        "an",
        "and",
        "or",
        "but",
        "of",
        "to",
        "in",
        "on",
        "at",
        "is",
        "it",
        "i",
        "you",
        "he",
        "she",
        "they",
        "we",
        "that",
        "this",
        "was",
        "were",
        "be",
        "for",
        "with",
        "as",
        "so",
        "not",
        "no",
        "do",
        "did",
        "have",
        "has",
        "had",
        "what",
        "just",
        "like",
        "all",
        "out",
        "up",
        "if",
        "then",
        "there",
        "they're",
        "i'm",
        "it's",
        "that's",
        "don't",
    }
)


def _top_content_words(turns: list[ScriptTurn], n: int) -> set[str]:
    freq: dict[str, int] = {}
    for t in turns:
        for w in words(t.text):
            if w in _STOPWORDS or len(w) < 3:
                continue
            freq[w] = freq.get(w, 0) + 1
    ranked = sorted(freq.items(), key=lambda kv: kv[1], reverse=True)
    return {w for w, _ in ranked[:n]}


def _jaccard_distance(a: set[str], b: set[str]) -> float:
    if len(a) == 0 and len(b) == 0:
        return 0.0
    inter = len(a & b)
    union = len(a) + len(b) - inter
    return 0.0 if union == 0 else 1 - inter / union


def _stdev(xs: list[float]) -> float:
    if len(xs) == 0:
        return 0.0
    mean = sum(xs) / len(xs)
    variance = sum((x - mean) ** 2 for x in xs) / len(xs)
    return math.sqrt(variance)


def _gini(xs: list[float]) -> float:
    """Gini coefficient of a non-negative distribution (0 = perfectly even)."""
    total = sum(xs)
    if total == 0 or len(xs) == 0:
        return 0.0
    sorted_xs = sorted(xs)
    cum = 0.0
    for i, x in enumerate(sorted_xs):
        cum += (i + 1) * x
    n = len(sorted_xs)
    return (2 * cum) / (n * total) - (n + 1) / n


def compute_metrics(script: Script) -> LintMetrics:
    turns = script.turns
    word_counts = [float(len(words(t.text))) for t in turns]

    per_speaker_turns: list[list[ScriptTurn]] = [
        [t for t in turns if t.speaker == s] for s in SPEAKERS
    ]
    per_speaker_means = [
        (sum(len(words(t.text)) for t in ts) / len(ts)) if ts else 0.0 for ts in per_speaker_turns
    ]
    means_present = [m for m, ts in zip(per_speaker_means, per_speaker_turns, strict=True) if ts]
    per_speaker_mean_spread = (
        max(means_present) - min(means_present) if len(means_present) > 1 else 0.0
    )

    # R1: vocabulary distinctness — pairwise Jaccard distance of top words.
    vocab_sets = [_top_content_words(ts, 15) for ts in per_speaker_turns]
    pairs = [(0, 1), (0, 2), (1, 2)]
    dists = [
        _jaccard_distance(vocab_sets[i], vocab_sets[j])
        for i, j in pairs
        if len(vocab_sets[i]) > 0 and len(vocab_sets[j]) > 0
    ]
    vocab_spread = sum(dists) / len(dists) if dists else 0.0

    meta_recap = sum(
        1 for t in turns if any(p.search(strip_tags(t.text).lower()) for p in _META_RECAP_PATTERNS)
    )
    disfluent = sum(1 for t in turns if is_disfluent_turn(t.text))
    clean_lines = sum(1 for t in turns if is_clean_line(t.text))

    n = len(turns) or 1
    return LintMetrics(
        turns=len(turns),
        vocab_spread=vocab_spread,
        turn_length_stdev=_stdev(word_counts),
        per_speaker_mean_spread=per_speaker_mean_spread,
        meta_recap_ratio=meta_recap / n,
        disfluency_ratio=disfluent / n,
        clean_line_ratio=clean_lines / n,
        floor_gini_turns=_gini([float(len(ts)) for ts in per_speaker_turns]),
        floor_gini_words=_gini(
            [float(sum(len(words(t.text)) for t in ts)) for ts in per_speaker_turns]
        ),
    )


# --- scoring ----------------------------------------------------------------

Direction = Literal["high", "low"]


class Threshold(BaseModel):
    id: str
    label: str
    metric: str
    dir: Direction
    two: float
    one: float


#: PROVISIONAL, calibration-pending. Re-tune against real linted episodes.
THRESHOLDS: tuple[Threshold, ...] = (
    Threshold(
        id="R1",
        label="per-speaker vocabulary spread",
        metric="vocab_spread",
        dir="high",
        two=0.75,
        one=0.55,
    ),
    Threshold(
        id="R2", label="turn-length variance", metric="turn_length_stdev", dir="high", two=6, one=3
    ),
    Threshold(
        id="R3",
        label="meta-recap-line ratio",
        metric="meta_recap_ratio",
        dir="low",
        two=0.02,
        one=0.08,
    ),
    Threshold(
        id="R4",
        label="disfluency / repair rate",
        metric="disfluency_ratio",
        dir="high",
        two=0.25,
        one=0.12,
    ),
    # R5 (room/sensory) retired — preserves R1-R9 numbering (R6 keeps its id).
    Threshold(
        id="R6",
        label="quip density (clean-line ratio)",
        metric="clean_line_ratio",
        dir="low",
        two=0.45,
        one=0.65,
    ),
)


def _score_one(value: float, t: Threshold) -> int:
    if t.dir == "high":
        return 2 if value >= t.two else 1 if value >= t.one else 0
    return 2 if value <= t.two else 1 if value <= t.one else 0


class CriterionScore(BaseModel):
    id: str
    label: str
    value: float
    score: int


class LintReport(BaseModel):
    metrics: LintMetrics
    criteria: list[CriterionScore]
    #: Sum of the mechanical criteria (R1-R4 and R6; max = len(THRESHOLDS) * 2).
    mechanical_subtotal: int
    #: Mechanical criteria scored 0 — a single one means a podcast tell survived.
    zeros: list[str]


def score_script(script: Script) -> LintReport:
    metrics = compute_metrics(script)
    criteria = [
        CriterionScore(
            id=t.id,
            label=t.label,
            value=getattr(metrics, t.metric),
            score=_score_one(getattr(metrics, t.metric), t),
        )
        for t in THRESHOLDS
    ]
    return LintReport(
        metrics=metrics,
        criteria=criteria,
        mechanical_subtotal=sum(c.score for c in criteria),
        zeros=[c.id for c in criteria if c.score == 0],
    )


def format_report(report: LintReport) -> str:
    """Human-readable report for the CLI / calibration note."""
    max_score = len(THRESHOLDS) * 2
    lines = ["Tavern-ness (mechanical rubric R1-R4, R6; PROVISIONAL thresholds)"]
    for c in report.criteria:
        bar = "●" * c.score + "○" * (2 - c.score)
        val = str(int(c.value)) if float(c.value).is_integer() else f"{c.value:.2f}"
        lines.append(f"  {bar} {c.id} {c.label}: {val}")
    lines.append(f"  mechanical subtotal: {report.mechanical_subtotal}/{max_score}")
    lines.append(
        f"  ⚠ criteria at 0 (podcast tell survived): {', '.join(report.zeros)}"
        if report.zeros
        else "  ✓ no mechanical criterion at 0"
    )
    lines.append("  (R7-R9 are human-judgment criteria; add them for the full /18 gate of >=13)")
    return "\n".join(lines)
