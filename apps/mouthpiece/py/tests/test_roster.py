"""Roster block tests (0024 §4.1.3) — hermetic, driven off the real `being.kdl`.

`through-a-song-darkly` (the main campaign) already exercises all three rendering
cases against real data: a GM role with zero descs, a class-less PC (Arctos), and a
classed PC with multiple descs (Argyle) — the exact adversarial findings the spec
calls out.
"""

from __future__ import annotations

from astra_mouthpiece.roster import build_roster_block


def test_roster_block_header_and_gm_line() -> None:
    block = build_roster_block("through-a-song-darkly")
    assert block.startswith("THE TABLE:\n")
    # GM: no class parenthetical, no trailing colon, no descs.
    assert "- Gamemaster, played by Josh" in block
    assert "Gamemaster, played by Josh:" not in block
    assert "(gm" not in block.lower()


def test_roster_block_pc_with_class_and_descs() -> None:
    block = build_roster_block("through-a-song-darkly")
    assert (
        "- Argyle (champion, played by Jorge): Formerly a failed celestial and "
        "repentant devil both inhabiting an elven body. The two halves have been "
        "separated and spread across the Infinite Horizon. Now only the celestial, "
        "and a custode from the Scale on loan to Iconoclasm." in block
    )


def test_roster_block_pc_with_no_class() -> None:
    block = build_roster_block("through-a-song-darkly")
    # Arctos has no `class=` in being.kdl — omit the parenthetical, never render "None".
    assert "- Arctos (played by Jorge): A polar bear" in block
    assert "None" not in block
    assert "Arctos (None" not in block


def test_roster_block_unmatched_show_is_empty() -> None:
    assert build_roster_block("not-a-real-campaign-slug") == ""


def test_roster_block_lines_in_campaign_role_order() -> None:
    block = build_roster_block("through-a-song-darkly")
    order = ["Gamemaster", "Argyle", "Arctos", "Benny", "Johnny", "Anzu"]
    positions = [block.index(f"- {name}") for name in order]
    assert positions == sorted(positions)
