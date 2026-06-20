"""mouthpiece-backend unit tests (NLSpec 0008 gates B–F) — hermetic.

No live ElevenLabs/Anthropic call and no ffmpeg-on-PATH: the LLM client is a stub
implementing the `LlmClient` protocol (`call_text`/`call_tool`), grounding runs on
injected pages, and the golden fixtures are the committed faerrin `out/` pairs.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from astra_llm import TextRequest, ToolCallRequest
from astra_mouthpiece.digest import DigestParseError, distill_session, parse_digest
from astra_mouthpiece.grounding import (
    GroundingPage,
    folder_index_name,
    ground_digest,
    pages_from_corpus,
)
from astra_mouthpiece.hosts import load_hosts
from astra_mouthpiece.lint import compute_metrics, score_script
from astra_mouthpiece.models import Beat, HostConfig, HostPersona, Script, ScriptTurn, SessionDigest
from astra_mouthpiece.prompts import (
    build_dressing_system_prompt,
    build_improv_system_prompt,
    build_script_system_prompt,
)
from astra_mouthpiece.script import generate_one_shot, generate_two_pass, parse_script

GOLDEN = Path(__file__).parent / "fixtures" / "golden"
DIGESTS = sorted(GOLDEN.glob("*.digest.json"))
SCRIPTS = sorted(GOLDEN.glob("*.script.json"))

HOSTS = HostConfig(
    a=HostPersona(name="Bram", persona="fluent but imprecise", voice_id="va"),
    b=HostPersona(name="Maeve", persona="precise but terse", voice_id="vb"),
    c=HostPersona(name="Pip", persona="fast but scattered", voice_id="vc"),
)


# ── stub LLM client (the LlmClient protocol) ───────────────────────────────
class StubClient:
    """Records calls and returns canned responses — no network."""

    def __init__(self, *, text: str = "", tool: dict[str, Any] | None = None) -> None:
        self._text = text
        self._tool = tool or {}
        self.calls: list[str] = []

    def call_text(self, req: TextRequest) -> str:
        self.calls.append("text")
        self.last_text_req = req
        return self._text

    def call_tool(self, req: ToolCallRequest) -> dict[str, Any]:
        self.calls.append("tool")
        self.last_tool_req = req
        return self._tool


# ── distill / parse_digest (gate B) ────────────────────────────────────────
@pytest.mark.parametrize("path", DIGESTS, ids=lambda p: p.name)
def test_parse_digest_on_every_golden_fixture(path: Path) -> None:
    raw = json.loads(path.read_text())
    digest = parse_digest(raw["sessionId"], raw)
    assert digest.session_id == raw["sessionId"]
    assert digest.synopsis == raw["synopsis"]
    assert len(digest.beats) == len(raw["beats"])
    # Beats renumbered to a contiguous 1-based order.
    assert [b.order for b in digest.beats] == list(range(1, len(digest.beats) + 1))
    # camelCase tool keys mapped onto snake_case model fields.
    first = raw["beats"][0]
    assert digest.beats[0].summary == first["summary"]
    assert digest.beats[0].wiki_refs == first.get("wikiRefs", [])


def test_parse_digest_renumbers_out_of_order_beats() -> None:
    raw = {
        "synopsis": "s",
        "beats": [
            {"order": 5, "summary": "late"},
            {"order": 1, "summary": "early"},
        ],
        "discarded": [],
    }
    digest = parse_digest("sid", raw)
    assert [b.summary for b in digest.beats] == ["early", "late"]
    assert [b.order for b in digest.beats] == [1, 2]


def test_parse_digest_rejects_bad_shape() -> None:
    with pytest.raises(DigestParseError):
        parse_digest("sid", {"synopsis": "s", "beats": []})


def test_distill_session_uses_call_tool() -> None:
    client = StubClient(
        tool={"synopsis": "syn", "beats": [{"order": 1, "summary": "x"}], "discarded": []}
    )
    digest = distill_session(client, "sid", "2026-1-1", [(1, "Archie", "hello")])
    assert client.calls == ["tool"]
    assert digest.synopsis == "syn"
    assert digest.beats[0].summary == "x"
    # The transcript line made it into the user content.
    assert "Archie: hello" in client.last_tool_req.user_content


# ── prompts (gate C — verbatim load-bearing lines + interpolation) ──────────
def test_improv_prompt_is_the_raw_transcript_prompt() -> None:
    p = build_improv_system_prompt(HOSTS)
    assert "RAW, unedited recording of three friends" in p
    assert "At least a third of the lines should fail as standalone wit." in p
    # Host names interpolate into the speaker-label example.
    assert "Bram: what they said" in p
    assert "Maeve, and Pip" in p


def test_dressing_prompt_forbids_polishing() -> None:
    p = build_dressing_system_prompt(HOSTS)
    assert "You are a careful transcript FORMATTER, not a writer." in p
    assert "DO NOT improve the dialogue." in p
    assert "Bram → A" in p and "Maeve → B" in p and "Pip → C" in p


def test_script_system_prompt_has_the_imperfection_budget() -> None:
    p = build_script_system_prompt(HOSTS)
    assert "at least a third of all lines should fail as standalone wit" in p
    assert "HOST A — Bram, the Recapper. fluent but imprecise." in p


# ── grounding (gate D — akasha seam, pure over injected pages) ──────────────
def test_ground_digest_matches_by_title_and_basename() -> None:
    pages = [
        GroundingPage(path="Geography/Calaria/Wrenford", title="Wrenford", text="A town."),
        GroundingPage(path="People/Iridescent Host", title="The Iridescent Host", text="A god."),
        GroundingPage(path="unused/Nowhere", title="Nowhere", text="x"),
    ]
    digest = SessionDigest(
        session_id="s",
        synopsis="x",
        beats=[
            Beat(order=1, summary="b1", wiki_refs=["Wrenford", "the iridescent host"]),
            Beat(order=2, summary="b2", wiki_refs=["Wrenford", "Unmatched NPC"]),
        ],
    )
    entries = ground_digest(digest, pages)
    # Two distinct pages, in first-appearance order; Wrenford deduped; NPC dropped.
    assert [e.path for e in entries] == ["Geography/Calaria/Wrenford", "People/Iridescent Host"]
    assert entries[0].refs == ["Wrenford"]  # deduped across beats
    assert entries[1].title == "The Iridescent Host"


def test_folder_index_pages_title_by_parent_and_dont_collide() -> None:
    # 45/141 akasha pages are `…/index` folder-notes; they must title + match by the
    # PARENT folder name (faerrin folderIndexName), not collapse onto "index".
    from types import SimpleNamespace

    assert folder_index_name("Geography/Quiet Below/index") == "Quiet Below"
    assert folder_index_name("index") is None  # root index — no parent
    assert folder_index_name("Geography/Wrenford") is None  # not an index page

    def fake(path: str, title: str | None = None) -> SimpleNamespace:
        return SimpleNamespace(
            path=path,
            source="body text",
            metadata=SimpleNamespace(frontmatter=SimpleNamespace(title=title)),
        )

    pages = pages_from_corpus(
        [fake("Geography/Quiet Below/index"), fake("Divinity/index"), fake("Geography/Wrenford")]
    )
    titles = {p.path: p.title for p in pages}
    assert titles["Geography/Quiet Below/index"] == "Quiet Below"
    assert titles["Divinity/index"] == "Divinity"
    assert titles["Geography/Wrenford"] == "Wrenford"

    digest = SessionDigest(
        session_id="s",
        synopsis="x",
        beats=[Beat(order=1, summary="b", wiki_refs=["Quiet Below", "Divinity"])],
    )
    entries = ground_digest(digest, pages)
    # Both folder-index pages resolve by parent-folder name — no "index" collision.
    assert {e.path for e in entries} == {"Geography/Quiet Below/index", "Divinity/index"}


# ── two-pass script (gate C) ───────────────────────────────────────────────
def _digest() -> SessionDigest:
    return SessionDigest(
        session_id="sid", synopsis="syn", beats=[Beat(order=1, summary="they did a thing")]
    )


def test_two_pass_calls_text_then_tool() -> None:
    client = StubClient(
        text="Bram: hey\nMaeve: hi",
        tool={"title": "The Episode", "turns": [{"speaker": "A", "text": "hey"}]},
    )
    script = generate_two_pass(client, _digest(), [], HOSTS)
    assert client.calls == ["text", "tool"]  # Pass A (free-text) then Pass B (tool)
    assert script.title == "The Episode"
    assert script.turns[0].speaker == "A"
    assert script.hosts.a.name == "Bram"  # hosts come from ontology-being, not the model
    # Pass B dressed Pass A's transcript.
    assert "Bram: hey" in client.last_tool_req.user_content


def test_one_shot_uses_only_call_tool() -> None:
    client = StubClient(tool={"title": "T", "turns": [{"speaker": "B", "text": "word"}]})
    script = generate_one_shot(client, _digest(), [], HOSTS)
    assert client.calls == ["tool"]
    assert script.turns[0].speaker == "B"


def test_parse_script_rejects_bad_speaker() -> None:
    from astra_mouthpiece.script import ScriptParseError

    with pytest.raises(ScriptParseError):
        parse_script("sid", {"title": "t", "turns": [{"speaker": "Z", "text": "x"}]}, HOSTS)


# ── lint (gate E — verbatim metrics) ───────────────────────────────────────
def _script_from_fixture(path: Path) -> Script:
    raw = json.loads(path.read_text())
    turns = [ScriptTurn(speaker=t["speaker"], text=t["text"]) for t in raw["turns"]]
    return Script(session_id=raw["sessionId"], title=raw["title"], hosts=load_hosts(), turns=turns)


@pytest.mark.parametrize("path", SCRIPTS, ids=lambda p: p.name)
def test_lint_metrics_finite_on_every_reference_script(path: Path) -> None:
    report = score_script(_script_from_fixture(path))
    assert 0 <= report.mechanical_subtotal <= 10
    m = report.metrics
    assert m.turns > 0
    assert 0.0 <= m.disfluency_ratio <= 1.0
    assert 0.0 <= m.clean_line_ratio <= 1.0
    assert 0.0 <= m.vocab_spread <= 1.0


def test_lint_distinguishes_clean_from_tavern() -> None:
    clean = Script(
        session_id="s",
        title="t",
        hosts=HOSTS,
        turns=[
            ScriptTurn(speaker=s, text="This is a perfectly clean complete sentence.")
            for s in "ABC"
        ],
    )
    tavern = Script(
        session_id="s",
        title="t",
        hosts=HOSTS,
        turns=[
            ScriptTurn(speaker="A", text="—no but wait, the thing is they just—"),
            ScriptTurn(speaker="B", text="No."),
            ScriptTurn(speaker="C", text="I mean... maybe? but the green one — no, the blue—"),
        ],
    )
    cm = compute_metrics(clean)
    tm = compute_metrics(tavern)
    assert cm.clean_line_ratio > tm.clean_line_ratio
    assert tm.disfluency_ratio > cm.disfluency_ratio
