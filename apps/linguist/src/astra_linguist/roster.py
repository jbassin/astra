"""Speaker resolution — alias → display name + color, from ontology-being (P3/G3).

faerrin hardcoded `userToName`/`nameToColor`; astra reads `Player.aliases`→
`Player.name` from ontology-being (verified to reproduce the same mapping). The
color is the CSS-variable NAME `--text{Name}` (gothic owns the value); an unknown
recording id keeps its raw id as the name and gets the guest color.
"""

from __future__ import annotations

from pathlib import Path

from astra_ontology import load_being
from astra_ontology_being import BEING_KDL_PATH

from .models import Speaker

GUEST_COLOR = "--textGuest"


class SpeakerResolver:
    """Resolves recording user-ids to `{name, color}` from the being roster."""

    def __init__(self, alias_to_name: dict[str, str]) -> None:
        self._alias_to_name = alias_to_name

    @classmethod
    def from_being(cls, being_path: Path | str = BEING_KDL_PATH) -> SpeakerResolver:
        being = load_being(being_path)
        mapping = {alias: player.name for player in being.players for alias in player.aliases}
        return cls(mapping)

    def resolve(self, user_id: str) -> Speaker:
        """Recording id → `{name, color}`; unknown → raw id + guest color."""
        known = user_id in self._alias_to_name
        name = self._alias_to_name[user_id] if known else user_id
        return Speaker(name=name, color=f"--text{name}" if known else GUEST_COLOR)
