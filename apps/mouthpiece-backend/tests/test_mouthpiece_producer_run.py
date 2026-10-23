"""The producer brief + one run end to end (0034 §4, D34-8) — DummyLMs, no network.

The cap test uses a fake interpreter (hermetic, runs in CI). ``test_submit_through_real_deno``
drives the real Deno + Pyodide sandbox: tool calls from sandbox code, then a typed
``SUBMIT(brief={...})``, including one invalid submit that dspy bounces back as a type
error. It skips when ``deno`` is absent (CI has none).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from astra_config.models import MouthpieceProducerConfig
from astra_llm.rlm import deno_available, make_interpreter
from astra_mouthpiece.models import DigestStats, SessionDigest
from astra_mouthpiece.producer import telemetry
from astra_mouthpiece.producer.brief import (
    Callback,
    LoreNote,
    Moment,
    ProducerBrief,
    check_citations,
    render_brief,
)
from astra_mouthpiece.producer.run import ProducerInputs, render_transcript, run_producer
from astra_mouthpiece.producer.telemetry import ProducerMetering
from dspy.utils.dummies import DummyLM
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from .test_mouthpiece_producer_tools import SHOWS, TARGET, fake_resolver
from .test_mouthpiece_producer_tools import tree as tree  # noqa: F401  (fixture re-export)

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


# ── brief (§4.2) ──
def test_check_citations_repairs_and_reports() -> None:
    brief = ProducerBrief.model_validate(
        brief_dict(
            moments=[
                {
                    "title": "m",
                    "line_ids": [10, 99],
                    "anchor": "a",
                    "why_it_matters": "w",
                    "feel": "f",
                }
            ],
            lore=[
                LoreNote(name="Galzu", note="n", page="People/Galzu").model_dump(),
                LoreNote(name="Ghost", note="n", page="People/Ghost").model_dump(),
                LoreNote(name="Pageless", note="n", page=None).model_dump(),
            ],
            callbacks=[
                Callback(date="2026-1-1", note="ok").model_dump(),
                Callback(date="2026-1-15", note="future").model_dump(),
            ],
        )
    )
    fixed, report = check_citations(
        brief, line_ids=[10, 11], pages=["People/Galzu"], dates=["2026-1-1"]
    )
    assert fixed.moments[0].line_ids == [10]
    assert [n.page for n in fixed.lore] == ["People/Galzu", None, None]
    assert [c.date for c in fixed.callbacks] == ["2026-1-1"]
    assert report.total == 2 + 2 + 2 and report.bad == 3
    assert report.drop_rate == pytest.approx(0.5) and len(report.warnings) == 3


def test_brief_schema_bounds_moments() -> None:
    with pytest.raises(ValueError):
        ProducerBrief.model_validate(brief_dict(moments=[]))
    many = [Moment(title="m", line_ids=[], anchor="a", why_it_matters="w", feel="f")] * 13
    with pytest.raises(ValueError):
        ProducerBrief(moments=many)


def test_render_brief_omits_line_ids_and_empty_sections() -> None:
    text = render_brief(ProducerBrief.model_validate(brief_dict(callbacks=[], open_threads=[])))
    assert text.startswith("PRODUCER NOTES")
    assert '- The chase (around: "Galzu flees") — She escapes. Feel: Tense.' in text
    assert "10" not in text and "Callbacks" not in text and "Open threads" not in text
    assert "- Galzu: Anzu's sister." in text and "Who is Galzu?" in text


def test_render_brief_guards_the_newcomer_seat() -> None:
    text = render_brief(ProducerBrief.model_validate(brief_dict()), newcomer="Nell")
    assert "Nell has NOT" in text and "Never have her recite lore" in text
    assert "Questions Nell should ask on air" in text
    assert "The newcomer has NOT" in render_brief(ProducerBrief.model_validate(brief_dict()))


def test_render_transcript_carries_line_ids() -> None:
    assert render_transcript(TURNS) == "10\tGamemaster: Galzu flees.\n11\tAda: After her!"


# ── run ──
class MeteredDummyLM(ProducerMetering, DummyLM):
    pass


def dummy_factory(main_answers: list[dict[str, Any]], sub_answers: list[dict[str, Any]]):
    def factory(model: str, role: str) -> MeteredDummyLM:
        return MeteredDummyLM(main_answers if role == "main" else sub_answers, role=role)

    return factory


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
def spans(monkeypatch: pytest.MonkeyPatch) -> InMemorySpanExporter:
    exporter = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    local = provider.get_tracer("test")
    monkeypatch.setattr(telemetry, "tracer", lambda: local)
    from astra_mouthpiece.producer import run as run_mod

    monkeypatch.setattr(run_mod, "tracer", lambda: local)
    return exporter


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


def _kwargs(tree: dict[str, Any], tmp_path: Path) -> dict[str, Any]:
    kw = {k: v for k, v in tree.items() if k != "root"}
    return {
        **kw,
        "inputs": _inputs(),
        "shows": SHOWS,
        "resolver": fake_resolver,
        "run_dir": tmp_path / "run",  # content_dir is not in a git repo → wiki head None
    }


def cfg(**kw: Any) -> MouthpieceProducerConfig:
    return MouthpieceProducerConfig(model="dummy/main", sub_model="dummy/sub", **kw)


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def test_cap_with_a_valid_extract_is_incomplete_with_a_brief(tree, tmp_path, spans) -> None:
    steps = [{"reasoning": "look", "code": "print(1)"}] * 2 + [
        {"brief": json.dumps(brief_dict(callbacks=[{"date": "2026-1-15", "note": "x"}]))}
    ]
    interp = FakeInterpreter()
    result = run_producer(
        TARGET,
        config=cfg(max_iterations=2),
        lm_factory=dummy_factory(steps, []),
        interpreter_factory=lambda: interp,
        **_kwargs(tree, tmp_path),
    )
    assert result.status == "incomplete" and interp.shut
    assert result.brief is not None and result.brief.callbacks == []  # future date dropped
    assert result.citations is not None and result.citations.bad == 1
    assert result.brief_block.startswith("PRODUCER NOTES")
    for name in ("brief.json", "brief.md", "trajectory.json", "warnings.json", "summary.json"):
        assert (result.run_dir / name).is_file(), name
    s = read_json(result.run_dir / "summary.json")
    assert s["hit_cap"] and s["counts"]["moments"] == 1 and s["permitted_sessions"] == 2
    assert s["wiki_head"]["start"] == {"sha": None, "dirty": False}
    run_span = next(x for x in spans.get_finished_spans() if x.name == "mouthpiece.producer.run")
    assert run_span.attributes["mouthpiece.producer.status"] == "incomplete"


def test_failed_run_still_writes_artifacts(tree, tmp_path, spans) -> None:
    class DyingProvider(DummyLM):
        def forward(self, prompt: Any = None, messages: Any = None, **kwargs: Any) -> Any:
            if self.meter.role == "main" and self.meter.calls >= 1:  # ty: ignore[unresolved-attribute]
                raise RuntimeError("provider down")
            return super().forward(prompt=prompt, messages=messages, **kwargs)

    class Dying(ProducerMetering, DyingProvider):
        pass

    def factory(model: str, role: str) -> Dying:
        return Dying([{"reasoning": "r", "code": "print(1)"}], role=role)

    result = run_producer(
        TARGET,
        config=cfg(max_iterations=5),
        lm_factory=factory,
        interpreter_factory=FakeInterpreter,
        **_kwargs(tree, tmp_path),
    )
    assert result.status == "failed" and result.brief is None
    assert result.error == "RuntimeError: provider down"
    assert not (result.run_dir / "brief.json").exists()
    assert read_json(result.run_dir / "summary.json")["status"] == "failed"
    assert read_json(result.run_dir / "warnings.json")["drop_rate"] is None


@pytest.mark.skipif(not deno_available(), reason="needs deno (just mouthpiece-sandbox-warm)")
def test_submit_through_real_deno(tree, tmp_path, spans) -> None:
    bad = json.dumps(brief_dict(moments=[]))  # violates min_length → dspy type error, retry
    good = json.dumps(brief_dict())
    steps = [
        {
            "reasoning": "look things up",
            "code": "eps = list_episodes()\nr = resolve_name('Galzoo')\n"
            "print(len(eps), r['canonical'], search_wiki('sister')[0]['path'])",
        },
        {
            "reasoning": "submit too early",
            "code": f"import json\nSUBMIT(brief=json.loads({bad!r}))",
        },
        {"reasoning": "fix it", "code": f"import json\nSUBMIT(brief=json.loads({good!r}))"},
    ]
    result = run_producer(
        TARGET,
        config=cfg(max_iterations=6),
        lm_factory=dummy_factory(steps, []),
        interpreter_factory=make_interpreter,
        **_kwargs(tree, tmp_path),
    )
    assert result.status == "ok", result.error
    assert result.brief is not None and result.brief.lore[0].page == "People/Galzu"
    traj = read_json(result.run_dir / "trajectory.json")["entries"]
    assert "2 Galzu People/Galzu" in traj[0]["output"]
    assert "Error" in traj[1]["output"]  # the invalid submit came back to the loop
    tool_spans = {s.name for s in spans.get_finished_spans()}
    assert "mouthpiece.producer.tool.resolve_name" in tool_spans
