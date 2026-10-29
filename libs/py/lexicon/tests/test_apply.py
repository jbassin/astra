"""astra-lexicon apply tests: correcting stored text and JSON in place, shape kept."""

from __future__ import annotations

import json
from pathlib import Path

from astra_lexicon import build_replacer, correct_file, correct_text, defs_digest

FIX = build_replacer({"Osyluth": ["Oce(lot|loth|lith)"], "Prime Marudine": [r"Prime\s*Marodine"]})


def test_text_is_corrected_line_by_line() -> None:
    text = "000001\tGM: Ocelith says no.  \n000002\tAda: Prime\nMarodine\n\n000003\tBo: ok"
    assert correct_text(FIX, text) == (
        "000001\tGM: Osyluth says no.  \n000002\tAda: Prime\nMarodine\n\n000003\tBo: ok"
    )


def test_json_strings_are_corrected_and_the_format_kept(tmp_path: Path) -> None:
    path = tmp_path / "script.json"
    value = {"Oceloth": "key kept", "turns": [{"text": " Ask Oceloth. ", "n": 1}], "ok": True}
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    assert correct_file(path, FIX) is True
    fixed = {"Oceloth": "key kept", "turns": [{"text": " Ask Osyluth. ", "n": 1}], "ok": True}
    expected = json.dumps(fixed, indent=2, ensure_ascii=False) + "\n"
    assert path.read_text(encoding="utf-8") == expected
    assert correct_file(path, FIX) is False
    assert not list(tmp_path.glob(".*.tmp"))


def test_json_in_another_format_is_skipped(tmp_path: Path) -> None:
    path = tmp_path / "digest.json"
    path.write_text('{"text": "Ocelot"}', encoding="utf-8")
    assert correct_file(path, FIX) is None
    assert path.read_text(encoding="utf-8") == '{"text": "Ocelot"}'


def test_text_file_without_changes_is_not_rewritten(tmp_path: Path) -> None:
    path = tmp_path / "t.txt"
    path.write_text("000001\tGM: Osyluth\n", encoding="utf-8")
    assert correct_file(path, FIX) is False


def test_defs_digest_changes_with_the_file(tmp_path: Path) -> None:
    path = tmp_path / "defs.kdl"
    path.write_text('entry "A" {\n    variant "B"\n}\n', encoding="utf-8")
    before = defs_digest(path)
    path.write_text('entry "A" {\n    variant "C"\n}\n', encoding="utf-8")
    assert defs_digest(path) != before
