"""`scripts/ratchet.py` (`just ratchet`): each measure counts what it names and nothing else,
and the check fails only when a count rises above the baseline."""

import importlib.util
import json
import textwrap
from collections import defaultdict
from pathlib import Path

import pytest

_SCRIPT = Path(__file__).resolve().parents[1] / "ratchet.py"


def _load():
    spec = importlib.util.spec_from_file_location("ratchet", _SCRIPT)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


ratchet = _load()


def _scan(path: str, text: str) -> dict[str, list[str]]:
    sites: dict[str, list[str]] = defaultdict(list)
    lang = ratchet.SOURCE_LANGS[Path(path).suffix]
    src = ratchet.Source(path, lang, ratchet.is_test(path))
    scan = {"ts": ratchet.scan_ts, "css": ratchet.scan_ts, "rs": ratchet.scan_rs}.get(
        lang, ratchet.scan_py
    )
    scan(src, textwrap.dedent(text), sites)
    return dict(sites)


def _counts(path: str, text: str) -> dict[str, int]:
    return {k: len(v) for k, v in _scan(path, text).items()}


# --------------------------------------------------------------------------- the lexer


def test_lex_keeps_comments_and_blanks_string_contents() -> None:
    code, comments = ratchet.lex('const a = "// not a comment"; // real\n', "ts")
    assert comments.strip() == "// real"
    assert "not a comment" not in code
    assert code.startswith('const a = "')
    assert len(code) == len(comments)


def test_lex_reads_a_regex_literal_as_code_not_a_comment() -> None:
    _, comments = ratchet.lex("const r = /\\/\\//g;\nconst x = a / b / c;\n", "ts")
    assert not comments.strip()


def test_lex_follows_template_expressions_back_into_the_template() -> None:
    text = 'const t = `a ${f("}")} // inside`;\n// after\n'
    code, comments = ratchet.lex(text, "ts")
    assert comments.strip() == "// after"
    assert "f(" in code
    assert "inside" not in code


def test_lex_keeps_line_numbers() -> None:
    text = "/* one\n two */\nconst s = 'x\\'y';\n"
    code, comments = ratchet.lex(text, "ts")
    assert code.count("\n") == comments.count("\n") == text.count("\n")


def test_lex_nests_rust_block_comments() -> None:
    _, comments = ratchet.lex("/* a /* b */ c */ fn x() {}\n", "rs")
    assert comments.strip() == "/* a /* b */ c */"


# --------------------------------------------------------------------------- TS measures


def test_directives_count_each_rule_once_and_drop_the_plugin_prefix() -> None:
    assert ratchet.directive_rules(
        "// oxlint-disable-next-line typescript/no-explicit-any, no-console -- the reason"
    ) == [("no-explicit-any", False), ("no-console", False)]
    assert ratchet.directive_rules("/* eslint-disable */") == [("(all)", True)]
    assert ratchet.directive_rules("// oxlint-disable react-hooks/exhaustive-deps -- why") == [
        ("exhaustive-deps", True)
    ]
    assert ratchet.directive_rules("// a comment about oxlint") == []


def test_ts_suppressions_are_counted_from_comments_only() -> None:
    counts = _counts(
        "apps/x/web/src/a.ts",
        """\
        // oxlint-disable-next-line no-non-null-assertion -- checked above
        const a = b!;
        const s = "// oxlint-disable-next-line no-console";
        // @ts-expect-error -- the stub is not a real global
        delete globalThis.game;
        """,
    )
    assert counts["suppress.oxlint.no-non-null-assertion"] == 1
    assert "suppress.oxlint.no-console" not in counts
    assert counts["suppress.ts-expect-error"] == 1


def test_catch_blocks_that_drop_the_error() -> None:
    sites = _scan(
        "apps/x/web/src/a.ts",
        """\
        try { a(); } catch {}
        try { a(); } catch { return null; }
        try { a(); } catch (e) { return fallback; }
        try { a(); } catch (e) { logger.warn("failed", e); }
        try { a(); } catch (err) { return err.message; }
        try { a(); } catch (e) { throw new Error("wrapped", { cause: e }); }
        try { a(); } catch { /* the download still happened */ }
        """,
    )
    lines = [int(s.rsplit(":", 1)[1]) for s in sites["errors.ts-catch-drops.prod"]]
    assert lines == [1, 2, 3, 7]


def test_no_op_promise_catch_handlers() -> None:
    sites = _scan(
        "apps/x/web/src/a.ts",
        """\
        p.catch(() => {});
        p.catch(() => null);
        p.catch((e) => report(e));
        p.catch(noop);
        p.catch(handleFailure);
        """,
    )
    lines = [int(s.rsplit(":", 1)[1]) for s in sites["errors.ts-promise-catch-noop.prod"]]
    assert lines == [1, 2, 4]


def test_test_files_count_under_their_own_scope() -> None:
    counts = _counts("apps/x/web/src/a.test.ts", "try { a(); } catch {}\n")
    assert counts == {"errors.ts-catch-drops.test": 1}


def test_module_scope_metric_instruments() -> None:
    counts = _counts(
        "apps/x/server/src/m.ts",
        """\
        const hits = meter.createCounter("hits");
        export function record() {
          const inner = meter.createHistogram("latency");
        }
        """,
    )
    assert counts["zero.ts-module-scope-metric"] == 1


def test_env_reads_outside_the_config_and_observe_libraries() -> None:
    text = 'const a = process.env.X;\nconst b = import.meta.env.DEV;\nconst c = "process.env";\n'
    assert _counts("apps/x/web/src/a.ts", text) == {"env.reads-outside-config.prod": 2}
    assert _counts("libs/ts/config/src/a.ts", text) == {}


def test_rust_todo_comments_but_not_strings() -> None:
    counts = _counts("libs/rust/x/src/lib.rs", '// TODO: later\nlet s = "TODO";\n')
    assert counts == {"zero.rust-todo-fixme": 1}


# --------------------------------------------------------------------------- Python measures


def test_python_suppressions_by_code() -> None:
    counts = _counts(
        "apps/x/py/src/m.py",
        """\
        # ruff: noqa: T201
        import os  # noqa: F401, E402
        x = 1  # noqa
        y = f()  # ty: ignore[unresolved-attribute, invalid-assignment]
        z = g()  # type: ignore
        s = "# noqa: BLE001"
        """,
    )
    assert counts == {
        "suppress.noqa-file.T201": 1,
        "suppress.noqa.F401": 1,
        "suppress.noqa.E402": 1,
        "suppress.noqa.(all)": 1,
        "suppress.ty.unresolved-attribute": 1,
        "suppress.ty.invalid-assignment": 1,
        "suppress.type-ignore": 1,
    }


def test_silent_broad_excepts() -> None:
    sites = _scan(
        "apps/x/py/src/m.py",
        """\
        try:
            a()
        except Exception:
            pass
        try:
            a()
        except Exception:
            return_value = None
        try:
            a()
        except Exception:
            log.exception("failed")
        try:
            a()
        except Exception as exc:
            errors.append(exc)
        try:
            a()
        except (ValueError, BaseException):
            raise
        try:
            a()
        except ValueError:
            pass
        """,
    )
    lines = [int(s.rsplit(":", 1)[1]) for s in sites["errors.py-silent-broad-except.prod"]]
    assert lines == [3, 7]


def test_python_any_and_env_reads() -> None:
    text = """\
    import os
    import typing
    from typing import Any
    from os import environ

    def f(a: Any, b: typing.Any) -> dict[str, Any]:
        return {"home": os.environ["HOME"], "x": os.getenv("X"), "y": environ.get("Y")}
    """
    counts = _counts("apps/x/py/src/m.py", text)
    assert counts["types.py-any.prod"] == 3
    assert counts["env.reads-outside-config.prod"] == 3
    assert "env.reads-outside-config.prod" not in _counts("libs/py/config/src/c.py", text)


def test_python_functions_over_80_lines() -> None:
    body = "\n".join(f"    x{i} = {i}" for i in range(80))
    counts = _counts(
        "apps/x/py/tests/test_m.py", f"def long():\n{body}\n\ndef short():\n    pass\n"
    )
    assert counts == {"size.py-functions-over-80.test": 1}


# --------------------------------------------------------------------------- the file set


@pytest.mark.parametrize(
    ("path", "excluded"),
    [
        ("apps/strider/web/src/routeTree.gen.ts", True),
        ("libs/ts/config/src/config.gen.ts", True),
        ("apps/akasha/web/src/generated/site.ts", True),
        ("libs/ts/weal-engine/gen/weal_engine.js", True),
        ("scripts/tests/fixtures/decision_ids/a.py", True),
        ("apps/codex/web/dist/server/main.js", True),
        ("apps/codex/web/src/data/rows.ts", False),
        ("apps/codex/web/src/domain/browse/BrowseListing.tsx", False),
    ],
)
def test_excluded_paths(path: str, excluded: bool) -> None:
    assert ratchet._excluded(path) is excluded


def test_file_sizes_count_over_each_limit() -> None:
    sites: dict[str, list[str]] = defaultdict(list)
    ratchet.scan_file_size(ratchet.Source("a.ts", "ts", False), "x\n" * 1200, sites)
    ratchet.scan_file_size(ratchet.Source("b.ts", "ts", True), "x\n" * 600, sites)
    ratchet.scan_file_size(ratchet.Source("c.ts", "ts", False), "x\n" * 500, sites)
    assert {k: len(v) for k, v in sites.items()} == {
        "size.files-over-500.prod": 1,
        "size.files-over-1000.prod": 1,
        "size.files-over-500.test": 1,
    }


# --------------------------------------------------------------------------- oxlint and knip


def test_oxlint_diagnostics_count_only_the_measured_rules() -> None:
    report = {
        "diagnostics": [
            {
                "code": "typescript(no-unsafe-type-assertion)",
                "filename": "apps/a/src/x.ts",
                "labels": [{"span": {"line": 3}}],
            },
            {"code": "eslint(complexity)", "filename": "apps/a/src/x.test.ts", "labels": []},
            {"code": "eslint(no-console)", "filename": "apps/a/src/x.ts", "labels": []},
        ]
    }
    sites: dict[str, list[str]] = defaultdict(list)
    ratchet.oxlint_sites(report, {"no-unsafe-type-assertion", "complexity"}, sites)
    assert dict(sites) == {
        "oxlint.no-unsafe-type-assertion.prod": ["apps/a/src/x.ts:3"],
        "size.ts-complexity-over-15.test": ["apps/a/src/x.test.ts:0"],
    }


def test_knip_report_counts_each_kind() -> None:
    report = {
        "files": ["apps/a/src/dead.ts"],
        "issues": [
            {
                "file": "apps/a/src/x.ts",
                "exports": [{"name": "unused"}],
                "types": [{"name": "T"}, {"name": "U"}],
                "unresolved": [{"name": "@/generated/site"}],
            },
            {"file": "apps/a/package.json", "devDependencies": [{"name": "tslib"}]},
        ],
    }
    sites: dict[str, list[str]] = defaultdict(list)
    ratchet.knip_sites(report, sites)
    assert {k: len(v) for k, v in sites.items()} == {
        "knip.files": 1,
        "knip.exports": 1,
        "knip.types": 2,
        "knip.devDependencies": 1,
    }


def test_the_ratchet_config_and_lint_paths_come_from_the_repo() -> None:
    rules = ratchet.ratchet_rules()
    assert {"no-unsafe-type-assertion", "max-lines-per-function", "complexity"} <= rules
    assert ratchet.lint_paths()[:2] == ["apps", "libs/ts"]


def test_the_committed_baseline_has_every_fixed_key_and_zero_keys_at_zero() -> None:
    baseline = json.loads(ratchet.BASELINE.read_text(encoding="utf-8"))
    assert set(ratchet.FIXED_KEYS) <= set(baseline)
    assert all(v == 0 for k, v in baseline.items() if k.startswith("zero."))
    assert list(baseline) == sorted(baseline)


# --------------------------------------------------------------------------- the ratchet


def test_compare_reports_rises_and_falls_with_missing_keys_as_zero() -> None:
    rose, fell = ratchet.compare({"a": 3, "b": 2, "gone": 1}, {"a": 4, "b": 2, "new": 1})
    assert rose == {"a": (3, 4), "new": (0, 1)}
    assert fell == {"gone": (1, 0)}


def test_lowered_never_raises_and_keeps_fixed_and_frozen_keys() -> None:
    fixed = ratchet.FIXED_KEYS[0]
    new = ratchet.lowered(
        {"a": 3, "b": 2, "c": 1, fixed: 1, "knip.exports": 5},
        {"a": 1, "b": 5, "c": 0, fixed: 0, "knip.exports": 4},
        frozen={"knip.exports"},
    )
    assert new == {"a": 1, "b": 2, fixed: 0, "knip.exports": 5}


@pytest.fixture
def fake_run(tmp_path, monkeypatch):
    """Point the ratchet at a temporary baseline and a canned measurement."""
    baseline = tmp_path / "ratchet_baseline.json"
    monkeypatch.setattr(ratchet, "BASELINE", baseline)
    monkeypatch.setattr(ratchet, "generated_modules_present", lambda: False)
    monkeypatch.setattr(ratchet, "changed_paths", lambda: None)

    def run(counts: dict[str, int], argv: list[str]) -> int:
        sites = {k: [f"f.ts:{i}" for i in range(n)] for k, n in counts.items()}
        monkeypatch.setattr(ratchet, "measure", lambda: sites)
        return ratchet.main(argv)

    return baseline, run


def test_a_rise_fails_and_lists_the_sites(fake_run, capsys) -> None:
    baseline, run = fake_run
    baseline.write_text(json.dumps({"suppress.oxlint.no-console": 1}))
    assert run({"suppress.oxlint.no-console": 2}, []) == 1
    out = capsys.readouterr().out
    assert "suppress.oxlint.no-console: 1 -> 2 (+1)" in out
    assert "f.ts:1" in out


def test_a_fall_passes_and_asks_for_an_update(fake_run, capsys) -> None:
    baseline, run = fake_run
    baseline.write_text(json.dumps({"suppress.oxlint.no-console": 3}))
    assert run({"suppress.oxlint.no-console": 2}, []) == 0
    assert "just ratchet --update" in capsys.readouterr().out
    assert json.loads(baseline.read_text()) == {"suppress.oxlint.no-console": 3}


def test_update_lowers_the_falls_and_still_fails_on_a_rise(fake_run) -> None:
    baseline, run = fake_run
    baseline.write_text(json.dumps({"a": 3, "b": 1}))
    assert run({"a": 1, "b": 2}, ["--update"]) == 1
    assert json.loads(baseline.read_text()) == {"a": 1, "b": 1}


def test_a_missing_baseline_fails_until_update_writes_it(fake_run) -> None:
    baseline, run = fake_run
    assert run({"a": 1, "b": 0}, []) == 2
    assert run({"a": 1, "b": 0}, ["--update"]) == 0
    assert json.loads(baseline.read_text()) == {"a": 1}


def test_unknown_arguments_print_the_usage(fake_run) -> None:
    _, run = fake_run
    assert run({}, ["--bogus"]) == 2


def test_a_failure_shows_the_sites_in_the_files_the_change_touches(capsys) -> None:
    found = ["a.ts:3", "b.ts: unusedExport", "c.ts (612 lines)"]
    ratchet.print_sites("k", found, {"b.ts", "c.ts"})
    out = capsys.readouterr().out
    assert "2 of 3 sites in the files this change touches" in out
    assert "a.ts:3" not in out
    assert "just ratchet --list k" in out
    ratchet.print_sites("k", found, None)
    assert "a.ts:3" in capsys.readouterr().out
