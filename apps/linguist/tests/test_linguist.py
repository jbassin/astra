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
