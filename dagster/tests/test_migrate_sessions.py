"""``migrate_sessions.py``: the plan, the launch preview, apply, crash safety and rollback."""

import dataclasses
import importlib.util
from pathlib import Path
from types import ModuleType

import dagster as dg
import pytest
from astra_pipeline_resources.partitions import (
    LEGACY_SESSIONS_NAMES,
    MIGRATION_MARKER,
    SESSIONS_NAME,
    migration_done,
    migration_pending,
)
from astra_pipeline_resources.testing import fail_partition, mark_materialized

SCRIPT = Path(__file__).resolve().parents[1] / "migrate_sessions.py"


@pytest.fixture
def mig(monkeypatch: pytest.MonkeyPatch) -> ModuleType:
    """The script, loaded by path, with every stage's file check passing.

    The real checks read the live transcript and saved dirs; here every session "has its
    files", so the preview shows exactly what the instance state alone would launch."""
    spec = importlib.util.spec_from_file_location("astra_migrate_sessions", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    open_stages = tuple(
        dataclasses.replace(s, sensor=dataclasses.replace(s.sensor, keep=lambda _k: True))
        for s in module.DOWNSTREAM
    )
    monkeypatch.setattr(module, "DOWNSTREAM", open_stages)
    return module


def test_the_stages_cover_every_legacy_set_in_order(mig: ModuleType) -> None:
    assert (mig.SCRIBE.legacy_set, *(s.legacy_set for s in mig.DOWNSTREAM)) == (
        LEGACY_SESSIONS_NAMES
    )
    assert [s.sensor.stage.to_user_string() for s in mig.DOWNSTREAM] == [
        s.root for s in mig.DOWNSTREAM
    ]


MOUTHPIECE = ("session_digest", "session_brief", "session_script", "session_audio_clips")
MOUTHPIECE_ALL = (*MOUTHPIECE, "session_episode")


@pytest.fixture
def legacy() -> dg.DagsterInstance:
    """A pre-migration instance shaped like production (2026-10-23 backup, in miniature)."""
    instance = dg.DagsterInstance.ephemeral()
    sets = {
        "scribe_sessions": ["s1", "s2", "stub"],
        "linguist_sessions": ["s1", "s2"],
        # h1/h2: history the old sensors adopted with no run; s2's episode run failed.
        "mouthpiece_sessions": ["h1", "h2", "s1", "s2"],
        "heartwood_sessions": ["h1", "s1", "s2"],
    }
    for name, keys in sets.items():
        instance.add_dynamic_partitions(name, keys)
    for asset in ("session_tracks", "session_transcript", "session_transcripts"):
        mark_materialized(instance, asset, "s1", "s2")
    mark_materialized(instance, "session_transcripts", "h1", "h2")  # history at rest
    mark_materialized(instance, "session_episode_summary", "s1", "s2", "h1")
    for asset in MOUTHPIECE_ALL:
        mark_materialized(instance, asset, "s1")
    fail_partition(instance, "session_digest", "s2", "mouthpiece_sessions")
    mark_materialized(instance, "session_wiki", "s1", "s2")
    return instance


def _materialized(instance: dg.DagsterInstance) -> dict[str, set[str]]:
    assets = [*MOUTHPIECE_ALL, "session_tracks", "session_transcripts", "session_wiki"]
    return {a: instance.get_materialized_partitions(dg.AssetKey(a)) for a in assets}


def test_dry_run_plans_previews_and_writes_nothing(mig: ModuleType, legacy) -> None:
    before = _materialized(legacy)
    todo = mig.plan(legacy)
    assert todo.add == ["h1", "h2", "s1", "s2", "stub"]
    # Per session, the stage roots last (crash safety).
    assert todo.adopt == {
        "h1": [*MOUTHPIECE_ALL[1:], "session_digest", "session_wiki"],
        "h2": [*MOUTHPIECE_ALL[1:], "session_digest"],
    }
    assert mig.preview(legacy, todo) == {
        "session_transcripts": [],
        "session_digest": [],
        "session_wiki": ["h2"],  # history at rest, never in heartwood's old set
    }
    assert mig.run(legacy, apply_changes=False) == 0
    assert legacy.get_dynamic_partitions(SESSIONS_NAME) == []
    assert _materialized(legacy) == before
    assert migration_pending(legacy)


def test_apply_refuses_when_the_sensors_would_launch(mig: ModuleType, legacy) -> None:
    assert mig.run(legacy, apply_changes=True) == mig.REFUSED_LAUNCH
    assert legacy.get_dynamic_partitions(SESSIONS_NAME) == []  # nothing written
    # The keys must match the launch list exactly: a wrong key, or an extra one, refuses.
    for wrong in (["h1"], ["h2", "h1"]):
        assert mig.run(legacy, apply_changes=True, allow_launch=wrong) == mig.REFUSED_LAUNCH
    assert legacy.get_dynamic_partitions(SESSIONS_NAME) == []


def test_the_cli_takes_session_keys(mig: ModuleType, monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict[str, object] = {}

    def fake_run(_instance: object, **kw: object) -> int:
        seen.update(kw)
        return 0

    class _Instance:
        def __enter__(self) -> object:
            return self

        def __exit__(self, *_a: object) -> None:
            return None

    monkeypatch.setattr(mig, "run", fake_run)
    monkeypatch.setattr(mig.dg.DagsterInstance, "get", staticmethod(_Instance))
    argv = ["--apply", "--allow-launch", "2026-10-5", "--allow-launch", "2026-10-12"]
    assert mig.main(argv) == 0
    assert seen["allow_launch"] == ["2026-10-5", "2026-10-12"]


def test_apply_with_the_launch_named_keeps_history_and_is_idempotent(
    mig: ModuleType, legacy
) -> None:
    before = _materialized(legacy)
    assert mig.run(legacy, apply_changes=True, allow_launch=["h2"]) == 0

    assert sorted(legacy.get_dynamic_partitions(SESSIONS_NAME)) == [
        "h1", "h2", "s1", "s2", "stub",
    ]  # fmt: skip
    after = _materialized(legacy)
    assert all(before[a] <= after[a] for a in before)  # nothing lost
    assert after["session_digest"] - before["session_digest"] == {"h1", "h2"}
    assert after["session_wiki"] - before["session_wiki"] == {"h1"}
    assert after["session_tracks"] == before["session_tracks"]  # scribe is not adopted
    assert migration_done(legacy) and not migration_pending(legacy)
    assert mig.sensor_preview(legacy)["session_wiki"] == ["h2"]
    assert not mig.plan(legacy).writes
    assert mig.run(legacy, apply_changes=True) == 0  # "nothing to do"


def test_a_clean_instance_applies_without_flags(mig: ModuleType, legacy) -> None:
    legacy.add_dynamic_partitions("heartwood_sessions", ["h2"])
    assert mig.run(legacy, apply_changes=True) == 0
    assert all(not keys for keys in mig.sensor_preview(legacy).values())


def test_adoption_marks_carry_the_tag(mig: ModuleType, legacy) -> None:
    mig.run(legacy, apply_changes=True, allow_launch=["h2"])
    result = legacy.fetch_materializations(
        dg.AssetRecordsFilter(asset_key=dg.AssetKey("session_digest"), asset_partitions=["h1"]),
        limit=1,
    )
    (record,) = result.records
    materialization = record.asset_materialization
    assert materialization is not None
    assert materialization.tags == {mig.ADOPTED_TAG: mig.ADOPTED_VALUE}


def test_an_interrupted_apply_completes_on_rerun(
    mig: ModuleType, legacy, monkeypatch: pytest.MonkeyPatch
) -> None:
    real = legacy.report_runless_asset_event
    calls = {"n": 0}

    def crash_after_three(event: dg.AssetMaterialization) -> None:
        calls["n"] += 1
        if calls["n"] > 3:
            raise RuntimeError("killed")
        real(event)

    monkeypatch.setattr(legacy, "report_runless_asset_event", crash_after_three)
    with pytest.raises(RuntimeError):
        mig.run(legacy, apply_changes=True, allow_launch=["h2"])
    assert not migration_done(legacy)  # the sensors keep skipping
    # h1 got three non-root marks; its root is still unmarked, so h1 is still "never tried".
    todo = mig.plan(legacy)
    assert todo.adopt["h1"][-2:] == ["session_digest", "session_wiki"]

    monkeypatch.setattr(legacy, "report_runless_asset_event", real)
    assert mig.run(legacy, apply_changes=True, allow_launch=["h2"]) == 0
    after = _materialized(legacy)
    assert all({"h1", "h2"} <= after[a] for a in MOUTHPIECE_ALL)


def test_apply_refuses_with_runs_in_flight(
    mig: ModuleType, legacy, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        legacy,
        "get_run_records",
        lambda **_kw: [type("R", (), {"dagster_run": type("D", (), {"run_id": "r1"})})],
    )
    assert mig.run(legacy, apply_changes=True, allow_launch=["h2"]) == mig.REFUSED_IN_FLIGHT
    assert legacy.get_dynamic_partitions(SESSIONS_NAME) == []


def test_down_tops_up_the_old_sets_and_blanks_the_marker(mig: ModuleType, legacy) -> None:
    mig.run(legacy, apply_changes=True, allow_launch=["h2"])
    # Two sessions after the cut-over: "new" went through scribe and linguist, "late" has
    # only been registered.
    legacy.add_dynamic_partitions(SESSIONS_NAME, ["new", "late"])
    for asset in ("session_tracks", "session_transcripts"):
        mark_materialized(legacy, asset, "new")
    assert mig.plan_down(legacy) == {
        "scribe_sessions": ["new"],
        "linguist_sessions": ["h1", "h2", "new"],  # history at rest, harmless
        "mouthpiece_sessions": [],
        "heartwood_sessions": [],
    }
    assert mig.run(legacy, apply_changes=True, down=True) == 0
    assert "new" in legacy.get_dynamic_partitions("scribe_sessions")
    assert all(not keys for keys in mig.plan_down(legacy).values())
    assert not migration_done(legacy) and migration_pending(legacy)
    # A session the old code adds meanwhile is copied by the next roll-forward.
    legacy.add_dynamic_partitions("scribe_sessions", ["meanwhile"])
    assert "meanwhile" in mig.plan(legacy).add
    assert legacy.run_storage.get_cursor_values({MIGRATION_MARKER}) == {MIGRATION_MARKER: ""}


def test_down_counts_an_old_sensor_ledger_as_tried(
    mig: ModuleType, legacy, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A session the old mouthpiece sensor launched whose run was later deleted: no
    materialization or run says it was tried, only the ledger. The rollback must still add
    it to the old set, or the old sensor would launch the paid stage again."""
    mig.run(legacy, apply_changes=True, allow_launch=["h2"])
    legacy.add_dynamic_partitions(SESSIONS_NAME, ["gone"])
    monkeypatch.setattr(mig, "old_ledgers", lambda _i: {"session_digest": {"gone", "unknown"}})
    down = mig.plan_down(legacy)
    assert down["mouthpiece_sessions"] == ["gone"]  # "unknown" is not a session
    assert down["heartwood_sessions"] == []
