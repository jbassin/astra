"""Render a special episode (the roundtable or the tier list) from a run dir's script.

PAID + LIVE: copy ``script.json`` into ``episodes/<id>/`` with ``kind: "special"``, write a
digest carrying only the id, the public synopsis and the kind, synthesize the script with the
configured TTS provider, assemble ``<id>.episode.mp3``, and touch ``.last-rendered`` so the
linguist-commit path unit publishes it to the mouthpiece site. ``kind: "special"`` is what
every session-scoped reader skips on.
"""

from __future__ import annotations

from pathlib import Path

from astra_mouthpiece.hosts import load_hosts
from astra_mouthpiece.inputs import episodes_root
from astra_mouthpiece.models import Script, SessionDigest


def render_special(run_dir: Path, synopsis: str) -> str:
    """Render ``run_dir/script.json`` as a special; returns a one-line report to print."""
    # The Dagster module owns the provider/voice resolution; reuse it rather than fork it.
    from astra_mouthpiece.assemble import assemble_episode
    from astra_mouthpiece.assets import _voices
    from astra_mouthpiece.resources import default_tts
    from astra_mouthpiece.tts.synth import synthesize_script
    from astra_sessions import atomic_write_text

    script = Script.model_validate_json((run_dir / "script.json").read_text(encoding="utf-8"))
    script = script.model_copy(update={"kind": "special"})
    sid = script.session_id
    out = episodes_root() / sid
    out.mkdir(parents=True, exist_ok=True)
    atomic_write_text(out / "script.json", script.model_dump_json(indent=2))
    # No clean pass, so no stats: a special's digest is its id, synopsis and kind.
    digest = SessionDigest(session_id=sid, synopsis=synopsis, kind="special")
    atomic_write_text(out / "digest.json", digest.model_dump_json(indent=2, exclude_none=True))
    manifest = synthesize_script(
        script, provider=default_tts().build(), voices=_voices(load_hosts()), out_dir=out
    )
    atomic_write_text(out / "manifest.json", manifest.model_dump_json(indent=2))
    episode, _transcript = assemble_episode(manifest, script, out_dir=out)
    atomic_write_text(episodes_root() / ".last-rendered", sid)
    return f"rendered {episode} ({len(manifest.clips)} clips, {manifest.mode})"
