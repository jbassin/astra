from __future__ import annotations

from pathlib import Path

import pytest
from astra_assay.snapshot import SnapshotNotFoundError, resolve_snapshot


def test_missing_data_root_raises_clear_error(tmp_path: Path) -> None:
    with pytest.raises(SnapshotNotFoundError, match="no Foundry snapshot"):
        resolve_snapshot(tmp_path)


def test_missing_version_dir_raises(tmp_path: Path) -> None:
    (tmp_path / "snapshots" / "foundry").mkdir(parents=True)
    with pytest.raises(SnapshotNotFoundError, match="pf2e-\\* version directory"):
        resolve_snapshot(tmp_path)


def test_missing_spells_subtree_raises(tmp_path: Path) -> None:
    version_dir = tmp_path / "snapshots" / "foundry" / "pf2e-9.9.9"
    version_dir.mkdir(parents=True)
    with pytest.raises(SnapshotNotFoundError, match="packs/pf2e/spells/spells"):
        resolve_snapshot(tmp_path)


def test_resolves_newest_version_and_globs_files(tmp_path: Path) -> None:
    for version in ("pf2e-8.2.0", "pf2e-8.3.0"):
        spells_dir = (
            tmp_path / "snapshots" / "foundry" / version / "packs" / "pf2e" / "spells" / "spells"
        )
        (spells_dir / "cantrip").mkdir(parents=True)
        (spells_dir / "cantrip" / "test-spell.json").write_text("{}", encoding="utf-8")

    paths = resolve_snapshot(tmp_path)
    assert paths.version_dir.name == "pf2e-8.3.0"

    from astra_assay.snapshot import iter_spell_files

    files = iter_spell_files(paths.spells_dir)
    assert len(files) == 1
    assert files[0].name == "test-spell.json"
