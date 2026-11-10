"""`scripts/ci.py` (`just ci`): which steps a change selects, read from the real ci.yml."""

import importlib.util
import json
import sys
from pathlib import Path

import pytest

_SCRIPT = Path(__file__).resolve().parents[1] / "ci.py"


def _load():
    spec = importlib.util.spec_from_file_location("ci_local", _SCRIPT)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    # dataclasses resolves a class's module through sys.modules.
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


ci = _load()
WORKFLOW = ci.load_workflow()


def _run(changed: list[str] | None, passed: set[str] | None = None, *, everything=False):
    return ci.select(WORKFLOW, changed, passed or set(), everything=everything)


@pytest.mark.parametrize(
    ("pattern", "path", "expected"),
    [
        ("apps/*/py/**", "apps/assay/py/src/a.py", True),
        ("apps/*/py/**", "apps/assay/web/src/a.ts", False),
        ("apps/**", "apps/codex/web/.env.example", True),
        ("libs/rust/**/*.py", "libs/rust/weal-engine/tools/gen_oracle.py", True),
        ("libs/rust/**/*.py", "libs/rust/top.py", True),
        ("**/*.sh", "deploy/deploy.sh", True),
        ("**/*.sh", "root.sh", True),
        ("**/Dockerfile", "Dockerfile", True),
        ("*.{js,mjs,cjs,ts,json}", "package.json", True),
        ("*.{js,mjs,cjs,ts,json}", "apps/codex/web/package.json", False),
        ("justfile", "justfile", True),
        ("justfile", "docs/justfile.md", False),
        (".github/**", ".github/workflows/ci.yml", True),
    ],
)
def test_a_filter_glob_matches_the_paths_picomatch_would(pattern, path, expected) -> None:
    assert bool(ci.glob_to_regex(pattern).fullmatch(path)) is expected


def test_every_job_in_ci_yml_is_a_step_with_a_known_filter() -> None:
    assert "changes" not in WORKFLOW.steps
    assert "ci-ok" not in WORKFLOW.steps
    assert {"py-test", "ts-build", "commitlint", "ratchet"} <= set(WORKFLOW.steps)
    assert {g for g in WORKFLOW.steps.values() if g} <= set(WORKFLOW.filters)


def test_a_docs_change_runs_only_the_unfiltered_steps() -> None:
    selection = _run(["docs/now.md"])
    assert selection.run == [s for s, guard in WORKFLOW.steps.items() if guard is None]
    assert "py-test" in selection.filtered
    assert "ts-test" in selection.filtered


def test_a_python_change_runs_the_python_lane_and_not_the_ts_lane() -> None:
    selection = _run(["libs/py/llm/src/astra_llm/client.py"])
    assert {"py-lint", "py-typecheck", "py-test"} <= set(selection.run)
    assert {"ts-test", "ts-build", "codex-e2e", "weal-engine-rust"} <= set(selection.filtered)


def test_a_justfile_change_runs_every_step() -> None:
    assert _run(["justfile"]).run == list(WORKFLOW.steps)


def test_no_base_to_compare_with_runs_every_step() -> None:
    assert _run(None, passed=set(WORKFLOW.steps)).run == list(WORKFLOW.steps)


def test_all_ignores_the_filter_and_the_pass_record() -> None:
    selection = _run(["docs/now.md"], passed=set(WORKFLOW.steps), everything=True)
    assert selection.run == list(WORKFLOW.steps)


def test_a_recorded_pass_skips_the_step_but_never_the_commit_range_steps() -> None:
    selection = _run(["justfile"], passed=set(WORKFLOW.steps))
    assert selection.run == ["commitlint", "no-decision-ids"]
    assert "py-test" in selection.recorded


def test_a_pass_record_for_another_tree_counts_for_nothing(tmp_path: Path) -> None:
    record = tmp_path / "ci-pass.json"
    record.write_text(json.dumps({"tree": "aaa", "passed": ["py-test"]}), encoding="utf-8")
    assert ci.read_passed(record, "aaa") == {"py-test"}
    assert ci.read_passed(record, "bbb") == set()
    record.write_text("not json", encoding="utf-8")
    assert ci.read_passed(record, "aaa") == set()
    assert ci.read_passed(tmp_path / "missing.json", "aaa") == set()


def test_a_step_that_waits_starts_after_the_step_it_waits_for(tmp_path, monkeypatch) -> None:
    order: list[str] = []

    def fake(step, args, log, wait_for):
        if wait_for is not None:
            wait_for.wait()
        order.append(step)
        return ci.Result(step, True, 0.0, log)

    monkeypatch.setattr(ci, "_run_step", fake)
    results = ci.run_steps(["codex-e2e", "ts-build"], "origin/main", tmp_path, jobs=1)
    assert order == ["ts-build", "codex-e2e"]
    assert all(r.ok for r in results)
