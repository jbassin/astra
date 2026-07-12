"""The KDL proposal manifest — serialize + explicit-walk parse (spec §9).

Hand-written, stable-ordered KDL (the ``entity.kdl`` precedent: KDL stays at the edge, never
threaded as raw nodes). ``manifest.kdl`` is the committed change-set head; each page's prose
lives in a sibling ``<id>.vellum`` referenced by ``body=``. A round-trip test
(``ProposalManifest`` → text → re-parse → equal) gates the schema.
"""

from __future__ import annotations

from typing import Any

from astra_config.kdl import snake

from .models import PageProposal, ProposalManifest, RegistryAddition, SkippedPage, UnplacedFact


def _kdl_str(s: str) -> str:
    """KDL v2 quoted string: escape backslash and double-quote (others literal)."""
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def _prop(key: str, value: str | None) -> str:
    """``key="value"`` (a leading space), or empty when value is None (omit the prop)."""
    return f" {key}={_kdl_str(value)}" if value is not None else ""


def serialize_manifest(m: ProposalManifest) -> str:
    """Serialize a ProposalManifest to deterministic KDL text (§9 shape)."""
    lines: list[str] = []
    head = f"proposal {_kdl_str(m.date)}{_prop('show', m.show)}{_prop('world', m.world)} {{"
    lines.append(head)

    for p in m.proposals:
        page = (
            f"    page {_kdl_str(p.target_path)}{_prop('op', p.op)}"
            f"{_prop('canonical', p.canonical)}"
            f"{_prop('kind', p.kind)}{_prop('status', p.status)}{_prop('page-type', p.page_type)}"
            f"{_prop('body', p.body_file)}{_prop('placement-note', p.placement_note)} {{"
        )
        lines.append(page)
        for claim in p.fact_claims:
            lines.append(f"        fact {_kdl_str(claim)}")
        lines.append("    }")

    for u in m.unplaced:
        lines.append(f"    unplaced{_prop('subject', u.subject)}{_prop('claim', u.claim)} {{")
        for canonical, score in u.candidates:
            lines.append(f"        candidate {_kdl_str(canonical)}{_prop('score', repr(score))}")
        lines.append("    }")

    for s in m.skipped:
        lines.append(f"    skipped{_prop('target-path', s.target_path)}{_prop('reason', s.reason)}")

    for r in m.registry_additions:
        lines.append(
            f"    registry-add{_prop('canonical', r.canonical)}{_prop('kind', r.kind)}"
            f"{_prop('suggested-path', r.suggested_path)}"
        )

    lines.append("}")
    return "\n".join(lines) + "\n"


def _props(node: Any) -> dict[str, Any]:
    """A node's ``key=value`` props, kebab→snake keyed (spec §5 note)."""
    return {snake(k): v for k, v in node.properties.items()}


def _arg(node: Any) -> str:
    return str(node.args[0])


def parse_manifest(text: str) -> ProposalManifest:
    """Explicit-walk parse of ``manifest.kdl`` text → ProposalManifest (round-trips serialize)."""
    doc = load_document_text(text)
    proposal_node = next(n for n in doc.nodes if n.name == "proposal")
    p = _props(proposal_node)

    proposals: list[PageProposal] = []
    unplaced: list[UnplacedFact] = []
    skipped: list[SkippedPage] = []
    registry_additions: list[RegistryAddition] = []

    for node in proposal_node.children:
        if node.name == "page":
            pp = _props(node)  # values are Any (ckdl) — pass Literal-typed props through verbatim
            body = str(pp["body"])
            proposals.append(
                PageProposal(
                    id=body[: -len(".vellum")] if body.endswith(".vellum") else body,
                    op=pp["op"],
                    target_path=_arg(node),
                    canonical=str(pp["canonical"]),
                    kind=pp.get("kind"),
                    status=pp["status"],
                    page_type=pp["page_type"],
                    body_file=body,
                    fact_claims=[_arg(c) for c in node.children if c.name == "fact"],
                    placement_note=(str(pp["placement_note"]) if "placement_note" in pp else None),
                )
            )
        elif node.name == "unplaced":
            up = _props(node)
            unplaced.append(
                UnplacedFact(
                    subject=str(up["subject"]),
                    claim=str(up["claim"]),
                    candidates=[
                        (_arg(c), float(str(_props(c)["score"])))
                        for c in node.children
                        if c.name == "candidate"
                    ],
                )
            )
        elif node.name == "skipped":
            sp = _props(node)
            skipped.append(SkippedPage(target_path=str(sp["target_path"]), reason=sp["reason"]))
        elif node.name == "registry-add":
            ra = _props(node)
            registry_additions.append(
                RegistryAddition(
                    canonical=str(ra["canonical"]),
                    kind=ra.get("kind"),
                    suggested_path=str(ra["suggested_path"]),
                )
            )

    return ProposalManifest(
        date=_arg(proposal_node),
        show=str(p["show"]),
        world=str(p["world"]),
        proposals=proposals,
        unplaced=unplaced,
        skipped=skipped,
        registry_additions=registry_additions,
    )


def load_document_text(text: str) -> Any:
    """Parse KDL text (the file helper ``load_document`` reads a path; we have a string).

    Route ckdl access through an ``Any`` handle — it ships no type stubs (the
    ``astra_config.kdl`` adapter does the same for ``parse``).
    """
    import ckdl

    _ckdl: Any = ckdl
    return _ckdl.parse(text)
