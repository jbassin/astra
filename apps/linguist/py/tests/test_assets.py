"""The linguist assets run through ``dg.materialize`` with fake resources.

Paths point under ``tmp_path`` and the LLM is a stub, so no key, no network and no money.
The being.kdl roster and the lexicon corrections are the real ones (read-only repo files).
"""

import json
from pathlib import Path
from typing import Any

import dagster as dg
from astra_linguist import assets
from astra_linguist.campaigns import _character_names, campaign_views
from astra_linguist.chronicle import (
    Chronicle,
    EpisodeEntry,
    EpisodeSummary,
    SeasonBoundary,
    SeasonPlan,
    show_index,
)
from astra_ontology import load_being
from astra_ontology_being import BEING_KDL_PATH
from astra_pipeline_resources.partitions import SESSIONS_NAME
from astra_pipeline_resources.testing import FakeConfig, FakeLlm, paths_under
from astra_sessions import MIN_TRANSCRIPT_SEGMENTS

DATE = "2025-1-6"

_SUMMARY = EpisodeSummary(
    title="A Title",
    synopsis="Things happen.",
    key_beats=["one", "two"],
    characters_present=[],
    locations=[],
    factions=[],
    items=[],
    cliffhanger="",
)


class _Client:
    """Answers every structured call with a canned value per output model; counts calls."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []

    def call_structured(self, output_model: type[Any], **kwargs: Any) -> Any:
        self.calls.append((output_model.__name__, kwargs["model"]))
        if output_model is EpisodeSummary:
            return _SUMMARY
        # Any start date works: the plan is normalized to start at the first episode.
        return SeasonPlan(seasons=[SeasonBoundary(title="S1", arc_summary="a", start_date="")])


def _resources(tmp_path: Path, client: _Client) -> tuple[dict[str, Any], FakeLlm, FakeConfig]:
    llm = FakeLlm(client)
    config = FakeConfig()
    config.cfg.llm.default_model = "test/chronicle-model"
    resources = {"astra_config": config, "pipeline_paths": paths_under(tmp_path), "llm": llm}
    return resources, llm, config


def _instance(*dates: str) -> dg.DagsterInstance:
    instance = dg.DagsterInstance.ephemeral()
    instance.add_dynamic_partitions(SESSIONS_NAME, list(dates))
    return instance


def test_session_writes_outputs_and_summarizes_with_the_configured_model(
    tmp_path: Path,
) -> None:
    """scribe's script.json → data, context script, canonical transcript, then one episode
    summary from the injected client on `llm.default-model`."""
    # A session that clears the campaign-match threshold for the first being.kdl campaign.
    campaign = campaign_views(load_being(BEING_KDL_PATH))[0]
    name = _character_names(campaign)[0]
    raw = [
        {"start": float(i), "end": i + 0.5, "user": "someone", "text": f" {name} acts."}
        for i in range(MIN_TRANSCRIPT_SEGMENTS)
    ]
    saved = tmp_path / "scribe" / "data" / "saved" / DATE
    saved.mkdir(parents=True)
    (saved / "script.json").write_text(json.dumps(raw))
    client = _Client()
    resources, llm, _config = _resources(tmp_path, client)

    result = dg.materialize(
        [assets.session_transcripts, assets.session_episode_summary],
        partition_key=DATE,
        instance=_instance(DATE),
        resources=resources,
    )

    assert result.success
    assert (tmp_path / "linguist" / "data" / f"{DATE}.json").exists()
    canonical = list((tmp_path / "linguist" / "transcripts").glob(f"*.{DATE}.txt"))
    context = list((tmp_path / "linguist" / "script").glob(f"*.{DATE}.txt"))
    assert len(canonical) == 1 and len(context) == 1
    entry = EpisodeEntry.model_validate_json(
        (tmp_path / "linguist" / "timeline" / "episodes" / f"{DATE}.json").read_text()
    )
    assert entry.summary == _SUMMARY
    assert canonical[0].name.split(".")[1] == entry.show
    assert client.calls == [("EpisodeSummary", "test/chronicle-model")]
    assert llm.clients == 1


def test_an_empty_transcript_is_refused_and_nothing_is_written(tmp_path: Path) -> None:
    """A hand materialize past scribe's `transcript_not_empty` gate: linguist fails without a
    retry, writes no dataset for linguist-commit to publish, and never calls the LLM."""
    raw = [{"start": float(i), "end": i + 0.5, "user": "someone", "text": " hi"} for i in range(3)]
    for lines in ([], raw):
        saved = tmp_path / "scribe" / "data" / "saved" / DATE
        saved.mkdir(parents=True, exist_ok=True)
        (saved / "script.json").write_text(json.dumps(lines))
        client = _Client()
        resources, llm, _config = _resources(tmp_path, client)
        result = dg.materialize(
            [assets.session_transcripts, assets.session_episode_summary],
            partition_key=DATE,
            instance=_instance(DATE),
            resources=resources,
            raise_on_error=False,
        )
        assert not result.success
        (failure,) = [e for e in result.all_events if e.is_step_failure]
        user_failure = failure.step_failure_data.user_failure_data
        assert user_failure is not None
        assert f"{len(lines)} segments" in (user_failure.description or "")
        assert not (tmp_path / "linguist").exists()
        assert llm.clients == 0 and client.calls == []


def test_unmatched_session_skips_the_summary_without_a_client(tmp_path: Path) -> None:
    """No transcript for the date → not a chronicle show → no LLM client is even built."""
    client = _Client()
    resources, llm, _config = _resources(tmp_path, client)
    result = dg.materialize(
        [assets.session_episode_summary],
        partition_key=DATE,
        instance=_instance(DATE),
        resources=resources,
    )
    assert result.success
    assert llm.clients == 0 and client.calls == []
    assert not (tmp_path / "linguist" / "timeline" / "episodes").exists()


def _write_entry(episodes: Path, date: str, show: str) -> None:
    episodes.mkdir(parents=True, exist_ok=True)
    entry = EpisodeEntry(date=date, show=show, summary=_SUMMARY)
    (episodes / f"{date}.json").write_text(entry.model_dump_json())


def test_campaign_timeline_rebuilds_once_then_skips_while_inputs_are_unchanged(
    tmp_path: Path,
) -> None:
    slug = next(iter(show_index()))  # any real campaign from being.kdl
    episodes = tmp_path / "linguist" / "timeline" / "episodes"
    _write_entry(episodes, "2025-1-6", slug)
    _write_entry(episodes, "2025-1-13", slug)
    client = _Client()
    resources, llm, _config = _resources(tmp_path, client)

    first = dg.materialize([assets.campaign_timeline], resources=resources)
    seasons = tmp_path / "linguist" / "timeline" / "seasons.json"
    assert first.success
    chronicle = Chronicle.model_validate_json(seasons.read_text())
    assert [s.show for s in chronicle.shows] == [slug]
    assert chronicle.inputs_hash is not None
    assert client.calls == [("SeasonPlan", "test/chronicle-model")]

    second = dg.materialize([assets.campaign_timeline], resources=resources)
    assert second.success
    meta = second.asset_materializations_for_node("campaign_timeline")[0].metadata
    assert meta["status"] == dg.TextMetadataValue("unchanged")
    assert len(client.calls) == 1 and llm.clients == 1  # no second paid call


def test_campaign_timeline_with_no_episodes_is_a_no_op(tmp_path: Path) -> None:
    resources, llm, _config = _resources(tmp_path, _Client())
    result = dg.materialize([assets.campaign_timeline], resources=resources)
    assert result.success
    assert llm.clients == 0
    assert not (tmp_path / "linguist" / "timeline" / "seasons.json").exists()


# ── campaign_timeline_sensor: runs when a summary lands and the inputs changed ──


def _summary_done(instance: dg.DagsterInstance, date: str) -> None:
    """Record a `session_episode_summary` materialization for ``date``, as a run would."""
    instance.report_runless_asset_event(
        dg.AssetMaterialization(asset_key="session_episode_summary", partition=date)
    )


def _tick(
    monkeypatch: Any, tmp_path: Path, instance: dg.DagsterInstance, cursor: str | None = None
) -> dg.SensorResult:
    monkeypatch.setattr(assets, "_timeline_paths", lambda: paths_under(tmp_path))
    result = assets.campaign_timeline_sensor(
        dg.build_sensor_context(instance=instance, cursor=cursor)
    )
    assert isinstance(result, dg.SensorResult)
    return result


def test_timeline_sensor_waits_for_a_summary(monkeypatch: Any, tmp_path: Path) -> None:
    _write_entry(tmp_path / "linguist" / "timeline" / "episodes", DATE, next(iter(show_index())))
    result = _tick(monkeypatch, tmp_path, _instance(DATE))
    assert not result.run_requests and result.cursor is None


def test_timeline_sensor_runs_once_per_new_summary_when_inputs_changed(
    monkeypatch: Any, tmp_path: Path
) -> None:
    _write_entry(tmp_path / "linguist" / "timeline" / "episodes", DATE, next(iter(show_index())))
    instance = _instance(DATE)
    _summary_done(instance, DATE)

    first = _tick(monkeypatch, tmp_path, instance)
    assert len(first.run_requests or []) == 1
    assert first.cursor is not None
    # The same summary again: nothing new, so no second request.
    again = _tick(monkeypatch, tmp_path, instance, cursor=first.cursor)
    assert not again.run_requests


def test_timeline_sensor_starts_no_run_for_unchanged_inputs(
    monkeypatch: Any, tmp_path: Path
) -> None:
    """A summary that changes no episode (an unmatched session's skip) starts no paid run."""
    slug = next(iter(show_index()))
    _write_entry(tmp_path / "linguist" / "timeline" / "episodes", DATE, slug)
    resources, _llm, _config = _resources(tmp_path, _Client())
    assert dg.materialize([assets.campaign_timeline], resources=resources).success
    instance = _instance(DATE, "2025-1-13")
    _summary_done(instance, "2025-1-13")

    result = _tick(monkeypatch, tmp_path, instance)
    assert not result.run_requests
    assert result.cursor is not None  # seen, so the next tick does not re-check it


def test_timeline_sensor_waits_while_a_timeline_run_is_in_flight(
    monkeypatch: Any, tmp_path: Path
) -> None:
    _write_entry(tmp_path / "linguist" / "timeline" / "episodes", DATE, next(iter(show_index())))
    instance = _instance(DATE)
    _summary_done(instance, DATE)
    job = assets.defs.get_repository_def().get_job("__anonymous_asset_job_campaign_timeline_sensor")
    instance.create_run_for_job(
        job_def=job,
        asset_selection=frozenset({assets.campaign_timeline.key}),
        status=dg.DagsterRunStatus.STARTED,
    )

    result = _tick(monkeypatch, tmp_path, instance)
    assert not result.run_requests
    assert result.cursor is None  # not consumed: the next tick looks again


def test_defs_bind_the_shared_resources() -> None:
    repo = assets.defs.get_repository_def()
    assert {"astra_config", "pipeline_paths", "llm"} <= set(repo.get_top_level_resources())
