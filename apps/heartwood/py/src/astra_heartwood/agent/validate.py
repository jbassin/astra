"""The per-write content rail (0033 D33-4): akasha's TS structural validator.

``write_page`` hands a private temp dir holding the one candidate page to a
``Validator``. The real one shells out to ``validate-corpus.ts --dir <dir>`` under node
(the same command ``astra_akasha_backend.snapshot.validate_corpus`` runs over the whole
corpus): exit 0 → clean, exit 1 → error chips / sigil collisions printed. Unit tests
inject a fake; CI's ``py-test`` lane has no node / pnpm install.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from collections.abc import Callable
from pathlib import Path

from astra_akasha_backend.snapshot import NODE_TS_RESOLVE_HOOK, VALIDATOR

#: ``validator(dir) -> None`` when clean, else the validator's report text.
Validator = Callable[[str], str | None]


def find_node() -> str:
    """Locate a ``node`` binary: ``$NODE``, then ``PATH``, then the newest nvm install.

    Detached/minimal environments (systemd-run, cron) often lack the interactive shell's
    nvm PATH entry, hence the fallback. Raises ``FileNotFoundError`` if none is found.
    """
    explicit = os.environ.get("NODE")
    if explicit and Path(explicit).is_file():
        return explicit
    on_path = shutil.which("node")
    if on_path:
        return on_path
    nvm = Path(os.environ.get("NVM_DIR", Path.home() / ".nvm")) / "versions" / "node"
    installs = sorted(
        nvm.glob("v*/bin/node"),
        key=lambda p: tuple(int(x) for x in p.parts[-3].lstrip("v").split(".") if x.isdigit()),
    )
    if installs:
        return str(installs[-1])
    raise FileNotFoundError("node not found ($NODE, PATH, ~/.nvm) — the vellum validator needs it")


def node_validator(directory: str) -> str | None:
    """Run ``validate-corpus.ts --dir <directory>``; ``None`` on exit 0, else its output."""
    proc = subprocess.run(
        [
            find_node(),
            "--import",
            str(NODE_TS_RESOLVE_HOOK),
            str(VALIDATOR),
            "--dir",
            directory,
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode == 0:
        return None
    return (proc.stderr + proc.stdout).strip() or f"validator exited {proc.returncode}"
