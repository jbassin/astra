"""``astra-heartwood-apply`` — the write-back (Phase 4, S5).

Exercises a synthetic change-set against monkeypatched corpus/registry paths (never
touches the real akasha corpus or entity.kdl): a create is written (date normalized to
ISO, E4), a rewrite overwrites, an approved registry-add lands in entity.kdl, and a
re-run is idempotent (committed-at). Plus the pure date helpers.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from astra_heartwood import apply as ap
from astra_heartwood.apply import _iso_date, _normalize_create_date
from astra_heartwood.proposer.manifest import serialize_manifest
from astra_heartwood.proposer.models import PageProposal, ProposalManifest, RegistryAddition
from astra_heartwood.review import Decision, RegistryDecision, ReviewState, serialize_review_state


def test_iso_date_zero_pads() -> None:
    assert _iso_date("2025-8-28") == "2025-08-28T00:00:00-04:00"


def test_normalize_create_date_rewrites_only_the_date_line() -> None:
    text = "---\ndate: 2025-8-28\ntags: []\n---\nBody stays.\n"
    out = _normalize_create_date(text, "2025-8-28")
    assert "date: 2025-08-28T00:00:00-04:00" in out
    assert "tags: []" in out
    assert out.endswith("Body stays.\n")


@pytest.fixture
def change_set(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    content = tmp_path / "content"
    content.mkdir()
    proposals = tmp_path / "proposals"
    sess = proposals / "2099-1-1"
    sess.mkdir(parents=True)
    entity_kdl = tmp_path / "entity.kdl"
    entity_kdl.write_text("", encoding="utf-8")

    monkeypatch.setattr(ap, "AKASHA_CONTENT", content)
    monkeypatch.setattr(ap, "PROPOSALS_DIR", proposals)
    monkeypatch.setattr(ap, "ENTITY_KDL_PATH", entity_kdl)

    manifest = ProposalManifest(
        date="2099-1-1",
        show="x",
        world="faerrin",
        proposals=[
            PageProposal(
                id="bestiary-foo",
                op="create",
                target_path="Bestiary/Foo",
                canonical="Foo",
                kind="creature",
                status="unknown",
                page_type="lore",
                body_file="bestiary-foo.vellum",
                fact_claims=["Foo is a beast."],
            ),
            PageProposal(
                id="org-bar-index",
                op="rewrite",
                target_path="Org/Bar/index",
                canonical="Bar",
                kind="org",
                status="resolved",
                page_type="lore",
                body_file="org-bar-index.vellum",
                fact_claims=["Bar runs things."],
            ),
        ],
        registry_additions=[
            RegistryAddition(canonical="Foo", kind="creature", suggested_path="Bestiary/Foo")
        ],
    )
    (sess / "manifest.kdl").write_text(serialize_manifest(manifest), encoding="utf-8")
    (sess / "bestiary-foo.vellum").write_text(
        "---\ndate: 2099-1-1\ntags: []\n---\nFoo is a beast that hunts at dusk.\n", encoding="utf-8"
    )
    (sess / "org-bar-index.vellum").write_text(
        "---\ndate: 2020-01-01T00:00:00-04:00\n---\nBar. Now updated.\n", encoding="utf-8"
    )
    (content / "Org" / "Bar").mkdir(parents=True)
    (content / "Org" / "Bar" / "index.vellum").write_text(
        "---\ndate: 2020-01-01T00:00:00-04:00\n---\nBar.\n", encoding="utf-8"
    )

    review = ReviewState(
        date="2099-1-1",
        decisions=[
            Decision(id="bestiary-foo", state="approved", target_path="Bestiary/Foo"),
            Decision(id="org-bar-index", state="approved"),
        ],
        registry_decisions=[RegistryDecision(canonical="Foo", state="approved")],
    )
    (sess / "review.kdl").write_text(serialize_review_state(review), encoding="utf-8")
    return tmp_path


def test_apply_writes_normalizes_and_is_idempotent(change_set: Path) -> None:
    content = change_set / "content"
    entity_kdl = change_set / "entity.kdl"

    r = ap.apply_change_set("2099-1-1")
    assert r.created == ["Bestiary/Foo"]
    assert r.rewritten == ["Org/Bar/index"]
    assert "Foo" in r.registry_added

    foo = (content / "Bestiary" / "Foo.vellum").read_text(encoding="utf-8")
    assert "Foo is a beast that hunts at dusk." in foo
    assert "date: 2099-01-01T00:00:00-04:00" in foo  # E4 normalized

    bar = (content / "Org" / "Bar" / "index.vellum").read_text(encoding="utf-8")
    assert "Now updated." in bar  # rewrite overwrote

    ents = entity_kdl.read_text(encoding="utf-8")
    assert "Foo" in ents and "Bestiary/Foo" in ents and "manual" in ents

    # re-run: committed-at makes it a no-op
    r2 = ap.apply_change_set("2099-1-1")
    assert r2.created == []
    assert r2.rewritten == []
    assert set(r2.already_committed) == {"Bestiary/Foo", "Org/Bar/index"}


def test_dry_run_writes_nothing(change_set: Path) -> None:
    content = change_set / "content"
    r = ap.apply_change_set("2099-1-1", dry_run=True)
    assert r.created == ["Bestiary/Foo"]
    assert not (content / "Bestiary" / "Foo.vellum").exists()


def test_refuses_to_clobber_an_existing_create_target(change_set: Path) -> None:
    content = change_set / "content"
    (content / "Bestiary").mkdir()
    (content / "Bestiary" / "Foo.vellum").write_text("pre-existing\n", encoding="utf-8")
    r = ap.apply_change_set("2099-1-1")
    assert "Bestiary/Foo" in r.refused
    assert "Bestiary/Foo" not in r.created
    assert (content / "Bestiary" / "Foo.vellum").read_text(encoding="utf-8") == "pre-existing\n"
