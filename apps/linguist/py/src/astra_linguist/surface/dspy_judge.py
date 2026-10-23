"""The dspy program behind the Phase-2 judge (NLSpec 0006 gate J).

A `dspy.Signature` (lexicon + window → typed `list[Candidate]`) carrying the verbatim
`SYSTEM` prompt (judge.py) as its instruction, wrapped in `dspy.ChainOfThought`. This
is what `make_dspy_complete_fn` runs and what the MIPROv2 optimizer tunes. The
`SYSTEM` const stays the source of truth for the instruction (J2); the deterministic
guardrails + the (now-inert, judge == escalate on GLM 5.2) escalation in `judge.py` are
unchanged and wrap this program.

The signature inputs mirror the `CompleteFn` seam exactly: `lexicon` is
`CompleteArgs.cached` (the lexicon block) and `window` is `CompleteArgs.user` (the
rendered window, which already carries the pre-flagged span list from `render_window`).
That keeps `judge_session` and its tests untouched (J1).
"""

from __future__ import annotations

from pathlib import Path

import dspy

from .judge import SYSTEM, Candidate

#: Committed compiled artifact (the tuned prompt/demos snapshot, K5/J7).
DEFAULT_COMPILED_PATH = Path(__file__).resolve().parent / "judge.compiled.json"


class _JudgeSignature(dspy.Signature):
    lexicon: str = dspy.InputField(
        desc="CANONICAL LEXICON (N terms): one canonical correct term per line"
    )
    window: str = dspy.InputField(
        desc="transcript window — [lineRef] (speaker) text lines, plus the pre-flagged "
        "spans to judge (report any others you spot too)"
    )
    candidates: list[Candidate] = dspy.OutputField(
        desc="one classification per suspicious span: confirm (maps to a lexicon term), "
        "new (a real proper noun not in the lexicon), or reject (ordinary English)"
    )


#: The judge signature with `SYSTEM` as its instruction (what MIPROv2 optimizes, J2).
JudgeSignature = _JudgeSignature.with_instructions(SYSTEM)


def build_judge_program() -> dspy.Module:
    """A fresh, uncompiled `ChainOfThought` judge over `JudgeSignature`."""
    return dspy.ChainOfThought(JudgeSignature)


def load_compiled(path: Path | str = DEFAULT_COMPILED_PATH) -> dspy.Module:
    """Load a compiled judge program's state from `path` into a fresh program."""
    prog = build_judge_program()
    prog.load(str(path))
    return prog


def save_compiled(prog: dspy.Module, path: Path | str = DEFAULT_COMPILED_PATH) -> None:
    """Save a compiled judge program's state as JSON (the committed artifact)."""
    prog.save(str(path), save_program=False)
