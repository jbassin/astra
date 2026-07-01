"""Dagster wiring — the per-session partition, the 4-asset episode graph, mega.

One partition per session/date (a `DynamicPartitionsDefinition`); a sensor
registers a partition + run request for each new linguist canonical transcript
(the linguist→mouthpiece trigger). The four assets chain on disk under
``episodes_path/<key>/`` (faerrin's `out/` disk-cache seams → asset
materialization):

    session_digest → session_script → session_audio_clips → session_episode

``mega_digest`` fuses a date range into one synthetic-id partition that the same
script/clips/episode assets then run on (reusing Stages 3-5).

The **live** materialization is deferred (gate K): distill + the two-pass script
spend Claude tokens, and the v3 audio path is paid ElevenLabs. This layer is
import-/structure-tested; the per-stage logic is unit-tested via injected seams.
"""

# No `from __future__ import annotations`: Dagster introspects the `context`/`config`
# annotations at definition time and needs the real types, not strings (scribe N.B.).
import os
from pathlib import Path

import dagster as dg
from astra_akasha_backend.corpus import load_corpus
from astra_linguist.chronicle import recent_prior_entries, season_for, show_for_date
from astra_llm import LiteLLMClient
from astra_observe import get_logger, get_meter, get_tracer

from . import linguist_io
from .assemble import assemble_episode
from .continuity import build_continuity_block
from .digest import distill_session
from .episodes_index import (
    INDEX_FILENAME,
    EpisodeHost,
    EpisodesIndex,
    build_index,
    discover_sessions,
)
from .grounding import pages_from_corpus
from .hosts import load_hosts
from .mega import MegaMember, fuse_digests, mega_id, select_members
from .models import AudioManifest, HostConfig, Script, SessionDigest, VoiceConfig
from .session import build_episode_script
from .threads import format_threads, load_threads
from .tts.elevenlabs import ElevenLabsTTSProvider
from .tts.mock import MockTTSProvider
from .tts.provider import TTSProvider
from .tts.synth import synthesize_script

SESSIONS_NAME = "mouthpiece_sessions"
mouthpiece_sessions = dg.DynamicPartitionsDefinition(name=SESSIONS_NAME)

_log = get_logger("astra.mouthpiece")
_meter = get_meter("astra.mouthpiece")
# Each asset body runs inside a span so the per-call astra.llm.* cost attributes
# (set on trace.get_current_span()) have a real span to land on, and so the LLM/TTS
# stages are timed in SigNoz. Without this they were attached to a no-op span.
_tracer = get_tracer("astra.mouthpiece")
_episodes_counter = _meter.create_counter(
    "astra.mouthpiece.episodes", description="episodes produced"
)


def _config():
    from astra_ontology_config import load as load_config

    return load_config().mouthpiece


def _llm_model() -> str:
    """The configured LLM for distill/script/mega (config-single-source) — not the
    LiteLLMClient constant default. linguist reads its judge models from config the same way."""
    from astra_ontology_config import load as load_config

    return load_config().llm.default_model


def _out_root() -> Path:
    return Path(_config().episodes_path)


def _session_dir(key: str) -> Path:
    d = _out_root() / key
    d.mkdir(parents=True, exist_ok=True)
    return d


def _atomic_write(path: Path, text: str) -> None:
    """Write `.tmp`→rename so an output only appears whole (a partition = done)."""
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, path)


def _provider() -> TTSProvider:
    """ElevenLabs v3 when the key resolves (gate K, paid), else the offline mock."""
    key = _config().elevenlabs_api_key
    if key is not None and key.resolve():
        return ElevenLabsTTSProvider(key.resolve())
    return MockTTSProvider()


def _voices(hosts: HostConfig) -> VoiceConfig:
    return VoiceConfig(
        a=hosts.a.voice_id,
        b=hosts.b.voice_id,
        c=hosts.c.voice_id if hosts.c else None,
    )


def _read_digest(key: str) -> SessionDigest:
    return SessionDigest.model_validate_json((_session_dir(key) / "digest.json").read_text())


def _read_script(key: str) -> Script:
    return Script.model_validate_json((_session_dir(key) / "script.json").read_text())


# ── the 4-asset per-session graph ────────────────────────────────────────────

# A transient external-API failure (Anthropic 529 "Overloaded", an ElevenLabs blip)
# shouldn't fail an unattended run — the sensor won't re-fire an already-partitioned
# session, so a one-off provider outage would otherwise need a manual re-run. Retry the
# step a few times with a growing delay to ride through a multi-minute outage (libs/py/llm
# also retries within each attempt). Applied only to the steps that hit an external API;
# the local ffmpeg assembly doesn't need it.
_EXTERNAL_RETRY = dg.RetryPolicy(max_retries=3, delay=120, backoff=dg.Backoff.EXPONENTIAL)


@dg.asset(partitions_def=mouthpiece_sessions, group_name="mouthpiece", retry_policy=_EXTERNAL_RETRY)
def session_digest(context: dg.AssetExecutionContext) -> dg.MaterializeResult:
    """linguist canonical transcript → distilled `SessionDigest` (Stage 2)."""
    date = context.partition_key
    with _tracer.start_as_current_span("mouthpiece.session_digest") as span:
        span.set_attribute("mouthpiece.date", date)
        tpath = linguist_io.transcript_for(date)
        if tpath is None:
            raise FileNotFoundError(f"no linguist transcript for session {date}")
        session_id, arc, _ = linguist_io.parse_filename(tpath)
        turns = linguist_io.parse_canonical_transcript(tpath.read_text(encoding="utf-8"))
        digest = distill_session(
            LiteLLMClient(), session_id, date, turns, arc_title=arc, model=_llm_model()
        )
        _atomic_write(_session_dir(date) / "digest.json", digest.model_dump_json(indent=2))
        span.set_attribute("mouthpiece.beats", len(digest.beats))
        _log.info("mouthpiece distilled %s → %d beats", date, len(digest.beats))
        return dg.MaterializeResult(metadata={"beats": len(digest.beats), "session_id": session_id})


@dg.asset(
    partitions_def=mouthpiece_sessions,
    deps=[session_digest],
    group_name="mouthpiece",
    retry_policy=_EXTERNAL_RETRY,
)
def session_script(context: dg.AssetExecutionContext) -> dg.MaterializeResult:
    """digest + akasha grounding → the two-pass tavern-tone `Script` (Stage 3)."""
    key = context.partition_key
    with _tracer.start_as_current_span("mouthpiece.session_script") as span:
        span.set_attribute("mouthpiece.key", key)
        digest = _read_digest(key)
        pages = pages_from_corpus(load_corpus())
        hosts = load_hosts()
        threads_block = format_threads(load_threads(_out_root() / "threads.json"))
        # Recap continuity (0021 Change B): prior episodes + best-effort season arc of THIS
        # show. The ordering gate guarantees this session's episode (and so 1..N-1) exists;
        # a carve-out (excluded/unmatched → show is None) simply yields no continuity.
        show = show_for_date(key)
        prior = recent_prior_entries(key, show.slug, limit=6) if show else []
        season = season_for(key, show.slug) if show else None
        continuity_block = build_continuity_block(prior, season)
        script = build_episode_script(
            LiteLLMClient(),
            digest,
            pages,
            hosts,
            two_pass=True,
            threads_block=threads_block,
            continuity_block=continuity_block,
            model=_llm_model(),
        )
        span.set_attribute("mouthpiece.continuity_episodes", len(prior))
        span.set_attribute("mouthpiece.continuity_chars", len(continuity_block))
        _atomic_write(_session_dir(key) / "script.json", script.model_dump_json(indent=2))
        span.set_attribute("mouthpiece.turns", len(script.turns))
        _log.info("mouthpiece scripted %s → %d turns (%s)", key, len(script.turns), script.title)
        return dg.MaterializeResult(metadata={"turns": len(script.turns), "title": script.title})


@dg.asset(
    partitions_def=mouthpiece_sessions,
    deps=[session_script],
    group_name="mouthpiece",
    retry_policy=_EXTERNAL_RETRY,
)
def session_audio_clips(context: dg.AssetExecutionContext) -> dg.MaterializeResult:
    """Script → TTS clips + manifest (Stage 4; ElevenLabs v3 / mock)."""
    key = context.partition_key
    with _tracer.start_as_current_span("mouthpiece.session_audio_clips") as span:
        span.set_attribute("mouthpiece.key", key)
        script = _read_script(key)
        hosts = load_hosts()
        manifest = synthesize_script(
            script, provider=_provider(), voices=_voices(hosts), out_dir=_session_dir(key)
        )
        _atomic_write(_session_dir(key) / "manifest.json", manifest.model_dump_json(indent=2))
        span.set_attribute("mouthpiece.clips", len(manifest.clips))
        span.set_attribute("mouthpiece.mode", manifest.mode)
        _log.info(
            "mouthpiece synthesized %s → %d clips (%s)", key, len(manifest.clips), manifest.mode
        )
        return dg.MaterializeResult(metadata={"clips": len(manifest.clips), "mode": manifest.mode})


@dg.asset(partitions_def=mouthpiece_sessions, deps=[session_audio_clips], group_name="mouthpiece")
def session_episode(context: dg.AssetExecutionContext) -> dg.MaterializeResult:
    """Clips → `episode.mp3` + `transcript.md` (Stage 5; ffmpeg concat + loudnorm)."""
    key = context.partition_key
    with _tracer.start_as_current_span("mouthpiece.session_episode") as span:
        span.set_attribute("mouthpiece.key", key)
        script = _read_script(key)
        manifest = AudioManifest.model_validate_json(
            (_session_dir(key) / "manifest.json").read_text()
        )
        episode, transcript = assemble_episode(manifest, script, out_dir=_session_dir(key))
        _episodes_counter.add(1)
        _log.info("mouthpiece produced episode %s: %s", key, episode.name)
        return dg.MaterializeResult(
            metadata={"episode": str(episode), "transcript": str(transcript)}
        )


# ── mega (date-range fuse → a synthetic-id partition) ────────────────────────


class MegaConfig(dg.Config):
    """Run config for a mega episode: the inclusive date span (+ optional arc)."""

    start: str
    end: str
    arc: str | None = None
    target_beats: int | None = None


@dg.asset(group_name="mouthpiece")
def mega_digest(context: dg.AssetExecutionContext, config: MegaConfig) -> dg.MaterializeResult:
    """Fuse the member digests in [start, end] into one month-in-review digest under a
    synthetic mega id, and register that id as a session partition so the
    script/clips/episode assets run on it (reusing Stages 3-5)."""
    with _tracer.start_as_current_span("mouthpiece.mega_digest") as span:
        members: list[MegaMember] = []
        for digest_file in sorted(_out_root().glob("*/digest.json")):
            digest = SessionDigest.model_validate_json(digest_file.read_text())
            parts = digest.session_id.split(".")
            date = parts[-1]
            arc = ".".join(parts[1:-1]) if len(parts) > 2 else digest.session_id
            members.append(
                MegaMember(session_id=digest.session_id, date=date, arc=arc, digest=digest)
            )

        selected = select_members(members, config.start, config.end, config.arc)
        fused_id = mega_id(selected)
        fused = fuse_digests(
            LiteLLMClient(),
            fused_id,
            selected,
            target_beats=config.target_beats,
            model=_llm_model(),
        )
        _atomic_write(_session_dir(fused_id) / "digest.json", fused.model_dump_json(indent=2))
        context.instance.add_dynamic_partitions(SESSIONS_NAME, [fused_id])
        span.set_attribute("mouthpiece.mega_id", fused_id)
        span.set_attribute("mouthpiece.members", len(selected))
        _log.info("mouthpiece fused mega %s ← %d members", fused_id, len(selected))
        return dg.MaterializeResult(
            metadata={"mega_id": fused_id, "members": len(selected), "beats": len(fused.beats)}
        )


# ── the cross-episode catalog (D1, plan 0012) ────────────────────────────────


def _episode_hosts() -> dict[str, EpisodeHost]:
    """The current-roster persona block (A=Bram, B=Maeve) from ontology-being, used as
    the FALLBACK host block in build_index. Each episode normally carries its own stored
    hosts (so legacy three-host episodes keep their roster); this covers a script that
    omits hosts entirely."""
    h = load_hosts()
    return {
        "A": EpisodeHost(name=h.a.name, persona=h.a.persona),
        "B": EpisodeHost(name=h.b.name, persona=h.b.persona),
    }


def _arc_maps() -> tuple[dict[str, str], dict[str, bool]]:
    """arc slug → (campaign.name, campaign.main) from ontology-being (the arc title
    truth — replaces faerrin's shibboleth.json)."""
    from astra_ontology_being import load as load_being

    being = load_being()
    return (
        {c.slug: c.name for c in being.campaigns},
        {c.slug: c.main for c in being.campaigns},
    )


def build_episodes_index(root: Path | None = None) -> EpisodesIndex:
    """The cross-episode catalog over a corpus dir (shared by the Dagster asset and
    the snapshot publisher — config-single-source for the build): discover sessions
    + ontology arc/host maps → sorted, deduped index. Defaults to the configured
    episodes path."""
    sessions = discover_sessions(root or _out_root())
    arc_titles, arc_main = _arc_maps()
    return build_index(sessions, arc_titles=arc_titles, arc_main=arc_main, hosts=_episode_hosts())


@dg.asset(group_name="mouthpiece")
def episodes_index(context: dg.AssetExecutionContext) -> dg.MaterializeResult:
    """Glob the session dirs → one sorted ``episodes-index.json`` catalog that
    mouthpiece-frontend (0012) reads at build. Owns id-parse, the arc-then-date
    sort, per-arc episode numbering, arc titles (campaign.name), ffprobe duration
    + the audio cache-bust token (episodes_index.py)."""
    index = build_episodes_index()
    _atomic_write(_out_root() / INDEX_FILENAME, index.model_dump_json(indent=2, by_alias=True))
    return dg.MaterializeResult(
        metadata={
            "episodes": len(index.episodes),
            "with_audio": sum(1 for e in index.episodes if e.has_audio),
        }
    )


# ── sensor: linguist → mouthpiece ────────────────────────────────────────────


# Safe to run by default because of the one-time backlog ADOPTION below: the input dir
# holds the migrated-at-rest history (incl. the 42 committed historical transcripts), and
# without adoption, enabling this sensor would treat all of them as "new" → 42 PAID
# mouthpiece runs (distill + two-pass script + ElevenLabs TTS). The incident on 2026-06-23
# was exactly that. Adoption registers the existing transcripts as done-at-rest partitions
# without running them, so only sessions that appear AFTER enable trigger the paid chain.
@dg.sensor(
    target=[session_digest, session_script, session_audio_clips, session_episode],
    minimum_interval_seconds=30,
    default_status=dg.DefaultSensorStatus.RUNNING,
)
def linguist_output_sensor(context: dg.SensorEvaluationContext) -> dg.SensorResult:
    """Register a partition + run for each new linguist canonical transcript.

    First eval after enable ADOPTS the migrated-at-rest backlog: register every existing
    transcript as a partition but emit NO run requests, then stamp the cursor. Thereafter
    only transcripts that appear after adoption are "new" and trigger the (paid) chain — so
    re-enabling the sensor never reprocesses seed data. Reset the cursor (Dagit / the CLI)
    to re-adopt; deliberately reprocessing history is a manual backfill, not a sensor sweep.

    CHRONICLE GATE (0021 Change B): in the normal branch a "new" session only runs once
    `chronicle_gate_open(date)` — its `episodes/<date>.json` exists, or its show is
    excluded/unmatched (carve-out). A gate-closed session is deliberately left
    un-partitioned so it stays re-discoverable and fires the eval its episode lands.
    """
    existing = set(context.instance.get_dynamic_partitions(SESSIONS_NAME))
    found = linguist_io.new_sessions(existing)
    if context.cursor is None:
        # One-time adoption: register the ENTIRE transcript backlog as known, NO runs
        # (the 2026-06-23 paid-replay guard). The chronicle gate only filters the normal
        # branch below — adoption must still cover every transcript at rest.
        adds = [mouthpiece_sessions.build_add_request(list(found))] if found else []
        return dg.SensorResult(dynamic_partitions_requests=adds, cursor="adopted")
    # Normal eval: a session is registered + run ONLY once chronicle is ready for it
    # (0021 Change B gate). A gate-closed session is left UN-partitioned so it stays
    # "found" and is re-checked next eval — registering it would hide it from
    # new_sessions forever, so it could never run once its episode lands. It fires
    # exactly once, in the eval it becomes ready.
    ready = {date: path for date, path in found.items() if linguist_io.chronicle_gate_open(date)}
    deferred = sorted(found.keys() - ready.keys())
    if deferred:
        _log.info(
            "mouthpiece deferring %d session(s) awaiting chronicle: %s", len(deferred), deferred
        )
    adds = [mouthpiece_sessions.build_add_request(list(ready))] if ready else []
    return dg.SensorResult(
        run_requests=[dg.RunRequest(partition_key=key) for key in ready],
        dynamic_partitions_requests=adds,
    )


defs = dg.Definitions(
    assets=[
        session_digest,
        session_script,
        session_audio_clips,
        session_episode,
        mega_digest,
        episodes_index,
    ],
    sensors=[linguist_output_sensor],
)
