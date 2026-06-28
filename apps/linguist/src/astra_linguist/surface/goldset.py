"""Gold-set builder + negative miner for the dspy judge optimizer (NLSpec 0006 gate J).

Three example sources feed the optimizer:

- **confirms** — from `defs.yaml`: every `(garble → canonical)` pair becomes a confirm
  example in a minimal synthetic window. The high-signal majority.
- **mined confirms / rejects** — running the Phase-1 filter (`find_known`) over the 76
  committed transcripts, **confidence-gated**: `confirm` where the span folds to a known
  `defs.yaml` garble, `reject` where it is purely ordinary English; everything ambiguous
  is `skip`ped (not guessed). Output is **deduped to one record per span-fold** and
  written to a reviewable JSON artifact, triaged with `review_tui` and hand-corrected
  offline (K2); a re-mine carries those decisions forward (`prior`). A confirm-only gold
  set teaches "confirm everything", so the negatives are load-bearing.
- **synthetic new** — invented proper nouns far from every canonical (`find_known` can't
  surface real `new`s); plus any `new` a human assigns in review.

Every example is normalized to a **single line at index 0** (synthetic sentence for
`defs` confirms, the real line for mined ones), so windows stay small + uniform and the
post-guardrail metric is simple. The metric (`make_metric`) runs `apply_guardrails`
first — the guardrails are fixed safety, never learned (J3).
"""

from __future__ import annotations

import json
import random
import re
from collections import Counter
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, cast

import dspy
from astra_lexicon import DEFS_PATH, Lexicon, build_lexicon, fold_for_match, load_defs, tokenize

from ..models import FormattedLine, Speaker, Transcript
from . import config
from .english import is_oov
from .judge import Candidate, Flagged, Verdict, apply_guardrails, lexicon_block, render_window
from .known import find_known

#: Committed reviewable artifact of mined negatives (K5 — hand-correctable offline).
DEFAULT_MINED_PATH = Path(__file__).resolve().parent / "gold" / "mined_negatives.json"
#: The 76 committed historical transcripts the miner reads.
DEFAULT_DATA_DIR = Path(__file__).resolve().parents[1].parent.parent / "data"

#: Regex metacharacters — a `defs.yaml` fragment containing any is a pattern, not a
#: literal garble, so it can't be embedded verbatim in a synthetic window (J5).
_REGEX_META = re.compile(r"[\\^$.|?*+()\[\]{}]")
#: A flag is labeled `new` only if its nearest canonical is farther than this — but
#: `find_known` floors at 0.78, so it never yields clean `new`; see `mine_negatives`.
_NEW_FAR_CEIL = 0.7


def _normalize_ws(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip().lower()


def is_literal_fragment(fragment: str) -> bool:
    """True if a `defs.kdl` mistranscription fragment is a plain literal (no regex)."""
    return bool(fragment) and not _REGEX_META.search(fragment)


def _one_line_transcript(text: str, speaker: str = "Player") -> Transcript:
    """A 1-line transcript carrying `text` at index 0 (the example's only line)."""
    line = FormattedLine(
        start="00:00:00",
        second=0.0,
        text=text,
        user=Speaker(name=speaker, color="--x"),
        duration=1.0,
    )
    return Transcript(date="gold", audio="gold", script=[line])


def _example(
    lex_block: str,
    line_text: str,
    speaker: str,
    span: str,
    verdict: Verdict,
    canonical: str | None,
) -> dspy.Example:
    """Build one normalized single-line dspy.Example with its focal gold candidate."""
    transcript = _one_line_transcript(line_text, speaker)
    window = render_window(transcript, 0, 1, [Flagged(line_ref=0, span=span)])
    gold = Candidate(
        line_ref=0,
        span=span,
        verdict=verdict,
        suggested_canonical=canonical,
        confidence=1.0,
        reason=f"gold {verdict}",
    )
    return dspy.Example(
        lexicon=lex_block,
        window=window,
        candidates=[gold],
        line_text=line_text,  # plain str — JSON-safe for demo serialization
    ).with_inputs("lexicon", "window")


def build_confirms(lex: Lexicon, defs: dict[str, list[str]]) -> list[dspy.Example]:
    """One confirm example per literal `(garble → canonical)` pair in `defs.yaml`."""
    lex_block = lexicon_block(lex)
    canon = {e.canonical for e in lex.entries}
    out: list[dspy.Example] = []
    for canonical, fragments in defs.items():
        if canonical not in canon:
            continue  # canonical not in the lexicon → can't be a guardrail-valid confirm
        for fragment in fragments or []:
            if not is_literal_fragment(fragment) or fold_for_match(fragment) == fold_for_match(
                canonical
            ):
                continue
            out.append(
                _example(
                    lex_block, f"Then {fragment} arrived.", "Player", fragment, "confirm", canonical
                )
            )
    return out


@dataclass
class MinedRecord:
    """One auto-labeled flag from the corpus, for the reviewable artifact (K2).

    `auto_label` is **confidence-gated** (not the old recurrence heuristic):
    - `confirm` — the span folds to a known `defs.yaml` garble (high signal);
    - `reject`  — a multi-word span of *only* ordinary English words (a filter false
      positive the judge should dismiss);
    - `skip`    — everything else: single-token near-misses (could be confirm *or* new —
      exactly the judgment the LLM is for) and already-correct possessives/plurals. Kept
      in the artifact (with `reason`) for review but **not** turned into a gold example.

    `find_known` only surfaces spans phonetically *near* a canonical (≥0.78), so it
    structurally cannot yield clean `new` (far-from-lexicon) examples — those are
    synthesized instead (`synthetic_new_examples`).
    """

    date: str
    line_ref: int
    span: str
    speaker: str
    line_text: str
    auto_label: str  # confirm | reject | skip
    canonical: str | None  # set when auto_label == confirm
    top_canonical: str
    top_score: float
    recurrence: int  # how many sessions the span appears in (informational)
    reason: str = ""  # why this label (esp. for skip)


def _load_transcript(path: Path) -> Transcript:
    return Transcript.model_validate(json.loads(path.read_text(encoding="utf-8")))


def _is_ordinary_english(span: str) -> bool:
    """True if every significant token in a multi-word span is common English (not OOV)."""
    toks = [t for t in tokenize(span) if len(t.fold) >= config.MIN_TOKEN_LEN]
    return len(toks) >= 2 and all(not is_oov(t.fold) for t in toks)


def _already_correct(fold: str, lex: Lexicon) -> bool:
    """True if the span is an existing canonical or its possessive/plural ('Church's')."""
    variants = {fold}
    for suffix in ("'s", "’s", "s", "'", "’"):
        if fold.endswith(suffix):
            variants.add(fold[: -len(suffix)])
    return any(lex.has(v) for v in variants)


#: Tie-break order when collapsing copies with disagreeing hand-labels — conservative
#: first. `confirm` is **last**, so any tie involving it resolves *away* from confirm: an
#: inconsistent human confirm/reject (or confirm/new) tie should not ship a shaky mapping
#: (a wrong `confirm` teaches a bad correction; a wrong `reject`/`new` only over-cautions).
_LABEL_PRIORITY = ("reject", "skip", "new", "confirm")


def _resolve_label(labels: list[str]) -> str:
    """Majority label among copies; ties broken by `_LABEL_PRIORITY` (conservative)."""
    counts = Counter(labels)
    top = max(counts.values())
    tied = [label for label, n in counts.items() if n == top]
    for pref in _LABEL_PRIORITY:
        if pref in tied:
            return pref
    return tied[0]


def dedupe_records(records: list[MinedRecord]) -> list[MinedRecord]:
    """Collapse to one record per span-fold, preserving hand-reviewed decisions.

    A span flagged in many lines becomes a single record (the occurrence with the most
    context), with `recurrence` = distinct sessions. When copies carry hand-reviewed
    labels they win over auto-labels; disagreements resolve by `_resolve_label`.
    """
    groups: dict[str, list[MinedRecord]] = {}
    for r in records:
        groups.setdefault(fold_for_match(r.span), []).append(r)

    out: list[MinedRecord] = []
    for group in groups.values():
        rep = max(group, key=lambda r: len(r.line_text))  # the richest context wins
        hand = [r for r in group if r.reason.startswith("hand-reviewed")]
        if hand:
            label = _resolve_label([r.auto_label for r in hand])
            reason = f"hand-reviewed: {label}"
        else:
            label, reason = rep.auto_label, rep.reason
        canonical = rep.top_canonical if label == "confirm" else None
        out.append(
            MinedRecord(
                date=rep.date,
                line_ref=rep.line_ref,
                span=rep.span,
                speaker=rep.speaker,
                line_text=rep.line_text,
                auto_label=label,
                canonical=canonical,
                top_canonical=rep.top_canonical,
                top_score=rep.top_score,
                recurrence=len({r.date for r in group}),
                reason=reason,
            )
        )
    return sorted(out, key=lambda r: (r.date, r.line_ref, _normalize_ws(r.span)))


def _carry_hand_labels(fresh: list[MinedRecord], prior: list[MinedRecord]) -> list[MinedRecord]:
    """Override fresh auto-labels with any hand-reviewed decision for the same span-fold."""
    decided = {fold_for_match(r.span): r for r in prior if r.reason.startswith("hand-reviewed")}
    for r in fresh:
        kept = decided.get(fold_for_match(r.span))
        if kept is not None:
            r.auto_label = kept.auto_label
            r.canonical = kept.canonical
            r.reason = kept.reason
    return fresh


def propose_new_entities(
    lex: Lexicon,
    data_dir: Path | str = DEFAULT_DATA_DIR,
    *,
    min_sessions: int = 2,
    far_ceil: float = 0.6,
    min_len: int = 4,
    limit: int = 150,
) -> list[MinedRecord]:
    """Propose real `new`-entity candidates the negative miner can't reach.

    Scans the corpus for capitalized OOV tokens that are **not** in the lexicon, **far**
    from every canonical (nearest < `far_ceil`, so not a garble), and recur across
    ≥`min_sessions` sessions (a real campaign entity, not a one-off ASR artifact). Speaker
    names are excluded. Emitted as `auto_label="proposed"` (carries no gold weight until a
    human confirms it via `review_tui --label proposed`), richest-context occurrence kept,
    most-frequent first.
    """
    paths = sorted(Path(data_dir).glob("*.json"))
    transcripts = [(p.stem, _load_transcript(p)) for p in paths]
    speakers = {fold_for_match(line.user.name) for _, t in transcripts for line in t.script}

    agg: dict[str, dict[str, Any]] = {}
    for date, t in transcripts:
        for line_ref, line in enumerate(t.script):
            for tok in tokenize(line.text):
                fold = tok.fold
                if len(fold) < min_len or not tok.span[:1].isupper():
                    continue
                if fold in speakers or lex.has(fold) or lex.is_token(fold) or not is_oov(fold):
                    continue
                a = agg.setdefault(fold, {"sessions": set(), "rep": None})
                a["sessions"].add(date)
                rep = a["rep"]
                if rep is None or len(line.text) > len(rep[4]):
                    a["rep"] = (date, line_ref, tok.span, line.user.name, line.text)

    out: list[MinedRecord] = []
    for fold, a in agg.items():
        if len(a["sessions"]) < min_sessions:
            continue
        nearest = lex.nearest(fold, 1, 0.0)
        score = nearest[0].score if nearest else 0.0
        if score >= far_ceil:
            continue  # near a canonical → a garble candidate, not a new entity
        date, line_ref, span, speaker, line_text = a["rep"]
        out.append(
            MinedRecord(
                date=date,
                line_ref=line_ref,
                span=span,
                speaker=speaker,
                line_text=line_text,
                auto_label="proposed",
                canonical=None,
                top_canonical=nearest[0].canonical if nearest else "",
                top_score=round(score, 4),
                recurrence=len(a["sessions"]),
                reason="proposed new entity (recurring OOV, far from lexicon)",
            )
        )
    out.sort(key=lambda r: (-r.recurrence, r.span.lower()))
    return out[:limit]


def mine_negatives(
    lex: Lexicon,
    defs: dict[str, list[str]],
    data_dir: Path | str = DEFAULT_DATA_DIR,
    *,
    prior: list[MinedRecord] | None = None,
) -> list[MinedRecord]:
    """Run `find_known` over every session; **confidence-gated** auto-label (K2).

    Only emits a usable label when it can be confident: `confirm` for known `defs.yaml`
    garbles, `reject` for purely-ordinary-English multi-word false positives. Ambiguous
    single-token near-misses and already-correct possessives are `skip`ped (left for the
    judge / human review), so the gold set is never polluted by guessed labels. Output is
    **deduped to one record per span-fold**; pass `prior` (a previously hand-curated
    artifact) to carry forward human decisions so a re-mine never clobbers review work.
    """
    # Reverse map: folded known garble → canonical (the high-signal confirm labels).
    garble_to_canon: dict[str, str] = {}
    for canonical, fragments in defs.items():
        for fragment in fragments or []:
            if is_literal_fragment(fragment):
                garble_to_canon.setdefault(fold_for_match(fragment), canonical)

    paths = sorted(Path(data_dir).glob("*.json"))
    flags: list[tuple[str, Any]] = []  # (date, KnownCandidate)
    span_sessions: dict[str, set[str]] = {}
    for path in paths:
        date = path.stem
        transcript = _load_transcript(path)
        for cand in find_known(transcript, lex):
            flags.append((date, cand))
            span_sessions.setdefault(fold_for_match(cand.span), set()).add(date)

    records: list[MinedRecord] = []
    for date, cand in flags:
        fold = fold_for_match(cand.span)
        top = cand.hypotheses[0]
        if fold in garble_to_canon:
            label, canonical, reason = "confirm", garble_to_canon[fold], "folds to a defs garble"
        elif _already_correct(fold, lex):
            label, canonical, reason = "skip", None, "already-correct canonical (possessive/plural)"
        elif _is_ordinary_english(cand.span):
            label, canonical, reason = "reject", None, "multi-word ordinary English"
        else:
            label, canonical, reason = "skip", None, "ambiguous single-token near-miss"
        records.append(
            MinedRecord(
                date=date,
                line_ref=cand.line_ref,
                span=cand.span,
                speaker=cand.speaker,
                line_text=cand.line_text,
                auto_label=label,
                canonical=canonical,
                top_canonical=top.canonical,
                top_score=round(top.score, 4),
                recurrence=len(span_sessions.get(fold, set())),
                reason=reason,
            )
        )
    deduped = dedupe_records(records)
    return _carry_hand_labels(deduped, prior) if prior else deduped


def write_mined_artifact(records: list[MinedRecord], path: Path | str = DEFAULT_MINED_PATH) -> None:
    """Write the reviewable mined-negatives artifact (sorted, stable for diffs)."""
    out = Path(path)
    out.parent.mkdir(parents=True, exist_ok=True)
    ordered = sorted(records, key=lambda r: (r.date, r.line_ref, _normalize_ws(r.span)))
    counts = Counter(r.auto_label for r in ordered)
    payload = {
        "_comment": "Confidence-gated corpus flags for the dspy judge gold set (gate J, K2). "
        "confirm=defs garble, reject=ordinary-English false positive, skip=ambiguous/"
        "already-correct (not used). Promote a skip to confirm (set canonical) or reject "
        "by hand, then recompile. `new` examples are synthesized, not mined.",
        "counts": dict(counts),
        "records": [asdict(r) for r in ordered],
    }
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def load_mined_artifact(path: Path | str = DEFAULT_MINED_PATH) -> list[MinedRecord]:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    return [MinedRecord(**r) for r in payload["records"]]


def examples_from_mined(records: list[MinedRecord], lex: Lexicon) -> list[dspy.Example]:
    """Turn the confidently-labeled mined records (confirm/reject) into examples.

    `skip` records carry no usable label and are ignored (real-line windows otherwise).
    """
    lex_block = lexicon_block(lex)
    canon = {e.canonical for e in lex.entries}
    out: list[dspy.Example] = []
    for r in records:
        # confirm/reject from the miner; `new` only arrives via human review (real-context
        # near-miss the reviewer judged a genuine new entity — a valuable hard example).
        if r.auto_label not in ("confirm", "reject", "new"):
            continue
        verdict = cast(Verdict, r.auto_label)
        canonical = r.canonical if verdict == "confirm" else None
        if verdict == "confirm" and canonical not in canon:
            continue
        out.append(_example(lex_block, r.line_text, r.speaker, r.span, verdict, canonical))
    return out


#: Invented proper nouns deliberately far from the lexicon — the `new` class find_known
#: can't surface (it only flags near-canonical spans). Filtered at build time to those
#: whose nearest canonical is < `_NEW_FAR_CEIL`, so every one is unambiguously new.
_SYNTHETIC_NEW_NAMES = (
    "Brannoch",
    "Vesperine",
    "Thorgildra",
    "Maelcourt",
    "Quennar",
    "Sythelby",
    "Drovanis",
    "Karneth",
    "Ilvenross",
    "Ogenheart",
    "Thanecross",
    "Estimund",
    "Halgrave",
    "Wexhollow",
    "Pell Yarrow",
    "Castle Drimm",
    "Voryn Kale",
    "Surville",
    "Marn Hollow",
    "Dwemerhold",
)


def synthetic_new_examples(lex: Lexicon) -> list[dspy.Example]:
    """`new`-verdict examples from invented names verified far from every canonical."""
    lex_block = lexicon_block(lex)
    out: list[dspy.Example] = []
    for name in _SYNTHETIC_NEW_NAMES:
        nearest = lex.nearest(fold_for_match(name), 1, 0.0)
        if nearest and nearest[0].score >= _NEW_FAR_CEIL:
            continue  # too close to a canonical to be unambiguously "new"
        out.append(
            _example(
                lex_block, f"We first heard of {name} last night.", "Player", name, "new", None
            )
        )
    return out


def build_goldset(
    lex: Lexicon | None = None,
    *,
    mined: list[MinedRecord] | None = None,
    data_dir: Path | str = DEFAULT_DATA_DIR,
    defs_path: Path | str = DEFS_PATH,
) -> list[dspy.Example]:
    """The full gold set: `defs.yaml` confirms + mined confirm/reject + synthetic `new`."""
    lex = lex or build_lexicon(defs_path)
    defs = load_defs(defs_path)
    if mined is None:
        mined = mine_negatives(lex, defs, data_dir)
    return build_confirms(lex, defs) + examples_from_mined(mined, lex) + synthetic_new_examples(lex)


def split_goldset(
    examples: list[dspy.Example], *, val_frac: float = 0.2, seed: int = 0
) -> tuple[list[dspy.Example], list[dspy.Example]]:
    """Deterministic shuffle + train/val split."""
    shuffled = list(examples)
    random.Random(seed).shuffle(shuffled)
    n_val = max(1, int(len(shuffled) * val_frac)) if shuffled else 0
    return shuffled[n_val:], shuffled[:n_val]


def _focal(cands: list[Candidate], line_ref: int, span_fold: str) -> Candidate | None:
    for c in cands:
        if c.line_ref == line_ref and _normalize_ws(c.span) == span_fold:
            return c
    return None


def make_metric(lex: Lexicon) -> Any:
    """A guardrails-first verdict metric (J3): runs `apply_guardrails`, scores the focal span.

    confirm → kept confirm with the exact canonical; new/reject → no surviving confirm
    (the safety-relevant signal: never false-confirm ordinary English / a near-miss).
    """

    def metric(example: dspy.Example, pred: Any, trace: Any = None) -> bool:
        try:
            pred_cands = [Candidate.model_validate(c) for c in pred.candidates]
        except Exception:
            return False
        transcript = _one_line_transcript(example.line_text)
        kept = apply_guardrails(pred_cands, transcript, lex)
        gold: Candidate = example.candidates[0]
        focal = _focal(kept, gold.line_ref, _normalize_ws(gold.span))
        if gold.verdict == "confirm":
            return (
                focal is not None
                and focal.verdict == "confirm"
                and focal.suggested_canonical == gold.suggested_canonical
            )
        # new / reject: correct iff no surviving confirm for the focal span.
        return focal is None or focal.verdict != "confirm"

    return metric
