"""linguist parity + unit tests (NLSpec 0006 gates B–D) — hermetic.

The formatted-transcript transform is a downstream byte contract, so it's tested
byte-for-byte against a real faerrin `data/{date}.json` produced from the same
raw `script.json`.
"""

from __future__ import annotations

import json
from pathlib import Path

from astra_linguist.corrections import build_replacer, load_corrections
from astra_linguist.ingest import format_transcript, to_json
from astra_linguist.models import RawLine
from astra_linguist.roster import SpeakerResolver

FIXTURES = Path(__file__).parent / "fixtures"


def _resolver() -> SpeakerResolver:
    return SpeakerResolver.from_being()


# ── formatted_transcript byte-parity (gate B) ──────────────────────────────
def test_formatted_transcript_parity() -> None:
    raw = [
        RawLine(**line)
        for line in json.loads((FIXTURES / "raw-2024-10-15.script.json").read_text())
    ]
    expected = (FIXTURES / "formatted-2024-10-15.json").read_text()

    transcript = format_transcript(
        date="2024-10-15",
        audio="https://static-audio.iridi.cc/2024-10-15/audio.mp3",
        raw=raw,
        replace=load_corrections(),
        resolver=_resolver(),
    )
    assert to_json(transcript) == expected


# ── speaker resolution from ontology-being (gate D) ────────────────────────
def test_speaker_resolution() -> None:
    resolver = _resolver()
    # Known aliases → player name + --text{Name} (matches faerrin's roster).
    assert resolver.resolve("jbassin").model_dump() == {"name": "Josh", "color": "--textJosh"}
    assert resolver.resolve("iiri__").name == "Josh"  # second alias, same player
    assert resolver.resolve("tanner_kn").model_dump() == {"name": "Tanner", "color": "--textTanner"}
    # Unknown id → raw id + guest color.
    assert resolver.resolve("craigbot").model_dump() == {"name": "craigbot", "color": "--textGuest"}


# ── defs.yaml correction replacer (gate C) ─────────────────────────────────
def test_correction_replacer_basics() -> None:
    replace = build_replacer({"Anouk": ["Anak", "Anuk", "Onyx"], "Calaria": ["Galaria"]})
    assert replace("the Anak met Galaria") == "the Anouk met Calaria"
    assert replace("ANUK shouted") == "Anouk shouted"  # case-insensitive
    assert replace("  spaced  ") == "spaced"  # trimmed
    assert replace("Anakin stayed") == "Anakin stayed"  # word-boundary: no partial match


def test_real_defs_loads_and_corrects() -> None:
    replace = load_corrections()
    # "Anak" is a real defs.yaml mistranscription of "Anouk".
    assert replace("and then Anak spoke") == "and then Anouk spoke"


# ── campaign match / billing / context / canonical (gates E/F) ─────────────
from astra_linguist.campaigns import (  # noqa: E402
    CampaignView,
    CharacterRole,
    campaign_filename,
    make_context,
    match_campaign,
    to_shibboleth,
)
from astra_linguist.canonical import to_canonical  # noqa: E402
from astra_linguist.context import build_context  # noqa: E402
from astra_linguist.models import FormattedLine, Speaker, Transcript  # noqa: E402

_CAMPAIGN = CampaignView(
    name="Test Quest, Darkly",
    is_main=True,
    roles={
        "Alice": [CharacterRole("Gamemaster", ["the gm"])],
        "Bob": [CharacterRole("Gandolf", ["a wizard"])],
        "Cara": [CharacterRole("Frodo", ["a hobbit", "ring bearer"])],
    },
)


def _line(user_name: str, text: str) -> FormattedLine:
    return FormattedLine(
        start="00:00:00",
        second=0.0,
        text=text,
        user=Speaker(name=user_name, color="--x"),
        duration=1.0,
    )


def test_match_campaign_and_billing() -> None:
    transcript = Transcript(
        date="2025-01-01",
        audio="a",
        script=[
            _line("Bob", "Gandolf casts"),
            _line("Cara", "Frodo runs"),
            _line("Bob", "Gandolf again"),
        ],
    )
    matched = match_campaign(transcript, [_CAMPAIGN], threshold=2)
    assert matched is not None
    assert matched.billing["Bob"].name == "Gandolf"
    assert matched.billing["Cara"].name == "Frodo"
    assert matched.billing["Alice"].name == "Gamemaster"  # GM always billed as GM
    assert campaign_filename(matched) == "000.test-quest-darkly"
    # Below threshold → no match.
    assert match_campaign(transcript, [_CAMPAIGN], threshold=99) is None


def test_make_context_format() -> None:
    matched = match_campaign(
        Transcript(date="2025-01-01", audio="a", script=[_line("Bob", "Gandolf Frodo")]),
        [_CAMPAIGN],
        threshold=1,
    )
    assert matched is not None
    ctx = make_context(matched, "2025-01-01")
    # GM is skipped; single-fact inline, multi-fact as an indented list.
    assert "  - Gandolf: a wizard\n" in ctx
    assert "  - Frodo: \n    - a hobbit\n    - ring bearer\n" in ctx
    assert "  - Gamemaster:" not in ctx  # GM not listed in the character block
    assert ctx.startswith("Context:\n\nThis is a transcript of an ongoing ttrpg game")
    assert 'This is from the main campaign of the game, "Test Quest, Darkly".' in ctx
    assert ctx.endswith("with an 85% confidence rate.\n")


def test_build_context_and_canonical() -> None:
    transcript = Transcript(
        date="2025-01-01",
        audio="a",
        script=[_line("Bob", "hello there"), _line("Cara", "hi")],
    )
    matched = match_campaign(transcript, [_CAMPAIGN], threshold=0)
    assert matched is not None
    ctx = build_context(transcript, matched)
    # Speaker is the billed character; lines end with two trailing spaces.
    assert "> Gandolf: hello there  " in ctx
    assert "> Frodo: hi  " in ctx
    # Canonical: header dropped, numbered, "> " stripped, trailing spaces kept.
    canon = to_canonical(ctx)
    assert canon == "000001\tGandolf: hello there  \n000002\tFrodo: hi  \n"


def test_to_canonical_blank_numbered_and_no_body() -> None:
    assert to_canonical("header\nno body here") == ""
    assert to_canonical("> a\n> \n> b\n") == "000001\ta\n      \t\n000002\tb\n"


def test_to_shibboleth_shape() -> None:
    shib = to_shibboleth([_CAMPAIGN])
    assert shib["Test Quest, Darkly"]["isMain"] is True
    assert shib["Test Quest, Darkly"]["roles"]["Bob"] == [{"name": "Gandolf", "desc": ["a wizard"]}]


# ── pipeline orchestration end-to-end (pure) ───────────────────────────────
def test_process_session_end_to_end() -> None:
    from astra_linguist.corrections import build_replacer
    from astra_linguist.pipeline import process_session

    raw = [RawLine(start=4.25, end=7.695, user="jbassin", text=" Gandolf casts a spell.")]
    artifacts = process_session(
        "2025-01-01",
        "https://static-audio.iridi.cc/2025-01-01/audio.mp3",
        raw,
        replace=build_replacer({}),
        resolver=SpeakerResolver({"jbassin": "Bob"}),  # alias→player for billing
        campaigns=[_CAMPAIGN],
        threshold=1,
    )
    assert artifacts.transcript.script[0].text == "Gandolf casts a spell."
    assert artifacts.matched is not None  # "Gandolf" keyword present
    assert artifacts.canonical is not None
    assert artifacts.canonical.startswith("000001\tGandolf: Gandolf casts a spell.  ")


# ── real-data end-to-end parity (gates E/F/I) ──────────────────────────────
def test_real_session_canonical_parity() -> None:
    """A committed historical data.json → match → context → canonical reproduces
    the committed transcripts/*.txt byte-for-byte (the whole deterministic pipeline)."""
    from astra_linguist.campaigns import campaign_filename, campaign_views, match_campaign
    from astra_linguist.canonical import to_canonical
    from astra_linguist.context import build_context
    from astra_linguist.historical import DATA_DIR
    from astra_ontology import load_being
    from astra_ontology_being import BEING_KDL_PATH

    date = "2025-10-20"
    transcript = Transcript.model_validate(json.loads((DATA_DIR / f"{date}.json").read_text()))
    matched = match_campaign(transcript, campaign_views(load_being(BEING_KDL_PATH)))
    assert matched is not None

    canonical = to_canonical(build_context(transcript, matched))
    expected = (
        DATA_DIR.parent / "transcripts" / f"{campaign_filename(matched)}.{date}.txt"
    ).read_text()
    assert canonical == expected  # byte-identical to faerrin's committed transcript
