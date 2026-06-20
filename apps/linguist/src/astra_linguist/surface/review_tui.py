"""Interactive terminal triage for the mined negatives (gate J gold-set curation, K2).

    uv run python -m astra_linguist.surface.review_tui                 # triage the `skip` queue
    uv run python -m astra_linguist.surface.review_tui --label all     # review every record
    uv run python -m astra_linguist.surface.review_tui --label reject  # re-check the rejects

Renders one flagged span at a time with its real transcript context + nearest canonical;
a single keypress sets its label, which the next compile picks up. The artifact is written
back in the miner's format on save, so runs are resumable. The pure helpers (`apply_action`,
`render_record`, `highlight_span`) are unit-tested; the keypress loop is interactive-only
(it needs a TTY and never runs in CI).

Keys: [c]onfirm→nearest  [r]eject  [n]ew  [s]kip  [k]eep/next  [b]ack  [q]save+quit  [Q]quit
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

from .goldset import DEFAULT_MINED_PATH, MinedRecord, load_mined_artifact, write_mined_artifact

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


def review(queue: list[MinedRecord], all_records: list[MinedRecord], *, path: Path) -> None:
    """Step through `queue` (shared refs into `all_records`); `q` writes the full artifact back."""
    if not queue:
        print("Nothing to review for that filter.")
        return
    width = max(40, shutil.get_terminal_size((100, 24)).columns - 8)
    pos = 0
    while 0 <= pos < len(queue):
        sys.stdout.write(render_record(queue[pos], pos, len(queue), width=width))
        sys.stdout.flush()
        key = _getch()
        if key in ("Q", "\x03"):  # Q or Ctrl-C → quit without saving
            print(f"\n{_YELLOW}Quit without saving.{_RESET}")
            return
        if key == "q":
            break
        if key == "b":
            pos = max(0, pos - 1)
            continue
        if key in ("k", " ", "\r", "\n"):
            pos += 1
            continue
        if apply_action(queue[pos], key):
            pos += 1
    write_mined_artifact(all_records, path)
    print(f"\n{_GREEN}Saved {len(all_records)} records → {path}{_RESET}\n  {_summary(all_records)}")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Interactive triage of the mined negatives (gate J).")
    ap.add_argument("--mined", type=Path, default=DEFAULT_MINED_PATH)
    ap.add_argument(
        "--label",
        default="skip",
        choices=["skip", "reject", "confirm", "new", "proposed", "all"],
        help="which records to step through (default: the ambiguous `skip` queue)",
    )
    args = ap.parse_args(argv)

    if not sys.stdin.isatty():
        print("review_tui needs an interactive terminal (TTY).", file=sys.stderr)
        return 2

    # `queue` items are the same objects as in `everything`, so editing them in the loop
    # updates the full list; we persist `everything`, not just the filtered view.
    everything = load_mined_artifact(args.mined)
    queue = (
        everything if args.label == "all" else [r for r in everything if r.auto_label == args.label]
    )
    print(f"{_BOLD}Reviewing {len(queue)} '{args.label}' record(s).{_RESET}  Starting…")
    review(queue, everything, path=args.mined)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
