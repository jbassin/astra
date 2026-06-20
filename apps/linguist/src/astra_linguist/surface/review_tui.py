"""Interactive terminal triage — two modes, one keypress per item.

**Gold-set curation** (gate J — the mined negatives):

    uv run python -m astra_linguist.surface.review_tui                 # triage the `skip` queue
    uv run python -m astra_linguist.surface.review_tui --label all     # review every record

**Surfacer candidates** (a live `{date}.candidates.json` from `surface.py`) — accept/reject
the judge's proposed corrections:

    uv run python -m astra_linguist.surface.review_tui --candidates data/2026-6-8.candidates.json

Renders one item at a time with its transcript context; a single keypress decides it, and the
file is written back so runs are resumable. The pure helpers (`apply_action`,
`apply_candidate_action`, `render_record`, `render_candidate`, `highlight_span`) are
unit-tested; the keypress loop is interactive-only (needs a TTY, never runs in CI).

Mined keys:      [c]onfirm→nearest  [r]eject  [n]ew  [s]kip  [k]eep/next  [b]ack  [q]save  [Q]quit
Candidate keys:  [a]ccept  [r]eject  [k]eep/next  [b]ack  [q]save  [Q]quit
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path
from typing import Any

from .goldset import DEFAULT_MINED_PATH, MinedRecord, load_mined_artifact, write_mined_artifact
from .surface import load_candidates, write_candidates

_ESC = "\033["
_RESET = f"{_ESC}0m"
_BOLD = f"{_ESC}1m"
_DIM = f"{_ESC}2m"
_REV = f"{_ESC}7m"
_CYAN = f"{_ESC}36m"
_YELLOW = f"{_ESC}33m"
_GREEN = f"{_ESC}32m"
_RED = f"{_ESC}31m"
_CLEAR = f"{_ESC}2J{_ESC}H"

#: Keypress → label. `confirm` adopts the nearest canonical; the rest carry no canonical.
_KEY_LABELS = {"c": "confirm", "r": "reject", "n": "new", "s": "skip"}
_LABEL_COLOR = {"confirm": _GREEN, "reject": _RED, "new": _YELLOW, "skip": _DIM}


def apply_action(rec: MinedRecord, key: str) -> bool:
    """Set `rec`'s label from a keypress (mutates in place). Returns False for non-action keys."""
    label = _KEY_LABELS.get(key.lower())
    if label is None:
        return False
    rec.auto_label = label
    rec.canonical = rec.top_canonical if label == "confirm" else None
    rec.reason = f"hand-reviewed: {label}"
    return True


def highlight_span(line_text: str, span: str, *, width: int = 100) -> str:
    """The transcript line with `span` reverse-highlighted, windowed around it if long."""
    idx = line_text.find(span)
    if idx < 0:
        return line_text[:width]
    start = max(0, idx - width // 2)
    end = min(len(line_text), idx + len(span) + width // 2)
    prefix = "…" if start > 0 else ""
    suffix = "…" if end < len(line_text) else ""
    before = line_text[start:idx]
    after = line_text[idx + len(span) : end]
    return f"{prefix}{before}{_REV}{span}{_RESET}{_DIM}{after}{suffix}{_RESET}"


def render_record(rec: MinedRecord, pos: int, total: int, *, width: int = 100) -> str:
    """A full-screen view of one record for the triage loop."""
    color = _LABEL_COLOR.get(rec.auto_label, "")
    header = (
        f"{_BOLD}[ {pos + 1} / {total} ]{_RESET}  {rec.date}  line {rec.line_ref}  "
        f"({rec.speaker})   label: {color}{rec.auto_label}{_RESET}"
    )
    body = [
        f"  {_BOLD}span{_RESET}:    {_CYAN}{rec.span!r}{_RESET}",
        f"  {_BOLD}nearest{_RESET}: {rec.top_canonical!r}  "
        f"{_DIM}(score {rec.top_score:.2f}, {rec.recurrence} session(s)){_RESET}",
        f"  {_BOLD}why{_RESET}:     {_DIM}{rec.reason}{_RESET}",
        "",
        f"  {_DIM}{highlight_span(rec.line_text, rec.span, width=width)}{_RESET}",
    ]
    keys = (
        f"  {_GREEN}[c]{_RESET}onfirm→{rec.top_canonical}   {_RED}[r]{_RESET}eject   "
        f"{_YELLOW}[n]{_RESET}ew   {_DIM}[s]kip{_RESET}   [k]eep/next   [b]ack   "
        f"[q]save+quit   [Q]quit"
    )
    return f"{_CLEAR}{header}\n\n" + "\n".join(body) + f"\n\n{keys}\n"


def _getch() -> str:
    """Read one raw keypress from the TTY (no Enter needed)."""
    import termios
    import tty

    fd = sys.stdin.fileno()
    old = termios.tcgetattr(fd)
    try:
        tty.setraw(fd)
        ch = sys.stdin.read(1)
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, old)
    return ch


def _summary(records: list[MinedRecord]) -> str:
    counts: dict[str, int] = {}
    for r in records:
        counts[r.auto_label] = counts.get(r.auto_label, 0) + 1
    return "  ".join(f"{k}={v}" for k, v in sorted(counts.items()))


def _triage_loop(queue: list[Any], render: Any, action: Any) -> bool:
    """Step through `queue`, one keypress per item. Returns True to save (`q`), False to
    discard (`Q`/Ctrl-C). `render(item, pos, total, width)`; `action(item, key) -> bool`."""
    width = max(40, shutil.get_terminal_size((100, 24)).columns - 8)
    pos = 0
    while 0 <= pos < len(queue):
        sys.stdout.write(render(queue[pos], pos, len(queue), width))
        sys.stdout.flush()
        key = _getch()
        if key in ("Q", "\x03"):  # Q or Ctrl-C → quit without saving
            print(f"\n{_YELLOW}Quit without saving.{_RESET}")
            return False
        if key == "q":
            return True
        if key == "b":
            pos = max(0, pos - 1)
            continue
        if key in ("k", " ", "\r", "\n"):
            pos += 1
            continue
        if action(queue[pos], key):
            pos += 1
    return True


def review(queue: list[MinedRecord], all_records: list[MinedRecord], *, path: Path) -> None:
    """Triage the mined `queue` (shared refs into `all_records`); `q` writes the artifact back."""
    if not queue:
        print("Nothing to review for that filter.")
        return
    if _triage_loop(queue, lambda r, p, t, w: render_record(r, p, t, width=w), apply_action):
        write_mined_artifact(all_records, path)
        print(f"\n{_GREEN}Saved {len(all_records)} records → {path}{_RESET}")
        print(f"  {_summary(all_records)}")


# ── surfacer-candidate review ───────────────────────────────────────────────
#: Keypress → decision on a judge-proposed correction.
_CAND_DECISIONS = {"a": "accept", "r": "reject"}
_DECISION_COLOR = {"accept": _GREEN, "reject": _RED, "pending": _DIM}


def apply_candidate_action(row: dict[str, Any], key: str) -> bool:
    """Accept/reject a surfacer candidate (mutates `row['decision']`). False for other keys."""
    decision = _CAND_DECISIONS.get(key.lower())
    if decision is None:
        return False
    row["decision"] = decision
    return True


def render_candidate(row: dict[str, Any], pos: int, total: int, *, width: int = 100) -> str:
    """A full-screen view of one judge-proposed correction for the accept/reject loop."""
    verdict = str(row["verdict"])
    canon = row.get("suggested_canonical")
    arrow = f" → {canon}" if canon else ""
    vcolor = _LABEL_COLOR.get(verdict, "")
    decision = str(row.get("decision", "pending"))
    dcolor = _DECISION_COLOR.get(decision, _DIM)
    count = int(row.get("count", 1))
    occurs = (
        f"  {_DIM}×{count} on lines {row.get('line_refs', [row['line_ref']])}{_RESET}"
        if count > 1
        else ""
    )
    header = (
        f"{_BOLD}[ {pos + 1} / {total} ]{_RESET}  line {row['line_ref']}  ({row['speaker']})   "
        f"judge: {vcolor}{verdict}{arrow}{_RESET}   decision: {dcolor}{decision}{_RESET}{occurs}"
    )
    body = [
        f"  {_BOLD}span{_RESET}:    {_CYAN}{row['span']!r}{_RESET}",
        f"  {_BOLD}verdict{_RESET}: {vcolor}{verdict}{_RESET}{arrow}  "
        f"{_DIM}(confidence {float(row['confidence']):.2f}){_RESET}",
        f"  {_BOLD}why{_RESET}:     {_DIM}{row['reason']}{_RESET}",
        "",
        f"  {_DIM}{highlight_span(str(row['line_text']), str(row['span']), width=width)}{_RESET}",
    ]
    keys = (
        f"  {_GREEN}[a]ccept{_RESET}   {_RED}[r]eject{_RESET}   [k]eep/next   [b]ack   "
        f"[q]save+quit   [Q]quit"
    )
    return f"{_CLEAR}{header}\n\n" + "\n".join(body) + f"\n\n{keys}\n"


def _candidate_summary(rows: list[dict[str, Any]]) -> str:
    counts: dict[str, int] = {}
    for r in rows:
        d = str(r.get("decision", "pending"))
        counts[d] = counts.get(d, 0) + 1
    return "  ".join(f"{k}={v}" for k, v in sorted(counts.items()))


def review_candidates(queue: list[dict[str, Any]], payload: dict[str, Any], *, path: Path) -> None:
    """Accept/reject the surfacer candidates in `queue` (shared refs into `payload`)."""
    if not queue:
        print("No candidates to review for that filter.")
        return
    if _triage_loop(
        queue, lambda r, p, t, w: render_candidate(r, p, t, width=w), apply_candidate_action
    ):
        write_candidates(payload, path)
        rows = payload["candidates"]
        accepted = [r for r in rows if r.get("decision") == "accept" and r["verdict"] == "confirm"]
        print(
            f"\n{_GREEN}Saved {len(rows)} candidates → {path}{_RESET}\n  {_candidate_summary(rows)}"
        )
        if accepted:
            print(f"  {len(accepted)} accepted correction(s):")
            for r in accepted:
                print(f"    {r['span']!r} → {r['suggested_canonical']!r}")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        description="Interactive triage — mined negatives or surfacer candidates."
    )
    ap.add_argument("--mined", type=Path, default=DEFAULT_MINED_PATH)
    ap.add_argument(
        "--label",
        default="skip",
        choices=["skip", "reject", "confirm", "new", "proposed", "all"],
        help="mined mode: which records to step through (default: the ambiguous `skip` queue)",
    )
    ap.add_argument(
        "--candidates",
        type=Path,
        default=None,
        help="candidate mode: review a surfacer {date}.candidates.json",
    )
    ap.add_argument(
        "--verdict",
        default="confirm",
        choices=["confirm", "new", "reject", "all"],
        help="candidate mode: which judge verdicts to review (default: the proposed corrections)",
    )
    args = ap.parse_args(argv)

    if not sys.stdin.isatty():
        print("review_tui needs an interactive terminal (TTY).", file=sys.stderr)
        return 2

    # Items in `queue` are shared refs into the full payload/list, so editing them in the
    # loop updates the whole thing; we persist the full file, not just the filtered view.
    if args.candidates is not None:
        payload = load_candidates(args.candidates)
        rows: list[Any] = payload["candidates"]
        queue = rows if args.verdict == "all" else [r for r in rows if r["verdict"] == args.verdict]
        print(
            f"{_BOLD}Reviewing {len(queue)} '{args.verdict}' candidate(s) "
            f"from {args.candidates.name}.{_RESET}  Starting…"
        )
        review_candidates(queue, payload, path=args.candidates)
        return 0

    everything = load_mined_artifact(args.mined)
    mined_queue = (
        everything if args.label == "all" else [r for r in everything if r.auto_label == args.label]
    )
    print(f"{_BOLD}Reviewing {len(mined_queue)} '{args.label}' record(s).{_RESET}  Starting…")
    review(mined_queue, everything, path=args.mined)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
