"""Hosts — load the two podcast personas (A=Bram/B=Maeve) from ontology-being.

H5: the personas + ElevenLabs voice ids are a distinct ontology-being entity type
(`PodcastPersona`, separate from weal `WealHost`); mouthpiece carries no local host
config — it reads name+persona+voice_id from ontology-being. The roster dropped to two
in 2026-06 (Pip retired into Maeve); legacy three-host episodes keep their own stored
hosts and are unaffected.
"""

from __future__ import annotations

from pathlib import Path

from astra_ontology_being import BEING_KDL_PATH, load_being

from .models import HostConfig, HostPersona

#: Speaker id → ontology-being persona slug (the roundtable seating).
HOST_SLUGS: dict[str, str] = {"A": "bram", "B": "maeve"}


def load_hosts(path: Path | str = BEING_KDL_PATH) -> HostConfig:
    """Build the A/B HostConfig from ontology-being's podcast personas."""
    being = load_being(path)
    personas = {p.slug: p for p in being.podcast_personas}

    def host(slug: str) -> HostPersona:
        p = personas[slug]
        return HostPersona(name=p.name, persona=p.persona, voice_id=p.voice_id)

    return HostConfig(
        a=host(HOST_SLUGS["A"]),
        b=host(HOST_SLUGS["B"]),
    )
