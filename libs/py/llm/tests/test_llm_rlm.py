"""astra_llm.rlm under a non-heartwood scope (0034 D34-1). heartwood's own suite covers
its bindings; these pin that the lifted pieces take their names from the caller."""

from __future__ import annotations

from typing import Any

import dspy
import pytest
from astra_llm import rlm as rlm_mod
from astra_llm.rlm import (
    HardenedRLM,
    MeteringMixin,
    RunParent,
    budget_warn_from,
    combined_cost,
    default_budget_note,
    instrument_tool,
)
from dspy.dsp.utils.utils import dotdict
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter


class Recorder:
    def __init__(self) -> None:
        self.adds: list[tuple[float, dict[str, Any]]] = []

    def add(self, value: float, attrs: dict[str, Any] | None = None) -> None:
        self.adds.append((value, dict(attrs or {})))


@pytest.fixture
def exporter() -> InMemorySpanExporter:
    return InMemorySpanExporter()


@pytest.fixture
def local_tracer(exporter: InMemorySpanExporter) -> Any:
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    return provider.get_tracer("test")


def _response(cost: float | None) -> dotdict:
    msg = dotdict(content="hello", tool_calls=None)
    return dotdict(
        choices=[dotdict(message=msg, finish_reason="stop")],
        usage=dotdict(prompt_tokens=7, completion_tokens=3, total_tokens=10),
        model="fake",
        _hidden_params={"response_cost": cost},
    )


class _Provider(dspy.BaseLM):
    costs: list[float | None]

    def forward(self, prompt: Any = None, messages: Any = None, **kwargs: Any) -> Any:
        return _response(self.costs.pop(0))


def test_mixin_uses_the_subclass_names(local_tracer, exporter) -> None:
    recs = {"llm_tokens": Recorder(), "llm_cost": Recorder()}

    class ProducerLM(MeteringMixin, _Provider):
        scope = "astra.test"
        span_name = "test.llm.call"
        attr_prefix = "test.llm"

        def _tracer(self) -> Any:
            return local_tracer

        def _instruments(self) -> dict[str, Any]:
            return recs

    lm = ProducerLM("openrouter/fake/model", role="sub")
    lm.costs = [0.01, None]
    lm("a")
    lm("b")
    spans = exporter.get_finished_spans()
    assert [s.name for s in spans] == ["test.llm.call"] * 2
    assert spans[0].attributes["test.llm.role"] == "sub"
    assert spans[0].attributes["test.llm.cost_usd"] == pytest.approx(0.01)
    assert spans[1].attributes["test.llm.cost_known"] is False
    assert lm.meter.cost is None and lm.meter.calls == 2
    assert recs["llm_cost"].adds == [(0.01, {"model": "openrouter/fake/model", "role": "sub"})]


def test_llm_instruments_are_named_by_scope_and_cached() -> None:
    a = rlm_mod.llm_instruments("astra.test-scope")
    assert a is rlm_mod.llm_instruments("astra.test-scope")
    assert set(a) == {"llm_tokens", "llm_cost"}


def test_combined_cost_unknown_wins() -> None:
    assert combined_cost([{"cost_usd": 0.1}, {"cost_usd": 0.2}]) == pytest.approx(0.3)
    assert combined_cost([{"cost_usd": 0.1}, {"cost_usd": None}]) is None


def test_instrument_tool_prefix_outcome_and_signature(local_tracer, exporter) -> None:
    calls = Recorder()

    def lookup(name: str, regex: bool = False) -> list[str]:
        """Find things."""
        if name == "boom":
            raise ValueError("no")
        return [name]

    wrapped = instrument_tool(
        lookup, RunParent(), prefix="test", tracer=lambda: local_tracer, calls=lambda: calls
    )
    assert getattr(wrapped, "__name__", None) == "lookup" and wrapped.__doc__ == "Find things."
    assert wrapped("x") == ["x"]
    with pytest.raises(ValueError):
        wrapped("boom")
    assert [s.name for s in exporter.get_finished_spans()] == ["test.tool.lookup"] * 2
    assert [a["outcome"] for _, a in calls.adds] == ["ok", "raised"]


def test_hardened_rlm_uses_the_supplied_budget_note() -> None:
    class Sig(dspy.Signature):
        """Answer."""

        question: str = dspy.InputField()
        answer: str = dspy.OutputField()

    rlm = HardenedRLM(Sig, max_iterations=10, budget_note=lambda s, m: f"NOTE {s}/{m}")
    history = rlm.repl_history.append(reasoning="r", code="print(1)", output="1")
    noted = rlm._with_budget_note(history, budget_warn_from(10))
    assert noted.entries[-1].output.endswith(f"NOTE {budget_warn_from(10) + 1}/10")
    # default note when none is supplied
    plain = HardenedRLM(Sig, max_iterations=10)
    assert plain._budget_note is default_budget_note
    assert "SUBMIT" in default_budget_note(9, 10) and "1 step." in default_budget_note(9, 10)


def test_make_interpreter_default_is_dspy_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(rlm_mod.CACHED_ONLY_ENV, raising=False)
    interp = rlm_mod.make_interpreter()
    assert "--cached-only" not in interp.deno_command


def test_make_interpreter_cached_only_command(monkeypatch: pytest.MonkeyPatch) -> None:
    from dspy.primitives.python_interpreter import PythonInterpreter

    monkeypatch.setenv(rlm_mod.CACHED_ONLY_ENV, "1")
    # _get_deno_dir is lru_cached on first use, so stub it rather than DENO_DIR
    monkeypatch.setattr(PythonInterpreter, "_get_deno_dir", lambda self: "/opt/deno")
    interp = rlm_mod.make_interpreter()
    cmd = interp.deno_command
    assert cmd[:3] == ["deno", "run", "--cached-only"]
    assert cmd[3].startswith("--allow-read=") and cmd[3].endswith(",/opt/deno")
    assert cmd[-1].endswith("runner.js") and cmd[3].split("=", 1)[1].split(",")[0] == cmd[-1]


def test_make_interpreter_cached_only_needs_a_deno_dir(monkeypatch: pytest.MonkeyPatch) -> None:
    from dspy.primitives.python_interpreter import PythonInterpreter

    monkeypatch.setenv(rlm_mod.CACHED_ONLY_ENV, "1")
    monkeypatch.setattr(PythonInterpreter, "_get_deno_dir", lambda self: None)
    with pytest.raises(RuntimeError, match="DENO_DIR"):
        rlm_mod.make_interpreter()


@pytest.mark.skipif(not rlm_mod.deno_available(), reason="needs deno (warmed cache)")
def test_cached_only_sandbox_executes(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(rlm_mod.CACHED_ONLY_ENV, "1")
    interp = rlm_mod.make_interpreter()
    try:
        assert interp.execute("print(6 * 7)").strip() == "42"
    finally:
        interp.shutdown()
