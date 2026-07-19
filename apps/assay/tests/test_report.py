from __future__ import annotations

import math

from astra_assay.report import round_clean_fraction, round_half


def test_round_half() -> None:
    assert round_half(7.24) == 7.0
    assert round_half(7.26) == 7.5
    assert round_half(21.0) == 21.0


def test_round_clean_fraction() -> None:
    assert round_clean_fraction(1.24) == 1.25
    assert round_clean_fraction(0.76) == 0.75
    assert round_clean_fraction(1.0) == 1.0


def test_round_clean_fraction_matches_doc_examples() -> None:
    # design doc §3: "exponentiated coefficients rounded to clean fractions
    # (×1.25, ×0.75, …)"
    assert round_clean_fraction(math.exp(math.log(1.25) + 1e-4)) == 1.25
    assert round_clean_fraction(math.exp(math.log(0.75) - 1e-4)) == 0.75
