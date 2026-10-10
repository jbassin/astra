"""The staging workspace, op journal, change-set and publish sync (0033 D33-2, D33-11).

A run never touches the live corpus while the agent works. ``Workspace.create`` copies
``apps/akasha-backend/content/`` into ``artifacts/heartwood/<date>/<run-id>/content/``
(the *staging* copy) plus a pristine ``baseline/`` copy, and records a baseline
``{path-key: sha256}`` in ``baseline.json``. The wiki tools read and write staging only;
every mutation goes through ``write`` / ``move`` / ``delete`` here, which append one line
to ``ops.jsonl`` (the op journal).

**Change-set semantics** (``changeset()``) — replayed from the journal, never inferred
from hashes. Each current staging page carries an *origin*: the baseline path it
descends from, or nothing if the run created it.

- ``write p`` on a path that does not exist gives ``p`` no origin (a creation); on an
  existing path the origin is kept.
- ``move src → dst`` carries ``src``'s origin over to ``dst``.
- ``delete p`` drops ``p`` and its origin.

At the end, for every staging page ``p``:

- no origin → **created** ``p`` (so create → move nets to one creation at the final
  path, and create → delete nets to nothing at all);
- origin ``p`` → **updated** iff its hash differs from baseline (a rewrite with
  identical bytes, or move-away-and-back unchanged, is no change);
- origin ``o ≠ p`` → **moved** ``o → p``; edits made after the move are part of the
  move (``edited`` is true when the bytes differ from ``o``'s baseline) and are *not*
  also listed under ``updated``.

Every baseline path that is no page's origin is **deleted** — except that delete ``p``
then write a new ``p`` folds back to **updated** ``p`` (or nothing if the bytes match).
A baseline path can be both a move source and a fresh creation (move ``A → B`` then
write a new ``A``): publish removes before it writes, so both land.

``publish_sync(live)`` applies that change-set to the live corpus: every touched path
(created, updated, deleted, moved-from, moved-to) must still have its baseline hash in
the live tree (or be absent where baseline was absent), else ``PublishConflict`` lists
every conflict and **nothing** is written. Then removals (deleted + moved-from) run
before writes (created + updated + moved-to), and emptied folders are pruned. Pages
the run never touched are never read or written, so a concurrent edit elsewhere
survives.
"""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
from datetime import UTC, datetime
from pathlib import Path

from astra_akasha_backend.corpus import CONTENT_DIR
from astra_akasha_backend.snapshot import REPO_ROOT
from pydantic import BaseModel

#: Run artifacts root (repo-root ``artifacts/`` is gitignored + dockerignored).
ARTIFACTS_ROOT = REPO_ROOT / "artifacts" / "heartwood"
PAGE_SUFFIX = ".vellum"


# ── path-keys ──────────────────────────────────────────────────────────────
def check_path_key(path: str) -> str:
    """Validate a page path-key (``Bestiary/Auger``); return it normalized or raise.

    A path-key is relative POSIX with no extension: no leading ``/``, no backslash,
    no empty / ``.`` / ``..`` segment, no ``.vellum`` suffix. Raises ``ValueError``.
    """
    if not isinstance(path, str) or not path.strip():
        raise ValueError("path must be a non-empty page path like 'Bestiary/Auger'")
    key = path.strip()
    if key.startswith("/") or "\\" in key or (len(key) > 1 and key[1] == ":"):
        raise ValueError(f"path must be relative (got {path!r})")
    if key.endswith(PAGE_SUFFIX):
        raise ValueError(f"path must not carry the {PAGE_SUFFIX} extension (got {path!r})")
    if any(seg in ("", ".", "..") for seg in key.split("/")):
        raise ValueError(f"path has an empty, '.' or '..' segment (got {path!r})")
    return key


def page_file(content_dir: Path, path: str) -> Path:
    """The ``.vellum`` file for path-key ``path`` under ``content_dir``, containment-checked.

    String-concatenates the suffix (``Mr. Whiskers`` would lose ``. Whiskers`` to
    ``with_suffix``). Raises ``ValueError`` when the resolved file escapes ``content_dir``
    (e.g. through a symlink).
    """
    key = check_path_key(path)
    root = content_dir.resolve()
    file = (content_dir / f"{key}{PAGE_SUFFIX}").resolve()
    if not file.is_relative_to(root):
        raise ValueError(f"path escapes the wiki (got {path!r})")
    return file


def path_key(content_dir: Path, file: Path) -> str:
    """The path-key of a ``.vellum`` file under ``content_dir`` (inverse of ``page_file``)."""
    return file.relative_to(content_dir).as_posix().removesuffix(PAGE_SUFFIX)


def sha256_file(file: Path) -> str:
    return hashlib.sha256(file.read_bytes()).hexdigest()


def hash_tree(content_dir: Path) -> dict[str, str]:
    """``{path-key: sha256}`` for every page under ``content_dir``."""
    return {
        path_key(content_dir, f): sha256_file(f)
        for f in sorted(content_dir.rglob(f"*{PAGE_SUFFIX}"))
    }


def prune_empty_dirs(start: Path, root: Path) -> None:
    """Remove ``start`` and its ancestors while empty, stopping at (never removing) ``root``."""
    root = root.resolve()
    d = start.resolve()
    while d != root and d.is_relative_to(root) and d.is_dir() and not any(d.iterdir()):
        d.rmdir()
        d = d.parent


# ── change-set ─────────────────────────────────────────────────────────────
class Move(BaseModel):
    """One page moved by the run: ``src`` (baseline path) → ``dst`` (final path)."""

    src: str
    dst: str
    #: The page's bytes at ``dst`` differ from ``src``'s baseline (move, then edit).
    edited: bool


class ChangeSet(BaseModel):
    """The run's net effect on the corpus (see the module docstring for the rules)."""

    created: list[str] = []
    updated: list[str] = []
    deleted: list[str] = []
    moved: list[Move] = []

    def touched(self) -> set[str]:
        """Every live path publish-sync reads or writes."""
        return (
            set(self.created)
            | set(self.updated)
            | set(self.deleted)
            | {m.src for m in self.moved}
            | {m.dst for m in self.moved}
        )

    def is_empty(self) -> bool:
        return not (self.created or self.updated or self.deleted or self.moved)


class PublishConflict(RuntimeError):
    """The live corpus changed under a touched path since the run's baseline."""

    def __init__(self, conflicts: list[str]) -> None:
        self.conflicts = conflicts
        super().__init__(
            "live corpus changed since the run's baseline; nothing written:\n  "
            + "\n  ".join(conflicts)
        )


# ── workspace ──────────────────────────────────────────────────────────────
def new_run_id(now: datetime | None = None) -> str:
    """A UTC ``YYYYMMDDTHHMMSSZ`` run id."""
    return (now or datetime.now(UTC)).astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")


class Workspace:
    """One run's directory: ``content/`` (staging), ``baseline/``, ``baseline.json``,
    ``ops.jsonl``, and later ``diff.patch`` / ``changeset.json``.

    Mutations go through ``write`` / ``move`` / ``delete`` so the journal stays the
    source of truth for the change-set. ``generation`` bumps on every mutation (the
    tools key their backlink cache on it).
    """

    def __init__(self, run_dir: Path) -> None:
        self.run_dir = run_dir
        self.content_dir = run_dir / "content"
        self.baseline_dir = run_dir / "baseline"
        self.journal_path = run_dir / "ops.jsonl"
        self.baseline: dict[str, str] = json.loads(
            (run_dir / "baseline.json").read_text(encoding="utf-8")
        )
        self.generation = 0

    @classmethod
    def create(
        cls,
        target_date: str,
        *,
        content_dir: Path = CONTENT_DIR,
        artifacts_root: Path = ARTIFACTS_ROOT,
        run_id: str | None = None,
    ) -> Workspace:
        """Make ``<artifacts_root>/<date>/<run-id>/``, copy the corpus, record the baseline.

        Raises ``FileExistsError`` if the run dir already exists.
        """
        run_dir = artifacts_root / target_date / (run_id or new_run_id())
        run_dir.mkdir(parents=True, exist_ok=False)
        shutil.copytree(content_dir, run_dir / "content")
        shutil.copytree(content_dir, run_dir / "baseline")
        baseline = hash_tree(run_dir / "baseline")
        (run_dir / "baseline.json").write_text(
            json.dumps(baseline, sort_keys=True, indent=2) + "\n", encoding="utf-8"
        )
        (run_dir / "ops.jsonl").touch()
        return cls(run_dir)

    @classmethod
    def open(cls, run_dir: Path) -> Workspace:
        """Re-open an existing run dir (e.g. for ``publish-sync`` in a later process)."""
        return cls(run_dir)

    # ── reads ──
    def file(self, path: str) -> Path:
        """The staging file for ``path`` (containment-checked; may not exist)."""
        return page_file(self.content_dir, path)

    def exists(self, path: str) -> bool:
        return self.file(path).is_file()

    def pages(self) -> list[str]:
        """Every staging path-key, sorted."""
        return sorted(
            path_key(self.content_dir, f) for f in self.content_dir.rglob(f"*{PAGE_SUFFIX}")
        )

    # ── journalled mutations ──
    def _journal(self, op: dict[str, str]) -> None:
        with self.journal_path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(op, sort_keys=True) + "\n")
        self.generation += 1

    def write(self, path: str, text: str) -> bool:
        """Write ``text`` to staging ``path`` (creating folders); True iff it was new."""
        file = self.file(path)
        created = not file.is_file()
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(text, encoding="utf-8")
        self._journal({"op": "write", "path": check_path_key(path)})
        return created

    def move(self, src: str, dst: str) -> None:
        """Move staging ``src`` → ``dst``; raises ``ValueError`` if src is missing or dst exists."""
        sfile, dfile = self.file(src), self.file(dst)
        if not sfile.is_file():
            raise ValueError(f"no page {src!r}")
        if dfile.exists():
            raise ValueError(f"destination {dst!r} already exists")
        dfile.parent.mkdir(parents=True, exist_ok=True)
        sfile.rename(dfile)
        prune_empty_dirs(sfile.parent, self.content_dir)
        self._journal({"op": "move", "src": check_path_key(src), "dst": check_path_key(dst)})

    def delete(self, path: str) -> None:
        """Delete staging ``path``; raises ``ValueError`` if it is missing."""
        file = self.file(path)
        if not file.is_file():
            raise ValueError(f"no page {path!r}")
        file.unlink()
        prune_empty_dirs(file.parent, self.content_dir)
        self._journal({"op": "delete", "path": check_path_key(path)})

    def ops(self) -> list[dict[str, str]]:
        lines = self.journal_path.read_text(encoding="utf-8").splitlines()
        return [json.loads(line) for line in lines if line.strip()]

    # ── change-set ──
    def changeset(self) -> ChangeSet:
        """Replay the journal over the baseline (rules in the module docstring).

        Raises ``RuntimeError`` if staging no longer matches the journal (a page was
        added or removed behind the tools' back).
        """
        origin: dict[str, str | None] = {p: p for p in self.baseline}
        for op in self.ops():
            kind = op["op"]
            if kind == "write":
                origin.setdefault(op["path"], None)
            elif kind == "move":
                origin[op["dst"]] = origin.pop(op["src"])
            elif kind == "delete":
                origin.pop(op["path"])
            else:
                raise RuntimeError(f"unknown journal op {kind!r}")

        current = hash_tree(self.content_dir)
        if set(current) != set(origin):
            drift = sorted(set(current) ^ set(origin))
            raise RuntimeError(f"staging diverged from the op journal: {drift}")

        cs = ChangeSet()
        for path in sorted(current):
            src = origin[path]
            if src is None:
                cs.created.append(path)
            elif src == path:
                if current[path] != self.baseline[path]:
                    cs.updated.append(path)
            else:
                cs.moved.append(Move(src=src, dst=path, edited=current[path] != self.baseline[src]))
        kept = {o for o in origin.values() if o is not None}
        cs.deleted = sorted(set(self.baseline) - kept)
        # delete p, then write a new p: the same live path ends up replaced → an update.
        for path in set(cs.created) & set(cs.deleted):
            cs.created.remove(path)
            cs.deleted.remove(path)
            if current[path] != self.baseline[path]:
                cs.updated.append(path)
        cs.updated.sort()
        cs.moved.sort(key=lambda m: m.src)
        return cs

    def write_changeset(self) -> ChangeSet:
        """Compute the change-set and write ``changeset.json``."""
        cs = self.changeset()
        (self.run_dir / "changeset.json").write_text(
            cs.model_dump_json(indent=2) + "\n", encoding="utf-8"
        )
        return cs

    def diff_patch(self) -> Path:
        """Write ``diff.patch`` (baseline → staging) via ``git diff --no-index``; return it.

        ``git diff --no-index`` exits 1 when the trees differ — that is success here;
        only an exit > 1 raises.
        """
        out = self.run_dir / "diff.patch"
        proc = subprocess.run(
            ["git", "diff", "--no-index", "--no-color", "--", "baseline", "content"],
            cwd=self.run_dir,
            capture_output=True,
            text=True,
            check=False,
        )
        if proc.returncode > 1:
            raise RuntimeError(f"git diff --no-index failed: {proc.stderr.strip()}")
        out.write_text(proc.stdout, encoding="utf-8")
        return out

    # ── publish ──
    def publish_sync(self, live_content_dir: Path) -> ChangeSet:
        """Apply the change-set to ``live_content_dir`` (§5 step 2); return it.

        Raises ``PublishConflict`` — having written nothing — if any touched live path's
        hash differs from the baseline (or exists where baseline had none).
        """
        cs = self.changeset()
        conflicts: list[str] = []
        for path in sorted(cs.touched()):
            live = page_file(live_content_dir, path)
            live_hash = sha256_file(live) if live.is_file() else None
            if live_hash != self.baseline.get(path):
                if live_hash is None:
                    why = "deleted live"
                elif path not in self.baseline:
                    why = "created live"
                else:
                    why = "edited live"
                conflicts.append(f"{path}: {why}")
        if conflicts:
            raise PublishConflict(conflicts)

        writes = [*cs.created, *cs.updated, *(m.dst for m in cs.moved)]
        removals = [*cs.deleted, *(m.src for m in cs.moved)]
        for path in removals:
            live = page_file(live_content_dir, path)
            if live.is_file():
                live.unlink()
        for path in writes:
            live = page_file(live_content_dir, path)
            live.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(self.file(path), live)
        for path in removals:
            prune_empty_dirs(page_file(live_content_dir, path).parent, live_content_dir)
        return cs
