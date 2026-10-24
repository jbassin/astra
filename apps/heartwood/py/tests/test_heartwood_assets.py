"""The 0036 Dagster wiring (D36-7, D36-8): session_wiki's request/wait/outcome handling and
the sensor's adoption. No host runner — a fake one writes results."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import dagster as dg
import pytest
from astra_heartwood import assets
from astra_heartwood import requests as rq


def answer(root: Path, outcome: rq.Outcome, code: int, **kw: Any):
    """A ``wait`` stand-in: the host answers the request immediately."""

    def wait(r: Path, date: str, request_id: str, *, timeout_s: float) -> rq.Result | None:
        result = rq.Result(
            request_id=request_id,
            date=date,
            outcome=outcome,
            exit_code=code,
            meaning=rq.meaning(code),
            started_at="t",
            finished_at="t",
            **kw,
        )
        rq.write_result(r, result)
        return rq.read_result(r, date, request_id)

    return wait


def test_published_returns_metadata(tmp_path: Path) -> None:
    meta = assets.run_session_wiki(
        "2026-10-26",
        root=tmp_path,
        timeout_min=1,
        dagster_run_id="run-1",
        wait=answer(
            tmp_path,
            "published",
            0,
            cost_usd=0.4,
            run_id="R",
            commit="abc",
            counts={"created": 3, "note": "x"},
        ),
    )
    assert meta["outcome"] == "published" and meta["cost_usd"] == 0.4 and meta["commit"] == "abc"
    assert meta["count_created"] == 3 and "count_note" not in meta
    req = rq.Request.model_validate_json(rq.request_path(tmp_path, "2026-10-26").read_text())
    assert req.dagster_run_id == "run-1"


def test_already_published_materializes_with_a_warning(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.WARNING, logger="astra.heartwood"):
        meta = assets.run_session_wiki(
            "2026-10-19",
            root=tmp_path,
            timeout_min=1,
            wait=answer(tmp_path, "already-published", 0),
        )
    assert meta["outcome"] == "already-published"
    assert any("already published" in r.message for r in caplog.records)


@pytest.mark.parametrize(
    ("code", "needle"), [(2, "incomplete"), (9, "_heartwood-push-deploy"), (-1, "preflight")]
)
def test_failure_logs_error_on_the_exported_logger_and_raises(
    tmp_path: Path, caplog: pytest.LogCaptureFixture, code: int, needle: str
) -> None:
    with (
        caplog.at_level(logging.ERROR, logger="astra.heartwood"),
        pytest.raises(assets.WikiFailure) as err,
    ):
        assets.run_session_wiki(
            "2026-10-26", root=tmp_path, timeout_min=1, wait=answer(tmp_path, "failed", code)
        )
    assert needle in str(err.value) and f"exit {code}" in str(err.value)
    assert [r.name for r in caplog.records if r.levelno == logging.ERROR] == ["astra.heartwood"]


def test_timeout_leaves_the_request_pending(tmp_path: Path) -> None:
    ticks = iter([0.0, 0.0, 30.0, 61.0])
    slept: list[float] = []

    def wait(root: Path, date: str, request_id: str, *, timeout_s: float):
        return assets.wait_for_result(
            root,
            date,
            request_id,
            timeout_s=timeout_s,
            sleep=slept.append,
            clock=lambda: next(ticks),
        )

    with pytest.raises(assets.WikiFailure, match="WILL run when the host picks it up"):
        assets.run_session_wiki("2026-10-26", root=tmp_path, timeout_min=1, wait=wait)
    assert slept == [assets.POLL_SECONDS, assets.POLL_SECONDS]
    assert [r.date for r in rq.pending(tmp_path)] == ["2026-10-26"]


def test_a_stale_result_is_cleared_before_the_new_request(tmp_path: Path) -> None:
    old = rq.file_request(tmp_path, "2026-10-26")
    answer(tmp_path, "failed", 1)(tmp_path, "2026-10-26", old.request_id, timeout_s=1)
    seen: list[rq.Result | None] = []

    def wait(root: Path, date: str, request_id: str, *, timeout_s: float):
        seen.append(rq.read_result(root, date, request_id))  # must not see the old failure
        return answer(root, "published", 0)(root, date, request_id, timeout_s=timeout_s)

    assets.run_session_wiki("2026-10-26", root=tmp_path, timeout_min=1, wait=wait)
    assert seen == [None]


# ── sensor ──
def _transcripts(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, dates: dict[str, bool]) -> Path:
    tdir = tmp_path / "transcripts"
    tdir.mkdir()
    for date in dates:
        (tdir / f"000.show.{date}.txt").write_text("000001\tGamemaster: hi\n")
    monkeypatch.setattr(assets, "TRANSCRIPT_DIR", tdir)
    monkeypatch.setattr(
        assets, "faerrin_session", lambda d, transcript_dir: "show" if dates[d] else None
    )
    return tdir


def _evaluate(instance: dg.DagsterInstance, cursor: str | None) -> dg.SensorResult:
    result = assets.heartwood_sensor(dg.build_sensor_context(instance=instance, cursor=cursor))
    assert isinstance(result, dg.SensorResult)
    return result


def test_sensor_adopts_then_runs_only_new_faerrin_sessions(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    dates = {"2026-10-12": True, "2026-10-19": True, "2026-10-20": False}
    tdir = _transcripts(tmp_path, monkeypatch, dates)
    with dg.DagsterInstance.ephemeral() as instance:
        first = _evaluate(instance, None)
        assert first.run_requests == [] and first.cursor == "adopted"
        (adds,) = first.dynamic_partitions_requests or []
        assert sorted(adds.partition_keys or []) == ["2026-10-12", "2026-10-19"]
        instance.add_dynamic_partitions(assets.SESSIONS_NAME, list(adds.partition_keys or []))

        dates["2026-10-26"] = True
        (tdir / "000.show.2026-10-26.txt").write_text("x")
        later = _evaluate(instance, "adopted")
        reqs = later.run_requests or []
        assert [r.partition_key for r in reqs] == ["2026-10-26"]
        assert reqs[0].tags == assets.CONCURRENCY_TAG


def test_definitions_and_no_retry_policy() -> None:
    assert assets.session_wiki.op.retry_policy is None
    repo = assets.defs.get_repository_def()
    assert repo.has_sensor_def("heartwood_sensor")
    assert dg.AssetKey("session_wiki") in {a.key for a in repo.asset_graph.asset_nodes}


# ── session_wiki through dg.materialize, with fake resources (0037 PIPE-16) ──
def _materialize_wiki(tmp_path: Path, timeout_min: int) -> dg.ExecuteInProcessResult:
    from astra_pipeline_resources.testing import FakeConfig, paths_under

    config = FakeConfig()
    config.cfg.heartwood.request_timeout_minutes = timeout_min
    instance = dg.DagsterInstance.ephemeral()
    instance.add_dynamic_partitions(assets.SESSIONS_NAME, ["2026-10-26"])
    return dg.materialize(
        [assets.session_wiki],
        partition_key="2026-10-26",
        instance=instance,
        resources={"astra_config": config, "pipeline_paths": paths_under(tmp_path)},
        raise_on_error=False,
    )


def test_session_wiki_files_its_request_under_the_configured_dir(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The host answers on the first poll: the run materializes with the result's metadata."""

    def read_result(root: Path, date: str, request_id: str) -> rq.Result:
        return rq.Result(
            request_id=request_id,
            date=date,
            outcome="published",
            exit_code=0,
            meaning=rq.meaning(0),
            started_at="t",
            finished_at="t",
            commit="abc",
        )

    monkeypatch.setattr(rq, "read_result", read_result)
    result = _materialize_wiki(tmp_path, timeout_min=1)
    assert result.success
    requests = tmp_path / "heartwood" / "requests"
    assert rq.request_path(requests, "2026-10-26").is_file()
    meta = result.asset_materializations_for_node("session_wiki")[0].metadata
    assert meta["commit"] == dg.TextMetadataValue("abc")


def test_session_wiki_times_out_after_the_configured_minutes(tmp_path: Path) -> None:
    """A zero-minute timeout from config: no host answer → the run fails once, no retry."""
    result = _materialize_wiki(tmp_path, timeout_min=0)
    assert not result.success
    (failure,) = [e for e in result.all_events if e.is_step_failure]
    assert "no result in 0 min" in str(failure.event_specific_data)
