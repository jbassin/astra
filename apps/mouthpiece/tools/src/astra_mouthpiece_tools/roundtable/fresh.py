"""Refuse to research or write a special from stale inputs.

The dossier and script read two trees that can fall behind: the wiki, transcripts and
chronicle in the astra-data clone (``data.content-root``), and ``being.kdl`` (the roster and
the Astra block) from whichever code checkout runs the command. ``stale_reasons`` fetches
both remotes and lists what is wrong: local changes in the clone, a clone that is not at
``origin/main``, or a checkout that does not contain ``origin/main``. An empty list means
both are current.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

from astra_akasha_backend.corpus import CONTENT_DIR

#: A path inside the code checkout this package runs from (an editable install).
HERE = Path(__file__).resolve().parent


def _git(repo: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", "-C", str(repo), *args], capture_output=True, text=True, check=False
    )


def _content_reasons(content_dir: Path) -> list[str]:
    top = _git(content_dir, "rev-parse", "--show-toplevel")
    if top.returncode != 0:
        return [f"the wiki at {content_dir} is not in a git clone"]
    repo = Path(top.stdout.strip())
    if _git(repo, "fetch", "-q", "origin").returncode != 0:
        return [f"could not fetch the astra-data clone {repo}"]
    reasons: list[str] = []
    if _git(repo, "status", "--porcelain").stdout.strip():
        reasons.append(f"the astra-data clone {repo} has uncommitted changes")
    head = _git(repo, "rev-parse", "HEAD").stdout.strip()
    origin = _git(repo, "rev-parse", "origin/main").stdout.strip()
    if head != origin:
        reasons.append(
            f"the astra-data clone {repo} is at {head[:7]}, not origin/main {origin[:7]}"
        )
    return reasons


def _code_reasons(here: Path) -> list[str]:
    top = _git(here, "rev-parse", "--show-toplevel")
    if top.returncode != 0:
        return [f"{here} is not in a git checkout, so being.kdl's age is unknown"]
    code_root = Path(top.stdout.strip())
    if _git(code_root, "fetch", "-q", "origin", "main").returncode != 0:
        return [f"could not fetch the code checkout {code_root}"]
    if _git(code_root, "merge-base", "--is-ancestor", "origin/main", "HEAD").returncode != 0:
        return [
            f"the code checkout {code_root} does not contain origin/main "
            "(being.kdl may be out of date); run from an up-to-date main"
        ]
    return []


def stale_reasons(content_dir: Path = CONTENT_DIR, code_dir: Path = HERE) -> list[str]:
    """Everything that makes the inputs stale; empty when both trees are current."""
    return [*_content_reasons(content_dir), *_code_reasons(code_dir)]
