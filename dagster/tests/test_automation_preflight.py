"""The read-only pre-flight and the opt-in adoption, over the real code location.

The stages' file checks are pointed at ``tmp_path`` (every session passes them), and the
instance is a temporary one that stores sensor rows, so the old sensors' ledgers can be
seeded the way the live instance keeps them.
"""

import importlib.util
import json
import time
from collections.abc import Iterator
from pathlib import Path
from types import ModuleType, SimpleNamespace

import astra_heartwood.assets as heartwood
import astra_linguist.assets as linguist
import astra_mouthpiece.assets as mouthpiece
import dagster as dg
import pytest
from astra_pipeline_resources.partitions import ready_sessions
from astra_pipeline_resources.testing import (
    cancel_partition,
    mark_materialized,
    seed_sensor_state,
    stored_sessions_instance,
)

HERE = Path(__file__).resolve().parents[1]
WIKI = dg.AssetKey("session_wiki")


def _load(name: str) -> ModuleType:
    spec = importlib.util.spec_from_file_location(name, HERE / f"{name}.py")
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def preflight(monkeypatch: pytest.MonkeyPatch) -> ModuleType:
    """The pre-flight script as a module; its PGOPTIONS change is undone after the test."""
    monkeypatch.setenv("PGOPTIONS", "")  # records the old value, which teardown restores
    return _load("automation_preflight")


@pytest.fixture
def adoption() -> ModuleType:
    return _load("adopt_held_sessions")


@pytest.fixture(autouse=True)
def files(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Every session has script.json, a canonical transcript, and is an Astra-world session."""
    monkeypatch.setattr(linguist, "has_script", lambda _saved, _key: True)
    monkeypatch.setattr(
        linguist, "_linguist_config", lambda: SimpleNamespace(ingest_saved_dir=str(tmp_path))
    )
    monkeypatch.setattr(mouthpiece.linguist_io, "transcript_for", lambda _k, _d: Path("t.txt"))
    monkeypatch.setattr(heartwood, "astra_session", lambda _d, transcript_dir: "show")


@pytest.fixture
def instance() -> Iterator[dg.DagsterInstance]:
    """Four sessions through linguist; mouthpiece and heartwood tried for none but one.

    2026-10-19's wiki run was canceled and then deleted: only heartwood_sensor's ledger
    remembers it. 2026-10-26's wiki was materialized."""
    keys = ("2026-10-5", "2026-10-12", "2026-10-19", "2026-10-26")
    with stored_sessions_instance(*keys) as instance:
        for asset in ("session_transcript", "session_transcripts", "session_episode_summary"):
            mark_materialized(instance, asset, *keys)
        mark_materialized(instance, "session_digest", *keys)
        mark_materialized(instance, "session_wiki", "2026-10-26")
        instance.delete_run(cancel_partition(instance, "session_wiki", "2026-10-19"))
        seed_sensor_state(
            instance, "heartwood_sensor", cursor=json.dumps({"launched": ["2026-10-19"]})
        )
        seed_sensor_state(instance, "linguist_output_sensor", cursor="adopted")
        yield instance


class _Opened:
    """Hands main() an instance it may close: the fixture owns it."""

    def __init__(self, instance: dg.DagsterInstance) -> None:
        self.instance = instance

    def __call__(self) -> "_Opened":
        return self

    def __enter__(self) -> dg.DagsterInstance:
        return self.instance

    def __exit__(self, *_exc: object) -> None:
        return None


def _main(
    module: ModuleType,
    instance: dg.DagsterInstance,
    definitions: ModuleType,
    argv: list[str] | None = None,
) -> int:
    return module.main(
        argv or [], instance_factory=_Opened(instance), load=lambda: definitions.defs
    )


def test_held_sessions_are_listed_with_the_ledger_and_fail_the_preflight(
    preflight: ModuleType,
    definitions: ModuleType,
    instance: dg.DagsterInstance,
    capsys: pytest.CaptureFixture[str],
) -> None:
    assert _main(preflight, instance, definitions) == 1
    out = capsys.readouterr().out
    assert "linguist_automation tick 1: 0 run(s) requested" in out
    assert "WOULD LAUNCH" not in out
    assert "session_wiki: 3 held session(s)" in out
    assert "session_transcripts: 0 held session(s)" in out
    assert "the real first tick happens at Start" in out
    # Every upstream finished within the default day: all "just finished".
    assert "HELD 2026-10-5 (upstream " in out
    assert out.count("just finished: launch by hand") == 3


def test_old_sessions_are_labelled_by_the_ledger(
    preflight: ModuleType, definitions: ModuleType, instance: dg.DagsterInstance
) -> None:
    lines: list[str] = []
    report = preflight.preflight(definitions.defs, instance, lines.append, recent_hours=-1)
    assert [h.key for h in report.held["session_wiki"]] == ["2026-10-12", "2026-10-19", "2026-10-5"]
    ledger = [line for line in lines if "its run was deleted" in line]
    assert len(ledger) == 1 and "HELD 2026-10-19" in ledger[0]
    assert sum("old: adopt, or launch by hand" in line for line in lines) == 2
    assert report.exit_code == 1


def test_nothing_held_and_nothing_requested_is_exit_0(
    preflight: ModuleType, definitions: ModuleType, instance: dg.DagsterInstance
) -> None:
    mark_materialized(instance, "session_wiki", "2026-10-5", "2026-10-12", "2026-10-19")
    assert _main(preflight, instance, definitions) == 0


def test_a_pending_migration_is_exit_2(
    preflight: ModuleType, definitions: ModuleType, instance: dg.DagsterInstance
) -> None:
    instance.add_dynamic_partitions("heartwood_sessions", ["2026-10-5"])
    assert _main(preflight, instance, definitions) == 2


def test_any_error_is_exit_2_never_1(
    preflight: ModuleType, instance: dg.DagsterInstance, capsys: pytest.CaptureFixture[str]
) -> None:
    def broken() -> dg.Definitions:
        raise RuntimeError("boom")

    code = preflight.main([], instance_factory=_Opened(instance), load=broken)
    assert code == 2
    assert "pre-flight failed: RuntimeError: boom" in capsys.readouterr().err


# ── adoption ──


def _adopt(
    adoption: ModuleType, instance: dg.DagsterInstance, argv: list[str], answer: str = "no"
) -> tuple[int, list[str]]:
    """Run the adoption a week after the seeded upstreams finished (none is recent)."""
    lines: list[str] = []
    week_later = time.time() + 7 * 24 * 3600
    code = adoption.run(
        instance, adoption.parse(argv), emit=lines.append, ask=lambda _q: answer, now=week_later
    )
    return code, lines


def test_adoption_marks_exactly_what_it_lists_after_a_yes(
    adoption: ModuleType, instance: dg.DagsterInstance
) -> None:
    code, lines = _adopt(adoption, instance, ["--stage", "session_wiki"], answer="yes")
    assert code == 0
    assert "  session_wiki: 2026-10-12, 2026-10-19, 2026-10-5" in lines
    up = dg.AssetKey("session_transcripts")
    assert ready_sessions(instance, upstream=up, stage=WIKI) == []
    adopted = {
        r.partition_key
        for r in instance.fetch_materializations(WIKI, limit=100).records
        if r.asset_materialization and (r.asset_materialization.tags or {}).get("astra/adopted")
    }
    assert adopted == {"2026-10-5", "2026-10-12", "2026-10-19"}


def test_adoption_writes_nothing_without_a_yes(
    adoption: ModuleType, instance: dg.DagsterInstance
) -> None:
    code, lines = _adopt(adoption, instance, ["--session", "2026-10-19", "--session", "1-1-1"])
    assert code == 1
    assert "  session_wiki: 2026-10-19" in lines
    assert "not held, not marking: 1-1-1" in lines
    assert lines[-1] == "declined: nothing written"
    assert (
        len(ready_sessions(instance, upstream=dg.AssetKey("session_transcripts"), stage=WIKI)) == 3
    )


def test_adoption_with_yes_flag_marks_only_the_named_session(
    adoption: ModuleType, instance: dg.DagsterInstance
) -> None:
    code, _ = _adopt(adoption, instance, ["--session", "2026-10-19", "--yes"])
    assert code == 0
    held = ready_sessions(instance, upstream=dg.AssetKey("session_transcripts"), stage=WIKI)
    assert held == ["2026-10-12", "2026-10-5"]


def test_adoption_leaves_recent_sessions_for_a_manual_launch(
    adoption: ModuleType, instance: dg.DagsterInstance
) -> None:
    lines: list[str] = []
    code = adoption.run(
        instance,
        adoption.parse(["--yes"]),
        emit=lines.append,
        ask=lambda _q: "no",
        now=None,  # the materializations are seconds old: all recent
    )
    assert code == 0
    assert lines[-1] == "nothing to mark"
    assert any(
        line.startswith("not marking (recent, launch by hand) session_wiki") for line in lines
    )


def test_adoption_refuses_while_a_stage_sensor_runs(
    adoption: ModuleType, instance: dg.DagsterInstance
) -> None:
    seed_sensor_state(instance, "heartwood_automation", running=True)
    code, lines = _adopt(adoption, instance, ["--yes"])
    assert code == 1
    assert lines == ["refused: stop these sensors first: heartwood_automation"]
