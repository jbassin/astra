"""The committed model artifacts in ``results/`` and their typed loader.

``assay price`` fits the model and writes these files; every scoring command reads them back
through :func:`load_model_artifacts`:

- ``fitted-params.json``: the damage ladder and the cantrip ladder (under ``round2``).
- ``comparables-corpus.json``: the hostile comparables corpus.
- ``buff-comparables-corpus.json``: the buff comparables corpus.

This module imports nothing from the command modules, so ``cli.py`` and ``homebrew.py`` can
both use it without an import cycle.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, TypedDict

from . import comparables, pricing

APP_ROOT = Path(__file__).resolve().parents[2]  # src/astra_assay/artifacts.py -> apps/assay/py
RESULTS_DIR = APP_ROOT / "results"
FITTED_PARAMS_PATH = RESULTS_DIR / "fitted-params.json"
COMPARABLES_CORPUS_PATH = RESULTS_DIR / "comparables-corpus.json"
BUFF_CORPUS_PATH = RESULTS_DIR / "buff-comparables-corpus.json"


class ModelArtifactsNotFoundError(FileNotFoundError):
    """A committed model artifact is missing or lacks the expected keys."""


@dataclass(frozen=True)
class ModelArtifacts:
    """Everything the scorer needs: both ladders and both comparables corpora."""

    ladder: pricing.LadderFit
    cantrip_ladder: pricing.CantripLadderFit
    hostile_corpus: list[comparables.ComparableProfile]
    buff_corpus: list[comparables.ComparableProfile]


class LadderJson(TypedDict):
    """`pricing.LadderFit` as stored in `fitted-params.json`."""

    intercept: float
    slope: float
    effective_target_coef: dict[str, float]
    range_coef: dict[str, float]
    n_obs: int
    r_squared: float
    excluded_singletons: bool


class CantripLadderJson(TypedDict):
    """`pricing.CantripLadderFit` as stored in `fitted-params.json`."""

    intercept: float
    effective_target_coef: dict[str, float]
    range_coef: dict[str, float]
    n_obs: int
    r_squared: float


def ladder_to_json(ladder: pricing.LadderFit) -> LadderJson:
    return {
        "intercept": ladder.intercept,
        "slope": ladder.slope,
        "effective_target_coef": ladder.effective_target_coef,
        "range_coef": ladder.range_coef,
        "n_obs": ladder.n_obs,
        "r_squared": ladder.r_squared,
        "excluded_singletons": ladder.excluded_singletons,
    }


def ladder_from_json(d: LadderJson) -> pricing.LadderFit:
    return pricing.LadderFit(
        intercept=d["intercept"],
        slope=d["slope"],
        effective_target_coef=d["effective_target_coef"],
        range_coef=d["range_coef"],
        n_obs=d["n_obs"],
        r_squared=d["r_squared"],
        excluded_singletons=d["excluded_singletons"],
    )


def cantrip_ladder_to_json(ladder: pricing.CantripLadderFit) -> CantripLadderJson:
    return {
        "intercept": ladder.intercept,
        "effective_target_coef": ladder.effective_target_coef,
        "range_coef": ladder.range_coef,
        "n_obs": ladder.n_obs,
        "r_squared": ladder.r_squared,
    }


def cantrip_ladder_from_json(d: CantripLadderJson) -> pricing.CantripLadderFit:
    return pricing.CantripLadderFit(
        intercept=d["intercept"],
        effective_target_coef=d["effective_target_coef"],
        range_coef=d["range_coef"],
        n_obs=d["n_obs"],
        r_squared=d["r_squared"],
    )


def corpus_to_json(corpus: list[comparables.ComparableProfile]) -> str:
    """A corpus file's exact text: sorted keys, 2-space indent, one trailing newline."""
    return (
        json.dumps([comparables.profile_to_json(p) for p in corpus], indent=2, sort_keys=True)
        + "\n"
    )


def _read_json(path: Path) -> Any:
    if not path.exists():
        raise ModelArtifactsNotFoundError(
            f"assay: no model artifact at {path}; run `assay price` first."
        )
    return json.loads(path.read_text(encoding="utf-8"))


def _load_corpus(path: Path) -> list[comparables.ComparableProfile]:
    return [comparables.profile_from_json(d) for d in _read_json(path)]


def load_model_artifacts(results_dir: Path = RESULTS_DIR) -> ModelArtifacts:
    """Read the ladders and both corpora from ``results_dir``. Raises
    :class:`ModelArtifactsNotFoundError` when a file or the ``round2`` params are missing."""
    params_path = results_dir / FITTED_PARAMS_PATH.name
    params = _read_json(params_path)
    if "round2" not in params:
        raise ModelArtifactsNotFoundError(
            f"assay: {params_path} has no round2 params; run `assay price` first."
        )
    r2 = params["round2"]
    return ModelArtifacts(
        ladder=ladder_from_json(r2["ladder"]),
        cantrip_ladder=cantrip_ladder_from_json(r2["cantrip_ladder"]),
        hostile_corpus=_load_corpus(results_dir / COMPARABLES_CORPUS_PATH.name),
        buff_corpus=_load_corpus(results_dir / BUFF_CORPUS_PATH.name),
    )
