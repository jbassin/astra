"""Tests for the one scorer (`scorer.py`) and the model-artifact loader (`artifacts.py`), run
against the committed `results/` and the committed homebrew store."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pytest
from astra_assay import artifacts, cli, export, homebrew, store
from astra_assay.scorer import Scorer, verdict_for_residual

STORE_SPELLS = store.STORE_ROOT / store.SPELLS_SUBDIR


@pytest.fixture(scope="module")
def scorer() -> Scorer:
    return Scorer.from_results()


def test_loader_reads_both_ladders_and_both_corpora() -> None:
    model = artifacts.load_model_artifacts()
    params = json.loads(artifacts.FITTED_PARAMS_PATH.read_text(encoding="utf-8"))
    assert artifacts.ladder_to_json(model.ladder) == params["round2"]["ladder"]
    assert (
        artifacts.cantrip_ladder_to_json(model.cantrip_ladder) == params["round2"]["cantrip_ladder"]
    )
    assert len(model.hostile_corpus) == params["round3"]["comparables_corpus_n"]
    assert len(model.buff_corpus) == params["round4"]["buff_corpus_n"]


def test_loader_round_trips_the_corpus_files() -> None:
    model = artifacts.load_model_artifacts()
    assert artifacts.corpus_to_json(model.hostile_corpus) == (
        artifacts.COMPARABLES_CORPUS_PATH.read_text(encoding="utf-8")
    )
    assert artifacts.corpus_to_json(model.buff_corpus) == (
        artifacts.BUFF_CORPUS_PATH.read_text(encoding="utf-8")
    )


def test_loader_fails_clearly_on_a_missing_artifact(tmp_path: Path) -> None:
    with pytest.raises(artifacts.ModelArtifactsNotFoundError, match="assay price"):
        artifacts.load_model_artifacts(tmp_path)


def test_verdict_band() -> None:
    assert verdict_for_residual(0.5) == "in band"
    assert verdict_for_residual(-0.5) == "in band"
    assert verdict_for_residual(0.66) == "+0.66 ranks HOT"
    assert verdict_for_residual(-1.78) == "-1.78 ranks COLD"


def test_buff_store_spell_gets_buff_comparables(scorer: Scorer) -> None:
    doc = json.loads((STORE_SPELLS / "bestial-rage.json").read_text(encoding="utf-8"))
    _row, score = scorer.score_doc(doc, "homebrew/bestial-rage.json")
    assert score.kind == "buff-comparables"
    assert score.population == "beneficial"
    assert score.comparables is not None
    assert len(score.comparables.matches) == 5


def test_score_doc_matches_score_homebrew_for_every_store_spell(scorer: Scorer) -> None:
    """`assay score` and `score-homebrew` give every store spell the same entry."""
    by_slug = {r["slug"]: r for r in homebrew.score_all()}
    for slug, doc in homebrew.load_homebrew_store():
        _row, score = scorer.score_doc(doc, f"homebrew/{slug}.json")
        record = by_slug[slug]
        assert record["kind"] == score.kind, slug
        if score.kind != "ledger":
            entry = export.score_to_entry(score)
            assert {k: record.get(k) for k in entry} == entry, slug


def test_cmd_score_prints_buff_comparables(capsys: pytest.CaptureFixture[str]) -> None:
    cli.cmd_score(argparse.Namespace(spell=str(STORE_SPELLS / "bestial-rage.json")))
    out = capsys.readouterr().out
    assert "beneficial/buff effect — buff comparables" in out
    assert "comparables:  buff corpus, rank RANGE" in out
    assert "Stage-B" not in out
