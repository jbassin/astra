"""The player roster — the track filter's source of truth (now ontology-being, N2).

faerrin filtered Craig tracks against a duplicated `PLAYERS` map; astra reads the
recording-user-id aliases from ontology-being (`Player.aliases`), so the
player↔track mapping stays authoritative in one place. A track is kept iff its
parsed user-id is a known alias.
"""

from __future__ import annotations

from pathlib import Path

from astra_ontology import load_being

from .naming import track_user


class Roster:
    """The set of recording user-ids that count as players."""

    def __init__(self, aliases: set[str]) -> None:
        self._aliases = aliases

    @classmethod
    def from_being(cls, being_path: Path | str) -> Roster:
        being = load_being(being_path)
        aliases = {alias for player in being.players for alias in player.aliases}
        return cls(aliases)

    def is_player(self, stem: str) -> bool:
        """True if a track stem's parsed user-id is a known player alias."""
        user = track_user(stem)
        return user != "" and user in self._aliases

    def user_of(self, stem: str) -> str:
        """The user tag scribe emits for a track (the parsed recording user-id).

        Precondition: call only on player tracks (`is_player` true) — the merge
        path filters first, so a non-player stem is never tagged.
        """
        return track_user(stem)
