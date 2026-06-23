"""The committed `snapshot/episodes-index.json` build fixture + its freshness gate.

mouthpiece-frontend (0012) reads a **committed** `episodes-index.json` at build (the
akasha-snapshot pattern — a deterministic build artifact, no live backend). This
generates that snapshot from the 14 golden fixtures through the **production path**
(`discover_sessions` over a session-dir layout → `build_index`), so the committed
file is byte-identical to what the live `episodes_index` asset would emit over the
same sessions. Audio fields are 0/false/"" here (no mp3s in git); the real seed
(slice 6) regenerates them with `ffprobe` durations.

Regenerate after any asset change:  ``UPDATE_SNAPSHOT=1 uv run pytest -k snapshot``.
"""

from __future__ import annotations

import os
from pathlib import Path

from astra_mouthpiece.assets import _arc_maps, _episode_hosts
from astra_mouthpiece.episodes_index import build_index, discover_sessions

GOLDEN = Path(__file__).parent / "fixtures" / "golden"
SNAPSHOT = Path(__file__).parents[1] / "snapshot" / "episodes-index.json"


def _build_snapshot(tmp_path: Path) -> str:
    """Lay the golden fixtures out as `episodes_path/<id>/{script,digest}.json` and
    run the exact production path the asset uses → indented camelCase JSON."""
    for script_path in sorted(GOLDEN.glob("*.script.json")):
        sid = script_path.name[: -len(".script.json")]
        d = tmp_path / sid
        d.mkdir()
        (d / "script.json").write_text(script_path.read_text())
        (d / "digest.json").write_text((GOLDEN / f"{sid}.digest.json").read_text())

    sessions = discover_sessions(tmp_path)
    arc_titles, arc_main = _arc_maps()
    index = build_index(sessions, arc_titles=arc_titles, arc_main=arc_main, hosts=_episode_hosts())
    return index.model_dump_json(indent=2, by_alias=True) + "\n"


def test_committed_snapshot_is_fresh(tmp_path: Path) -> None:
    generated = _build_snapshot(tmp_path)
    if os.environ.get("UPDATE_SNAPSHOT"):
        SNAPSHOT.parent.mkdir(parents=True, exist_ok=True)
        SNAPSHOT.write_text(generated)
    assert SNAPSHOT.exists(), "snapshot missing — run UPDATE_SNAPSHOT=1 pytest -k snapshot"
    assert SNAPSHOT.read_text() == generated, (
        "snapshot/episodes-index.json is stale — regenerate with "
        "`UPDATE_SNAPSHOT=1 uv run pytest -k snapshot`"
    )


def test_snapshot_shape_for_the_frontend(tmp_path: Path) -> None:
    import json

    data = json.loads(_build_snapshot(tmp_path))
    assert len(data["episodes"]) == 7
    first = data["episodes"][0]
    # the load-bearing fields the frontend's build-content reads
    assert first["arcTitle"] == "Through a Song, Darkly"
    assert first["episodeNo"] == 1
    assert first["transcript"][0]["name"] in {"Bram", "Maeve", "Pip"}
    # mega recap sorts last with episodeNo 0
    assert data["episodes"][-1]["episodeNo"] == 0
