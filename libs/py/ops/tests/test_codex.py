"""``codex-refresh`` / ``codex-build`` replay the old recipes' steps: the dirty-tree refusal,
both fetches, the release build with the flags verbatim, then the head of report.md."""

from __future__ import annotations

from pathlib import Path

import pytest
from astra_ops import cli, codex
from astra_ops.testing import Call, Step, make_ctx

INGEST = ["pnpm", "--filter", "@astra/codex-ingest", "cli"]


def status(tmp: Path, stdout: str = "") -> Call:
    argv = ["git", "-C", f"{tmp}/repo", "status", "--porcelain", "--", "apps/codex/ingest"]
    return Call(argv, stdout=stdout, out="capture")


def report(tmp: Path, lines: int) -> dict[str, str]:
    data = tmp / "codex"
    corpus = data / "releases" / "current" / "corpus"
    corpus.mkdir(parents=True)
    (corpus / "report.md").write_text("".join(f"line {i}\n" for i in range(lines)))
    return {"codex.data-path": str(data)}


def test_build_passes_flags_verbatim_and_prints_the_report_head(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    cfg = report(tmp_path, 50)
    flags = ["--allow-shrink", "--force"]
    ctx, r = make_ctx(tmp_path, [Call([*INGEST, "release", "build", *flags])], config=cfg)
    assert cli.dispatch(ctx, "codex-build", flags) == 0
    r.assert_done()
    out = capsys.readouterr().out
    assert "codex-build: report.md summary:\nline 0\n" in out
    assert f"line {codex.REPORT_LINES - 1}\n" in out
    assert f"line {codex.REPORT_LINES}\n" not in out


def test_build_stops_with_the_build_s_exit_code(tmp_path: Path) -> None:
    cfg = report(tmp_path, 1)
    ctx, r = make_ctx(tmp_path, [Call([*INGEST, "release", "build"], rc=3)], config=cfg)
    assert cli.dispatch(ctx, "codex-build", []) == 3
    r.assert_done()


def test_build_fails_when_the_report_is_missing(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    cfg = {"codex.data-path": str(tmp_path / "codex")}
    ctx, r = make_ctx(tmp_path, [Call([*INGEST, "release", "build"])], config=cfg)
    assert cli.dispatch(ctx, "codex-build", []) == 1
    r.assert_done()
    assert "cannot read" in capsys.readouterr().err


def test_refresh_fetches_both_snapshots_then_builds(tmp_path: Path) -> None:
    cfg = report(tmp_path, 1)
    steps: list[Step] = [
        status(tmp_path),
        Call([*INGEST, "fetch-foundry"]),
        Call([*INGEST, "fetch-aon"]),
        Call([*INGEST, "release", "build", "--allow-shrink"]),
    ]
    ctx, r = make_ctx(tmp_path, steps, config=cfg)
    assert cli.dispatch(ctx, "codex-refresh", ["--allow-shrink"]) == 0
    r.assert_done()


def test_refresh_refuses_a_dirty_ingest_tree(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    ctx, r = make_ctx(tmp_path, [status(tmp_path, " M apps/codex/ingest/x.ts\n")])
    assert cli.dispatch(ctx, "codex-refresh", []) == 1
    r.assert_done()
    err = capsys.readouterr().err
    assert "has uncommitted changes" in err
    assert "apps/codex/ingest/x.ts" in err


def test_refresh_stops_when_a_fetch_fails(tmp_path: Path) -> None:
    steps: list[Step] = [status(tmp_path), Call([*INGEST, "fetch-foundry"], rc=2)]
    ctx, r = make_ctx(tmp_path, steps)
    assert cli.dispatch(ctx, "codex-refresh", []) == 2
    r.assert_done()
