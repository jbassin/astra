"""The producer pipeline stages (0035 D35-4/D35-5/D35-7) — hermetic, fake producer."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from astra_mouthpiece.hosts import load_hosts
from astra_mouthpiece.producer.brief import CitationReport, ProducerBrief
from astra_mouthpiece.producer.run import ProducerResult, RunStatus, wiki_head
from astra_mouthpiece.producer.stage import produce_brief, script_brief_block

from .test_mouthpiece_producer_run import brief_dict

KEY = "2026-1-8"
HOSTS = load_hosts()


def producer_returning(status: RunStatus, *, with_brief: bool = True, error: str | None = None):
    def producer(key: str, *, run_dir: Path) -> ProducerResult:
        run_dir.mkdir(parents=True, exist_ok=True)
        (run_dir / "summary.json").write_text("{}")
        brief = ProducerBrief.model_validate(brief_dict()) if with_brief else None
        return ProducerResult(
            status=status,
            run_dir=run_dir,
            summary={"cost_usd": 0.2, "iterations": 9},
            brief=brief,
            citations=CitationReport(total=3, bad=1, warnings=["x"]),
            error=error,
        )

    return producer


@pytest.mark.parametrize("status", ["ok", "incomplete"])
def test_brief_written_on_ok_and_incomplete(tmp_path, status: RunStatus) -> None:
    meta = produce_brief(KEY, root=tmp_path, producer=producer_returning(status))
    brief = json.loads((tmp_path / KEY / "brief.json").read_text())
    assert brief["moments"][0]["title"] == "The chase"
    assert meta["status"] == status and meta["moments"] == 1 and meta["citations_bad"] == 1


def test_failed_run_removes_a_stale_brief_and_keeps_only_the_latest_run(tmp_path) -> None:
    produce_brief(KEY, root=tmp_path, producer=producer_returning("ok"))
    meta = produce_brief(
        KEY, root=tmp_path, producer=producer_returning("failed", with_brief=False, error="E: x")
    )
    assert meta == {**meta, "status": "failed", "error": "E: x"}
    assert not (tmp_path / KEY / "brief.json").exists()
    runs = list((tmp_path / KEY / "producer").iterdir())
    assert len(runs) == 1  # the earlier run's dir was replaced


def test_setup_error_never_raises(tmp_path) -> None:
    (tmp_path / KEY).mkdir()
    (tmp_path / KEY / "brief.json").write_text("{}")

    def boom(key: str, *, run_dir: Path) -> Any:
        raise ValueError("no show")

    meta = produce_brief(KEY, root=tmp_path, producer=boom)
    assert meta == {"status": "failed", "error": "ValueError: no show"}
    assert not (tmp_path / KEY / "brief.json").exists()


def test_script_brief_block_used_fallback_invalid(tmp_path) -> None:
    assert script_brief_block(KEY, HOSTS, root=tmp_path) == ("", "fallback")
    (tmp_path / KEY).mkdir()
    (tmp_path / KEY / "brief.json").write_text("{not json")
    assert script_brief_block(KEY, HOSTS, root=tmp_path) == ("", "invalid")
    (tmp_path / KEY / "brief.json").write_text(json.dumps(brief_dict()))
    block, outcome = script_brief_block(KEY, HOSTS, root=tmp_path)
    assert outcome == "used" and block.startswith("PRODUCER NOTES")
    assert HOSTS.c is not None and f"{HOSTS.c.name} has NOT" in block


def test_wiki_head_without_git_is_unknown_not_an_error(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PATH", str(tmp_path))  # no git binary anywhere on PATH
    assert wiki_head(tmp_path) == {"sha": None, "dirty": False}
