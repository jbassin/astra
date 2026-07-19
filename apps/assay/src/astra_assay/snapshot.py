"""Locate + enumerate the Foundry spell-pack snapshot (read-only input).

The codex ingest pipeline (0029) writes a gitignored corpus under
``<codex.data-path>/snapshots/foundry/pf2e-<version>/packs/pf2e/spells/spells/``
(main "slot" spells only — focus/rituals sit in sibling dirs, out of round-1
scope per R1). The path root is config-single-source: read from
``cfg.codex.data_path`` via ``astra_config``, never hardcoded. The version
segment is globbed (``pf2e-*``), never pinned, so a snapshot refresh doesn't
require a code change.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


class SnapshotNotFoundError(RuntimeError):
    """The Foundry spell-pack snapshot is absent (fail-soft, clear message)."""


@dataclass(frozen=True)
class SnapshotPaths:
    version_dir: Path
    spells_dir: Path  # .../packs/pf2e/spells/spells (main slot only)


def default_data_root() -> Path | None:
    """``cfg.codex.data_path`` via astra_config, or ``None`` if config can't load."""
    try:
        from astra_config import load_config
    except ImportError:
        return None
    try:
        return Path(load_config().codex.data_path)
    except Exception:
        return None


def resolve_snapshot(data_root: Path | str | None = None) -> SnapshotPaths:
    """Find the newest ``pf2e-*`` snapshot version dir under ``data_root``.

    Raises ``SnapshotNotFoundError`` with a clear, actionable message if the
    data root, a version dir, or the spells subtree is missing — this is the
    fail-soft path for fixture-less checkouts (assay's own tests never call
    this; they load committed fixture JSONs directly).
    """
    root = Path(data_root) if data_root is not None else default_data_root()
    if root is None:
        raise SnapshotNotFoundError(
            "assay: could not resolve the codex data path from config.kdl "
            "(codex.data-path) — pass --data-root explicitly."
        )
    foundry_root = root / "snapshots" / "foundry"
    if not foundry_root.is_dir():
        raise SnapshotNotFoundError(
            f"assay: no Foundry snapshot at {foundry_root} — run the codex ingest "
            "first, or pass --data-root to point at an existing snapshot."
        )
    version_dirs = sorted(p for p in foundry_root.glob("pf2e-*") if p.is_dir())
    if not version_dirs:
        raise SnapshotNotFoundError(
            f"assay: {foundry_root} has no pf2e-* version directory — the codex "
            "ingest may not have completed."
        )
    version_dir = version_dirs[-1]  # lexicographic == semver order for pf2e-N.N.N
    spells_dir = version_dir / "packs" / "pf2e" / "spells" / "spells"
    if not spells_dir.is_dir():
        raise SnapshotNotFoundError(
            f"assay: {spells_dir} is missing — expected the main-slot spells pack "
            "under packs/pf2e/spells/spells/<rank-N|cantrip>/*.json."
        )
    return SnapshotPaths(version_dir=version_dir, spells_dir=spells_dir)


def iter_spell_files(spells_dir: Path) -> list[Path]:
    """All spell JSON files under the main-slot spells pack (every rank + cantrip)."""
    return sorted(spells_dir.glob("**/*.json"))
