"""The staging workspace, op journal, change-set and publish sync (0033 D33-2, gate B).

Hermetic: a tiny fixture corpus under tmp_path stands in for akasha's content/.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from astra_heartwood.agent.workspace import (
    ChangeSet,
    Move,
    PublishConflict,
    Workspace,
    check_path_key,
    hash_tree,
    new_run_id,
    page_file,
)

PAGES = {
    "index": "---\ndate: 2026-06-05T16:40:21-04:00\n---\n\nHome. [[Bestiary/Auger]]\n",
    "Bestiary/Auger": "---\ndate: 2025-08-28T00:00:00-04:00\ntags: []\n---\n\nAn auger.\n",
    "Bestiary/Ugathal": "---\ndate: 2025-08-28T00:00:00-04:00\ntags: []\n---\n\nUgathal.\n",
    "Geography/Hallia/index": "---\ndate: 2025-08-28T00:00:00-04:00\n---\n\nHallia.\n",
    "Org/Amber Call/People/Mr. Whiskers": "---\ndate: 2026-06-05T16:40:21-04:00\n---\n\nCat.\n",
}


def make_corpus(root: Path, pages: dict[str, str] = PAGES) -> Path:
    for key, text in pages.items():
        f = root / f"{key}.vellum"
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(text, encoding="utf-8")
    return root


@pytest.fixture
def live(tmp_path: Path) -> Path:
    return make_corpus(tmp_path / "live")


@pytest.fixture
def ws(tmp_path: Path, live: Path) -> Workspace:
    return Workspace.create(
        "2025-8-28", content_dir=live, artifacts_root=tmp_path / "art", run_id="20261010T000000Z"
    )


# ── layout ──
def test_create_layout_and_baseline(ws: Workspace, tmp_path: Path, live: Path) -> None:
    assert ws.run_dir == tmp_path / "art" / "2025-8-28" / "20261010T000000Z"
    assert ws.baseline == hash_tree(live)
    assert set(ws.baseline) == set(PAGES)
    assert ws.pages() == sorted(PAGES)
    assert (ws.run_dir / "ops.jsonl").read_text() == ""
    assert Workspace.open(ws.run_dir).baseline == ws.baseline
    with pytest.raises(FileExistsError):
        Workspace.create(
            "2025-8-28", content_dir=live, artifacts_root=tmp_path / "art", run_id=ws.run_dir.name
        )


def test_run_id_format() -> None:
    rid = new_run_id()
    assert len(rid) == 16 and rid[8] == "T" and rid.endswith("Z")


# ── path keys ──
@pytest.mark.parametrize(
    "bad",
    ["", "  ", "/etc/passwd", "../outside", "Bestiary/../../x", "a//b", "./a", "a\\b",
     "Bestiary/Auger.vellum", "C:/x"],
)  # fmt: skip
def test_bad_path_keys_raise(bad: str, ws: Workspace) -> None:
    with pytest.raises(ValueError):
        check_path_key(bad)
    with pytest.raises(ValueError):
        ws.file(bad)


def test_dotted_basename_is_a_valid_key(ws: Workspace) -> None:
    f = ws.file("Org/Amber Call/People/Mr. Whiskers")
    assert f.name == "Mr. Whiskers.vellum" and f.is_file()


def test_symlink_escape_raises(ws: Workspace, tmp_path: Path) -> None:
    (tmp_path / "elsewhere").mkdir()
    (ws.content_dir / "Escape").symlink_to(tmp_path / "elsewhere")
    with pytest.raises(ValueError, match="escapes"):
        page_file(ws.content_dir, "Escape/x")


# ── change-set semantics ──
def test_no_ops_is_empty(ws: Workspace) -> None:
    assert ws.changeset().is_empty()


def test_create_update_delete(ws: Workspace) -> None:
    assert ws.write("Bestiary/Grell", "new") is True
    assert ws.write("Bestiary/Auger", "changed") is False
    ws.delete("Bestiary/Ugathal")
    assert ws.changeset() == ChangeSet(
        created=["Bestiary/Grell"], updated=["Bestiary/Auger"], deleted=["Bestiary/Ugathal"]
    )
    assert [op["op"] for op in ws.ops()] == ["write", "write", "delete"]


def test_identical_rewrite_is_no_change(ws: Workspace) -> None:
    ws.write("Bestiary/Auger", PAGES["Bestiary/Auger"])
    assert ws.changeset().is_empty()


def test_create_then_delete_nets_to_nothing(ws: Workspace) -> None:
    ws.write("Bestiary/Grell", "new")
    ws.delete("Bestiary/Grell")
    assert ws.changeset().is_empty()
    assert not (ws.content_dir / "Bestiary" / "Grell.vellum").exists()


def test_create_then_move_is_one_creation(ws: Workspace) -> None:
    ws.write("Drafts/Grell", "new")
    ws.move("Drafts/Grell", "Bestiary/Grell")
    assert ws.changeset() == ChangeSet(created=["Bestiary/Grell"])
    assert not (ws.content_dir / "Drafts").exists()  # emptied folder pruned


def test_move_then_edit_is_one_edited_move(ws: Workspace) -> None:
    ws.move("Bestiary/Auger", "Bestiary/Machines/Auger")
    cs = ws.changeset()
    assert cs == ChangeSet(
        moved=[Move(src="Bestiary/Auger", dst="Bestiary/Machines/Auger", edited=False)]
    )
    ws.write("Bestiary/Machines/Auger", "fixed after the move")
    cs = ws.changeset()
    assert cs.moved == [Move(src="Bestiary/Auger", dst="Bestiary/Machines/Auger", edited=True)]
    assert cs.updated == [] and cs.created == [] and cs.deleted == []


def test_move_chain_and_move_back(ws: Workspace) -> None:
    ws.move("Bestiary/Auger", "A")
    ws.move("A", "B/C")
    assert ws.changeset().moved == [Move(src="Bestiary/Auger", dst="B/C", edited=False)]
    ws.move("B/C", "Bestiary/Auger")
    assert ws.changeset().is_empty()


def test_move_away_then_recreate_source(ws: Workspace) -> None:
    ws.move("Bestiary/Auger", "Bestiary/Old Auger")
    ws.write("Bestiary/Auger", "a different auger")
    cs = ws.changeset()
    assert cs.created == ["Bestiary/Auger"]
    assert cs.moved == [Move(src="Bestiary/Auger", dst="Bestiary/Old Auger", edited=False)]


def test_delete_then_rewrite_is_update(ws: Workspace) -> None:
    ws.delete("Bestiary/Auger")
    ws.write("Bestiary/Auger", "rewritten")
    assert ws.changeset() == ChangeSet(updated=["Bestiary/Auger"])


def test_delete_dst_then_move_onto_it(ws: Workspace) -> None:
    ws.delete("Bestiary/Ugathal")
    ws.move("Bestiary/Auger", "Bestiary/Ugathal")
    cs = ws.changeset()
    assert cs.deleted == ["Bestiary/Ugathal"]
    assert cs.moved == [Move(src="Bestiary/Auger", dst="Bestiary/Ugathal", edited=False)]


def test_move_and_delete_guards(ws: Workspace) -> None:
    with pytest.raises(ValueError, match="already exists"):
        ws.move("Bestiary/Auger", "Bestiary/Ugathal")
    with pytest.raises(ValueError, match="no page"):
        ws.move("Bestiary/Nope", "Bestiary/X")
    with pytest.raises(ValueError, match="no page"):
        ws.delete("Bestiary/Nope")
    assert ws.ops() == []


def test_delete_prunes_emptied_dirs(ws: Workspace) -> None:
    ws.delete("Org/Amber Call/People/Mr. Whiskers")
    assert not (ws.content_dir / "Org").exists()
    assert ws.content_dir.is_dir()


def test_staging_drift_is_detected(ws: Workspace) -> None:
    (ws.content_dir / "Sneaky.vellum").write_text("x")
    with pytest.raises(RuntimeError, match="diverged"):
        ws.changeset()


def test_write_changeset_json(ws: Workspace) -> None:
    ws.write("Bestiary/Grell", "new")
    ws.write_changeset()
    data = json.loads((ws.run_dir / "changeset.json").read_text())
    assert data["created"] == ["Bestiary/Grell"]


# ── diff.patch ──
def test_diff_patch(ws: Workspace) -> None:
    assert ws.diff_patch().read_text() == ""
    ws.write("Bestiary/Auger", "changed\n")
    patch = ws.diff_patch().read_text()
    assert "a/baseline/Bestiary/Auger.vellum" in patch
    assert "b/content/Bestiary/Auger.vellum" in patch
    assert "+changed" in patch


# ── publish sync ──
def test_publish_sync_applies_changeset(ws: Workspace, live: Path) -> None:
    ws.write("Bestiary/Grell", "grell\n")
    ws.write("Bestiary/Auger", "auger v2\n")
    ws.delete("Org/Amber Call/People/Mr. Whiskers")
    ws.move("Geography/Hallia/index", "Geography/Hallia City")
    cs = ws.publish_sync(live)
    assert cs.created == ["Bestiary/Grell"]
    assert hash_tree(live) == hash_tree(ws.content_dir)
    assert not (live / "Org").exists()  # emptied dirs pruned
    assert not (live / "Geography" / "Hallia").exists()


def test_publish_sync_refuses_baseline_mismatch_and_writes_nothing(
    ws: Workspace, live: Path
) -> None:
    ws.write("Bestiary/Grell", "grell\n")  # created
    ws.write("Bestiary/Auger", "auger v2\n")  # updated
    ws.delete("Bestiary/Ugathal")  # deleted
    # concurrent live changes to three touched paths
    (live / "Bestiary" / "Auger.vellum").write_text("someone else's edit\n")
    (live / "Bestiary" / "Grell.vellum").write_text("someone else's grell\n")
    (live / "Bestiary" / "Ugathal.vellum").unlink()
    before = hash_tree(live)
    with pytest.raises(PublishConflict) as exc:
        ws.publish_sync(live)
    assert exc.value.conflicts == [
        "Bestiary/Auger: edited live",
        "Bestiary/Grell: created live",
        "Bestiary/Ugathal: deleted live",
    ]
    assert hash_tree(live) == before


def test_concurrent_edit_to_untouched_page_survives(ws: Workspace, live: Path) -> None:
    ws.write("Bestiary/Auger", "auger v2\n")
    (live / "index.vellum").write_text("edited live meanwhile\n")
    (live / "Late.vellum").write_text("added live meanwhile\n")
    ws.publish_sync(live)
    assert (live / "index.vellum").read_text() == "edited live meanwhile\n"
    assert (live / "Late.vellum").read_text() == "added live meanwhile\n"
    assert (live / "Bestiary" / "Auger.vellum").read_text() == "auger v2\n"


def test_publish_sync_from_reopened_workspace(ws: Workspace, live: Path) -> None:
    ws.move("Bestiary/Auger", "Machines/Auger")
    Workspace.open(ws.run_dir).publish_sync(live)
    assert not (live / "Bestiary" / "Auger.vellum").exists()
    assert (live / "Machines" / "Auger.vellum").read_text() == PAGES["Bestiary/Auger"]
