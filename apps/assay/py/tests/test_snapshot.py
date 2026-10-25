from __future__ import annotations

from pathlib import Path

import pytest
from astra_assay.snapshot import (
    SnapshotNotFoundError,
    newest_version_dir,
    resolve_snapshot,
    version_key,
)


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


def test_newest_version_compares_numbers_not_strings(tmp_path: Path) -> None:
    """As strings, pf2e-10.0.0 sorts before pf2e-9.0.0 and pf2e-8.10.0 before
    pf2e-8.9.0; the snapshot picked must be the highest version."""
    foundry = tmp_path / "snapshots" / "foundry"
    for version in ("pf2e-9.0.0", "pf2e-10.0.0", "pf2e-8.10.0", "pf2e-8.9.0"):
        (foundry / version / "packs" / "pf2e" / "spells" / "spells").mkdir(parents=True)
    assert sorted(p.name for p in foundry.iterdir())[-1] == "pf2e-9.0.0"  # the old bug

    assert resolve_snapshot(tmp_path).version_dir.name == "pf2e-10.0.0"


def test_newest_version_dir_minor_and_patch_and_non_versions() -> None:
    names = ["pf2e-8.9.0", "pf2e-8.10.0", "pf2e-8.10.2", "pf2e-latest", "pf2e-8.10.10"]
    assert newest_version_dir([Path(n) for n in names]) == Path("pf2e-8.10.10")
    assert version_key("pf2e-latest") is None
    assert newest_version_dir([Path("pf2e-latest")]) is None


def test_non_version_dirs_alone_raise(tmp_path: Path) -> None:
    (tmp_path / "snapshots" / "foundry" / "pf2e-latest").mkdir(parents=True)
    with pytest.raises(SnapshotNotFoundError, match="pf2e-\\* version directory"):
        resolve_snapshot(tmp_path)
