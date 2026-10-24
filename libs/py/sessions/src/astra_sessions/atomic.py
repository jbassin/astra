"""Atomic file writes: write a ``.tmp`` sibling, then rename it over the target.

Every pipeline output is written this way so a reader (a sensor, the next asset, the host
publisher) only ever sees a whole file: a materialized partition means "done", so a crash
mid-write must not leave a half-written output. No fsync: none of the pipeline's writers
ever did one, and the rename alone gives the all-or-nothing appearance they rely on.
"""

from __future__ import annotations

from pathlib import Path


def temp_sibling(path: Path) -> Path:
    """The ``.tmp`` sibling a writer fills before renaming it to ``path``
    (``script.json`` → ``script.json.tmp``)."""
    return path.with_name(path.name + ".tmp")


def atomic_write_text(path: Path, text: str) -> None:
    """Write ``text`` (UTF-8) to ``path`` via ``temp_sibling(path)`` and a rename."""
    tmp = temp_sibling(path)
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)
