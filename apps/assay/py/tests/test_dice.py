from __future__ import annotations

from astra_assay.dice import parse_formula


def test_pure_dice() -> None:
    r = parse_formula("6d6")
    assert r.ok
    assert r.kind == "dice"
    assert r.ev == 21.0  # 6 * 3.5


def test_dice_plus_flat() -> None:
    r = parse_formula("2d8+4")
    assert r.ok
    assert r.ev == 13.0  # 2*4.5 + 4


def test_dice_minus_flat() -> None:
    r = parse_formula("1d4-1")
    assert r.ok
    assert r.ev == 1.5  # 1*2.5 - 1


def test_dice_case_insensitive() -> None:
    r = parse_formula("3D6")
    assert r.ok
    assert r.ev == 10.5


def test_flat_integer() -> None:
    r = parse_formula("70")
    assert r.ok
    assert r.kind == "flat"
    assert r.ev == 70.0


def test_flat_zero() -> None:
    r = parse_formula("0")
    assert r.ok
    assert r.ev == 0.0


def test_rejects_item_rank_formula() -> None:
    r = parse_formula("@item.rank")
    assert not r.ok
    assert r.kind == "rejected"
    assert r.reason is not None


def test_rejects_empty_formula() -> None:
    r = parse_formula("")
    assert not r.ok


def test_whitespace_tolerant() -> None:
    r = parse_formula("  6d6  ")
    assert r.ok
    assert r.ev == 21.0
