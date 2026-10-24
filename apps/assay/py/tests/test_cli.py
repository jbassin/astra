from __future__ import annotations

import json
from pathlib import Path

import pytest
from astra_assay.cli import build_parser, write_fitted_params


def test_fitted_params_writer_does_not_read_the_previous_file(tmp_path: Path) -> None:
    """ASY-5: `price` used to merge into the old file, so it failed on a fresh tree and kept
    whatever stale keys (round 1's `main`/`cantrip`) were already there."""
    path = tmp_path / "results" / "fitted-params.json"
    path.parent.mkdir()
    path.write_text('{"main": {"stale": true}, "round2": {"old": 1}}', encoding="utf-8")

    write_fitted_params({"round2": {"new": 2}, "round3": {}}, path)

    assert json.loads(path.read_text(encoding="utf-8")) == {"round2": {"new": 2}, "round3": {}}


def test_fitted_params_writer_works_on_a_fresh_tree(tmp_path: Path) -> None:
    path = tmp_path / "results" / "fitted-params.json"
    write_fitted_params({"round2": {}}, path)
    assert path.read_text(encoding="utf-8") == '{\n  "round2": {}\n}\n'


@pytest.mark.parametrize("command", ["fit", "extract", "seed-homebrew"])
def test_removed_commands_are_gone(command: str) -> None:
    """ASY-5: `fit` wiped the parameters the other commands read, `seed-homebrew` could bring
    back deleted spells, and `extract` duplicated part of `price`."""
    with pytest.raises(SystemExit):
        build_parser().parse_args([command])
