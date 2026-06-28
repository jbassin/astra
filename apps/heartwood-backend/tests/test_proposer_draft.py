"""Phase-3 S3 — the draft stage (spec §7). Stub client, no network.

Verifies the user-message construction (create vs amend), and the parse-off of the draft's
trailing ``CONFLICTS:`` section (P3.17) and the ``ALREADY-KNOWN`` sentinel (P3.15). Live prose
quality is judged at the S5 acceptance run, not here.
"""

from __future__ import annotations

from astra_heartwood.proposer.draft import build_user, draft_page
from astra_heartwood.proposer.models import EntityKind, PageProposal, ProposalOp
from astra_llm import TextRequest


class _StubClient:
    """Returns a canned body; records the request so the prompt can be asserted."""

    def __init__(self, reply: str) -> None:
        self.reply = reply
        self.last: TextRequest | None = None

    def call_text(self, req: TextRequest) -> str:
        self.last = req
        return self.reply


def _create(
    *,
    op: ProposalOp = "create",
    target_path: str = "Bestiary/Augers",
    canonical: str = "Augers",
    kind: EntityKind = "creature",
) -> PageProposal:
    return PageProposal(
        id="bestiary-augers",
        op=op,
        target_path=target_path,
        canonical=canonical,
        kind=kind,
        status="unknown",
        page_type="stub",
        body_file="bestiary-augers.vellum",
        fact_claims=["Augers are creatures made by a divination ritual."],
    )


def test_create_user_message_has_subject_and_facts() -> None:
    p = _create()
    user = build_user(p, None)
    assert "Subject: Augers (a new page)" in user
    assert "- Augers are creatures made by a divination ritual." in user
    assert "Existing page prose" not in user  # no existing body on a create


def test_rewrite_user_message_includes_existing_body() -> None:
    p = _create(
        op="rewrite", target_path="Org/Iconoclasm/index", canonical="Iconoclasm", kind="org"
    )
    user = build_user(p, "You weren't the only one who heard the Voidsong.")
    assert "amending an existing page" in user
    assert "match its voice, POV, tense, and spelling" in user
    assert "You weren't the only one" in user


def test_draft_create_returns_body_no_conflicts() -> None:
    client = _StubClient(
        "Augers stir when fed, and the ritual that made them sharpens with each meal."
    )
    draft = draft_page(_create(), client=client, model="stub")
    assert draft.body.startswith("Augers stir when fed")
    assert draft.conflicts == [] and not draft.already_known
    assert client.last is not None and client.last.model == "stub"


def test_draft_parses_trailing_conflicts() -> None:
    reply = (
        "Iconoclasm hands out food and a bunk to anyone who hears the song.\n\n"
        "CONFLICTS:\n- Iconoclasm functions as an orphanage.\n- It is a religious order."
    )
    p = _create(
        op="rewrite", target_path="Org/Iconoclasm/index", canonical="Iconoclasm", kind="org"
    )
    draft = draft_page(
        p, "An existing mercenary-group description.", client=_StubClient(reply), model="m"
    )
    assert "CONFLICTS" not in draft.body
    assert draft.conflicts == [
        "Iconoclasm functions as an orphanage.",
        "It is a religious order.",
    ]


def test_draft_already_known_sentinel_on_rewrite() -> None:
    p = _create(
        op="rewrite", target_path="Org/Iconoclasm/index", canonical="Iconoclasm", kind="org"
    )
    draft = draft_page(
        p, "Body already states everything.", client=_StubClient("ALREADY-KNOWN"), model="m"
    )
    assert draft.already_known and draft.body == ""


def test_already_known_sentinel_ignored_on_create() -> None:
    # The sentinel is rewrite-only; a create that literally returns it keeps it as the body.
    draft = draft_page(_create(), client=_StubClient("ALREADY-KNOWN"), model="m")
    assert not draft.already_known
