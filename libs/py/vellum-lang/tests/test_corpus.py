"""The cross-language parity gate: Python's metadata matches the same committed
`.meta.json` the TS reference asserts. Agreeing with the shared fixture ⇒ py and ts agree."""

from __future__ import annotations

from pathlib import Path

import pytest
from astra_vellum_lang import canonical_meta_json


def _repo_root() -> Path:
    for parent in [Path(__file__).resolve(), *Path(__file__).resolve().parents]:
        if (parent / "fixtures" / "vellum").is_dir():
            return parent
    raise RuntimeError("fixtures/vellum not found")


_DIR = _repo_root() / "fixtures" / "vellum"
_FIXTURES = sorted(_DIR.glob("*.vellum"))


def test_corpus_is_non_empty() -> None:
    assert _FIXTURES, "no .vellum fixtures found"


@pytest.mark.parametrize("vellum", _FIXTURES, ids=lambda p: p.stem)
def test_metadata_parity(vellum: Path) -> None:
    expected = (vellum.parent / f"{vellum.stem}.meta.json").read_text(encoding="utf-8")
    assert canonical_meta_json(vellum.read_text(encoding="utf-8")) == expected
