"""The code location's three stage automation sensors hand a session down the pipeline.

One new session goes from scribe's transcript to the episode graph and the wiki, with each
sensor ticked over one ephemeral instance and each stage's run recorded as the daemon's run
would record it. The stages' file checks are pointed at ``tmp_path``. Nothing runs.
"""

from pathlib import Path
from types import ModuleType, SimpleNamespace

import astra_heartwood.assets as heartwood
import astra_linguist.assets as linguist
import astra_mouthpiece.assets as mouthpiece
import dagster as dg
import pytest
from astra_pipeline_resources.testing import (
    automation_tick,
    mark_materialized,
    queue_partition,
    sessions_instance,
)

SESSION = "2026-10-29"
SENSORS = ("linguist_automation", "mouthpiece_automation", "heartwood_automation")


@pytest.fixture
def files(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """script.json and a faerrin canonical transcript for ``SESSION``."""
    (tmp_path / SESSION).mkdir()
    (tmp_path / SESSION / "script.json").write_text("[]")
    (tmp_path / f"000.show.{SESSION}.txt").write_text("x")
    monkeypatch.setattr(
        linguist, "_linguist_config", lambda: SimpleNamespace(ingest_saved_dir=str(tmp_path))
    )
    monkeypatch.setattr(mouthpiece.linguist_io, "TRANSCRIPT_DIR", tmp_path)
    monkeypatch.setattr(heartwood, "faerrin_session", lambda _d, transcript_dir: "show")


class Pipeline:
    """Ticks every stage sensor, each with its own cursor, as the daemon does."""

    def __init__(self, defs: dg.Definitions, instance: dg.DagsterInstance) -> None:
        self.defs, self.instance = defs, instance
        self.cursors: dict[str, str | None] = dict.fromkeys(SENSORS)

    def tick(self) -> dict[str, list[tuple[str | None, set[str], dict[str, str]]]]:
        out = {}
        for name in SENSORS:
            requests, self.cursors[name] = automation_tick(
                self.defs, name, self.instance, self.cursors[name]
            )
            out[name] = [
                (
                    r.partition_key,
                    {k.to_user_string() for k in r.asset_selection or []},
                    dict(r.tags),
                )
                for r in requests
            ]
        return {name: reqs for name, reqs in out.items() if reqs}


def check_passed(instance: dg.DagsterInstance) -> None:
    instance.report_runless_asset_event(
        dg.AssetCheckEvaluation(
            asset_key=dg.AssetKey("session_transcript"),
            check_name="transcript_not_empty",
            passed=True,
            partition=SESSION,
        )
    )


@pytest.mark.usefixtures("files")
def test_a_new_session_flows_through_every_stage_once(definitions: ModuleType) -> None:
    instance = sessions_instance()
    pipeline = Pipeline(definitions.defs, instance)
    assert pipeline.tick() == {}

    # craig_drop_sensor adds the session and scribe's run materializes the transcript.
    instance.add_dynamic_partitions("sessions", [SESSION])
    mark_materialized(instance, "session_transcript", SESSION)
    check_passed(instance)
    ((key, assets, _tags),) = pipeline.tick()["linguist_automation"]
    assert (key, assets) == (SESSION, {"session_transcripts", "session_episode_summary"})
    queue_partition(instance, "session_transcripts", SESSION)

    # linguist's run writes the canonical transcript: heartwood starts, with its tag.
    mark_materialized(instance, "session_transcripts", SESSION)
    ticked = pipeline.tick()
    assert list(ticked) == ["heartwood_automation"]
    ((key, assets, tags),) = ticked["heartwood_automation"]
    assert (key, assets) == (SESSION, {"session_wiki"})
    assert tags.items() >= heartwood.CONCURRENCY_TAG.items()
    queue_partition(instance, "session_wiki", SESSION)

    # ...then the episode summary: the chronicle gate opens the episode graph.
    mark_materialized(instance, "session_episode_summary", SESSION)
    ticked = pipeline.tick()
    assert list(ticked) == ["mouthpiece_automation"]
    ((key, assets, _tags),) = ticked["mouthpiece_automation"]
    assert (key, assets) == (
        SESSION,
        {
            "session_digest",
            "session_brief",
            "session_script",
            "session_audio_clips",
            "session_episode",
        },
    )
    queue_partition(instance, "session_digest", SESSION)

    # Re-running scribe and linguist by hand launches nothing: every stage was tried.
    mark_materialized(instance, "session_transcript", SESSION)
    mark_materialized(instance, "session_transcripts", SESSION)
    mark_materialized(instance, "session_episode_summary", SESSION)
    assert pipeline.tick() == {}
    assert pipeline.tick() == {}
