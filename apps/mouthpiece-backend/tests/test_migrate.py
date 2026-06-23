"""The historical back-catalog migrator (step 2 — catalog union).

Seeds faerrin's flat ``<id>.script.json``/``<id>.digest.json`` into id-keyed
``episodes_root/<id>/`` dirs, skipping ids already in astra's corpus (live-precedence)
and idempotent on re-run. The committed golden fixtures double as a flat faerrin source.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from astra_mouthpiece.episodes_index import discover_sessions
from astra_mouthpiece.migrate import migrate_history

GOLDEN = Path(__file__).parent / "fixtures" / "golden"  # flat <id>.script.json layout
GOLDEN_IDS = {p.name[: -len(".script.json")] for p in GOLDEN.glob("*.script.json")}
LIVE_ID = "000.through-a-song-darkly.2026-5-7"  # pretend astra already rendered this one


def _seed_live(episodes_root: Path) -> None:
    """A date-keyed live dir whose script carries the snake_case session_id (the
    real pipeline shape) — discover_sessions resolves it to LIVE_ID."""
    d = episodes_root / "2026-5-7"
    d.mkdir(parents=True)
    (d / "script.json").write_text(
        json.dumps({"session_id": LIVE_ID, "title": "Live", "turns": []})
    )


def test_migrate_fills_gaps_skips_live_and_is_idempotent(tmp_path: Path) -> None:
    _seed_live(tmp_path)

    copied, skipped = migrate_history(GOLDEN, tmp_path)
    assert copied == len(GOLDEN_IDS) - 1  # every golden id except the already-live one
    assert skipped == 1

    # every migrated dir has both catalog files
    for eid in GOLDEN_IDS - {LIVE_ID}:
        assert (tmp_path / eid / "script.json").is_file()
        assert (tmp_path / eid / "digest.json").is_file()

    # the union is the full corpus, exactly once each (live render preserved, not clobbered)
    ids = [s.id for s in discover_sessions(tmp_path)]
    assert sorted(ids) == sorted(GOLDEN_IDS)
    assert len(ids) == len(set(ids))

    # re-running copies nothing
    copied2, skipped2 = migrate_history(GOLDEN, tmp_path)
    assert copied2 == 0
    assert skipped2 == len(GOLDEN_IDS)


def test_migrate_missing_source_raises(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        migrate_history(tmp_path / "nope", tmp_path / "episodes")
