"""Phase-3 S4 — orchestration (spec §10). Stub client, no network.

Covers the full draft→lint→revise→assemble→emit flow over the committed ``2025-8-28`` facts, the
bounded revise (keep-the-cleaner), the already-known rewrite skip (P3.15), and ``write_change_set``.
"""

from __future__ import annotations

from pathlib import Path

from astra_heartwood.proposer.manifest import parse_manifest, serialize_manifest
from astra_heartwood.proposer.models import PageProposal
from astra_heartwood.proposer.pipeline import (
    _draft_lint_assemble,
    build_session_proposals,
    write_change_set,
)
from astra_llm import TextRequest

DATE = "2025-8-28"
CLEAN = (
    "On the river’s edge the trade hums along under a watchful, indifferent eye, and "
    "[[Iconoclasm]] keeps its own counsel."
)


class _Stub:
    """Returns a fixed reply for every call (records the count)."""

    def __init__(self, reply: str) -> None:
        self.reply = reply
        self.n = 0

    def call_text(self, req: TextRequest) -> str:
        self.n += 1
        return self.reply


class _Scripted:
    """Returns successive replies; the last repeats once exhausted."""

    def __init__(self, *replies: str) -> None:
        self.replies = list(replies)
        self.calls: list[TextRequest] = []

    def call_text(self, req: TextRequest) -> str:
        self.calls.append(req)
        idx = min(len(self.calls) - 1, len(self.replies) - 1)
        return self.replies[idx]


def _create() -> PageProposal:
    return PageProposal(
        id="bestiary-scrapheap",
        op="create",
        target_path="Bestiary/Scrapheap",
        canonical="Scrapheap",
        kind="creature",
        status="unknown",
        page_type="stub",
        body_file="bestiary-scrapheap.vellum",
        fact_claims=["The Scrapheap is a yard of discarded automatons."],
    )


# ── full pipeline over the committed facts ────────────────────────────────────
def test_build_session_proposals_clean_stub() -> None:
    cs = build_session_proposals(DATE, client=_Stub(CLEAN), model="stub")
    assert cs is not None
    m = cs.manifest
    assert len(m.proposals) > 0
    assert len(cs.bodies) == len(m.proposals)
    assert all(p.id in cs.bodies for p in m.proposals)
    # the manifest still round-trips after drafting
    assert parse_manifest(serialize_manifest(m)) == m
    # a create gets fresh session-dated frontmatter; a rewrite keeps the page's own.
    create = next(p for p in m.proposals if p.op == "create")
    assert cs.bodies[create.id].startswith(f"---\ndate: {DATE}\ntags: []\n---\n")
    rewrite = next(p for p in m.proposals if p.op == "rewrite")
    assert cs.bodies[rewrite.id].startswith("---\n")
    assert (
        f"date: {DATE}" not in cs.bodies[rewrite.id]
    )  # the existing page's date, not the session's


def test_no_facts_file_returns_none() -> None:
    assert build_session_proposals("1999-1-1", client=_Stub(CLEAN), model="stub") is None


def test_already_known_rewrites_are_skipped() -> None:
    # The sentinel is rewrite-only: every rewrite skips already-known; creates keep it as a body.
    cs = build_session_proposals(DATE, client=_Stub("ALREADY-KNOWN"), model="stub")
    assert cs is not None
    assert all(p.op == "create" for p in cs.manifest.proposals)
    assert any(s.reason == "already-known" for s in cs.manifest.skipped)


# ── the bounded revise (keep-the-cleaner) ─────────────────────────────────────
def test_revise_keeps_cleaner_draft() -> None:
    slop = "Scrapheap is a large yard located within the district."  # opener + intensifier
    clean = "A yard of discarded automatons, hunched at the district's edge and watched by no one."
    client = _Scripted(slop, clean)
    result = _draft_lint_assemble(
        _create(),
        date=DATE,
        client=client,
        model="m",
        known_pages=frozenset(),
        batch_pages=frozenset(),
        batch_names=frozenset(),
    )
    assert result is not None
    vellum, lints, revised = result
    assert revised and len(client.calls) == 2  # one draft + one revise
    assert "discarded automatons" in vellum  # the clean revision was kept
    assert not [w for w in lints if w.type in {"encyclopedia_opener", "intensifier"}]


def test_revise_keeps_original_when_no_cleaner() -> None:
    slop = "Scrapheap is a large yard located within the district."
    worse = "Scrapheap is a vast expansive yard located within the district."
    client = _Scripted(slop, worse)
    result = _draft_lint_assemble(
        _create(),
        date=DATE,
        client=client,
        model="m",
        known_pages=frozenset(),
        batch_pages=frozenset(),
        batch_names=frozenset(),
    )
    assert result is not None
    vellum, lints, revised = result
    assert revised  # a revise was attempted
    assert "vast expansive" not in vellum  # the worse revision was rejected
    assert [w for w in lints if w.type == "encyclopedia_opener"]  # residual tells recorded


# ── write_change_set ──────────────────────────────────────────────────────────
def test_write_change_set_emits_manifest_and_bodies(tmp_path: Path) -> None:
    cs = build_session_proposals(DATE, client=_Stub(CLEAN), model="stub")
    assert cs is not None
    write_change_set(tmp_path, cs)
    assert (tmp_path / "manifest.kdl").is_file()
    for p in cs.manifest.proposals:
        assert (tmp_path / p.body_file).read_text(encoding="utf-8") == cs.bodies[p.id]
    # re-emitting is idempotent and clears stale bodies.
    (tmp_path / "stale-orphan.vellum").write_text("x", encoding="utf-8")
    write_change_set(tmp_path, cs)
    assert not (tmp_path / "stale-orphan.vellum").exists()
