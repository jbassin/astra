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
    stage = "apps/portal/server/src/stage.ts"
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
        (aon, 1350, "requirement-code", "R3"),
        (aon, 1350, "roadmap-decision", "decision E4"),
        ("justfile", 101, "phase-slice", "P9/S1"),
        ("justfile", 101, "code-in-parens", "(P9/S1)"),
        ("justfile", 101, "spec-ref", "0007/F3"),
        (stage, 1, "stage-tag", "S2"),
        (stage, 1, "section-ref", "§3"),
        (stage, 2, "phase-slice", "P3-S1"),
        (stage, 2, "requirement-code", "R21"),
        (stage, 2, "dashed-code", "D-7"),
        (stage, 3, "lane-slug", "svc-2"),
        (stage, 4, "slice-number", "slice 5"),
        (stage, 4, "spec-slug", "codex-0029"),
    }


def test_the_failing_fixture_exercises_every_rule() -> None:
    assert {rule for _, _, rule, _ in _found("fail.diff")} == set(cdi.RULES)


# Each rule: lines it flags (with the match) and look-alikes it must pass.
_CASES: dict[str, tuple[list[tuple[str, str]], list[str]]] = {
    "phase-slice": ([("the P3-S1 precedent", "P3-S1")], ["P3-5 rows", "a P9 slice"]),
    "stage-tag": (
        [
            ("// the S2 checker", "S2"),
            ("S2 widenings", "S2"),
            ("since the S1 commit", "S1"),
            ("the S3-proven path", "S3"),
            ('it("S5c: drops boons", () => {})', "S5c"),
            ("S1/S2 wire contract", "S1"),
        ],
        [
            "an AWS S3 bucket",
            "the S3 bucket name",
            "s3://bucket/key",
            "S3_BUCKET = 1",
            "row.S1 = 2",
            "P9 S1",
            "P3-S1",
            "0022 S8",
            "S100 is a model number",
            'SeasonBoundary(title="S1")',
        ],
    ),
    "section-ref": (
        [("the §3 depth", "§3"), ("(E14, §5 rule 5)", "§5"), ("spec §4.1", "§4.1"), ("§5A", "§5A")],
        ["MARKDOWN.md §5 lists it", "a lone § sign"],
    ),
    "requirement-code": (
        [
            ("the R21 save-serializer", "R21"),
            ("(K4)", "K4"),
            ("rollup to tsdown, D5", "D5"),
            ('describe("R1 (the table skin)", () => {})', "R1"),
            ("R10/D29-68", "R10"),
        ],
        [
            'id="R1"',
            "run_dir(tmp, 'R2')",
            "Deadly D8",
            "fatal d10",
            "2d6 + D29-1",
            "#D2A2E1",
            "rgb.R1x",
            "E14 and F5",
            "R100",
            "R2D2",
        ],
    ),
    "dashed-code": (
        [
            ("(R-16)", "R-16"),
            ("OQ-1 is open", "OQ-1"),
            ("NFR-9: no hex", "NFR-9"),
            ("the D-7 read-back", "D-7"),
            ("AD-7/L2", "AD-7"),
        ],
        ["UTF-8", "GLM-5.2", "C-1 is the last column", "D29-7", "XR-16"],
    ),
    "lane-slug": (
        [
            ("(svc-2)", "svc-2"),
            ("0037 pipe-5", "pipe-5"),
            ("ops-4 drift", "ops-4"),
            ("before lib-3", "lib-3"),
            ("kit-1a", "kit-1a"),
            ("p3-0", "p3-0"),
            ("ops-1b;", "ops-1b"),
        ],
        ["test-1", "a pipe-delimited row", "x-ops-2", "--lib-3", "ops-x", "p-3"],
    ),
    "slice-number": (
        [("(slice 5)", "slice 5"), ("Slice 2 extends", "Slice 2"), ("slices 4", "slices 4")],
        ["a slice of 3 rows", "slice(0, 5)", "slices"],
    ),
    "spec-slug": (
        [("the codex-0029 memory", "codex-0029"), ("the pre-0024 port", "pre-0024")],
        ["spell-0001", "row-0005", "headless-gm-0027-thoughts.md", "heartwood-0020.md", "a-00100"],
    ),
}


@pytest.mark.parametrize("rule", sorted(_CASES))
def test_each_new_rule_flags_its_ids_and_passes_its_look_alikes(rule: str) -> None:
    flagged, passed = _CASES[rule]
    for text, match in flagged:
        assert [v.match for v in cdi.check_line("a.ts", 1, text) if v.rule == rule] == [match], text
    for text in passed:
        assert [v.match for v in cdi.check_line("a.ts", 1, text) if v.rule == rule] == [], text


def test_a_rewrap_carries_ids_across_lines_but_not_new_copies() -> None:
    def diff(removed: list[str], added: list[str]) -> str:
        body = [f"-{line}" for line in removed] + [f"+{line}" for line in added]
        return "\n".join(["+++ b/a.ts", f"@@ -1,{len(removed)} +1,{len(added)} @@", *body])

    # `P9 S1` split over two comment lines leaves a bare `S1`; joining them re-forms `P9 S1`.
    assert not cdi.check_diff(diff(["// as P9 S1 did"], ["// as P9", "// S1 did"]))
    assert not cdi.check_diff(diff(["# as P9", "# S1 (§3", "# of it)"], ["# as P9 S1 (§3 of it)"]))
    # A second copy of a removed ID, or a new one, still fails.
    found = cdi.check_diff(diff(["// the S2 checker"], ["// the S2 checker", "// S2 again, S3"]))
    assert [(v.line, v.match) for v in found] == [(2, "S2"), (2, "S3")]
    # Only whole tokens carry: removing `S1_KEY` does not carry `S1`.
    assert [v.match for v in cdi.check_diff(diff(["S1_KEY = 1"], ["// S1"]))] == ["S1"]


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
