"""The prediction roundtable: the dossier schema + render, the episode id, the roundtable
prompt's seams, and the subagent run dir over the fixture astra-data. No network, no TTS."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from astra_llm import TextRequest, ToolCallRequest
from astra_mouthpiece.episodes_index import is_recap, parse_id
from astra_mouthpiece.hosts import load_hosts
from astra_mouthpiece.models import Script, ScriptTurn, SpeakerId
from astra_mouthpiece_tools.roundtable import cli, run
from astra_mouthpiece_tools.roundtable.agent import campaign_tools, cutoff_after
from astra_mouthpiece_tools.roundtable.astra import build_astra_block
from astra_mouthpiece_tools.roundtable.dossier import Dossier, render_dossier
from astra_mouthpiece_tools.roundtable.script import (
    build_roundtable_system_prompt,
    build_roundtable_user_content,
)
from astra_ontology_being import BEING_KDL_PATH, load_being


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
        Dossier.model_validate({"mysteries": [mystery("q", [hyp(["c1"])])] * 19})


def test_cutoff_after_rolls_months_and_years() -> None:
    assert cutoff_after("2026-10-19") == "2026-10-20"
    assert cutoff_after("2026-10-31") == "2026-11-1"
    assert cutoff_after("2025-12-31") == "2026-1-1"


def test_episode_id_has_the_special_token() -> None:
    sid = cli.episode_id("show-a", "2026-10-19")
    assert sid == "000.show-a.2026-10-19-special-roundtable"
    assert parse_id(sid)[1] == "show-a" and not is_recap(sid)


def test_roundtable_prompt_carries_the_rules() -> None:
    hosts = load_hosts()
    system = build_roundtable_system_prompt(hosts)
    assert hosts.c is not None and f"{hosts.c.name}: " in system
    assert "BREADCRUMBS FIRST, THEN SPECULATE" in system and "the Astra" in system
    assert "never invent an event" in system and "lightning round" in system
    assert "7,000 to 8,000 words" in system
    user = build_roundtable_user_content("ep", "SEASONS", "THE TABLE: x", "MYSTERY 1: q")
    assert user.index("SEASON OVERVIEW") < user.index("MYSTERY FILE")
    assert "THE TABLE: x" in user
    assert "finally" not in system  # a second special must not claim to be the first
    with_astra = build_roundtable_user_content("ep", "SEASONS", "", "MYSTERY 1: q", "THE ASTRA: y")
    assert with_astra.index("THE ASTRA: y") < with_astra.index("SEASON OVERVIEW")


def test_render_carries_the_setting_background_and_connections() -> None:
    base = mystery("Who is she?", [hyp(["c1"])])
    d = Dossier.model_validate(
        {
            "setting": [{"topic": "The Thessians", "pages": ["Divinity/Thessians"], "note": "N."}],
            "mysteries": [
                {**base, "background": "B.", "connections": [{"to": 2, "how": "H."}]},
                mystery("Why the mask?", [hyp(["c1"])]),
                mystery("Where next?", [hyp(["w1"])]),
            ],
        }
    )
    text = render_dossier(d, episode_label=lambda d: d)
    assert text.startswith("THE WIDER SETTING")
    assert "- The Thessians (wiki: Divinity/Thessians): N." in text
    assert "What we know: B." in text and "Connects to:\n- Mystery 2: H." in text
    assert "What we know" not in text.split("MYSTERY 2")[1]


def test_a_dossier_without_the_new_fields_still_loads() -> None:
    d = Dossier.model_validate({"mysteries": [mystery("q", [hyp(["c1"])])] * 3})
    assert d.setting == [] and d.mysteries[0].background == ""
    assert not render_dossier(d, episode_label=lambda d: d).startswith("THE WIDER")


def test_astra_block_lists_the_other_astra_games_only() -> None:
    being = load_being(BEING_KDL_PATH)
    main = next(c for c in being.campaigns if c.main)
    block = build_astra_block(main.slug)
    assert block.startswith(f"THE ASTRA: {main.name} is set on")
    for c in being.campaigns:
        listed = f"(wiki tag `{c.slug}`)" in block
        assert listed == (c.slug != main.slug and c.world in being.astra_worlds), c.slug
    assert "Gamemaster" not in block  # the GM is named as "run by", never as a character
    assert build_astra_block("no-such-show") == ""


def test_render_hands_the_roundtable_synopsis_to_the_shared_render(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    seen: list[tuple[Path, str]] = []

    def fake_render(run: Path, synopsis: str) -> str:
        seen.append((run, synopsis))
        return "rendered"

    monkeypatch.setattr(cli, "render_special", fake_render)
    assert cli.cli(["render", str(tmp_path)]) == 0
    assert seen == [(tmp_path, cli.SYNOPSIS)]


# ── the follow-up: the last roundtable's block and prompt ──
Json = dict[str, object]


def previous_dict(**kw: object) -> Json:
    return {
        "covered": "They went deep on the mask.",
        "predictions": [
            {
                "host": "Bram",
                "claim": "She is Galzu.",
                "said": "dead certain",
                "status": "gained support",
                "since": "She was seen again.",
                "mystery": 1,
            },
            {"host": "Nell", "claim": "The bell rings.", "status": "untouched", "since": "N."},
        ],
        "callbacks": [{"host": "Maeve", "line": 3, "moment": "The soup bit."}],
        **kw,
    }


def three_mysteries(**kw: object) -> Json:
    return {"mysteries": [mystery("q", [hyp(["c1"])])] * 3, **kw}


def test_render_opens_with_the_last_roundtable() -> None:
    d = Dossier.model_validate(three_mysteries(previous=previous_dict()))
    text = render_dossier(d, episode_label=lambda d: d, previous_title="It Walked Home")
    head = text.split("MYSTERY 1")[0]
    assert head.startswith('THE LAST ROUNDTABLE ("It Walked Home"')
    assert "- Bram: She is Galzu. (dead certain) Now: gained support. She was seen again." in head
    assert "See mystery 1." in head and "- Nell: The bell rings. Now: untouched. N." in head
    assert "- Maeve: The soup bit." in head and "line" not in head


def test_followup_prompt_checks_back_and_asks_for_new_predictions() -> None:
    hosts = load_hosts()
    first = build_roundtable_system_prompt(hosts)
    follow = build_roundtable_system_prompt(hosts, followup=True)
    assert "THE LAST ROUNDTABLE" not in first and "THE LAST ROUNDTABLE" in follow
    assert "three NEW predictions" in follow and "three NEW" not in first
    assert "another theory episode" in follow and "Never\n  read the list out" in follow


# ── the subagent run dir: prepare, validate, script, render ──
MAIN = "through-a-song-darkly"
HIDDEN = "Zorvaxine"  # a name that must never reach stdout or stderr
SPEAKERS: list[SpeakerId] = ["A", "B", "C", "A", "B"]


def fixture_dates() -> list[str]:
    tools, _ = campaign_tools(MAIN)
    return tools.dates


def good_mystery(*clues: Json, to: int | None = None) -> Json:
    d1, d2 = fixture_dates()[:2]
    return {
        "question": f"Who is {HIDDEN}?",
        "why_it_matters": "w",
        "clues": list(clues)
        or [
            clue("c1", date=d1, line=4, quote=f"{HIDDEN} turns and smiles at you"),
            clue("c2", date=d2, line=9, quote="the bell rang twice that night"),
            clue("w1", page="People/Galzu", quote="a masked woman of the court"),
        ],
        "hypotheses": [hyp(["c1", "w1"], complicated_by=["c2"])],
        "connections": [{"to": to, "how": "H."}] if to else [],
    }


def good_dossier(*mysteries: Json, **kw: object) -> Json:
    ms = list(mysteries) or [good_mystery(to=2), good_mystery(), good_mystery()]
    return {"mysteries": ms, **kw}


def previous_script(tmp_path: Path) -> str:
    hosts = load_hosts()
    sid = f"000.{MAIN}.2026-1-1-recap-of-2025-8-28"
    script = Script(
        session_id=sid,
        title="It Walked Home",
        kind="special",
        hosts=hosts,
        turns=[ScriptTurn(speaker=s, text=f"line {n}") for n, s in enumerate(SPEAKERS)],
    )
    (tmp_path / "episodes" / sid).mkdir(parents=True)
    (tmp_path / "episodes" / sid / "script.json").write_text(script.model_dump_json())
    return sid


class ScriptedClient:
    seen: list[str] = []

    def __init__(self, caller: str = "") -> None:
        self.calls = 0

    def call_text(self, req: TextRequest) -> str:
        ScriptedClient.seen.append(f"{req.system}{req.user_content}")
        self.calls += 1
        return f"Bram: {HIDDEN} did it"

    def call_tool(self, req: ToolCallRequest) -> Json:
        self.calls += 1
        return {"title": "T", "turns": [{"speaker": "A", "text": f"{HIDDEN} did it"}]}

    def snapshot(self) -> Json:
        return {"calls": self.calls, "cost_usd": 0.01, "priced": True}


def prepare(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
    *extra: str,
) -> Path:
    monkeypatch.setattr(run, "ARTIFACTS_ROOT", tmp_path / "runs")
    monkeypatch.setattr(cli, "episodes_root", lambda: tmp_path / "episodes")
    assert cli.cli(["prepare", "--show", MAIN, "--allow-stale", *extra]) == 0
    (run_dir,) = next((tmp_path / "runs").iterdir()).iterdir()
    assert capsys.readouterr().out.splitlines()[-1] == f"RUN_DIR={run_dir}"
    return run_dir


def test_prepare_lays_out_a_first_roundtable(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    run_dir = prepare(monkeypatch, tmp_path, capsys)
    names = {p.name for p in run_dir.iterdir()}
    assert names == {
        "overview.md",
        "astra.md",
        "sessions.md",
        "dossier.schema.json",
        "brief.md",
        "summary.json",
    }
    brief = (run_dir / "brief.md").read_text()
    assert "{{" not in brief and str(run_dir) in brief and '"LastRoundtable"' in brief
    assert "This is a first roundtable" in brief
    assert "previous" not in json.loads((run_dir / "summary.json").read_text())


def test_followup_prepare_validate_script_and_render(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    sid = previous_script(tmp_path)
    run_dir = prepare(monkeypatch, tmp_path, capsys, "--previous", sid)
    lines = (run_dir / "previous.txt").read_text().splitlines()
    assert lines[0] == "000001\tBram: line 0" and lines[2].startswith("000003\tNell: ")
    assert "It Walked Home" in (run_dir / "brief.md").read_text()

    # A follow-up dossier without `previous`, or with bad references, fails by location only.
    (run_dir / "dossier.json").write_text(json.dumps(good_dossier()))
    assert cli.cli(["validate", str(run_dir)]) == 1
    bad_prev = previous_dict(callbacks=[{"host": HIDDEN, "line": 99, "moment": "m"}])
    w1 = clue("w1", page="People/Galzu", quote="a masked woman of the court")
    bad_clues = [clue("c1", date="1999-1-1", line=1, quote="too short"), clue("c2", page="p"), w1]
    bad = good_dossier(
        good_mystery(to=2), good_mystery(to=2), good_mystery(*bad_clues), previous=bad_prev
    )
    (run_dir / "dossier.json").write_text(json.dumps(bad))
    assert cli.cli(["validate", str(run_dir)]) == 1
    err = capsys.readouterr().err
    assert "invalid: previous: missing, but this run is a follow-up" in err
    assert "previous.callbacks.0.host: not a host" in err and "callbacks.0.line" in err
    assert "mysteries.1.connections.0.to" in err
    assert "mysteries.2.clues.0.date" in err and "mysteries.2.clues.0.quote" in err
    assert HIDDEN not in err

    (run_dir / "dossier.json").write_text(json.dumps(good_dossier(previous=previous_dict())))
    assert cli.cli(["validate", str(run_dir)]) == 0
    out = capsys.readouterr().out
    assert "3 mysteries, 9 clues, 3 theories, 0 setting notes" in out
    assert "2 predictions (1 gained support, 1 untouched), 1 callbacks" in out
    assert HIDDEN not in out and HIDDEN in (run_dir / "dossier.md").read_text()

    monkeypatch.setattr(cli, "LiteLLMClient", ScriptedClient)
    monkeypatch.setattr(cli, "ensure_openrouter_env", lambda: None)
    ScriptedClient.seen = []
    assert cli.cli(["script", str(run_dir), "--allow-stale", "--model", "m"]) == 0
    out = capsys.readouterr().out
    assert HIDDEN not in out and "(follow-up)" in out
    script = json.loads((run_dir / "script.json").read_text())
    assert script["session_id"].endswith("-special-roundtable")
    (prompt,) = ScriptedClient.seen
    assert "three NEW predictions" in prompt and 'THE LAST ROUNDTABLE ("It Walked Home"' in prompt

    seen: list[str] = []
    monkeypatch.setattr(cli, "render_special", lambda r, syn: seen.append(syn) or "rendered")
    assert cli.cli(["render", str(run_dir)]) == 0
    assert seen == [cli.FOLLOWUP_SYNOPSIS]


def test_script_refuses_an_invalid_prepared_dossier(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    run_dir = prepare(monkeypatch, tmp_path, capsys)
    (run_dir / "dossier.json").write_text(json.dumps(good_dossier(previous=previous_dict())))
    assert cli.cli(["script", str(run_dir), "--allow-stale"]) == 1
    assert "no previous.txt" in capsys.readouterr().err
    assert not (run_dir / "script.json").exists()
