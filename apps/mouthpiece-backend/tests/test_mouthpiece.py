"""mouthpiece-backend unit tests (NLSpec 0008 gates C-F, reworked by 0024) — hermetic.

No live ElevenLabs/Anthropic call and no ffmpeg-on-PATH: the LLM client is a stub
implementing the `LlmClient` protocol (`call_text`/`call_tool`), grounding runs on
injected pages, and the golden fixtures are the committed faerrin `out/` pairs
(script-side only — 0024 replaced the beat-driven digest shape, so the `*.digest.json`
fixtures are read raw by episodes_index/snapshot/migrate tests, never parsed into a
`SessionDigest` here).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from astra_llm import TextRequest, ToolCallRequest
from astra_mouthpiece.grounding import (
    GroundingPage,
    folder_index_name,
    ground_digest,
    pages_from_corpus,
)
from astra_mouthpiece.hosts import load_hosts
from astra_mouthpiece.lint import compute_metrics, score_script
from astra_mouthpiece.models import (
    DigestStats,
    GroundingEntry,
    HostConfig,
    HostPersona,
    Script,
    ScriptTurn,
    SessionDigest,
)
from astra_mouthpiece.prompts import (
    build_dressing_system_prompt,
    build_improv_system_prompt,
    build_script_user_content,
)
from astra_mouthpiece.script import generate_script, parse_script

GOLDEN = Path(__file__).parent / "fixtures" / "golden"
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


def _digest(session_id: str = "sid", wiki_refs: list[str] | None = None) -> SessionDigest:
    return SessionDigest(
        session_id=session_id,
        synopsis="syn",
        wiki_refs=wiki_refs or [],
        kept_ranges=[(1, 1)],
        stats=DigestStats(lines=1, kept_lines=1, windows=1, dropped_windows=0),
    )


def _cleaned_turns() -> list[tuple[int, str, str]]:
    return [(1, "Archie", "they did a thing")]


# ── prompts (gate C — load-bearing lines + interpolation; two-host, two friends) ──
def test_improv_prompt_is_the_two_friends_recap_prompt() -> None:
    p = build_improv_system_prompt(HOSTS)
    assert "recorded podcast RECAP between two co-hosts" in p
    # Two friends building on each other + trading theories — NOT the retired debate
    # rhythm (propose / object / repeat), which over-tuned Maeve into a contrarian.
    assert "They BUILD on each other" in p
    assert "They TRADE THEORIES" in p
    assert "They LIVE IN THE WORLD" in p
    assert "Disagreement is SEASONING, not structure" in p
    assert "DEBATE" not in p
    assert "Pushback is the rhythm" not in p
    # Host names interpolate into the speaker-label example, two hosts only.
    assert "Bram: what they said" in p
    assert "Bram and Maeve" in p
    assert "Pip" not in p


def test_improv_prompt_frames_the_transcript_not_a_digest() -> None:
    p = build_improv_system_prompt(HOSTS)
    flat = " ".join(p.split())
    assert "digest" not in flat.lower()
    assert "the session TRANSCRIPT itself" in flat
    assert "no beat list" in flat.lower()
    assert "not in the transcript below" in flat


def test_improv_prompt_has_narrative_mechanics_instruction() -> None:
    p = build_improv_system_prompt(HOSTS)
    flat = " ".join(p.split())
    assert "NARRATIVE MECHANICS" in flat
    assert "never recite" in flat.lower()
    assert "die result" in flat.lower() and "DC" in flat and "HP arithmetic" in flat


def test_improv_prompt_steers_away_from_direct_quotes() -> None:
    p = build_improv_system_prompt(HOSTS)
    flat = " ".join(p.split())
    assert "QUOTING" in flat
    assert "they RETELL, they never recite" in flat
    assert "two or three in the whole episode" in flat
    assert 'no "quote ... end quote"' in flat


def test_dressing_prompt_forbids_polishing() -> None:
    p = build_dressing_system_prompt(HOSTS)
    assert "You are a careful transcript FORMATTER, not a writer." in p
    assert "DO NOT improve the dialogue." in p
    # Provider-neutral delivery tags (Cartesia translates, ElevenLabs passes through).
    assert "ElevenLabs" not in p and "recapping" in p
    assert "Bram → A" in p and "Maeve → B" in p
    assert "Pip" not in p and "→ C" not in p
    # Quotation marks stay punctuation — never spoken "quote"/"end quote".
    flat = " ".join(p.split())
    assert 'NEVER verbalize them as the words "quote" / "end quote"' in flat


# ── grounding (gate D — akasha seam, pure over injected pages; flat wiki_refs) ──
def test_ground_digest_matches_by_title_and_basename() -> None:
    pages = [
        GroundingPage(path="Geography/Calaria/Wrenford", title="Wrenford", text="A town."),
        GroundingPage(path="People/Iridescent Host", title="The Iridescent Host", text="A god."),
        GroundingPage(path="unused/Nowhere", title="Nowhere", text="x"),
    ]
    digest = _digest(wiki_refs=["Wrenford", "the iridescent host", "Wrenford", "Unmatched NPC"])
    entries = ground_digest(digest, pages)
    # Two distinct pages, in first-appearance order; Wrenford deduped; NPC dropped.
    assert [e.path for e in entries] == ["Geography/Calaria/Wrenford", "People/Iridescent Host"]
    assert entries[0].refs == ["Wrenford"]  # deduped across the flat ref list
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

    digest = _digest(wiki_refs=["Quiet Below", "Divinity"])
    entries = ground_digest(digest, pages)
    # Both folder-index pages resolve by parent-folder name — no "index" collision.
    assert {e.path for e in entries} == {"Geography/Quiet Below/index", "Divinity/index"}


# ── user content (0024 §4.1 — ordering, id-stripping, roster omission) ─────────
def test_script_user_content_orders_sections_and_strips_line_ids() -> None:
    digest = _digest(session_id="000.x.2025-1-1")
    cleaned = [(5, "Bram", "hello"), (6, "Maeve", "hi")]
    grounding = [GroundingEntry(refs=["r"], title="Page", path="page", text="lore")]

    content = build_script_user_content(digest, cleaned, "", grounding, "")
    assert content.index("SESSION — 000.x.2025-1-1") < content.index("Bram: hello")
    assert content.index("Bram: hello") < content.index("WIKI EXCERPTS")
    assert "5\tBram" not in content and "6\tMaeve" not in content  # ids stripped
    assert "Bram: hello" in content and "Maeve: hi" in content
    assert "THE TABLE" not in content  # empty roster omitted cleanly

    withr = build_script_user_content(digest, cleaned, "THE TABLE:\n- x", grounding, "")
    assert "THE TABLE:" in withr
    assert withr.index("THE TABLE:") < withr.index("Bram: hello")

    withc = build_script_user_content(digest, cleaned, "", grounding, "PREVIOUSLY: stuff")
    assert "PREVIOUSLY: stuff" in withc
    assert withc.index("PREVIOUSLY: stuff") < withc.index("Bram: hello")


# ── two-pass script generation (gate C) ────────────────────────────────────
def test_generate_script_calls_text_then_tool() -> None:
    client = StubClient(
        text="Bram: hey\nMaeve: hi",
        tool={"title": "The Episode", "turns": [{"speaker": "A", "text": "hey"}]},
    )
    script = generate_script(client, _digest(), _cleaned_turns(), [], HOSTS)
    assert client.calls == ["text", "tool"]  # Pass A (free-text) then Pass B (tool)
    assert script.title == "The Episode"
    assert script.turns[0].speaker == "A"
    assert script.hosts.a.name == "Bram"  # hosts come from ontology-being, not the model
    # Pass B dressed Pass A's transcript.
    assert "Bram: hey" in client.last_tool_req.user_content


def test_generate_script_passes_roster_block_into_pass_a() -> None:
    client = StubClient(
        text="Bram: hey\nMaeve: hi",
        tool={"title": "T", "turns": [{"speaker": "A", "text": "hey"}]},
    )
    generate_script(client, _digest(), _cleaned_turns(), [], HOSTS, roster_block="THE TABLE:\n- x")
    assert "THE TABLE:" in client.last_text_req.user_content


def test_split_transcript_single_segment_under_limit() -> None:
    from astra_mouthpiece.script import PASS_B_CHUNK_WORDS, _split_transcript

    t = "Bram: hey\nMaeve: hi there"
    assert _split_transcript(t, PASS_B_CHUNK_WORDS) == [t]  # short → one segment, verbatim


def test_split_transcript_breaks_only_on_line_boundaries() -> None:
    from astra_mouthpiece.script import _split_transcript

    # 6 lines of 2 words each; cap 4 words/segment → 3 segments of 2 whole lines.
    t = "\n".join(f"Bram: word{i}" for i in range(6))
    segs = _split_transcript(t, 4)
    assert len(segs) == 3
    assert "\n".join(segs) == t  # no utterance split; rejoin reproduces the input
    assert all(ln.startswith("Bram: word") for s in segs for ln in s.splitlines())


def test_generate_script_chunks_long_transcript() -> None:
    # A long Pass A transcript is typeset in multiple Pass B calls, turns concatenated.
    long_text = "\n".join("Bram: word here" for _ in range(1500))  # 3 words × 1500 = 4500
    client = StubClient(
        text=long_text,
        tool={"title": "The Title", "turns": [{"speaker": "A", "text": "hey"}]},
    )
    script = generate_script(client, _digest(), _cleaned_turns(), [], HOSTS)
    n_tool = client.calls.count("tool")
    assert client.calls[0] == "text"  # Pass A once
    assert n_tool >= 2  # Pass B ran per segment
    assert len(script.turns) == n_tool  # one canned turn per chunk, concatenated
    assert script.title == "The Title"  # title taken from the first chunk


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
