"""The committed `snapshot/episodes-index.json` gate (+ the build-path correctness check).

mouthpiece-frontend (0012) reads a **committed** `episodes-index.json` at build (the
akasha-snapshot pattern — a deterministic build artifact, no live backend). Since the
pipeline went live the snapshot is **live-derived** (migrated back-catalog ∪ live renders
under the gitignored `episodes_path`), so there is no in-git source to rebuild-and-compare
byte-for-byte. The gate therefore validates the committed file's **shape + invariants** and
that it never drops the in-git golden baseline — the same content-agnostic posture akasha's
cutover gates took when its pipeline went live. Regenerate it with
`uv run python -m astra_mouthpiece.publish` (or `just mouthpiece-publish`).

The golden fixtures still exercise the **production build path** (`discover_sessions` over a
session-dir layout → `build_index`) deterministically — that's the build-correctness check.
"""

from __future__ import annotations

import json
from pathlib import Path

from astra_mouthpiece.assets import _arc_maps, _episode_hosts
from astra_mouthpiece.episodes_index import EpisodesIndex, build_index, discover_sessions

GOLDEN = Path(__file__).parent / "fixtures" / "golden"
SNAPSHOT = Path(__file__).parents[1] / "snapshot" / "episodes-index.json"
GOLDEN_IDS = {p.name[: -len(".script.json")] for p in GOLDEN.glob("*.script.json")}


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


# ── the committed live-derived snapshot: shape + invariants, not byte-equality ───


def _committed() -> EpisodesIndex:
    assert SNAPSHOT.exists(), "snapshot missing — run `uv run python -m astra_mouthpiece.publish`"
    return EpisodesIndex.model_validate_json(SNAPSHOT.read_text())


def test_committed_snapshot_is_wellformed() -> None:
    index = _committed()
    assert index.episodes, "snapshot has no episodes"
    ids = [e.id for e in index.episodes]
    assert len(ids) == len(set(ids)), "duplicate episode ids in the snapshot"


def test_committed_snapshot_keeps_the_golden_baseline() -> None:
    # live growth may ADD episodes, but it must never drop a known (golden) one — the
    # akasha 'no historical entry lost' posture. Counts are a floor, not exact.
    ids = {e.id for e in _committed().episodes}
    assert ids >= GOLDEN_IDS, f"snapshot dropped golden episodes: {GOLDEN_IDS - ids}"
    assert len(ids) >= len(GOLDEN_IDS)


def test_committed_snapshot_is_sorted_arc_then_date() -> None:
    eps = _committed().episodes
    keys = [(e.arc_no, e.date_sort_key) for e in eps]
    assert keys == sorted(keys), "snapshot not sorted arc-then-date"


def test_committed_snapshot_rows_carry_frontend_fields() -> None:
    row = json.loads(SNAPSHOT.read_text())["episodes"][0]
    for key in ("id", "arcTitle", "episodeNo", "dateSortKey", "hosts", "transcript"):
        assert key in row, f"snapshot row missing {key}"
    assert row["hosts"]["A"]["name"]
    assert row["transcript"], "first episode has no inlined transcript"


# ── build-path correctness over the in-git golden fixtures (deterministic) ───────


def test_build_path_produces_wellformed_catalog_over_golden(tmp_path: Path) -> None:
    data = json.loads(_build_snapshot(tmp_path))
    assert len(data["episodes"]) == 7  # the 7 golden sessions (6 regular + 1 mega recap)
    first = data["episodes"][0]
    assert first["arcTitle"] == "Through a Song, Darkly"
    assert first["episodeNo"] == 1
    assert first["transcript"][0]["name"] in {"Bram", "Maeve", "Pip"}
    # exactly one mega recap (episodeNo 0); every other episode is numbered >= 1
    recaps = [e for e in data["episodes"] if e["episodeNo"] == 0]
    assert len(recaps) == 1
    assert all(e["episodeNo"] >= 1 for e in data["episodes"] if e["episodeNo"] != 0)
