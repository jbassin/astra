"""`sessions.kdl`, the per-session overrides: its schema and the real file."""

from __future__ import annotations

from pathlib import Path

import pytest
from astra_config.kdl import KdlDecodeError
from astra_ontology.sessions import (
    SessionOverrides,
    episode_key,
    load_session_overrides,
    parse_session_overrides,
)
from astra_ontology_being import SESSIONS_KDL_PATH, session_overrides

SAMPLE = """
session "2025-8-11" skip=#true { note "a different campaign" }
session "2026-10-19-recap-of-2025-8-28" kind="special"
session "2026-9-7" title="The Night the Bell Rang Twice"
"""


def test_the_sample_parses_into_lookups() -> None:
    o = parse_session_overrides(SAMPLE)
    assert o.skipped("2025-8-11") and not o.skipped("2026-9-7")
    assert o.skipped_keys == frozenset({"2025-8-11"})
    entry = o.get("2025-8-11")
    assert entry is not None and entry.note == "a different campaign"
    special = o.for_episode("000.through-a-song-darkly.2026-10-19-recap-of-2025-8-28")
    assert special is not None and special.kind == "special" and not special.skip
    titled = o.for_episode("000.through-a-song-darkly.2026-9-7")
    assert titled is not None and titled.title == "The Night the Bell Rang Twice"
    assert o.for_episode("000.through-a-song-darkly.2026-9-14") is None


def test_episode_key_is_the_last_dotted_segment() -> None:
    assert episode_key("000.show.2026-9-7") == "2026-9-7"
    assert episode_key("2026-9-7") == "2026-9-7"


@pytest.mark.parametrize(
    "text",
    [
        'session "2025-8-11" skp=#true',  # a typo'd property
        'session "2025-08-11x"',  # not a session key
        'session "2025-8-11"\nsession "2025-8-11" skip=#true',  # a repeated key
        'session "2025-8-11" kind="bonus"',  # an unknown kind
        'session "2025-8-11" title=""',  # an empty title
        'sesion "2025-8-11"',  # an unknown node
    ],
)
def test_a_mistake_fails_the_load(text: str) -> None:
    with pytest.raises((KdlDecodeError, ValueError)):
        parse_session_overrides(text)


def test_a_missing_file_fails_rather_than_reading_no_overrides(tmp_path: Path) -> None:
    with pytest.raises(OSError):
        load_session_overrides(tmp_path / "sessions.kdl")


def test_an_empty_file_means_no_overrides() -> None:
    assert parse_session_overrides("// nothing yet\n") == SessionOverrides()


def test_the_committed_file_loads_and_keeps_its_known_entries() -> None:
    """The live file parses, and the two corrections it was created with are still there:
    2025-8-11 (the old EXCLUDED_DATES) and the roundtable special's kind."""
    o = load_session_overrides(SESSIONS_KDL_PATH)
    assert o == session_overrides()
    assert o.skipped("2025-8-11")
    special = o.get("2026-10-19-recap-of-2025-8-28")
    assert special is not None and special.kind == "special"
    assert all(entry.note for entry in o.sessions), "every override says why"


def test_a_campaign_override_parses_and_is_looked_up() -> None:
    o = parse_session_overrides('session "2026-9-3" campaign="urth" { note "Noah GMs" }')
    assert o.campaign("2026-9-3") == "urth"
    assert o.campaign("2026-9-4") is None
    assert not o.skipped("2026-9-3")


@pytest.mark.parametrize(
    "text",
    [
        'session "2026-9-3" skip=#true campaign="urth"',  # skipped yet filed
        'session "2026-9-3" campaign=""',  # an empty slug
    ],
)
def test_a_bad_campaign_override_fails_the_load(text: str) -> None:
    with pytest.raises((KdlDecodeError, ValueError)):
        parse_session_overrides(text)


def test_an_unknown_campaign_slug_fails_the_load_when_the_roster_is_given(
    tmp_path: Path,
) -> None:
    text = 'session "2026-9-3" campaign="urht"'
    assert parse_session_overrides(text).campaign("2026-9-3") == "urht"  # no roster, no check
    with pytest.raises(ValueError, match="urht"):
        parse_session_overrides(text, campaigns=["urth", "deep-eyes"])
    path = tmp_path / "sessions.kdl"
    path.write_text(text)
    with pytest.raises(ValueError, match="urht"):
        load_session_overrides(path, campaigns=["urth"])
    ok = 'session "2026-9-3" campaign="urth"'
    assert parse_session_overrides(ok, campaigns=["urth"]).campaign("2026-9-3") == "urth"


def test_the_committed_campaign_overrides_name_being_kdl_campaigns() -> None:
    """ontology-being's loader checks every `campaign=` against being.kdl."""
    o = session_overrides()
    assert o.campaign("2026-9-3") == "urth"
    assert o.campaign("2025-6-9") == "a-hunt-of-metal-and-vine"
