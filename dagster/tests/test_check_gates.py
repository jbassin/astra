"""A failed scribe check keeps linguist from launching.

A failed blocking check fails its run but leaves the checked asset materialized, and
linguist's trigger is that materialization. This runs the real scribe assets and checks
(zip, ffmpeg and Groq stubbed) and then ticks the code location's real
``linguist_automation`` sensor, gates included, over the same instance.
"""

from pathlib import Path
from types import ModuleType, SimpleNamespace
from typing import Any

import astra_linguist.assets as linguist
import dagster as dg
import pytest
from astra_pipeline_resources.testing import (
    FakeConfig,
    automation_tick,
    paths_under,
    sessions_instance,
)
from astra_scribe import assets as scribe


def _scribe_run(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, instance: dg.DagsterInstance, key: str, n: int
) -> bool:
    """Materialize the scribe assets and checks for ``key`` with an ``n``-segment transcript."""
    config = FakeConfig()
    config.cfg.scribe.groq_api_key = None
    monkeypatch.setattr(scribe.Roster, "from_being", classmethod(lambda cls, _p: cls(set())))
    monkeypatch.setattr(scribe, "_find_zip", lambda _inc, _key: Path("fake.zip"))

    def extract(_zip: Any, dest: Path | str, _roster: Any, **_kw: Any) -> list[Path]:
        Path(dest).mkdir(parents=True, exist_ok=True)
        (Path(dest) / "1-a.aac").write_bytes(b"aac")
        return [Path(dest) / "1-a.aac"]

    monkeypatch.setattr(scribe, "extract_session_tracks", extract)
    monkeypatch.setattr(scribe, "merge_audio", lambda _t, out, **_kw: Path(out).write_bytes(b"m"))
    monkeypatch.setattr(
        scribe, "build_transcript", lambda *_a, **_kw: [{"text": "hi"} for _ in range(n)]
    )
    monkeypatch.setattr(scribe, "_sessions_counter", SimpleNamespace(add=lambda _n: None))
    result = dg.materialize(
        [*scribe.SCRIBE_ASSETS, *scribe.SCRIBE_CHECKS],
        partition_key=key,
        instance=instance,
        resources={"astra_config": config, "pipeline_paths": paths_under(tmp_path)},
        raise_on_error=False,
    )
    return result.success


def test_an_empty_transcript_never_launches_linguist(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, definitions: ModuleType
) -> None:
    saved = paths_under(tmp_path).linguist_saved
    monkeypatch.setattr(
        linguist, "_linguist_config", lambda: SimpleNamespace(ingest_saved_dir=saved)
    )
    instance = sessions_instance("2026-9-26", "2026-10-5")
    _, cursor = automation_tick(definitions.defs, "linguist_automation", instance)

    assert not _scribe_run(monkeypatch, tmp_path, instance, "2026-9-26", 0)
    assert _scribe_run(monkeypatch, tmp_path, instance, "2026-10-5", 4901)
    transcript = dg.AssetKey("session_transcript")
    assert instance.get_materialized_partitions(transcript) == {"2026-9-26", "2026-10-5"}

    requests, cursor = automation_tick(definitions.defs, "linguist_automation", instance, cursor)
    assert [r.partition_key for r in requests] == ["2026-10-5"]
    requests, _ = automation_tick(definitions.defs, "linguist_automation", instance, cursor)
    assert requests == []
