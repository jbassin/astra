"""Find wiki pages that grew by accretion: many separate edits, each adding a paragraph.

A page edited by many commits is not wrong by itself, but when its body paragraphs come from
many different commits, the edits most likely appended text instead of integrating it. Those
pages are the candidates for the consolidation brief (``apps/heartwood/py/consolidate.md``).

vellum paragraphs are single lines, so ``git blame --line-porcelain`` attributes each paragraph
to one commit. Only body lines (after the frontmatter) longer than ``MIN_PARAGRAPH_CHARS``
count, so headings, short list items and blank lines are ignored. Lines not yet committed
(the all-zero commit) are ignored too.
"""

from __future__ import annotations

import subprocess
from dataclasses import dataclass
from pathlib import Path

MIN_PARAGRAPH_CHARS = 80
DEFAULT_MIN_COMMITS = 4
SKIP_NAMES = frozenset({"Timeline.vellum"})
_UNCOMMITTED = "0" * 40


@dataclass(frozen=True)
class LayeredPage:
    path: Path
    commits: int
    words: int


def _blame(page: Path) -> list[tuple[str, str]]:
    """``(commit, line)`` for each line of ``page``; empty when git cannot blame it."""
    proc = subprocess.run(
        ["git", "-C", str(page.parent), "blame", "--line-porcelain", "--", page.name],
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        return []
    out: list[tuple[str, str]] = []
    commit = ""
    expect_header = True
    for raw in proc.stdout.splitlines():
        if expect_header:
            commit = raw.split(" ", 1)[0]
            expect_header = False
        elif raw.startswith("\t"):
            out.append((commit, raw[1:]))
            expect_header = True
    return out


def _body(lines: list[tuple[str, str]]) -> list[tuple[str, str]]:
    """The lines after the YAML frontmatter (all lines when there is none)."""
    if not lines or lines[0][1].strip() != "---":
        return lines
    for i in range(1, len(lines)):
        if lines[i][1].strip() == "---":
            return lines[i + 1 :]
    return []


def measure(page: Path) -> LayeredPage:
    body = _body(_blame(page))
    commits = {
        commit
        for commit, line in body
        if len(line.strip()) > MIN_PARAGRAPH_CHARS and commit != _UNCOMMITTED
    }
    words = sum(len(line.split()) for _, line in body)
    return LayeredPage(path=page, commits=len(commits), words=words)


def layered_pages(content: Path, min_commits: int = DEFAULT_MIN_COMMITS) -> list[LayeredPage]:
    """Pages under ``content`` whose body paragraphs come from at least ``min_commits``
    commits, most commits first, then most words."""
    pages = [measure(p) for p in sorted(content.rglob("*.vellum")) if p.name not in SKIP_NAMES]
    hits = [p for p in pages if p.commits >= min_commits]
    return sorted(hits, key=lambda p: (-p.commits, -p.words, str(p.path)))
