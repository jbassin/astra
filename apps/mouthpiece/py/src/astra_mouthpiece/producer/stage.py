"""The pipeline stages around the producer, Dagster-free so they unit-test.

``produce_brief`` is the ``session_brief`` asset body: run the producer, keep only the latest
run's artifacts under ``episodes/<key>/producer/<run_id>/``, write ``brief.json`` on success and
remove any stale one on failure. It never raises an ``Exception`` — a failed producer must not
block the episode; the script falls back to the old prompt.

``script_brief_block`` is what ``session_script`` asks: the rendered brief and whether it was
``used``, absent (``fallback``) or unreadable (``invalid``, also a fallback).
"""

from __future__ import annotations

import shutil
from collections.abc import Callable
from pathlib import Path
from typing import Any, Literal

from astra_lexicon import load_corrections
from astra_sessions import atomic_write_text

from ..inputs import brief_path, episodes_root, read_brief
from ..models import HostConfig
from .brief import render_brief
from .run import new_run_id, run_producer
from .telemetry import log

BriefOutcome = Literal["used", "fallback", "invalid"]


def produce_brief(
    key: str,
    *,
    root: Path | None = None,
    producer: Callable[..., Any] = run_producer,
) -> dict[str, Any]:
    """Run the producer for session ``key``; return the asset metadata (never raises)."""
    base = (root if root is not None else episodes_root()) / key
    target = brief_path(key, root=base.parent)
    producer_dir = base / "producer"
    shutil.rmtree(producer_dir, ignore_errors=True)
    run_dir = producer_dir / new_run_id()
    try:
        result = producer(key, run_dir=run_dir)
    except Exception as exc:  # noqa: BLE001 -- setup errors raise before run_producer's own try; the episode falls back
        target.unlink(missing_ok=True)
        error = f"{type(exc).__name__}: {exc}"
        log.warning("mouthpiece brief %s failed — script will fall back: %s", key, error)
        return {"status": "failed", "error": error[:500]}

    s = result.summary
    meta: dict[str, Any] = {
        "status": result.status,
        "cost_usd": s.get("cost_usd"),
        "iterations": s.get("iterations"),
        "run_dir": str(result.run_dir),
    }
    if result.brief is not None and result.status in ("ok", "incomplete"):
        atomic_write_text(target, result.brief.model_dump_json(indent=2))
        meta.update(
            moments=len(result.brief.moments),
            callbacks=len(result.brief.callbacks),
            citations_bad=result.citations.bad if result.citations else 0,
        )
    else:
        target.unlink(missing_ok=True)
        meta["error"] = (result.error or "no valid brief")[:500]
        log.warning("mouthpiece brief %s failed — script will fall back: %s", key, meta["error"])
    return meta


def script_brief_block(
    key: str, hosts: HostConfig, *, root: Path | None = None
) -> tuple[str, BriefOutcome]:
    """The Pass A brief block for ``key`` and how it was obtained. Today's `defs.kdl`
    corrections run over it, since a brief written before an entry existed keeps the old
    spellings (it named Osyluth twice, as Oceloth and Ocelith, on 2026-10-28)."""
    try:
        brief = read_brief(key, root=root)
    except Exception as exc:  # noqa: BLE001 -- an unreadable brief falls back, logged
        log.warning("mouthpiece brief %s unreadable — falling back: %s", key, exc)
        return "", "invalid"
    if brief is None:
        return "", "fallback"
    newcomer = hosts.c.name if hosts.c is not None else "The newcomer"
    return load_corrections()(render_brief(brief, newcomer=newcomer)), "used"
