"""The one repo-root finder. The TS twin is `libs/ts/config/src/root.ts`.

Every path the libraries derive from the checkout (`config.kdl`, the SOPS file, its age
key) starts here, so there is one marker (`ontology/ontology-config`) and one failure mode:
`FileNotFoundError` when no ancestor holds it. Nothing falls back to a guessed path.
"""

from __future__ import annotations

import functools
from pathlib import Path

_MARKER = Path("ontology") / "ontology-config"


def find_repo_root(start: Path | None = None) -> Path:
    """The checkout root: the nearest ancestor of `start` holding `ontology/ontology-config`.

    `start` defaults to this module's own file, which sits inside the checkout because
    workspace members install editable (`/repo` in the Dagster image). Code calls this
    instead of counting `Path.parents`, so no path depends on how deep an app sits under
    `apps/`. Memoized per `start`. Raises `FileNotFoundError` when no ancestor matches.
    """
    return _walk_up(start if start is not None else Path(__file__))


@functools.cache
def _walk_up(start: Path) -> Path:
    origin = start.resolve()
    for parent in [origin, *origin.parents]:
        if (parent / _MARKER).is_dir():
            return parent
    raise FileNotFoundError(f"no ancestor of {origin} holds {_MARKER}")
