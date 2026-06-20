"""Phase-2 LLM judge (port of `judge.ts`, gate H).

Takes Phase-1 candidate spans, windows the transcript, and asks Claude to classify
each span confirm/new/reject (mapping confirms to a lexicon canonical).
**Deterministic guardrails** then drop anything unsafe; borderline confirms are
re-judged by a stronger model (haiku→sonnet escalation). The guardrails + windowing
are pure (tested here); the LLM call is the injectable `CompleteFn` seam — the live
dspy run + optimizer are deferred (H1).
"""

from __future__ import annotations

import re
from collections.abc import Callable
from pathlib import Path
from typing import Literal, Protocol

from astra_observe import get_meter
from pydantic import BaseModel

from ..models import Transcript
from . import config
from .lexicon import Lexicon
from .normalize import fold_for_match

Verdict = Literal["confirm", "new", "reject"]

_judge_meter = get_meter("astra.linguist.judge")
_judge_calls = _judge_meter.create_counter("astra.judge.calls", description="judge LM calls")
_judge_cost = _judge_meter.create_counter(
    "astra.judge.cost_usd", unit="USD", description="judge spend"
)


class Candidate(BaseModel):
    line_ref: int
    span: str
    verdict: Verdict
    suggested_canonical: str | None = None
    confidence: float
    reason: str


class ScanResult(BaseModel):
    candidates: list[Candidate]


class Flagged(BaseModel):
    line_ref: int
    span: str


class CompleteArgs(BaseModel):
    stage: str
    model: str
    system: str
    cached: str
    user: str


class CompleteFn(Protocol):
    """Injectable LLM seam — tests pass a stub; production wraps a dspy module."""

    def __call__(self, args: CompleteArgs) -> ScanResult: ...


SYSTEM = "\n".join(
    [
        "You are a transcription-error auditor for a Pathfinder 2e fantasy campaign.",
        "ASR reliably mangles invented proper nouns (names, places, factions,",
        "items) into phonetically similar English words or wrong names.",
        "",
        "You are given a CANONICAL LEXICON of known correct terms and a transcript window",
        "with [lineRef] (speaker) prefixes, plus spans a phonetic filter pre-flagged. For",
        "each suspicious span decide:",
        "  confirm : a mistranscription of exactly one lexicon term.",
        "  new     : a plausible NEW proper noun not in the lexicon (correctly transcribed;",
        "            do NOT map it to a near-miss lexicon term).",
        "  reject  : an ordinary English word/phrase the filter caught by accident, or a",
        "            correctly-transcribed inflection of a lexicon term (see Rules).",
        "",
        "Rules:",
        "- Only confirm when sound AND context both fit. Prefer reject/new over a shaky confirm.",
        "- Inflected or derived forms of a lexicon term are NOT mistranscriptions: a plural",
        "  (Raelians), possessive (Calaria's), or demonym/adjective (Calarian, Oreskian) is",
        "  correctly transcribed as spoken — reject it; do NOT confirm it to the base canonical",
        "  (Raelion / Calaria) or strip it to the singular.",
        "- Out-of-fiction vocabulary is correctly transcribed, never a garble: real-world names",
        "  (people, software/apps, websites — Pathbuilder, ChatGPT, Foundry) and Pathfinder 2e",
        "  rules terms (skills, saves, conditions, actions, DCs — Arcana, Will save, Darkvision)",
        "  are reject, even when they sound like a lexicon term.",
        "- suggestedCanonical MUST be copied verbatim from the lexicon (exact casing/diacritics),",
        "  and is null unless verdict is confirm.",
        "- span MUST be copied verbatim from the line at lineRef. Multi-word spans are allowed.",
    ]
)


def lexicon_block(lex: Lexicon) -> str:
    """Sorted, deduped canonical list for the cached system block."""
    names = sorted({e.canonical for e in lex.entries})
    return f"CANONICAL LEXICON ({len(names)} terms):\n" + "\n".join(names)


def windows(
    line_count: int,
    flagged_lines: set[int],
    size: int,
    overlap: int,
    mode: Literal["hybrid", "full"],
) -> list[tuple[int, int]]:
    """Window ranges [start,end); hybrid keeps only windows containing a flagged line."""
    step = max(1, size - overlap)
    out: list[tuple[int, int]] = []
    start = 0
    while start < line_count:
        end = min(line_count, start + size)
        if mode == "full" or any(start <= line < end for line in flagged_lines):
            out.append((start, end))
        if end >= line_count:
            break
        start += step
    return out


def render_window(transcript: Transcript, start: int, end: int, flagged: list[Flagged]) -> str:
    in_window = [f for f in flagged if start <= f.line_ref < end]
    lines = [
        f"[{i}] ({transcript.script[i].user.name}) {transcript.script[i].text}"
        for i in range(start, end)
    ]
    flagged_list = ""
    if in_window:
        flagged_list = (
            "\n\nPre-flagged spans to judge (also report any others you spot):\n"
            + "\n".join(f'- [{f.line_ref}] "{f.span}"' for f in in_window)
        )
    return "TRANSCRIPT WINDOW:\n" + "\n".join(lines) + flagged_list


def _normalize_ws(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip().lower()


def apply_guardrails(
    cands: list[Candidate], transcript: Transcript, lex: Lexicon
) -> list[Candidate]:
    """Drop hallucinated canonicals, missing spans, no-op confirms; dedupe by (line, span)."""
    canonical = {e.canonical for e in lex.entries}
    seen: set[str] = set()
    out: list[Candidate] = []
    for c in cands:
        if not (0 <= c.line_ref < len(transcript.script)):
            continue
        if _normalize_ws(c.span) not in _normalize_ws(transcript.script[c.line_ref].text):
            continue
        if c.verdict == "confirm":
            if not c.suggested_canonical or c.suggested_canonical not in canonical:
                continue
            if fold_for_match(c.suggested_canonical) == fold_for_match(c.span):
                continue  # already correct
        key = f"{c.line_ref} {_normalize_ws(c.span)}"
        if key in seen:
            continue
        seen.add(key)
        out.append(c)
    return out


def _merge_escalated(base: list[Candidate], escalated: list[Candidate]) -> list[Candidate]:
    by_key = {f"{c.line_ref} {_normalize_ws(c.span)}": c for c in escalated}
    return [by_key.get(f"{c.line_ref} {_normalize_ws(c.span)}", c) for c in base]


def judge_session(
    transcript: Transcript,
    flagged: list[Flagged],
    lex: Lexicon,
    *,
    complete_fn: CompleteFn,
    mode: Literal["hybrid", "full"] = "hybrid",
    size: int = config.JUDGE_CHUNK_SIZE,
    overlap: int = config.JUDGE_OVERLAP,
    judge_model: str = config.JUDGE_MODEL,
    escalate_model: str = config.ESCALATE_MODEL,
) -> list[Candidate]:
    """Window → judge → guardrails → (borderline) escalate → dedupe."""
    cached = lexicon_block(lex)
    flagged_lines = {f.line_ref for f in flagged}

    collected: list[Candidate] = []
    for start, end in windows(len(transcript.script), flagged_lines, size, overlap, mode):
        user = render_window(transcript, start, end, flagged)
        result = complete_fn(
            CompleteArgs(stage="judge", model=judge_model, system=SYSTEM, cached=cached, user=user)
        )
        cands = apply_guardrails(result.candidates, transcript, lex)

        borderline = any(
            c.verdict == "confirm" and config.ESCALATE_LOW <= c.confidence <= config.ESCALATE_HIGH
            for c in cands
        )
        if borderline and escalate_model != judge_model:
            escalated = complete_fn(
                CompleteArgs(
                    stage="judge-escalate",
                    model=escalate_model,
                    system=SYSTEM,
                    cached=cached,
                    user=user,
                )
            )
            cands = _merge_escalated(cands, apply_guardrails(escalated.candidates, transcript, lex))
        collected.extend(cands)

    seen: set[str] = set()
    out: list[Candidate] = []
    for c in collected:
        key = f"{c.line_ref} {_normalize_ws(c.span)}"
        if key not in seen:
            seen.add(key)
            out.append(c)
    return out


#: How `make_dspy_complete_fn` builds a `dspy.LM` for a model id. Tests inject a factory
#: returning a `DummyLM` to stay hermetic; production uses `astra_llm.make_dspy_lm`.
LmFactory = Callable[[str], object]


def make_dspy_complete_fn(
    compiled_path: str | Path | None = None, *, lm_factory: LmFactory | None = None
) -> CompleteFn:
    """A production `CompleteFn` backed by the dspy judge program → litellm → Claude (J).

    Resolves the Anthropic key through `astra_config` (via `ensure_anthropic_env`), loads
    the committed compiled program if present (else runs uncompiled), and adapts each
    `CompleteArgs` to a `ScanResult`. The model varies per call (`judge` on haiku,
    `judge-escalate` on sonnet) so the LM is swapped per call via `dspy.context`; the
    same compiled program serves both (J4). `judge_session` is unchanged. Tests inject a
    `lm_factory` (a `DummyLM`) instead of touching the network — it never runs live in CI.
    """
    import dspy
    from astra_llm import ensure_anthropic_env, make_dspy_lm

    from .dspy_judge import DEFAULT_COMPILED_PATH, build_judge_program, load_compiled

    # Only resolve the real key on the production path; an injected stub factory (tests)
    # stays fully key-free + hermetic (no SOPS/astra_config side effect).
    if lm_factory is None:
        ensure_anthropic_env()
    make_lm: LmFactory = lm_factory or (
        lambda model: make_dspy_lm(model, max_tokens=config.JUDGE_MAX_TOKENS)
    )
    path = Path(compiled_path) if compiled_path is not None else DEFAULT_COMPILED_PATH
    program = load_compiled(path) if path.exists() else build_judge_program()

    lm_cache: dict[str, object] = {}

    def complete(args: CompleteArgs) -> ScanResult:
        lm = lm_cache.get(args.model)
        if lm is None:
            lm = make_lm(args.model)
            lm_cache[args.model] = lm
        with dspy.context(lm=lm):
            pred = program(lexicon=args.cached, window=args.user)
        history = getattr(lm, "history", None) or []
        cost = float(history[-1].get("cost") or 0.0) if history else 0.0
        _judge_calls.add(1, {"stage": args.stage, "model": args.model})
        _judge_cost.add(cost, {"stage": args.stage, "model": args.model})
        return ScanResult(candidates=[Candidate.model_validate(c) for c in pred.candidates])

    return complete
