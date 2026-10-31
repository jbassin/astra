"""The real vellum validator's image check, as heartwood's write_page runs it.

write_page validates a candidate page alone in a temp dir, so the validator can't find the
wiki's ``akasha/assets/`` beside it; ``node_validator`` passes the real folder with ``--assets``.
Skips without node and node_modules (CI's py-test lane).
"""

from __future__ import annotations

from pathlib import Path

import pytest
from astra_akasha_backend.snapshot import REPO_ROOT
from astra_heartwood.agent.validate import find_node, node_validator


def _node_ready() -> bool:
    try:
        find_node()
    except FileNotFoundError:
        return False
    return (REPO_ROOT / "node_modules").is_dir() or (
        REPO_ROOT / "libs/ts/vellum-lang/node_modules"
    ).is_dir()


@pytest.mark.skipif(not _node_ready(), reason="node / node_modules absent (CI py-test lane)")
def test_images_are_checked_against_the_assets_dir(tmp_path: Path) -> None:
    page = tmp_path / "probe" / "Bestiary"
    page.mkdir(parents=True)
    (page / "Auger.vellum").write_text("---\ntags: []\n---\n\n![An auger](auger.png)\n")
    assets = tmp_path / "assets"
    assets.mkdir()
    report = node_validator(str(tmp_path / "probe"), assets)
    assert report is not None and "image auger.png: no such file" in report
    (assets / "auger.png").write_bytes(b"")
    assert node_validator(str(tmp_path / "probe"), assets) is None
