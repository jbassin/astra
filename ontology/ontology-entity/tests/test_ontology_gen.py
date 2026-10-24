"""`scripts/ontology_gen.py` (`just ontology-gen` / `just ontology-check`): the check reports a
stale artifact without writing it, and the regen writes exactly what the sources produce."""

from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType

import pytest

_SCRIPT = Path(__file__).resolve().parents[3] / "scripts" / "ontology_gen.py"


def _load_script() -> ModuleType:
    spec = importlib.util.spec_from_file_location("ontology_gen", _SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_committed_artifacts_are_current() -> None:
    gen = _load_script()
    for path, text in gen.artifacts():
        assert path.read_text(encoding="utf-8") == text, f"{path} is stale: run just ontology-gen"


def test_check_fails_on_a_stale_artifact_and_regen_fixes_it(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    gen = _load_script()
    target = tmp_path / "artifact.json"
    target.write_text("old\n", encoding="utf-8")
    monkeypatch.setattr(gen, "artifacts", lambda: [(target, "new\n")])

    assert gen.main(["--check"]) == 1
    assert "STALE" in capsys.readouterr().err
    assert target.read_text(encoding="utf-8") == "old\n"  # --check writes nothing

    assert gen.main([]) == 0
    assert target.read_text(encoding="utf-8") == "new\n"
    assert gen.main(["--check"]) == 0
