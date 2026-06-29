"""The per-session review store (Phase 4) — the Python side of the review.kdl contract.

review.kdl is WRITTEN by the heartwood-frontend (TS, hand-rolled KDL) and READ here by
``just heartwood-apply``; the apply pass also re-writes it to stamp ``committed-at``
(idempotence). So the serializer here must match the TS one byte-for-byte — a shared
fixture (``tests/fixtures/review-sample.kdl``) round-trips on BOTH sides as the gate
(B3: KDL emit is hand-rolled on both ends, never a library ``format``).

Metadata only — the prose lives in the proposal ``.vellum`` (P4.5).
"""

from __future__ import annotations

from typing import Any, Literal

from astra_config.kdl import snake
from pydantic import BaseModel, ConfigDict

DecisionState = Literal["pending", "approved", "rejected", "deferred"]


class _Base(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Decision(_Base):
    id: str
    state: DecisionState
    target_path: str | None = None  # the human's re-placement (P4.9), overrides the manifest
    rejection_reason: str | None = None
    decided_at: str | None = None
    committed_at: str | None = None  # set ONLY by apply — the idempotence stamp


class ConflictResolution(_Base):
    page_id: str
    claim: str
    resolution: Literal["accepted", "rejected"]


class RegistryDecision(_Base):
    canonical: str
    state: Literal["approved", "rejected"]


class ReviewState(_Base):
    date: str
    updated_at: str | None = None
    decisions: list[Decision] = []
    conflict_resolutions: list[ConflictResolution] = []
    registry_decisions: list[RegistryDecision] = []


def empty_review_state(date: str) -> ReviewState:
    return ReviewState(date=date)


# ── serialize (must match the TS hand-rolled writer byte-for-byte) ───────────
def _kdl_str(s: str) -> str:
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def _prop(key: str, value: str | None) -> str:
    return f" {key}={_kdl_str(value)}" if value is not None else ""


def serialize_review_state(s: ReviewState) -> str:
    lines: list[str] = [f"review {_kdl_str(s.date)}{_prop('updated-at', s.updated_at)} {{"]
    for d in s.decisions:
        lines.append(
            f"    decision{_prop('id', d.id)}{_prop('state', d.state)}"
            f"{_prop('target-path', d.target_path)}{_prop('rejection-reason', d.rejection_reason)}"
            f"{_prop('decided-at', d.decided_at)}{_prop('committed-at', d.committed_at)}"
        )
    for c in s.conflict_resolutions:
        lines.append(
            f"    conflict-res{_prop('page-id', c.page_id)}{_prop('claim', c.claim)}"
            f"{_prop('resolution', c.resolution)}"
        )
    for r in s.registry_decisions:
        lines.append(
            f"    registry-decision{_prop('canonical', r.canonical)}{_prop('state', r.state)}"
        )
    lines.append("}")
    return "\n".join(lines) + "\n"


# ── parse (explicit walk; the manifest.py idiom) ─────────────────────────────
def _props(node: Any) -> dict[str, Any]:
    return {snake(k): v for k, v in node.properties.items()}


def parse_review_state(text: str) -> ReviewState:
    import ckdl

    _ckdl: Any = ckdl
    doc = _ckdl.parse(text)
    root = next(n for n in doc.nodes if n.name == "review")
    head = _props(root)

    decisions: list[Decision] = []
    conflict_resolutions: list[ConflictResolution] = []
    registry_decisions: list[RegistryDecision] = []

    for node in root.children:
        p = _props(node)
        if node.name == "decision":
            decisions.append(
                Decision(
                    id=str(p["id"]),
                    state=p["state"],
                    target_path=(str(p["target_path"]) if "target_path" in p else None),
                    rejection_reason=(
                        str(p["rejection_reason"]) if "rejection_reason" in p else None
                    ),
                    decided_at=(str(p["decided_at"]) if "decided_at" in p else None),
                    committed_at=(str(p["committed_at"]) if "committed_at" in p else None),
                )
            )
        elif node.name == "conflict-res":
            conflict_resolutions.append(
                ConflictResolution(
                    page_id=str(p["page_id"]), claim=str(p["claim"]), resolution=p["resolution"]
                )
            )
        elif node.name == "registry-decision":
            registry_decisions.append(
                RegistryDecision(canonical=str(p["canonical"]), state=p["state"])
            )

    return ReviewState(
        date=str(root.args[0]),
        updated_at=(str(head["updated_at"]) if "updated_at" in head else None),
        decisions=decisions,
        conflict_resolutions=conflict_resolutions,
        registry_decisions=registry_decisions,
    )
