"""MeteredLM accounting, tool telemetry, and HeartwoodRLM robustness (0033 D33-8..D33-10).

Hermetic: no network, no Deno. LMs are ``DummyLM`` / a fake provider LM mixed with
``MeteringMixin`` (the same code path as the production ``MeteredLM``); spans go to an
in-memory exporter; metric instruments are swapped for recording fakes.
"""

from __future__ import annotations

import copy
import inspect
from pathlib import Path
from typing import Any

import dspy
import pytest
from astra_heartwood.agent import rlm as rlm_mod
from astra_heartwood.agent import telemetry
from astra_heartwood.agent.rlm import (
    PARSE_ERROR_OUTPUT,
    HeartwoodRLM,
    MeteredLM,
    MeteringMixin,
)
from astra_heartwood.agent.run import determine_status
from astra_heartwood.agent.telemetry import LmMeter, RunParent, instrument_tool, tool_outcome
from astra_llm import make_dspy_lm
from dspy.dsp.utils.utils import dotdict
from dspy.primitives.python_interpreter import PythonInterpreter
from dspy.utils.dummies import DummyLM
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter


class MeteredDummyLM(MeteringMixin, DummyLM):
    """DummyLM metered through the production mixin (DummyLM reports no cost)."""


def _provider_response(cost: float | None) -> dotdict:
    msg = dotdict(content="hello", tool_calls=None)
    return dotdict(
        choices=[dotdict(message=msg, finish_reason="stop")],
        usage=dotdict(prompt_tokens=10, completion_tokens=4, total_tokens=14),
        model="fake",
        _hidden_params={"response_cost": cost},
    )


class _Base(dspy.BaseLM):
    """A provider stand-in under the mixin: pops the next scripted cost per call."""

    costs: list[float | None]

    def forward(self, prompt: Any = None, messages: Any = None, **kwargs: Any) -> Any:
        return _provider_response(self.costs.pop(0))


class ProviderLM(MeteringMixin, _Base):
    def __init__(self, costs: list[float | None], **kwargs: Any) -> None:
        super().__init__("openrouter/fake/model", **kwargs)
        self.costs = list(costs)


class Recorder:
    def __init__(self) -> None:
        self.adds: list[tuple[float, dict[str, Any]]] = []

    def add(self, value: float, attrs: dict[str, Any] | None = None) -> None:
        self.adds.append((value, dict(attrs or {})))


@pytest.fixture
def fake_metrics(monkeypatch: pytest.MonkeyPatch) -> dict[str, Recorder]:
    recs = {k: Recorder() for k in ("runs", "pages", "tool_calls", "llm_tokens", "llm_cost")}
    for mod in (telemetry, rlm_mod):
        monkeypatch.setattr(mod, "instruments", lambda: recs)
    return recs


@pytest.fixture
def spans(monkeypatch: pytest.MonkeyPatch) -> InMemorySpanExporter:
    exporter = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    local = provider.get_tracer("test")
    for mod in (telemetry, rlm_mod):
        monkeypatch.setattr(mod, "tracer", lambda: local)
    return exporter


# ── MeteredLM accounting (D33-8) ──
def test_meter_matches_dspy_history_and_sums_cost(fake_metrics, spans) -> None:
    lm = ProviderLM([0.002, 0.003], role="main")
    assert lm("hi") == ["hello"]
    lm("again")
    snap = lm.meter.snapshot()
    assert snap == {
        "calls": 2,
        "errors": 0,
        "prompt_tokens": 20,
        "completion_tokens": 8,
        "cost_usd": pytest.approx(0.005),
    }
    # the meter reads exactly what dspy writes into history (base_lm.py:109-110)
    assert [h["cost"] for h in lm.history] == [0.002, 0.003]
    assert sum(h["usage"]["prompt_tokens"] for h in lm.history) == snap["prompt_tokens"]
    assert ("llm_cost", 0.002) in [("llm_cost", v) for v, _ in fake_metrics["llm_cost"].adds]
    kinds = {(a["role"], a["kind"]) for _, a in fake_metrics["llm_tokens"].adds}
    assert kinds == {("main", "prompt"), ("main", "completion")}
    assert [s.name for s in spans.get_finished_spans()] == ["heartwood.llm.call"] * 2


def test_one_unknown_cost_makes_the_total_unknown_never_zero(fake_metrics, spans) -> None:
    lm = ProviderLM([0.002, None], role="sub")
    lm("a")
    assert lm.meter.cost == pytest.approx(0.002)
    lm("b")
    assert lm.meter.cost is None and lm.meter.snapshot()["cost_usd"] is None
    assert lm.meter.calls == 2


def test_dummy_lm_cost_is_unknown(fake_metrics, spans) -> None:
    lm = MeteredDummyLM([{"answer": "x"}], role="main")
    lm("q")
    assert lm.meter.snapshot()["cost_usd"] is None
    assert lm.meter.calls == 1


def test_accounting_survives_lm_copy_and_deepcopy(fake_metrics, spans) -> None:
    lm = ProviderLM([0.001, 0.001, 0.001], role="main")
    parent = lm.parent
    clone = lm.copy(temperature=0.5)  # BaseLM.copy deep-copies (base_lm.py:203)
    deep = copy.deepcopy(lm)
    assert clone is not lm and deep is not lm
    assert clone.meter is lm.meter and deep.meter is lm.meter
    assert clone.parent is parent and deep.parent is parent
    clone("x")
    deep("y")
    lm("z")
    assert lm.meter.calls == 3 and lm.meter.cost == pytest.approx(0.003)


def test_real_metered_lm_builds_via_make_dspy_lm_without_network() -> None:
    lm = make_dspy_lm(
        "openrouter/deepseek/deepseek-v4.1-flash",
        max_tokens=64000,
        lm_class=MeteredLM,
        cache=False,
        role="sub",
    )
    assert isinstance(lm, MeteredLM) and isinstance(lm, dspy.LM)
    assert lm.role == "sub" and lm.cache is False and lm.kwargs["max_tokens"] == 64000
    other = make_dspy_lm("openrouter/x/y", lm_class=MeteredLM, role="main")
    assert other.meter is not lm.meter  # distinct instances, distinct accumulators
    assert lm.copy().meter is lm.meter


def test_lm_span_parented_to_run_span_across_threads(fake_metrics, spans) -> None:
    from concurrent.futures import ThreadPoolExecutor

    lm = ProviderLM([0.001] * 4, role="sub")
    tr = telemetry.tracer()
    with tr.start_as_current_span("heartwood.agent.run") as run_span:
        lm.parent.ctx = trace.set_span_in_context(run_span)
        with ThreadPoolExecutor(max_workers=4) as pool:  # drops contextvars, like rlm.py:266
            list(pool.map(lm, ["a", "b", "c", "d"]))
    run_id = run_span.get_span_context().span_id
    calls = [s for s in spans.get_finished_spans() if s.name == "heartwood.llm.call"]
    assert len(calls) == 4
    assert all(s.parent is not None and s.parent.span_id == run_id for s in calls)


def test_lm_errors_are_counted_and_reraised(fake_metrics, spans) -> None:
    class Boom(MeteringMixin, dspy.BaseLM):
        pass

    lm = Boom("openrouter/x/y", role="main")
    with pytest.raises(NotImplementedError):
        lm("x")
    assert lm.meter.errors == 1 and lm.meter.calls == 0


def test_lm_meter_snapshot_shape() -> None:
    m = LmMeter(role="main")
    m.add(prompt=1, completion=2, cost=0.5)
    assert m.snapshot()["cost_usd"] == 0.5
    assert copy.deepcopy(m) is m


# ── tool telemetry (D33-10) ──
def _tool(path: str, regex: bool = False) -> list[dict[str, Any]]:
    """Search `path`. Returns [{'path'}]. Raises ValueError on 'bad'."""
    if path == "bad":
        raise ValueError("bad path")
    return [{"path": path}]


def _writer(path: str, text: str) -> str:
    """Write. Returns 'created <path>' or 'rejected: <report>'."""
    return "rejected: nope" if "X" in text else f"created {path}"


def test_tool_wrapper_preserves_name_doc_and_signature() -> None:
    wrapped = instrument_tool(_tool, RunParent())
    assert getattr(wrapped, "__name__", None) == "_tool" and wrapped.__doc__ == _tool.__doc__
    assert inspect.signature(wrapped) == inspect.signature(_tool)
    a, b = dspy.Tool(_tool), dspy.Tool(wrapped)
    assert (b.name, b.desc, b.args) == (a.name, a.desc, a.args)
    interp = PythonInterpreter()
    assert interp._extract_parameters(wrapped) == interp._extract_parameters(_tool)


class _Box:
    def find(self, where: Path, limit: int = 3) -> list[str]:
        """Find under `where`. Returns paths."""
        return [str(where)][:limit]


def test_tool_wrapper_on_bound_methods_keeps_tool_docs() -> None:
    # A bound method whose string annotation (`Path`) is not importable from the
    # telemetry module: get_type_hints must follow __wrapped__ to the method's globals.
    original = _Box().find
    w = instrument_tool(original, RunParent())
    assert (dspy.Tool(w).name, dspy.Tool(w).desc, dspy.Tool(w).args) == (
        dspy.Tool(original).name, dspy.Tool(original).desc, dspy.Tool(original).args,
    )  # fmt: skip
    assert list(inspect.signature(w).parameters) == ["where", "limit"]
    assert w(Path("/x")) == ["/x"]


def test_tool_wrapper_outcomes_spans_and_reraise(fake_metrics, spans) -> None:
    parent = RunParent()
    tool, writer = instrument_tool(_tool, parent), instrument_tool(_writer, parent)
    tr = telemetry.tracer()
    with tr.start_as_current_span("heartwood.agent.run") as run_span:
        parent.ctx = trace.set_span_in_context(run_span)
    assert tool("Bestiary/Auger") == [{"path": "Bestiary/Auger"}]
    with pytest.raises(ValueError, match="bad path"):
        tool("bad")
    assert writer("A", "X") == "rejected: nope"
    assert writer("A", "ok") == "created A"
    outcomes = [(a["tool"], a["outcome"]) for _, a in fake_metrics["tool_calls"].adds]
    assert outcomes == [
        ("_tool", "ok"), ("_tool", "raised"), ("_writer", "rejected"), ("_writer", "ok"),
    ]  # fmt: skip
    finished = [s for s in spans.get_finished_spans() if s.name.startswith("heartwood.tool.")]
    names = [s.name for s in finished]
    assert names == ["heartwood.tool._tool"] * 2 + ["heartwood.tool._writer"] * 2
    run_id = run_span.get_span_context().span_id
    assert all(s.parent is not None and s.parent.span_id == run_id for s in finished)
    assert tool_outcome("rejected: x") == "rejected" and tool_outcome(["rejected:"]) == "ok"


# ── HeartwoodRLM (D33-9) ──
class FakeInterpreter:
    """A CodeInterpreter stand-in: records code, returns 'ran'."""

    def __init__(self) -> None:
        self.tools: dict[str, Any] = {}
        self.output_fields: list[dict[str, Any]] | None = None
        self.codes: list[str] = []

    def execute(self, code: str, variables: dict[str, Any] | None = None) -> str:
        self.codes.append(code)
        return "ran"

    def shutdown(self) -> None:
        pass


def test_malformed_reply_costs_one_iteration_not_the_run(fake_metrics, spans) -> None:
    # One malformed step = two LM calls: ChatAdapter, then its JSONAdapter fallback
    # (dspy adapters/chat_adapter.py:71-85), both unparseable.
    main = MeteredDummyLM(
        [
            {"garbage": "x"},
            {"garbage": "y"},
            {"reasoning": "look", "code": "```python\nprint(1)\n```"},
            {"changelog": "- forced"},
        ],
        role="main",
    )
    interp = FakeInterpreter()
    agent = HeartwoodRLM("q -> changelog", max_iterations=2, interpreter=interp)
    with dspy.context(lm=main):
        pred = agent(q="hi")
    assert agent.parse_errors == 1 and agent.iterations == 2 and agent.hit_cap
    first = pred.trajectory[0]
    assert first["code"] == "" and first["output"].startswith(PARSE_ERROR_OUTPUT)
    assert pred.trajectory[1]["output"] == "ran"
    assert pred.changelog == "- forced"
    assert main.meter.calls == 4


def test_history_mirrored_when_the_run_dies(fake_metrics, spans) -> None:
    class Dying(MeteredDummyLM):
        def forward(self, prompt: Any = None, messages: Any = None, **kwargs: Any) -> Any:
            if self.meter.calls >= 1:
                raise RuntimeError("provider down")
            return super().forward(prompt=prompt, messages=messages, **kwargs)

    main = Dying([{"reasoning": "r", "code": "print(2)"}], role="main")
    agent = HeartwoodRLM("q -> changelog", max_iterations=5, interpreter=FakeInterpreter())
    with dspy.context(lm=main), pytest.raises(RuntimeError, match="provider down"):
        agent(q="hi")
    assert agent.iterations == 2 and not agent.hit_cap
    assert [e["code"] for e in agent.trajectory()] == ["print(2)"]


def test_submit_is_ok_and_state_resets_per_call(fake_metrics, spans) -> None:
    class SubmitInterp(FakeInterpreter):
        def execute(self, code: str, variables: dict[str, Any] | None = None) -> Any:
            from dspy.primitives.code_interpreter import FinalOutput

            return FinalOutput({"changelog": "- done"})

    main = MeteredDummyLM(
        [{"reasoning": "r", "code": "SUBMIT(changelog='- done')"}] * 2, role="main"
    )
    agent = HeartwoodRLM("q -> changelog", max_iterations=3, interpreter=SubmitInterp())
    with dspy.context(lm=main):
        assert agent(q="a").changelog == "- done"
        agent.hit_cap = True
        agent(q="b")
    assert agent.iterations == 1 and not agent.hit_cap


# ── outcome (D33-9) ──
def test_determine_status() -> None:
    assert determine_status(error=None, hit_cap=False) == "ok"
    assert determine_status(error=None, hit_cap=True) == "incomplete"
    assert determine_status(error=RuntimeError("x"), hit_cap=False) == "failed"
    assert determine_status(error=RuntimeError("extract"), hit_cap=True) == "incomplete"
