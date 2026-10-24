"""`scripts/check_decision_ids.py` (`just no-decision-ids`): added lines that cite a process ID
fail, with the file, line and rule; everything else passes."""

import importlib.util
import subprocess
from pathlib import Path

import pytest

_SCRIPT = Path(__file__).resolve().parents[1] / "check_decision_ids.py"
_FIXTURES = Path(__file__).resolve().parent / "fixtures" / "decision_ids"


def _load():
    spec = importlib.util.spec_from_file_location("check_decision_ids", _SCRIPT)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


cdi = _load()


def _found(diff_name: str) -> set[tuple[str, int, str, str]]:
    diff = (_FIXTURES / diff_name).read_text(encoding="utf-8")
    return {(v.path, v.line, v.rule, v.match) for v in cdi.check_diff(diff)}


def test_the_passing_fixture_has_no_violations() -> None:
    # ADR references, look-alike code, removed and context lines, exempt paths, Markdown,
    # content files and an inline exception with a reason all pass.
    assert _found("pass.diff") == set()


def test_the_failing_fixture_reports_each_added_id_at_its_new_line() -> None:
    listing = "apps/codex/web/src/listing.ts"
    assets = "apps/linguist/py/src/astra_linguist/assets.py"
    aon = "apps/codex/ingest/src/aonMarkup.ts"
    assert _found("fail.diff") == {
        (listing, 10, "phase-slice", "P4.5 S4"),
        (listing, 10, "decision-id", "D29-49"),
        (listing, 40, "decision-id", "D29-101a"),
        (assets, 259, "finding-id", "PIPE-20"),
        (assets, 259, "spec-ref", "0037 PIPE-20"),
        (assets, 260, "finding-id", "WEAL-1"),
        (assets, 261, "spec-ref", "0022 S11"),
        (assets, 261, "spec-ref", "spec 0030"),
        (assets, 262, "gate-letter", "gates C/D/E"),
        (assets, 262, "roadmap-decision", "Decision I"),
        (aon, 1350, "code-in-parens", "(R3, P6)"),
        (aon, 1350, "roadmap-decision", "decision E4"),
        ("justfile", 101, "phase-slice", "P9/S1"),
        ("justfile", 101, "code-in-parens", "(P9/S1)"),
        ("justfile", 101, "spec-ref", "0007/F3"),
    }


def test_the_failing_fixture_exercises_every_rule() -> None:
    assert {rule for _, _, rule, _ in _found("fail.diff")} == set(cdi.RULES)


def test_an_ignore_needs_a_reason_and_covers_only_the_rules_it_names() -> None:
    assert cdi.check_line("a.py", 1, "x = '(T1)'  # decision-ids: ignore[code-in-parens]")
    assert not cdi.check_line("a.py", 1, "'(T1)'  # decision-ids: ignore[code-in-parens] -- tier")
    still = cdi.check_line("a.py", 1, "'(T1) D29-1'  # decision-ids: ignore[code-in-parens] -- t")
    assert [v.rule for v in still] == ["decision-id"]


def test_the_failure_message_names_file_line_and_rule(capsys: pytest.CaptureFixture[str]) -> None:
    assert cdi.main(["--diff", str(_FIXTURES / "fail.diff")]) == 1
    err = capsys.readouterr().err
    assert "apps/codex/web/src/listing.ts:10: [decision-id] 'D29-49'" in err
    assert "[spec-ref] a spec number or a spec-qualified ID" in err
    assert "ADR 0015" in err
    assert cdi.main(["--diff", str(_FIXTURES / "pass.diff")]) == 0


def _git(repo: Path, *args: str) -> str:
    return subprocess.run(
        ["git", "-c", "user.name=t", "-c", "user.email=t@example.com", *args],
        cwd=repo,
        check=True,
        capture_output=True,
        text=True,
    ).stdout


def test_only_lines_added_since_the_merge_base_fail(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _git(tmp_path, "init", "-q", "-b", "main")
    (tmp_path / "old.py").write_text("# D29-1: an existing ID is left for the sweeps\n")
    _git(tmp_path, "add", ".")
    _git(tmp_path, "commit", "-qm", "base")
    _git(tmp_path, "switch", "-qc", "feature")
    (tmp_path / "new.py").write_text("x = 1\n# P9 S1: a new one fails\n")
    _git(tmp_path, "add", ".")
    _git(tmp_path, "commit", "-qm", "feature")
    # main moves on after the branch point; its new lines are not the branch's to answer for.
    _git(tmp_path, "switch", "-q", "main")
    (tmp_path / "main.py").write_text("# D30-2 landed on main meanwhile\n")
    _git(tmp_path, "add", ".")
    _git(tmp_path, "commit", "-qm", "main")
    monkeypatch.setattr(cdi, "ROOT", tmp_path)

    found = cdi.check_diff(cdi.diff_since("main", "feature"))
    assert [(v.path, v.line, v.rule) for v in found] == [("new.py", 2, "phase-slice")]
    # An empty base checks the head commit alone (a push with no usable `before`).
    assert [v.path for v in cdi.check_diff(cdi.diff_since("", "main"))] == ["main.py"]
    # A root commit is diffed against the empty tree.
    assert [v.path for v in cdi.check_diff(cdi.diff_since("", "main~1"))] == ["old.py"]
    assert cdi.main(["main", "feature"]) == 1
    assert cdi.main(["feature", "main"]) == 1
    assert cdi.main(["main", "main"]) == 0
