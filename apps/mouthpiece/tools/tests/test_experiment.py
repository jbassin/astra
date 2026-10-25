"""The producer comparison — hermetic: a fake producer and a scripted LLM client."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from astra_config import load_config
from astra_config.models import MouthpieceProducerConfig
from astra_linguist.chronicle import ShowInfo
from astra_mouthpiece.hosts import load_hosts
from astra_mouthpiece.models import DigestStats, Script, ScriptTurn, SessionDigest
from astra_mouthpiece.producer.brief import ProducerBrief, render_brief
from astra_mouthpiece.producer.run import ProducerInputs, ProducerResult, RunStatus
from astra_mouthpiece_tools.producer import experiment as exp_mod
from astra_mouthpiece_tools.producer.experiment import arm_slug, host_shares, run_experiment

# Fixtures copied from the backend's producer tests (a test package can't import another
# member's tests).
TARGET = "2026-1-8"
SHOWS = {"show-a": ShowInfo(slug="show-a", name="Show A", is_main=True, order=0)}
TURNS = [(10, "Gamemaster", "Galzu flees."), (11, "Ada", "After her!")]


def brief_dict(**over: Any) -> dict[str, Any]:
    base = {
        "moments": [
            {
                "title": "The chase",
                "line_ids": [10, 11],
                "anchor": "Galzu flees",
                "why_it_matters": "She escapes.",
                "feel": "Tense.",
            }
        ],
        "lore": [{"name": "Galzu", "note": "Anzu's sister.", "page": "People/Galzu"}],
        "callbacks": [{"date": "2026-1-1", "note": "She fled into the mist before."}],
        "open_threads": ["Where is she going?"],
        "newcomer_questions": ["Who is Galzu?"],
    }
    base.update(over)
    return base


def _inputs() -> ProducerInputs:
    digest = SessionDigest(
        session_id=f"000.show-a.{TARGET}",
        synopsis="Galzu flees.",
        kept_ranges=[(10, 11)],
        stats=DigestStats(lines=2, kept_lines=2, windows=1, dropped_windows=0),
    )
    return ProducerInputs(
        date=TARGET, show=SHOWS["show-a"], digest=digest, cleaned_turns=TURNS, roster="ROSTER"
    )


HOSTS = load_hosts()
CFG = MouthpieceProducerConfig.model_validate(
    {
        **load_config().mouthpiece_producer.model_dump(),  # config.kdl holds every value
        "experiment_models": ["openrouter/z-ai/glm-5.3", "openrouter/deepseek/deepseek-v4.1-flash"],
        "experiment_max_tokens": [128000, 64000],
    }
)


class ScriptedClient:
    """Pass A returns text; Pass B returns one turn naming Galzu. Fails for `fail_model`."""

    fail_model: str | None = None
    seen: list[tuple[str, int, str]] = []

    def __init__(self) -> None:
        self.calls = 0

    def call_text(self, req: Any) -> str:
        if req.model == self.fail_model:
            raise RuntimeError("provider down")
        ScriptedClient.seen.append((req.model, req.max_tokens, req.user_content))
        self.calls += 1
        return "Bram: Galzu got away"

    def call_tool(self, req: Any) -> dict[str, Any]:
        self.calls += 1
        return {"title": f"T {req.model}", "turns": [{"speaker": "A", "text": "Galzu got away"}]}

    def snapshot(self) -> dict[str, Any]:
        return {"calls": self.calls, "cost_usd": 0.01, "priced": True}


@pytest.fixture(autouse=True)
def _reset(monkeypatch: pytest.MonkeyPatch) -> None:
    ScriptedClient.fail_model = None
    ScriptedClient.seen = []
    monkeypatch.setattr(exp_mod, "ensure_openrouter_env", lambda: None)


def fake_producer(status: RunStatus = "ok"):
    def producer(date: str, *, config: Any, inputs: Any, run_dir: Path) -> ProducerResult:
        brief = None if status == "failed" else ProducerBrief.model_validate(brief_dict())
        (run_dir / "warnings.json").write_text(
            json.dumps({"citations_total": 4, "citations_bad": 0, "drop_rate": 0.0, "warnings": []})
        )
        summary = {
            "status": status,
            "iterations": 7,
            "parse_errors": 0,
            "seconds": 1.0,
            "cost_usd": 0.12,
            "counts": {"moments": 1},
            "wiki_head": {"start": {"sha": "abc"}, "end": {"sha": "abc"}},
        }
        return ProducerResult(
            status=status,
            run_dir=run_dir,
            summary=summary,
            brief=brief,
            brief_block=render_brief(brief) if brief else "",
        )

    return producer


def baseline_tree(tmp_path: Path) -> Path:
    root = tmp_path / "episodes"
    (root / "2026-1-8").mkdir(parents=True)
    live = Script(
        session_id="000.show-a.2026-1-8",
        title="Live Title",
        hosts=HOSTS,
        turns=[ScriptTurn(speaker="A", text="one two"), ScriptTurn(speaker="B", text="three")],
    )
    (root / "2026-1-8" / "script.json").write_text(live.model_dump_json(), encoding="utf-8")
    return root


def run(tmp_path: Path, **kw: Any):
    return run_experiment(
        "2026-1-8",
        config=CFG,
        run_dir=tmp_path / "run",
        inputs=_inputs(),
        hosts=HOSTS,
        baseline_root=baseline_tree(tmp_path),
        client_factory=ScriptedClient,
        **kw,
    )


def test_both_arms_get_the_brief_and_their_own_cap(tmp_path) -> None:
    result = run(tmp_path, producer=fake_producer())
    assert [a.slug for a in result.arms] == ["glm-5.3", "deepseek-v4.1-flash"]
    assert [(m, t) for m, t, _ in ScriptedClient.seen] == [
        ("openrouter/z-ai/glm-5.3", 128000),
        ("openrouter/deepseek/deepseek-v4.1-flash", 64000),
    ]
    for _m, _t, content in ScriptedClient.seen:
        assert "PRODUCER NOTES" in content and "WIKI EXCERPTS" not in content
    out = result.run_dir
    for name in (
        "script.glm-5.3.json",
        "script.deepseek-v4.1-flash.json",
        "script.baseline.json",
        "cost.json",
        "report.md",
    ):
        assert (out / name).is_file(), name
    report = (out / "report.md").read_text()
    assert "| metric | baseline | glm-5.3 | deepseek-v4.1-flash |" in report
    assert "Live Title" in report and "| brief lore names said | 0 / 1 | 1 / 1 | 1 / 1 |" in report
    cost = json.loads((out / "cost.json").read_text())
    assert cost["producer_usd"] == 0.12 and len(cost["arms"]) == 2


def test_one_failing_arm_does_not_abort_the_other(tmp_path) -> None:
    ScriptedClient.fail_model = "openrouter/z-ai/glm-5.3"
    result = run(tmp_path, producer=fake_producer())
    assert result.arms[0].error == "RuntimeError: provider down" and result.arms[0].script is None
    assert result.arms[1].script is not None
    assert (
        "## Arm failures" in result.report and not (result.run_dir / "script.glm-5.3.json").exists()
    )


def test_failed_producer_spends_nothing_on_scripts(tmp_path) -> None:
    result = run(tmp_path, producer=fake_producer("failed"))
    assert result.producer_status == "failed" and result.arms == []
    assert ScriptedClient.seen == []
    assert (result.run_dir / "report.md").is_file()


def test_reuse_brief_and_arm_filter(tmp_path) -> None:
    prior = tmp_path / "prior"
    prior.mkdir()
    (prior / "brief.json").write_text(json.dumps(brief_dict()), encoding="utf-8")

    def never(*_a: Any, **_k: Any) -> Any:
        raise AssertionError("producer must not run when reusing a brief")

    result = run(tmp_path, producer=never, reuse_brief=prior, arms=["glm-5.3"])
    assert result.producer_status == "reused" and [a.slug for a in result.arms] == ["glm-5.3"]
    assert (result.run_dir / "brief.md").read_text().startswith("PRODUCER NOTES")


def test_unknown_arm_and_mismatched_lists_are_refused(tmp_path) -> None:
    with pytest.raises(ValueError, match="no configured arm"):
        run(tmp_path, producer=fake_producer(), arms=["nope"])
    bad = CFG.model_copy(update={"experiment_max_tokens": [1]})
    with pytest.raises(ValueError, match="equal length"):
        run_experiment("2026-1-8", config=bad, inputs=_inputs(), run_dir=tmp_path / "r2")


def test_helpers() -> None:
    assert arm_slug("openrouter/z-ai/glm-5.3") == "glm-5.3"
    s = Script(
        session_id="x",
        title="t",
        hosts=HOSTS,
        turns=[ScriptTurn(speaker="A", text="a b c"), ScriptTurn(speaker="B", text="d")],
    )
    assert host_shares(s) == {HOSTS.a.name: 0.75, HOSTS.b.name: 0.25}
