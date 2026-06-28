"""The runtime resolution seam — `resolve(name)` over the committed registry, with
telemetry. The pure engine + thresholds live in `astra_ontology.resolve`; this wraps a
cached `Resolver` over `entity.kdl` and emits the `astra.heartwood.resolve` span/metric
(per telemetry-built-in). Phase-2/3's proposer calls this.
"""

from __future__ import annotations

from functools import lru_cache

from astra_observe import get_meter, get_tracer
from astra_ontology import EntityKind, Resolution, Resolver

from . import load_entities

_tracer = get_tracer("astra.heartwood")
_meter = get_meter("astra.heartwood")
_resolve_calls = _meter.create_counter(
    "astra.heartwood.resolve", description="entity resolve calls"
)


@lru_cache(maxsize=1)
def _resolver() -> Resolver:
    return Resolver(load_entities())


def reload_registry() -> None:
    """Drop the cached resolver (e.g. after a re-seed in a long-running process)."""
    _resolver.cache_clear()


def resolve(name: str, *, kind_hint: EntityKind | None = None) -> Resolution:
    """Resolve a (possibly garbled) mention to a registry entity. See
    `astra_ontology.Resolution` for the status/candidates/confidence contract."""
    with _tracer.start_as_current_span("astra.heartwood.resolve") as span:
        result = _resolver().resolve(name, kind_hint=kind_hint)
        span.set_attribute("resolve.status", result.status)
        span.set_attribute("resolve.confidence", result.confidence)
        span.set_attribute("resolve.kind_hint", kind_hint or "")
        if result.entity is not None:
            span.set_attribute("resolve.entity", result.entity.canonical)
        _resolve_calls.add(1, {"status": result.status, "kind_hint": kind_hint or ""})
        return result
