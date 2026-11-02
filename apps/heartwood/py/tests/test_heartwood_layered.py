"""The layered-page detector: distinct commits among a page's body paragraphs.

Hermetic: builds a tiny git repo under tmp_path; the live corpus is never touched.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest
from astra_heartwood.agent.cli import EXIT_OK, cli
from astra_heartwood.agent.layered import layered_pages, measure

FRONT = "---\ndate: 2025-08-28T00:00:00-04:00\ntags: []\n---\n\n"


def para(n: int) -> str:
    """One paragraph line, longer than the 80-character threshold."""
    return f"Paragraph {n} says something true about the subject, at enough length to count here."


def git(repo: Path, *args: str) -> None:
    subprocess.run(
        [
            "git",
            "-c",
            "user.name=t",
            "-c",
            "user.email=t@t",
            "-c",
            "commit.gpgsign=false",
            "-C",
            str(repo),
            *args,
        ],
        check=True,
        capture_output=True,
    )


def commit(repo: Path, rel: str, text: str, msg: str) -> None:
    f = repo / rel
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(text, encoding="utf-8")
    git(repo, "add", rel)
    git(repo, "commit", "-q", "-m", msg)


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    root = tmp_path / "content"
    root.mkdir()
    git(root, "init", "-q")
    # Layered: five commits, each appending a paragraph (plus a short line that never counts).
    body = ""
    for n in range(5):
        body += para(n) + "\n\nshort line\n\n"
        commit(root, "Divinity/Layered.vellum", FRONT + body, f"edit {n}")
    # Whole: written once, then its frontmatter edited three times (frontmatter never counts).
    for n in range(4):
        front = FRONT.replace("tags: []", f"tags: [t{n}]")
        commit(root, "People/Whole.vellum", front + para(0) + "\n\n" + para(1) + "\n", f"w{n}")
    # Timeline: as layered as Layered, but always skipped.
    body = ""
    for n in range(5):
        body += para(n) + "\n\n"
        commit(root, "Timeline.vellum", FRONT + body, f"t{n}")
    return root


def test_measure_counts_body_paragraph_commits(repo: Path) -> None:
    layered = measure(repo / "Divinity/Layered.vellum")
    assert layered.commits == 5
    assert layered.words > 0
    assert measure(repo / "People/Whole.vellum").commits == 1


def test_uncommitted_lines_do_not_count(repo: Path) -> None:
    page = repo / "People/Whole.vellum"
    page.write_text(page.read_text(encoding="utf-8") + para(9) + "\n", encoding="utf-8")
    assert measure(page).commits == 1


def test_layered_pages_filters_and_skips_timeline(repo: Path) -> None:
    assert [p.path.name for p in layered_pages(repo, 4)] == ["Layered.vellum"]
    assert [p.path.name for p in layered_pages(repo, 1)] == ["Layered.vellum", "Whole.vellum"]
    assert layered_pages(repo, 6) == []


def test_cli_prints_tab_separated_rows(repo: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert cli(["layered", "--content", str(repo), "--min", "1"]) == EXIT_OK
    rows = [line.split("\t") for line in capsys.readouterr().out.splitlines()]
    assert [(r[0], r[2]) for r in rows] == [
        ("5", "Divinity/Layered.vellum"),
        ("1", "People/Whole.vellum"),
    ]
    assert all(r[1].isdigit() for r in rows)
