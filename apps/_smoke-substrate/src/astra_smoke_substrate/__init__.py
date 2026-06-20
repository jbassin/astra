"""Phase-1 exit-gate smoke — proves the whole substrate works end-to-end.

`main()` (the live gate): resolve the Anthropic key from KDL config + SOPS, init OTel,
and inside one span: round-trip ontology-being, then make one litellm→Claude structured
call with cost recorded. Run it against the live stack:

    cd /ruby/data/experiments/astra
    uv run astra-smoke-substrate          # needs deploy/ up + a real anthropic_api_key in SOPS

`run()` is split out so CI exercises the offline wiring (config + being + a stub client)
with no network — see tests/test_smoke.py.
"""

from __future__ import annotations

from typing import Any

from astra_llm import LiteLLMClient, ensure_anthropic_env
from astra_observe import get_tracer, init_telemetry, shutdown
from astra_ontology_being import CANONICAL_JSON_PATH
from astra_ontology_being import load as load_being
from astra_ontology_config import load as load_config
from pydantic import BaseModel

SERVICE_NAME = "astra.smoke-substrate"


class Heartbeat(BaseModel):
    """The structured output the substrate asks Claude to fill (forced-tool path)."""

    status: str
    note: str


def run(client: LiteLLMClient) -> dict[str, Any]:
    """The substrate exercise, parameterized on the LLM client (stub in tests).

    Reads config (KDL) + the SOPS-decrypted Anthropic key, round-trips ontology-being,
    and makes one structured Claude call. Returns a summary dict.
    """
    cfg = load_config()

    # Resolve the Anthropic key through astra_config (config.kdl → SOPS) and expose it to
    # litellm via the single sanctioned bridge — no ad-hoc env handling in app code.
    ensure_anthropic_env()

    # ontology-being round-trips against the committed canonical snapshot.
    being = load_being()
    from astra_ontology import canonical_json

    being_ok = canonical_json(being) == CANONICAL_JSON_PATH.read_text(encoding="utf-8")

    # One structured litellm→Claude call (forced tool → Pydantic), cost recorded to OTel.
    heartbeat = client.call_structured(
        Heartbeat,
        system="You are astra's substrate health check. Answer only through the record tool.",
        user_content=(
            "Record status='online' and a one-line note confirming astra's Phase 1 "
            "substrate (config, telemetry, ontology, llm) is live."
        ),
        model=cfg.llm.default_model,
        max_tokens=200,
        tool_name="record_heartbeat",
        tool_description="Record the substrate heartbeat status and a short note.",
    )

    return {
        "model": cfg.llm.default_model,
        "players": len(being.players),
        "being_parity": being_ok,
        "status": heartbeat.status,
        "note": heartbeat.note,
    }


def main() -> None:
    init_telemetry(SERVICE_NAME)
    tracer = get_tracer(SERVICE_NAME)
    try:
        with tracer.start_as_current_span("substrate-smoke") as span:
            span.set_attribute("astra.phase", 1)
            summary = run(LiteLLMClient())
            span.set_attribute("astra.being.players", summary["players"])
            span.set_attribute("astra.being.parity", summary["being_parity"])
            span.set_attribute("astra.llm.status", summary["status"])
        print("substrate smoke OK:", summary)
    finally:
        shutdown()  # force-flush spans + metrics before exit
