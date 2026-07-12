"""0020 facts-only rework (spec §10) — orchestration. Zero LLM calls, no network needed.

Covers the full group→emit flow over the committed ``2025-8-28`` facts (proving the proposer
constructs no LLM client of any kind — FO-1), the no-facts-file → None path, and
``write_change_set``'s atomic/idempotent emit.
"""

from __future__ import annotations

import inspect
from pathlib import Path

from astra_heartwood.proposer.corpus import read_page_text
from astra_heartwood.proposer.manifest import parse_manifest, serialize_manifest
from astra_heartwood.proposer.pipeline import build_session_proposals, write_change_set

DATE = "2025-8-28"


def test_build_session_proposals_takes_no_llm_client() -> None:
    # 0020 FO-1: the proposer is zero-LLM — there is no client/model parameter to inject one.
    sig = inspect.signature(build_session_proposals)
    assert list(sig.parameters) == ["date"]


def test_build_session_proposals_over_committed_facts() -> None:
    cs = build_session_proposals(DATE)
    assert cs is not None
    m = cs.manifest
    assert len(m.proposals) > 0
    assert len(cs.bodies) == len(m.proposals)
    assert all(p.id in cs.bodies for p in m.proposals)
    # the manifest still round-trips (no LLM-populated fields to lose)
    assert parse_manifest(serialize_manifest(m)) == m

    # a create gets a fresh skeleton, empty body; a rewrite gets the live page verbatim.
    create = next(p for p in m.proposals if p.op == "create")
    assert cs.bodies[create.id] == f"---\ndate: {DATE}\ntags: []\n---\n\n"
    rewrite = next(p for p in m.proposals if p.op == "rewrite")
    assert cs.bodies[rewrite.id] == read_page_text(rewrite.target_path)


def test_no_facts_file_returns_none() -> None:
    assert build_session_proposals("1999-1-1") is None


def test_write_change_set_emits_manifest_and_bodies(tmp_path: Path) -> None:
    cs = build_session_proposals(DATE)
    assert cs is not None
    write_change_set(tmp_path, cs)
    assert (tmp_path / "manifest.kdl").is_file()
    for p in cs.manifest.proposals:
        assert (tmp_path / p.body_file).read_text(encoding="utf-8") == cs.bodies[p.id]
    # re-emitting is idempotent and clears stale bodies.
    (tmp_path / "stale-orphan.vellum").write_text("x", encoding="utf-8")
    write_change_set(tmp_path, cs)
    assert not (tmp_path / "stale-orphan.vellum").exists()
