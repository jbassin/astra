"""`publish_snapshot` refuses a missing corpus dir and a catalog that shrinks."""

from __future__ import annotations

from pathlib import Path

import pytest
from astra_mouthpiece.episodes_index import EpisodesIndex
from astra_mouthpiece.publish import PublishRefusedError, main, publish_snapshot

GOLDEN = Path(__file__).parent / "fixtures" / "golden"


def _corpus(root: Path, limit: int | None = None) -> Path:
    """Lay the first `limit` golden sessions out as `episodes_path/<id>/{script,digest}.json`."""
    scripts = sorted(GOLDEN.glob("*.script.json"))[:limit]
    for script_path in scripts:
        sid = script_path.name[: -len(".script.json")]
        d = root / sid
        d.mkdir(parents=True)
        (d / "script.json").write_text(script_path.read_text())
        (d / "digest.json").write_text((GOLDEN / f"{sid}.digest.json").read_text())
    return root


def _count(snapshot: Path) -> int:
    return len(EpisodesIndex.model_validate_json(snapshot.read_text()).episodes)


def test_publishes_then_grows(tmp_path: Path) -> None:
    snapshot = tmp_path / "snapshot" / "episodes-index.json"
    n = publish_snapshot(snapshot, corpus_dir=_corpus(tmp_path / "small", limit=2))
    assert n == 2 and _count(snapshot) == 2
    n = publish_snapshot(snapshot, corpus_dir=_corpus(tmp_path / "full"))
    assert n > 2 and _count(snapshot) == n


def test_refuses_a_missing_corpus_dir(tmp_path: Path) -> None:
    snapshot = tmp_path / "episodes-index.json"
    with pytest.raises(PublishRefusedError, match="missing"):
        publish_snapshot(snapshot, corpus_dir=tmp_path / "nope")
    assert not snapshot.exists()


def test_refuses_a_shrinking_catalog_unless_allowed(tmp_path: Path) -> None:
    snapshot = tmp_path / "episodes-index.json"
    full = publish_snapshot(snapshot, corpus_dir=_corpus(tmp_path / "full"))
    before = snapshot.read_text()
    small = _corpus(tmp_path / "small", limit=1)
    with pytest.raises(PublishRefusedError, match="fewer than"):
        publish_snapshot(snapshot, corpus_dir=small)
    assert snapshot.read_text() == before
    # An empty corpus dir (a half-mounted volume) is the same refusal.
    (tmp_path / "empty").mkdir()
    with pytest.raises(PublishRefusedError, match="fewer than"):
        publish_snapshot(snapshot, corpus_dir=tmp_path / "empty")
    assert publish_snapshot(snapshot, corpus_dir=small, allow_shrink=True) == 1 < full


def test_main_rejects_unknown_flags(capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["--force"]) == 2
    assert "usage" in capsys.readouterr().err
