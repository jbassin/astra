"""The ``astra-ops`` entry point: wait out a deploy's venv sync before importing anything.

deploy.sh re-syncs the deploy checkout's venv (and checks out new source) under an EXCLUSIVE
flock on ``<data root>/locks/host-tooling.lock`` (step 3b). A command that started importing
during that window could load half-replaced packages. So this module, which imports only the
standard library, first takes that lock SHARED, imports the CLI (and with it everything the
commands use: config, telemetry), then releases the lock and runs the command. Holding it only
across the imports keeps the lock order intact: nothing else is held yet, and linguist-commit
does not keep it while its own deploy wants it exclusively.

If the lock stays busy for ``WAIT_S`` the import goes ahead anyway with a warning (the
behaviour before this guard), rather than failing a unit run.
"""

from __future__ import annotations

import fcntl
import os
import sys
import time
from collections.abc import Sequence
from pathlib import Path

DEFAULT_DATA_ROOT = "/ruby/data/astra-state"
WAIT_S = 1800.0
#: The CLI's global options that take a separate value (cli.build_parser).
VALUE_OPTIONS = frozenset(
    {
        "--uv",
        "--mouthpiece-episodes",
        "--akasha-audio",
        "--deploy-root",
        "--just",
        "--craig-drop-dir",
    }
)


def data_root_from(argv: Sequence[str]) -> Path:
    """``--data-root X`` / ``--data-root=X`` before the command, else $ASTRA_DATA_ROOT (an
    empty value counts as unset, like the justfile), else the default."""
    i = 0
    while i < len(argv):
        arg = argv[i]
        if arg == "--data-root" and i + 1 < len(argv):
            return Path(argv[i + 1])
        if arg.startswith("--data-root="):
            return Path(arg.removeprefix("--data-root="))
        if not arg.startswith("-"):
            break  # the command name: options after it belong to the command
        i += 2 if arg in VALUE_OPTIONS else 1
    return Path(os.environ.get("ASTRA_DATA_ROOT") or DEFAULT_DATA_ROOT)


def wait_for_tooling(data_root: Path, wait_s: float = WAIT_S) -> int | None:
    """Take the host-tooling lock shared; return its descriptor, or None when it could not
    be opened or stayed busy for ``wait_s`` seconds."""
    path = data_root / "locks" / "host-tooling.lock"
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_CLOEXEC, 0o644)
    except OSError:
        return None
    deadline = time.monotonic() + wait_s
    while True:
        try:
            fcntl.flock(fd, fcntl.LOCK_SH | fcntl.LOCK_NB)
        except BlockingIOError:
            if time.monotonic() >= deadline:
                os.close(fd)
                return None
            time.sleep(0.2)
        else:
            return fd


def main() -> int:
    data_root = data_root_from(sys.argv[1:])
    fd = wait_for_tooling(data_root)
    if fd is None:
        print(  # noqa: T201 -- command-line output
            f"astra-ops: {data_root}/locks/host-tooling.lock busy or unusable — importing "
            "anyway (a deploy may be syncing the venv)",
            file=sys.stderr,
        )
    try:
        from astra_ops import cli
    finally:
        if fd is not None:
            os.close(fd)
    return cli.main()


if __name__ == "__main__":
    sys.exit(main())
