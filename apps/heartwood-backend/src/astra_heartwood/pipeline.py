"""The Phase-2 orchestration (spec §9) — filter → extract → resolve → SessionFacts.

``build_session_facts(date)`` is the pure, Dagster-free core (the asset and the host
``main`` both call it); it returns None for a non-faerrin / unmatched / excluded session.
Telemetry is wired from day one: the ``astra.heartwood.extract`` span + the
``facts_extracted`` / ``spans_dropped`` metrics (resolve() emits its own span per fact).
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

from astra_linguist.models import Transcript
from astra_observe import get_meter, get_tracer
from astra_ontology.models import Being

from .extract import extract_facts
from .filter import filter_session
from .llm import StructuredClient, default_model, real_client
from .models import SessionFacts
from .refine import refine_facts
from .resolve_facts import resolve_fact
from .sessions import faerrin_session, load_corrected_transcript

APP_ROOT = Path(__file__).resolve().parents[2]
FACTS_DIR = APP_ROOT / "facts"

_tracer = get_tracer("astra.heartwood")
_meter = get_meter("astra.heartwood")
_facts_extracted = _meter.create_counter(
    "astra.heartwood.facts_extracted", description="noun-facts extracted, by status/kind"
)
_spans_dropped = _meter.create_counter(
    "astra.heartwood.spans_dropped", description="filter-dropped spans, by category"
)
_facts_refined_out = _meter.create_counter(
    "astra.heartwood.facts_refined_out", description="facts dropped by the refinement pass (events)"
)


def _atomic_write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(text)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def _session_facts(
    date: str,
    show: str,
    transcript: Transcript,
    *,
    client: StructuredClient | None = None,
    model: str | None = None,
) -> SessionFacts:
    """Filter → extract → resolve one loaded transcript into SessionFacts."""
    client = client if client is not None else real_client()
    model = model if model is not None else default_model()
    with _tracer.start_as_current_span("astra.heartwood.extract") as span:
        filtered = filter_session(transcript, client=client, model=model)
        resolved = [
            resolve_fact(f) for f in extract_facts(filtered.kept_text, client=client, model=model)
        ]
        facts, refined_out = refine_facts(resolved, client=client, model=model)
        span.set_attribute("facts", len(facts))
        span.set_attribute("facts.refined_out", len(refined_out))
        span.set_attribute("windows.kept", filtered.windows_kept)
        span.set_attribute("windows.dropped", filtered.windows_dropped)
        for f in facts:
            _facts_extracted.add(1, {"status": f.status, "kind": f.kind_hint or ""})
        for d in filtered.dropped:
            _spans_dropped.add(1, {"category": d.category})
        _facts_refined_out.add(len(refined_out))
    # world is "faerrin" by construction — faerrin_session only matches faerrin campaigns (P2.3).
    return SessionFacts(
        date=date,
        show=show,
        world="faerrin",
        facts=facts,
        refined_out=refined_out,
        dropped=filtered.dropped,
    )


def build_session_facts(
    date: str,
    *,
    client: StructuredClient | None = None,
    model: str | None = None,
    being: Being | None = None,
) -> SessionFacts | None:
    """One session's facts, or None if it is not an ingestible faerrin-world session."""
    show = faerrin_session(date, being=being)
    if show is None:
        return None
    transcript = load_corrected_transcript(date)
    return _session_facts(date, show, transcript, client=client, model=model)


def main() -> None:
    """Host entry-point (``astra-heartwood-extract <date>``) for the acceptance run."""
    from astra_observe import init_telemetry, shutdown

    init_telemetry("astra.heartwood")
    try:
        if len(sys.argv) != 2:
            print("usage: astra-heartwood-extract <date>", file=sys.stderr)
            raise SystemExit(2)
        date = sys.argv[1]
        facts = build_session_facts(date)
        if facts is None:
            print(f"{date}: skipped (non-faerrin / unmatched / excluded)")
            return
        _atomic_write(FACTS_DIR / f"{date}.json", facts.model_dump_json(indent=2))
        print(
            f"{date} [{facts.show}]: {len(facts.facts)} facts, "
            f"{len(facts.dropped)} dropped spans → facts/{date}.json"
        )
    finally:
        shutdown()  # console_script exit → flush the run's spans/metrics/logs


if __name__ == "__main__":
    main()
