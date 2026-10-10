"""One agent run end to end (0033 S3, gates C + the D33-9 outcomes).

``run_session`` over a fixture corpus + fixture transcripts with scripted ``DummyLM``s
(metered through the production mixin) — no network, no key, no paid calls.

- The cap and failure tests use a fake interpreter (hermetic, run in CI).
- ``test_scripted_run_through_real_deno`` is **gate C**: the real dspy
  ``PythonInterpreter`` (Deno + Pyodide) drives write → rejected write → fixed write →
  malformed reply → move + a raised tool error caught in sandbox code → ``llm_query`` +
  ``llm_query_batched`` → ``SUBMIT``. It skips when ``deno`` is absent (CI has none) and
  needs a warmed Deno cache (``just heartwood-sandbox-warm``).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from astra_config.models import HeartwoodConfig
from astra_heartwood.agent import rlm as rlm_mod
from astra_heartwood.agent import telemetry
from astra_heartwood.agent.cli import format_summary
from astra_heartwood.agent.rlm import PARSE_ERROR_OUTPUT, MeteringMixin
from astra_heartwood.agent.run import deno_available, make_interpreter, run_session
from astra_ontology import Resolution
from astra_ontology.models import Being, Campaign
from dspy.utils.dummies import DummyLM
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

TARGET = "2025-8-28"

PAGES = {
    "index": "---\ntitle: Home\ndate: 2026-06-05T16:40:21-04:00\n---\n\nSee [[Bestiary/Auger]].\n",
    "Bestiary/Auger": "---\ndate: 2025-08-20T00:00:00-04:00\ntags: []\n---\n\n"
    "Augers hunt near [[Geography/Hallia|Hallia]].\n",
    "Geography/Hallia/index": "---\ndate: 2025-08-28T00:00:00-04:00\ntags: []\n---\n\n"
    "The city of Hallia.\n",
    "Divinity/Aut": "---\ndate: 2025-08-28T00:00:00-04:00\ntags: []\n---\n\nA god.\n",
}

TRANSCRIPTS = {
    "000.song.2025-8-20.txt": "000001\tGamemaster: The auger circles Hallia.\n",
    "000.song.2025-8-28.txt": "000001\tGamemaster: A grell drifts out of the dark.\n"
    "000002\tAda: Is that a grell?\n",
    "000.song.2025-10-6.txt": "000001\tGamemaster: Future spoilers.\n",
}


def fixture_being() -> Being:
    camp = Campaign(slug="song", name="song", edition="pf2e", main=False, world="faerrin", roles=[])
    return Being(
        players=[], guest_color="#000000", campaigns=[camp], weal_hosts=[], podcast_personas=[]
    )


def fake_resolver(name: str) -> Resolution:
    return Resolution("unknown", None, [], 0.0)


def marker_validator(directory: str) -> str | None:
    """Rejects any candidate containing BAD-MARKER (stands in for validate-corpus.ts)."""
    for f in Path(directory).rglob("*.vellum"):
        if "BAD-MARKER" in f.read_text(encoding="utf-8"):
            return f"✖ {f.relative_to(directory).as_posix()}  (sigil collisions)"
    return None


class MeteredDummyLM(MeteringMixin, DummyLM):
    pass


def dummy_factory(main_answers: list[dict[str, Any]], sub_answers: list[dict[str, Any]]):
    built: dict[str, MeteredDummyLM] = {}

    def factory(model: str, role: str) -> MeteredDummyLM:
        lm = MeteredDummyLM(main_answers if role == "main" else sub_answers, role=role)
        built[role] = lm
        return lm

    return factory, built


class FakeInterpreter:
    def __init__(self) -> None:
        self.tools: dict[str, Any] = {}
        self.output_fields: list[dict[str, Any]] | None = None
        self.shut = False

    def execute(self, code: str, variables: dict[str, Any] | None = None) -> str:
        return "ran"

    def shutdown(self) -> None:
        self.shut = True


@pytest.fixture
def env(tmp_path: Path) -> dict[str, Any]:
    live = tmp_path / "live"
    for key, text in PAGES.items():
        f = live / f"{key}.vellum"
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(text, encoding="utf-8")
    tdir = tmp_path / "transcripts"
    tdir.mkdir()
    for name, text in TRANSCRIPTS.items():
        (tdir / name).write_text(text, encoding="utf-8")
    return {
        "content_dir": live,
        "artifacts_root": tmp_path / "art",
        "transcript_dir": tdir,
        "being": fixture_being(),
        "resolver": fake_resolver,
        "validator": marker_validator,
        "run_id": "r1",
    }


@pytest.fixture
def spans(monkeypatch: pytest.MonkeyPatch) -> InMemorySpanExporter:
    exporter = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    local = provider.get_tracer("test")
    for mod in (telemetry, rlm_mod):
        monkeypatch.setattr(mod, "tracer", lambda: local)
    from astra_heartwood.agent import run as run_mod

    monkeypatch.setattr(run_mod, "tracer", lambda: local)
    return exporter


def cfg(**kw: Any) -> HeartwoodConfig:
    return HeartwoodConfig(model="dummy/main", sub_model="dummy/sub", **kw)


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


# ── hermetic outcomes ──
def test_hitting_max_iterations_is_incomplete(env, spans) -> None:
    steps = [{"reasoning": "look", "code": "print(1)"}] * 2 + [{"changelog": "- partial"}]
    factory, built = dummy_factory(steps, [])
    interp = FakeInterpreter()
    result = run_session(
        TARGET,
        config=cfg(max_iterations=2),
        lm_factory=factory,
        interpreter_factory=lambda: interp,
        **env,
    )
    assert result.status == "incomplete" and result.exit_code == 2
    s = result.summary
    assert s["hit_cap"] and s["iterations"] == 2 and s["main"]["calls"] == 3
    assert s["changelog"] == "- partial" and s["cost_usd"] is None
    assert interp.shut
    for name in ("trajectory.json", "changeset.json", "diff.patch", "summary.json", "ops.jsonl"):
        assert (result.run_dir / name).is_file(), name
    run_span = next(x for x in spans.get_finished_spans() if x.name == "heartwood.agent.run")
    assert run_span.attributes["heartwood.status"] == "incomplete"
    assert run_span.attributes["heartwood.cost_usd"] == "unknown"


def test_failed_run_still_writes_artifacts(env, spans) -> None:
    class DyingProvider(DummyLM):  # fails *below* the metering mixin, like litellm would
        def forward(self, prompt: Any = None, messages: Any = None, **kwargs: Any) -> Any:
            if self.meter.role == "main" and self.meter.calls >= 1:  # ty: ignore[unresolved-attribute]
                raise RuntimeError("provider down")
            return super().forward(prompt=prompt, messages=messages, **kwargs)

    class Dying(MeteringMixin, DyingProvider):
        pass

    def factory(model: str, role: str) -> Dying:
        return Dying([{"reasoning": "r", "code": "print(1)"}], role=role)

    result = run_session(
        TARGET,
        config=cfg(max_iterations=5),
        lm_factory=factory,
        interpreter_factory=FakeInterpreter,
        **env,
    )
    assert result.status == "failed" and result.exit_code == 1
    assert result.error == "RuntimeError: provider down"
    traj = read_json(result.run_dir / "trajectory.json")
    assert traj["status"] == "failed" and [e["code"] for e in traj["entries"]] == ["print(1)"]
    summary = read_json(result.run_dir / "summary.json")
    assert summary["status"] == "failed" and summary["iterations"] == 2
    # ChatAdapter retries ANY exception through its JSONAdapter fallback (dspy
    # adapters/chat_adapter.py:71-85), so one failing turn is two failed LM calls.
    assert summary["main"]["errors"] == 2 and summary["counts"]["created"] == 0
    assert (result.run_dir / "changeset.json").is_file()
    assert (result.run_dir / "diff.patch").read_text() == ""
    assert "failed — RuntimeError: provider down" in format_summary(result)


def test_lm_factory_must_return_distinct_metered_lms(env) -> None:
    shared = MeteredDummyLM([], role="main")
    with pytest.raises(ValueError, match="distinct"):
        run_session(
            TARGET,
            config=cfg(),
            lm_factory=lambda m, r: shared,
            interpreter_factory=FakeInterpreter,
            **env,
        )
    env["run_id"] = "r2"
    with pytest.raises(TypeError, match="metered"):
        run_session(
            TARGET,
            config=cfg(),
            lm_factory=lambda m, r: DummyLM([]),
            interpreter_factory=FakeInterpreter,
            **env,
        )


# ── gate C: the scripted real-Deno run ──
def _step(reasoning: str, code: str) -> dict[str, str]:
    return {"reasoning": reasoning, "code": f"```python\n{code}\n```"}


SCRIPT = [
    _step(
        "Look, then create the grell page.",
        'pages = list_pages()\nprint(len(pages), "Divinity/Aut" in pages)\n'
        'print(write_page("Bestiary/Grell", "A grell, kin of the [[Auger]]. (line 1)"))',
    ),
    _step(
        "Second page; first draft has a bad sigil.",
        'r = write_page("Bestiary/Grell Kin", "BAD-MARKER draft")\nprint(r)',
    ),
    _step(
        "Rejected — fix and retry.",
        'assert r.startswith("rejected:")\n'
        'print(write_page("Bestiary/Grell Kin", "Grell kin. [[Bestiary/Grell]]"))',
    ),
    {"garbage": "not a reasoning/code reply"},  # ChatAdapter attempt …
    {"garbage": "still not"},  # … and its JSONAdapter fallback: one malformed step
    _step(
        "Re-file pages; a missing page raises and I catch it.",
        'm = move_page("Bestiary/Grell Kin", "Bestiary/Grells/Grell Kin")\n'
        'print(m["moved"], m["backlinks"])\n'
        'print(move_page("Divinity/Aut", "Divinity/Old/Aut")["moved"])\n'
        "try:\n"
        '    read_page("Nope/Missing")\n'
        "except Exception as exc:\n"
        '    print("caught", type(exc).__name__, exc)',
    ),
    _step(
        "Ask the sub-LM.",
        'one = llm_query("What is a grell?")\n'
        'two = llm_query_batched(["a?", "b?"])\n'
        "print(len(one) > 0, len(two))",
    ),
    _step("Done.", 'SUBMIT(changelog="- Bestiary/Grell: created (line 1)")'),
]


@pytest.mark.skipif(not deno_available(), reason="deno not installed (CI) — gate C runs locally")
def test_scripted_run_through_real_deno(env, spans) -> None:
    factory, built = dummy_factory(
        SCRIPT, [{"response": "A grell is a floating brain."}, {"response": "A"}, {"response": "B"}]
    )
    result = run_session(
        TARGET,
        config=cfg(max_iterations=10, max_llm_calls=5),
        lm_factory=factory,
        interpreter_factory=make_interpreter,
        **env,
    )
    traj = read_json(result.run_dir / "trajectory.json")
    outputs = [e["output"].strip() for e in traj["entries"]]
    assert result.status == "ok", (result.error, outputs)
    assert result.exit_code == 0 and result.changelog == "- Bestiary/Grell: created (line 1)"

    # the scripted beats, as the sandbox printed them
    assert outputs[0].splitlines() == ["4 True", "created Bestiary/Grell"]
    assert outputs[1].startswith("rejected: ✖ Bestiary/Grell Kin.vellum")
    assert outputs[2] == "created Bestiary/Grell Kin"
    assert outputs[3].startswith(PARSE_ERROR_OUTPUT)
    assert outputs[4].splitlines()[0] == "['Bestiary/Grell Kin', 'Bestiary/Grells/Grell Kin'] []"
    assert outputs[4].splitlines()[1] == "['Divinity/Aut', 'Divinity/Old/Aut']"
    caught = outputs[4].splitlines()[2]
    assert caught.startswith("caught RuntimeError ValueError: no page 'Nope/Missing'")
    assert outputs[5] == "True 2"
    assert outputs[6].startswith("FINAL:")

    # the change-set (D33-2): create→move nets to one creation at the final path
    cs = read_json(result.run_dir / "changeset.json")
    assert cs == {
        "created": ["Bestiary/Grell", "Bestiary/Grells/Grell Kin"],
        "updated": [],
        "deleted": [],
        "moved": [{"src": "Divinity/Aut", "dst": "Divinity/Old/Aut", "edited": False}],
    }
    grell = (result.run_dir / "content" / "Bestiary" / "Grell.vellum").read_text()
    assert grell.startswith("---\ndate: 2025-08-28T00:00:00-04:00\ntags: []\n---\n")
    assert "Bestiary/Grell.vellum" in (result.run_dir / "diff.patch").read_text()
    ops = (result.run_dir / "ops.jsonl").read_text().splitlines()
    assert [json.loads(o)["op"] for o in ops] == ["write", "write", "move", "move"]

    s = read_json(result.run_dir / "summary.json")
    assert s["status"] == "ok" and s["iterations"] == 7 and s["parse_errors"] == 1
    assert s["main"]["calls"] == 8  # 7 iterations + the malformed step's JSON fallback
    assert s["sub"]["calls"] == 3 and s["cost_usd"] is None  # DummyLM: cost unknown
    assert s["pyodide"] and s["pyodide"].split()[0].count(".") == 2
    assert s["counts"] == {"created": 2, "updated": 0, "moved": 1, "deleted": 0}
    assert "cost unknown" in format_summary(result)

    # telemetry: tool + LM spans (incl. the batched sub-calls) all under the run span
    finished = spans.get_finished_spans()
    run_span = next(x for x in finished if x.name == "heartwood.agent.run")
    run_id = run_span.get_span_context().span_id
    children = [x for x in finished if x is not run_span]
    assert children and all(x.parent is not None and x.parent.span_id == run_id for x in children)
    sub_spans = [x for x in children if x.attributes.get("heartwood.llm.role") == "sub"]
    assert len(sub_spans) == 3
    tool_outcomes = [
        (x.name, x.attributes["heartwood.tool.outcome"])
        for x in children
        if x.name.startswith("heartwood.tool.")
    ]
    assert ("heartwood.tool.write_page", "rejected") in tool_outcomes
    assert ("heartwood.tool.read_page", "raised") in tool_outcomes
    assert run_span.attributes["heartwood.status"] == "ok"
    assert run_span.attributes["heartwood.pages_created"] == 2


def test_non_ingestible_date_raises_before_staging(env) -> None:
    for bad in ("2025-1-1", "2025-10-6x"):
        with pytest.raises(ValueError, match="not an ingestible"):
            run_session(
                bad,
                config=cfg(),
                lm_factory=lambda m, r: MeteredDummyLM([], role=r),
                interpreter_factory=FakeInterpreter,
                **env,
            )
    assert not env["artifacts_root"].exists()


# ── CLI per-run model overrides (S5 prep: model comparisons via dry runs) ──
def _cli_run(env, monkeypatch, argv: list[str]) -> tuple[int, dict[str, Any], list[str]]:
    """Drive ``cli run`` with the fixture env + dummy LMs; return (exit, summary, models
    the LM factory was asked for)."""
    from types import SimpleNamespace

    from astra_heartwood.agent import cli as cli_mod

    seen: list[str] = []
    steps = [{"reasoning": "look", "code": "print(1)"}, {"changelog": "- partial"}]
    factory, _ = dummy_factory(steps, [])

    def recording_factory(model: str, role: str) -> MeteredDummyLM:
        seen.append(model)
        return factory(model, role)

    real_run = cli_mod.run_session

    def run_with_fixtures(date: str, **kw: Any) -> Any:
        if kw.get("config") is None:  # no override → what run_session would load itself
            kw["config"] = cfg(max_iterations=1)
        return real_run(
            date,
            lm_factory=recording_factory,
            interpreter_factory=FakeInterpreter,
            **kw,
            **env,
        )

    monkeypatch.setattr(
        cli_mod, "load_config", lambda: SimpleNamespace(heartwood=cfg(max_iterations=1))
    )
    monkeypatch.setattr(cli_mod, "run_session", run_with_fixtures)
    code = cli_mod.cli(["run", TARGET, "--dry-run", *argv])
    summary = read_json(env["artifacts_root"] / TARGET / "r1" / "summary.json")
    return code, summary, seen


def test_cli_model_overrides_reach_lm_factory_summary_and_span(env, spans, monkeypatch) -> None:
    code, summary, seen = _cli_run(
        env, monkeypatch, ["--model", "or/override-main", "--sub-model", "or/override-sub"]
    )
    assert code == 2  # incomplete at the 1-iteration cap — the run itself is not the point
    assert seen == ["or/override-main", "or/override-sub"]
    assert summary["model"] == "or/override-main"
    assert summary["sub_model"] == "or/override-sub"
    assert summary["dry_run"] is True and summary["max_iterations"] == 1  # rest of cfg kept
    run_span = next(x for x in spans.get_finished_spans() if x.name == "heartwood.agent.run")
    assert run_span.attributes["heartwood.model"] == "or/override-main"
    assert run_span.attributes["heartwood.sub_model"] == "or/override-sub"


def test_cli_single_override_keeps_the_other_model(env, spans, monkeypatch) -> None:
    _, summary, seen = _cli_run(env, monkeypatch, ["--model", "or/override-main"])
    assert seen == ["or/override-main", "dummy/sub"]
    assert (summary["model"], summary["sub_model"]) == ("or/override-main", "dummy/sub")


def test_cli_without_overrides_uses_config_models(env, spans, monkeypatch) -> None:
    _, summary, seen = _cli_run(env, monkeypatch, [])
    assert seen == ["dummy/main", "dummy/sub"]
    assert (summary["model"], summary["sub_model"]) == ("dummy/main", "dummy/sub")
