"""Held sessions, the old sensors' ledgers, and the adoption that settles a held session."""

import json
import time

import dagster as dg
from astra_pipeline_resources.partitions import SessionStage, ready_sessions
from astra_pipeline_resources.stage_audit import (
    ADOPTED_TAG,
    adopt,
    held_sessions,
    old_ledgers,
    read_ledger,
    running_sensors,
)
from astra_pipeline_resources.testing import (
    mark_materialized,
    seed_sensor_state,
    sessions_instance,
    stored_sessions_instance,
)

WIKI = SessionStage(
    upstream=dg.AssetKey("session_transcripts"),
    stage=dg.AssetKey("session_wiki"),
    keep=lambda _key: True,
)


def test_read_ledger_reads_launched_and_nothing_else() -> None:
    assert read_ledger(json.dumps({"launched": ["a", "b"]})) == {"a", "b"}
    assert read_ledger("adopted") == set()
    assert read_ledger(None) == set()
    assert read_ledger(json.dumps({"launched": "a"})) == set()


def test_old_ledgers_come_from_the_old_sensors_rows() -> None:
    with stored_sessions_instance() as instance:
        launched = json.dumps({"launched": ["a"]})
        seed_sensor_state(instance, "heartwood_sensor", cursor=launched)
        seed_sensor_state(instance, "linguist_output_sensor", cursor="adopted")
        seed_sensor_state(instance, "craig_drop_sensor", cursor=json.dumps({"launched": ["x"]}))
        assert old_ledgers(instance) == {
            "session_transcripts": set(),
            "session_digest": set(),
            "session_wiki": {"a"},
        }


def test_running_sensors_names_only_started_ones() -> None:
    with stored_sessions_instance() as instance:
        seed_sensor_state(instance, "heartwood_automation", running=True)
        seed_sensor_state(instance, "linguist_automation")
        names = ("heartwood_automation", "linguist_automation", "mouthpiece_automation")
        assert running_sensors(instance, names) == ["heartwood_automation"]


def test_held_sessions_carry_their_upstream_time_ledger_and_age() -> None:
    instance = sessions_instance("a", "b", "c")
    mark_materialized(instance, "session_transcripts", "a", "b", "c")
    mark_materialized(instance, "session_wiki", "c")
    held = held_sessions(instance, WIKI, ledger={"a"}, recent_after=0)
    assert [(h.key, h.in_old_ledger, h.recent) for h in held] == [
        ("a", True, True),
        ("b", False, True),
    ]
    assert all(h.upstream_at for h in held)
    far_future = time.time() + 10**6
    old = held_sessions(instance, WIKI, ledger=(), recent_after=far_future)
    assert [h.recent for h in old] == [False, False]


def test_adoption_marks_exactly_the_listed_sessions_tried() -> None:
    instance = sessions_instance("a", "b")
    mark_materialized(instance, "session_transcripts", "a", "b")
    adopt(instance, WIKI, ["a"])
    assert ready_sessions(instance, upstream=WIKI.upstream, stage=WIKI.stage) == ["b"]
    (record,) = instance.fetch_materializations(WIKI.stage, limit=10).records
    assert record.partition_key == "a"
    assert record.asset_materialization is not None
    assert record.asset_materialization.tags == {ADOPTED_TAG: "stage-automation"}


def test_an_instance_without_sensor_rows_has_no_ledgers() -> None:
    stages = ("session_transcripts", "session_digest", "session_wiki")
    assert old_ledgers(sessions_instance()) == {stage: set() for stage in stages}
