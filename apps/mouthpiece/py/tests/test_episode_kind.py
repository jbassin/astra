"""The explicit episode kind (0037 PIPE-22) and its reader for files written before it.

The file shapes below are the ones on disk in ``mouthpiece/episodes`` (listed 2026-10-24):
a live session dir (script ``hosts/session_id/title/turns``, digest with ``stats``), a recap
capstone (digest ``{session_id, synopsis}``), and the faerrin-era dirs (camelCase
``sessionId``). None of them carries ``kind``.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from astra_mouthpiece.episodes_index import (
    EpisodeEntry,
    SessionInput,
    build_episode_numbers,
    build_index,
    discover_sessions,
)
from astra_mouthpiece.models import (
    EpisodeKind,
    Script,
    SessionDigest,
    kind_from_id,
    stored_kind,
)
from astra_ontology.sessions import parse_session_overrides
from pydantic import ValidationError

SHOW = "000.through-a-song-darkly"
HOSTS = {"a": {"name": "Bram", "persona": "p"}, "b": {"name": "Maeve", "persona": "p"}, "c": None}
STATS = {"lines": 10, "kept_lines": 8, "windows": 2, "dropped_windows": 0}


def _script(sid: str, **extra: object) -> dict:
    turns = [{"speaker": "A", "text": "hi"}]
    return {"session_id": sid, "title": "T", "hosts": HOSTS, "turns": turns, **extra}


def test_old_files_read_their_kind_from_the_id() -> None:
    session = f"{SHOW}.2026-10-5"
    recap = f"{SHOW}.2026-10-12-recap-of-2026-8-24"
    assert Script.model_validate(_script(session)).kind == "session"
    assert Script.model_validate(_script(recap)).kind == "recap"
    digest = SessionDigest.model_validate({"session_id": session, "synopsis": "s", "stats": STATS})
    assert digest.kind == "session" and digest.session_stats().lines == 10
    # A recap capstone's digest is just {session_id, synopsis}: valid, with no stats.
    capstone = SessionDigest.model_validate({"session_id": recap, "synopsis": "s"})
    assert capstone.kind == "recap" and capstone.stats is None


def test_a_stored_kind_wins_over_the_id() -> None:
    sid = f"{SHOW}.2026-10-19-recap-of-2025-8-28"
    assert Script.model_validate(_script(sid, kind="special")).kind == "special"
    assert stored_kind({"kind": "special"}, sid) == "special"
    assert stored_kind({"kind": "bogus"}, sid) == "recap"  # an unknown value is ignored
    assert kind_from_id(f"{SHOW}.2026-10-5") == "session"


def test_a_session_digest_needs_stats_and_a_special_does_not() -> None:
    with pytest.raises(ValidationError):
        SessionDigest.model_validate({"session_id": f"{SHOW}.2026-10-5", "synopsis": "s"})
    special = SessionDigest(session_id=f"{SHOW}.2026-10-19", synopsis="s", kind="special")
    with pytest.raises(ValueError):
        special.session_stats()


def test_a_written_script_round_trips_its_kind() -> None:
    script = Script.model_validate(_script(f"{SHOW}.2026-10-5"))
    assert json.loads(script.model_dump_json())["kind"] == "session"


def test_only_sessions_are_numbered() -> None:
    """A special with a plain id (no recap marker) is still left out of the numbering."""
    ids = [f"{SHOW}.2026-10-5", f"{SHOW}.2026-10-12", f"{SHOW}.2026-10-19"]
    numbers = build_episode_numbers(ids, {f"{SHOW}.2026-10-12": "special"})
    assert numbers == {ids[0]: 1, ids[1]: 0, ids[2]: 2}


def test_discovery_reads_old_and_new_dirs(tmp_path: Path) -> None:
    layout = {
        "2026-10-5": (_script(f"{SHOW}.2026-10-5"), {"session_id": "x", "synopsis": "s"}),
        "recap": (_script(f"{SHOW}.2026-10-12-recap-of-2026-8-24"), {"synopsis": "s"}),
        "special": (_script(f"{SHOW}.2026-10-19", kind="special"), {"synopsis": "s"}),
    }
    for name, (script, digest) in layout.items():
        (tmp_path / name).mkdir()
        (tmp_path / name / "script.json").write_text(json.dumps(script))
        (tmp_path / name / "digest.json").write_text(json.dumps(digest))
    kinds = {s.id.rsplit(".", 1)[1]: s.kind for s in discover_sessions(tmp_path)}
    assert kinds == {
        "2026-10-5": "session",
        "2026-10-12-recap-of-2026-8-24": "recap",
        "2026-10-19": "special",
    }


def test_the_catalog_carries_the_kind_and_reads_an_old_snapshot() -> None:
    def entry(sid: str, kind: EpisodeKind | None) -> SessionInput:
        return SessionInput(
            id=sid, title="T", synopsis="s", duration_ms=0, has_audio=False,
            has_transcript=False, audio_version="", kind=kind,
        )  # fmt: skip

    index = build_index(
        [entry(f"{SHOW}.2026-10-19", "special"), entry(f"{SHOW}.2026-10-19-x", None)],
        arc_titles={},
        arc_main={},
        hosts={},
    )
    assert [(e.kind, e.episode_no) for e in index.episodes] == [("session", 1), ("special", 0)]
    dumped = index.episodes[0].model_dump(by_alias=True)
    del dumped["kind"]  # a snapshot published before the field existed
    assert EpisodeEntry.model_validate(dumped).kind == "session"


# ── sessions.kdl overrides (0037 pipe-10) ────────────────────────────────────


def test_the_sidecar_sets_kind_and_title_in_the_catalog(tmp_path: Path) -> None:
    overrides = parse_session_overrides(
        'session "2026-10-19-recap-of-2025-8-28" kind="special"\n'
        'session "2026-10-5" title="A Better Title"\n'
    )
    for sid in (f"{SHOW}.2026-10-5", f"{SHOW}.2026-10-19-recap-of-2025-8-28"):
        (tmp_path / sid).mkdir()
        (tmp_path / sid / "script.json").write_text(json.dumps(_script(sid)))
    found = {s.id: s for s in discover_sessions(tmp_path, overrides)}
    assert found[f"{SHOW}.2026-10-5"].title == "A Better Title"
    assert found[f"{SHOW}.2026-10-5"].kind == "session"
    assert found[f"{SHOW}.2026-10-19-recap-of-2025-8-28"].kind == "special"
    assert found[f"{SHOW}.2026-10-19-recap-of-2025-8-28"].title == "T"


def test_the_committed_sidecar_marks_the_roundtable_special(tmp_path: Path) -> None:
    """The real roundtable dir (2026-10-19, no stored kind) reads as special by default."""
    sid = f"{SHOW}.2026-10-19-recap-of-2025-8-28"
    (tmp_path / sid).mkdir()
    (tmp_path / sid / "script.json").write_text(json.dumps(_script(sid)))
    (found,) = discover_sessions(tmp_path)
    assert found.kind == "special"


def test_a_skipped_session_gets_no_episode(monkeypatch: pytest.MonkeyPatch) -> None:
    from astra_mouthpiece import assets

    overrides = parse_session_overrides('session "2026-9-7" skip=#true')
    monkeypatch.setattr(assets, "session_overrides", lambda: overrides)
    monkeypatch.setattr(assets.linguist_io, "transcript_for", lambda _key, _dir: Path("t.txt"))
    assert not assets.MOUTHPIECE_STAGE.keep("2026-9-7")
    assert assets.MOUTHPIECE_STAGE.keep("2026-9-14")
