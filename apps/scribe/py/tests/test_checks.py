"""scribe's blocking session checks through ``dg.materialize``.

The zip, ffmpeg and Groq seams are stubbed as in ``test_scribe.py``; the checks read real
zip files that the tests write under ``tmp_path`` (padded past the stub floor).
"""

import json
import os
import zipfile
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import dagster as dg
import pytest
from astra_pipeline_resources.testing import FakeConfig, paths_under, sessions_instance
from astra_scribe import assets
from astra_scribe.sensor import MIN_ZIP_BYTES, read_info, read_recording, stray_recordings

DATE = "2026-10-5"
REAL = "craig_hQEYwwabQv9w_2026-10-5_23-33-14.aac.zip"
UNDATED = "craig-hQEYwwabQv9w-IZKX8AMUPTf3q-fStU_vOLIi5rpTs1.aac.zip"


def _craig_zip(path: Path, recording: str, start: str = "2026-10-05T23:33:14.618Z") -> Path:
    """A real-sized Craig zip: an ``info.txt`` like Craig's plus padding past the floor."""
    path.parent.mkdir(parents=True, exist_ok=True)
    info = f"Recording {recording}\n\nGuild:\t\tTellers\nStart time:\t{start}\n\nTracks:\n"
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_STORED) as archive:
        archive.writestr("info.txt", info)
        archive.writestr("raw.dat", b"\0" * MIN_ZIP_BYTES)
    return path


def _resources(monkeypatch: pytest.MonkeyPatch, tmp_path: Path, segments: int) -> dict[str, Any]:
    """Stub the extract/merge/transcribe seams; the transcript has ``segments`` lines."""
    config = FakeConfig()
    config.cfg.scribe.groq_api_key = None
    monkeypatch.setattr(assets.Roster, "from_being", classmethod(lambda cls, _p: cls(set())))
    monkeypatch.setattr(assets, "_find_zip", lambda _inc, _key: Path("fake.zip"))

    def fake_extract(_zip: Any, dest: Path | str, _roster: Any, **_kw: Any) -> list[Path]:
        Path(dest).mkdir(parents=True, exist_ok=True)
        track = Path(dest) / "1-miked6187.aac"
        track.write_bytes(b"aac")
        return [track]

    monkeypatch.setattr(assets, "extract_session_tracks", fake_extract)
    monkeypatch.setattr(assets, "merge_audio", lambda _t, out, **_kw: Path(out).write_bytes(b"m"))
    monkeypatch.setattr(
        assets,
        "build_transcript",
        lambda *_a, **_kw: [{"start": i, "end": i + 1, "text": "hi"} for i in range(segments)],
    )
    monkeypatch.setattr(assets, "_sessions_counter", SimpleNamespace(add=lambda _n: None))
    return {"astra_config": config, "pipeline_paths": paths_under(tmp_path)}


def _run(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, *, segments: int = 120
) -> tuple[dg.ExecuteInProcessResult, dg.DagsterInstance]:
    instance = sessions_instance(DATE)
    result = dg.materialize(
        [*assets.SCRIBE_ASSETS, *assets.SCRIBE_CHECKS],
        partition_key=DATE,
        instance=instance,
        resources=_resources(monkeypatch, tmp_path, segments),
        raise_on_error=False,
    )
    return result, instance


def _checks(result: dg.ExecuteInProcessResult) -> dict[str, dg.AssetCheckEvaluation]:
    return {e.check_name: e for e in result.get_asset_check_evaluations()}


def _saved(tmp_path: Path) -> Path:
    return tmp_path / "scribe" / "data" / "saved" / DATE


def _incoming(tmp_path: Path) -> Path:
    return tmp_path / "scribe" / "incoming"


def test_every_check_passes_for_one_dated_recording(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    _craig_zip(_incoming(tmp_path) / REAL, "hQEYwwabQv9w")
    # An aborted-start stub on the same date is not a second recording.
    (_incoming(tmp_path) / "craig_EQJ0J7q9fe2T_2026-10-5_23-31-24.aac.zip").write_bytes(b"x" * 912)
    result, _ = _run(monkeypatch, tmp_path)
    assert result.success
    checks = _checks(result)
    assert set(checks) == {"single_recording", "no_undated_recording", "transcript_not_empty"}
    assert all(c.passed for c in checks.values())
    assert checks["transcript_not_empty"].metadata["segments"] == dg.IntMetadataValue(120)
    assert not (tmp_path / "scribe" / "tmp" / DATE).exists()  # cleanup ran


def test_a_hard_linked_undated_name_is_the_same_recording(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """The 2026-10-5 recovery: the undated original kept next to its dated hard link."""
    real = _craig_zip(_incoming(tmp_path) / REAL, "hQEYwwabQv9w")
    os.link(real, _incoming(tmp_path) / UNDATED)
    result, _ = _run(monkeypatch, tmp_path)
    assert result.success
    assert all(c.passed for c in _checks(result).values())


def test_a_second_recording_on_the_date_blocks_transcription(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """The 2026-9-26 case: two real zips for one date. Groq must not run."""
    _craig_zip(
        _incoming(tmp_path) / "craig_gd2cviJRhL0Q_2026-10-5_17-43-41.aac.zip", "gd2cviJRhL0Q"
    )
    _craig_zip(
        _incoming(tmp_path) / "craig_xhzWjJp5Tga6_2026-10-5_22-44-56.aac.zip", "xhzWjJp5Tga6"
    )
    result, _ = _run(monkeypatch, tmp_path)
    assert not result.success
    check = _checks(result)["single_recording"]
    assert not check.passed
    assert DATE in (check.description or "")
    assert check.metadata["session"] == dg.TextMetadataValue(DATE)
    assert not (_saved(tmp_path) / "script.json").exists()  # the transcript was skipped
    assert not (_saved(tmp_path) / "audio.mp3").exists()


def test_an_undated_zip_for_the_session_blocks_transcription(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    _craig_zip(_incoming(tmp_path) / REAL, "hQEYwwabQv9w")
    _craig_zip(_incoming(tmp_path) / UNDATED.replace("hQEY", "ZZZZ"), "ZZZZwwabQv9w")
    result, _ = _run(monkeypatch, tmp_path)
    assert not result.success
    checks = _checks(result)
    assert checks["single_recording"].passed  # only one dated recording
    undated = checks["no_undated_recording"]
    assert not undated.passed
    assert DATE in (undated.description or "")
    assert not (_saved(tmp_path) / "script.json").exists()


def test_an_empty_transcript_fails_and_keeps_the_tracks(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """The 2026-9-26 outcome: a run that "succeeded" with `"script": []`."""
    _craig_zip(_incoming(tmp_path) / REAL, "hQEYwwabQv9w")
    result, instance = _run(monkeypatch, tmp_path, segments=0)
    assert not result.success
    check = _checks(result)["transcript_not_empty"]
    assert not check.passed
    assert DATE in (check.description or "")
    assert json.loads((_saved(tmp_path) / "script.json").read_text()) == []
    # The asset still counts as materialized; only the gate stops linguist (see dagster/tests).
    assert DATE in instance.get_materialized_partitions(dg.AssetKey("session_transcript"))
    assert (tmp_path / "scribe" / "tmp" / DATE / "tracks").is_dir()  # cleanup was skipped


def test_the_sensor_job_runs_the_checks() -> None:
    """The run craig_drop_sensor launches includes every check, so they gate live runs."""
    job = assets.defs.get_repository_def().get_job("__anonymous_asset_job_craig_drop_sensor")
    selected = job.asset_layer.asset_graph.asset_check_keys
    assert {c.name for c in selected} == {
        "single_recording",
        "no_undated_recording",
        "transcript_not_empty",
    }
    for check in assets.SCRIBE_CHECKS:
        assert all(spec.blocking for spec in check.check_specs)


# ── reading Craig zips ──────────────────────────────────────────────────────
def test_read_info_takes_the_utc_start_date(tmp_path: Path) -> None:
    late = _craig_zip(tmp_path / "a.zip", "abc", start="2026-10-05T23:59:59-04:00")
    assert read_info(late) == ("abc", "2026-10-6")
    assert read_info(tmp_path / "missing.zip") == ("", "")
    (tmp_path / "bad.zip").write_bytes(b"not a zip")
    assert read_info(tmp_path / "bad.zip") == ("", "")


def test_a_dated_name_is_read_without_opening_the_zip(tmp_path: Path) -> None:
    path = tmp_path / REAL
    path.write_bytes(b"not a zip at all")
    rec = read_recording(path)
    assert (rec.recording_id, rec.key, rec.dated) == ("hQEYwwabQv9w", DATE, True)


# ── craig_drop_sensor names undated zips ────────────────────────────────────
def _tick(monkeypatch: pytest.MonkeyPatch, incoming: Path, cursor: str | None = None) -> Any:
    monkeypatch.setattr(
        assets,
        "load_config",
        lambda: SimpleNamespace(scribe=SimpleNamespace(incoming_path=str(incoming))),
    )
    context = dg.build_sensor_context(instance=sessions_instance(DATE), cursor=cursor)
    return assets.craig_drop_sensor(context)


def test_the_sensor_names_an_undated_zip_and_warns_once(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    _craig_zip(tmp_path / UNDATED, "hQEYwwabQv9w")
    first = _tick(monkeypatch, tmp_path)
    assert not first.run_requests
    reason = first.skip_reason.skip_message
    assert UNDATED in reason and DATE in reason
    assert json.loads(first.cursor) == {"warned": [UNDATED]}
    assert [r for r in caplog.records if UNDATED in r.getMessage()]
    caplog.clear()
    again = _tick(monkeypatch, tmp_path, first.cursor)
    assert again.skip_reason == first.skip_reason  # still shown in the UI
    assert not [r for r in caplog.records if UNDATED in r.getMessage()]  # but logged once


def test_the_sensor_is_quiet_once_the_undated_zip_has_a_dated_name(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    undated = _craig_zip(tmp_path / UNDATED, "hQEYwwabQv9w")
    os.link(undated, tmp_path / REAL)
    result = _tick(monkeypatch, tmp_path)
    assert result.skip_reason is None
    assert stray_recordings([read_recording(tmp_path / REAL), read_recording(undated)]) == []
