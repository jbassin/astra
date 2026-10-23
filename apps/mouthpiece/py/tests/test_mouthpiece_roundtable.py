"""The prediction roundtable: the dossier schema + render, the episode id, and the
roundtable prompt's seams. No network."""

from __future__ import annotations

from typing import Any

import pytest
from astra_mouthpiece.episodes_index import is_recap, parse_id
from astra_mouthpiece.hosts import load_hosts
from astra_mouthpiece.roundtable import cli
from astra_mouthpiece.roundtable.agent import cutoff_after
from astra_mouthpiece.roundtable.dossier import Dossier, render_dossier
from astra_mouthpiece.roundtable.script import (
    build_roundtable_system_prompt,
    build_roundtable_user_content,
)


def clue(cid: str, **kw: Any) -> dict[str, Any]:
    return {"id": cid, "quote": "the masked woman turns", "shows": "s", **kw}


def hyp(support: list[str], **kw: Any) -> dict[str, Any]:
    return {
        "claim": "She is Galzu.",
        "supported_by": support,
        "confidence": "plausible",
        "would_confirm": "She unmasks.",
        **kw,
    }


def mystery(q: str, hyps: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "question": q,
        "why_it_matters": "w",
        "clues": [clue("c1", date="2026-1-1", line=4), clue("w1", page="People/Galzu")],
        "hypotheses": hyps,
    }


def test_render_names_sessions_leaps_and_counter_clues() -> None:
    d = Dossier.model_validate(
        {
            "mysteries": [
                mystery("Who is she?", [hyp(["c1", "w1"], complicated_by=["w1"], leap="L.")]),
                mystery("Why the mask?", [hyp(["c1"])]),
                mystery("Where next?", [hyp(["w1"])]),
            ]
        }
    )
    text = render_dossier(d, episode_label=lambda d: f"Season 1, the one on {d}")
    assert text.startswith("MYSTERY 1: Who is she?")
    assert '- [c1] Season 1, the one on 2026-1-1: "the masked woman turns" — s' in text
    assert "[w1] wiki page People/Galzu" in text
    assert (
        "(plausible) She is Galzu. Starts from: c1, w1. Cuts against it: w1. The leap: L." in text
    )
    assert "MYSTERY 3: Where next?" in text and "The leap" not in text.split("MYSTERY 2")[1]


def test_dossier_schema_bounds() -> None:
    with pytest.raises(ValueError):  # a mystery needs at least two breadcrumbs
        Dossier.model_validate(
            {"mysteries": [{**mystery("q", [hyp(["c1"])]), "clues": [clue("c1", page="p")]}] * 3}
        )
    with pytest.raises(ValueError):
        Dossier.model_validate({"mysteries": [mystery("q", [hyp(["c1"])])] * 17})


def test_cutoff_after_rolls_months_and_years() -> None:
    assert cutoff_after("2026-10-19") == "2026-10-20"
    assert cutoff_after("2026-10-31") == "2026-11-1"
    assert cutoff_after("2025-12-31") == "2026-1-1"


def test_episode_id_is_a_recap_capstone(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(cli, "permitted_dates", lambda cutoff, show: ["2025-8-28", "2026-1-1"])
    sid = cli.episode_id("show-a", "2026-10-19")
    assert sid == "000.show-a.2026-10-19-recap-of-2025-8-28"
    assert is_recap(sid) and parse_id(sid)[1] == "show-a"


def test_roundtable_prompt_carries_the_rules() -> None:
    hosts = load_hosts()
    system = build_roundtable_system_prompt(hosts)
    assert hosts.c is not None and f"{hosts.c.name}: " in system
    assert "BREADCRUMBS FIRST, THEN SPECULATE" in system and "outside this campaign" in system
    assert "never invent an event" in system and "lightning round" in system
    assert "7,000 to 8,000 words" in system
    user = build_roundtable_user_content("ep", "SEASONS", "THE TABLE: x", "MYSTERY 1: q")
    assert user.index("SEASON OVERVIEW") < user.index("MYSTERY FILE")
    assert "THE TABLE: x" in user
