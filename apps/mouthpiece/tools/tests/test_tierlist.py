"""The tier list: the cast schema, its cross-checks and render, the prompt's seams, and the
CLI over a temp run dir. Hermetic: the fixture astra-data, a scripted LLM client, no TTS."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from astra_llm import TextRequest, ToolCallRequest
from astra_mouthpiece.hosts import load_hosts
from astra_mouthpiece_tools.tierlist import cli, run
from astra_mouthpiece_tools.tierlist.cast import CastFile, cross_problems, render_cast
from astra_mouthpiece_tools.tierlist.script import (
    build_tierlist_system_prompt,
    build_tierlist_user_content,
)
from pydantic import ValidationError

MAIN = "through-a-song-darkly"
OLD = "interred-in-iomenei"
HIDDEN = "Zorvaxine"  # a name that must never reach stdout or stderr

Json = dict[str, object]


def moment(**kw: object) -> Json:
    return {
        "show": MAIN,
        "date": "2025-10-20",
        "line": 12,
        "quote": "the masked woman turns and smiles at you",
        "shows": "She knows them.",
        **kw,
    }


def entry(name: str, **kw: object) -> Json:
    return {
        "name": name,
        "page": f"People/{name}",
        "campaigns": [MAIN],
        "role": "R.",
        "background": "B.",
        "moments": [moment(), moment(show=OLD, date=None, line=None, page="People/X")],
        "case_for_higher": "H.",
        "case_for_lower": "L.",
        **kw,
    }


def villain_list(n: int = 6) -> list[Json]:
    return [entry(f"{HIDDEN}{i}" if i else HIDDEN) for i in range(n)]


def npc_list(n: int = 12) -> list[Json]:
    return [entry(f"Npc{i}") for i in range(n - 1)] + [entry(HIDDEN, ties=["Npc0"])]


def cast_dict(
    villains: int = 6,
    npcs: int = 12,
    *,
    vs: list[Json] | None = None,
    ns: list[Json] | None = None,
    **extra: object,
) -> Json:
    return {
        "villains": vs if vs is not None else villain_list(villains),
        "npcs": ns if ns is not None else npc_list(npcs),
        **extra,
    }


def test_cast_round_trips_and_its_schema_carries_the_bounds() -> None:
    cast = CastFile.model_validate(cast_dict())
    again = CastFile.model_validate_json(cast.model_dump_json())
    assert again == cast and again.setting == []
    schema = json.loads(run.cast_schema())
    assert schema["properties"]["villains"]["minItems"] == 6
    assert schema["properties"]["npcs"]["maxItems"] == 25
    assert "case_for_higher" in schema["$defs"]["CastEntry"]["required"]


@pytest.mark.parametrize(
    "bad",
    [
        cast_dict(villains=5),
        cast_dict(npcs=26),
        cast_dict(vs=[entry("a", moments=[moment()])] * 6),
        cast_dict(vs=[entry("a", moments=[moment(quote="too short")] * 2)] * 6),
        cast_dict(vs=[entry("a", moments=[moment(date=None)] * 2)] * 6),
    ],
)
def test_cast_schema_rejects(bad: Json) -> None:
    with pytest.raises(ValidationError):
        CastFile.model_validate(bad)


def test_cross_problems_name_locations_not_content() -> None:
    vs, ns = villain_list(), npc_list()
    vs[1] = entry(HIDDEN, campaigns=["nope"], ties=["Nobody", HIDDEN])
    ns[0] = entry("Npc0", moments=[moment(show="nope"), moment()])
    d = cast_dict(vs=vs, ns=ns)
    problems = cross_problems(CastFile.model_validate(d), {MAIN, OLD})
    assert problems == [
        "villains.1.name: listed twice on this board",
        "villains.1.campaigns.0: not a being.kdl campaign slug",
        "villains.1.ties.0: not the name of another entry in the file",
        "villains.1.ties.1: not the name of another entry in the file",
        "npcs.0.moments.0.show: not a being.kdl campaign slug",
    ]
    assert cross_problems(CastFile.model_validate(cast_dict()), {MAIN, OLD}) == []


def test_render_cast_runs_both_boards_in_order() -> None:
    vs = villain_list()
    vs[0] = entry(HIDDEN, open_questions=["Q1?", "Q2?"])
    d = cast_dict(
        vs=vs,
        setting=[{"topic": "The Thessians", "pages": ["Divinity/Thessians"], "note": "N."}],
    )
    text = render_cast(
        CastFile.model_validate(d),
        campaign_names={MAIN: "Song", OLD: "Iomenei"},
        episode_label=lambda show, date: f"{show} on {date}",
    )
    assert text.startswith("THE WIDER SETTING")
    assert "- The Thessians (wiki: Divinity/Thessians): N." in text
    assert text.index("BOARD ONE: THE VILLAINS") < text.index("VILLAIN 1:")
    assert text.index("VILLAIN 6:") < text.index("BOARD TWO: THE NPCS") < text.index("NPC 1:")
    assert f"VILLAIN 1: {HIDDEN} (wiki: People/{HIDDEN})\nKnown from: Song" in text
    assert f'- {MAIN} on 2025-10-20: "the masked woman turns and smiles at you"' in text
    assert '- wiki page People/X: "the masked' in text
    assert "Case for a higher tier: H.\nCase for a lower tier: L.\nStill unknown: Q1? Q2?" in text
    assert f"NPC 12: {HIDDEN} (wiki: People/{HIDDEN}) (also on the villain board)" in text
    assert "Tied to: Npc0" in text and "NPC 1: Npc0 (wiki: People/Npc0)\n" in text


def test_cast_labeller_names_campaign_season_and_episode() -> None:
    label = run.cast_labeller(run.campaign_names())
    main = label(MAIN, "2025-10-20")
    assert main.startswith('Through a Song, Darkly, Season 1, "Delivery Boys", episode "')
    assert main.endswith("(2025-10-20)")
    assert label("no-such-show", "2020-1-1") == "no-such-show (2020-1-1)"


def test_tierlist_prompt_carries_both_boards_and_the_length_rule() -> None:
    hosts = load_hosts()
    system = build_tierlist_system_prompt(hosts)
    assert hosts.c is not None and f"{hosts.c.name}: " in system
    assert "VILLAINS, S tier to D tier by how dangerous" in system
    assert "ALL THE NOTABLE NPCS, S tier to\nD tier by how much" in system
    assert "villain board comes first" in system and "read-out of both final boards" in system
    assert "about 6,000 words" in system and "never more than about 6,500" in system
    assert "never invent an event" in system and "homebrew" in system
    assert "no dice results" in system
    user = build_tierlist_user_content("ep", "SEASONS", "THE TABLE: x", "BOARD ONE", "ASTRA: y")
    assert user.index("ASTRA: y") < user.index("SEASON OVERVIEW") < user.index("CAST FILE")


def test_episode_id_has_the_special_token() -> None:
    assert run.episode_id("show-a", "2026-10-19") == "000.show-a.2026-10-19-special-tier-list"


# ── the CLI over a temp run dir ──
class ScriptedClient:
    seen: list[str] = []

    def __init__(self, caller: str = "") -> None:
        self.calls = 0

    def call_text(self, req: TextRequest) -> str:
        ScriptedClient.seen.append(f"{req.system}{req.user_content}")
        self.calls += 1
        return f"Bram: {HIDDEN} is S tier"

    def call_tool(self, req: ToolCallRequest) -> Json:
        self.calls += 1
        return {"title": "T", "turns": [{"speaker": "A", "text": f"{HIDDEN} is S tier"}]}

    def snapshot(self) -> Json:
        return {"calls": self.calls, "cost_usd": 0.01, "priced": True}


@pytest.fixture
def prepared(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> Path:
    monkeypatch.setattr(run, "ARTIFACTS_ROOT", tmp_path)
    assert cli.cli(["prepare", "--show", MAIN, "--allow-stale"]) == 0
    (run_dir,) = (tmp_path / "tierlist-2026-6-8").iterdir()
    assert capsys.readouterr().out.splitlines()[-1] == f"RUN_DIR={run_dir}"
    return run_dir


def test_prepare_lays_out_the_run_dir(prepared: Path) -> None:
    names = {p.name for p in prepared.iterdir()}
    assert names == {
        "overview.md",
        "astra.md",
        "sessions.md",
        "cast.schema.json",
        "brief.md",
        "summary.json",
    }
    brief = (prepared / "brief.md").read_text()
    assert "{{" not in brief and str(prepared) in brief and '"CastEntry"' in brief
    assert json.loads((prepared / "summary.json").read_text())["latest"] == "2026-6-8"
    sessions = (prepared / "sessions.md").read_text()
    assert f"(`{OLD}`): 2026-2-10" in sessions


def test_schema_prints_the_json_schema(capsys: pytest.CaptureFixture[str]) -> None:
    assert cli.cli(["schema"]) == 0
    assert json.loads(capsys.readouterr().out)["title"] == "CastFile"


def test_validate_reports_counts_or_locations_never_names(
    prepared: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert cli.cli(["validate", str(prepared)]) == 1  # no cast.json yet
    ns = npc_list()
    ns[0] = entry("Npc0", campaigns=[HIDDEN])
    bad = cast_dict(villains=5, ns=ns)
    (prepared / "cast.json").write_text(json.dumps(bad))
    assert cli.cli(["validate", str(prepared)]) == 1
    (prepared / "cast.json").write_text(json.dumps(cast_dict()))
    assert cli.cli(["validate", str(prepared)]) == 0
    captured = capsys.readouterr()
    assert "invalid: villains: List should have at least 6 items" in captured.err
    assert "6 villains, 12 npcs (1 on both boards), 36 moments, 0 setting notes" in captured.out
    assert HIDDEN not in captured.out + captured.err
    assert HIDDEN in (prepared / "cast.md").read_text()


def test_script_writes_the_artifacts_and_reports_stats_only(
    prepared: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    (prepared / "cast.json").write_text(json.dumps(cast_dict()))
    monkeypatch.setattr(cli, "LiteLLMClient", ScriptedClient)
    monkeypatch.setattr(cli, "ensure_openrouter_env", lambda: None)
    ScriptedClient.seen = []
    assert cli.cli(["script", str(prepared), "--allow-stale", "--model", "m"]) == 0
    out = capsys.readouterr().out
    assert HIDDEN not in out and "words" in out
    assert {"pass_a.txt", "script.json", "report.md", "cast.md"} <= {
        p.name for p in prepared.iterdir()
    }
    script = json.loads((prepared / "script.json").read_text())
    assert script["session_id"] == f"000.{MAIN}.2026-6-8-special-tier-list"
    (prompt,) = ScriptedClient.seen
    assert "BOARD ONE: THE VILLAINS" in prompt and "THE ASTRA:" in prompt


def test_script_refuses_an_invalid_cast(prepared: Path) -> None:
    (prepared / "cast.json").write_text(json.dumps(cast_dict(villains=5)))
    assert cli.cli(["script", str(prepared), "--allow-stale"]) == 1
    assert not (prepared / "script.json").exists()


def test_render_hands_the_tierlist_synopsis_to_the_shared_render(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    seen: list[tuple[Path, str]] = []

    def fake_render(run_dir: Path, synopsis: str) -> str:
        seen.append((run_dir, synopsis))
        return "rendered"

    monkeypatch.setattr(cli, "render_special", fake_render)
    assert cli.cli(["render", str(tmp_path)]) == 0
    assert seen == [(tmp_path, cli.SYNOPSIS)]
    assert "tier" in cli.SYNOPSIS and HIDDEN not in cli.SYNOPSIS
