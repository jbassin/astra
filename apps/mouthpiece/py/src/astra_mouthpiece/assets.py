"""Dagster wiring — the episode graph and the linguist→mouthpiece sensor.

One partition per session/date in the pipeline's shared ``sessions`` set.
`session_digest` depends on linguist's `session_transcripts` and on
`session_episode_summary` (the chronicle gate, 0021 Change B), and the sensor launches
the graph once that summary is materialized. The five assets chain on disk under
``episodes_path/<key>/`` (faerrin's `out/` disk-cache seams → asset materialization):

    session_digest → session_brief → session_script → session_audio_clips → session_episode

The live chain is paid: clean/enrich + the two-pass script spend GLM tokens
(`mouthpiece.model`), and the audio stage is paid ElevenLabs (`mouthpiece.tts-provider`).
This layer is import-/structure-tested; the per-stage logic is unit-tested via
injected seams.
"""

# No `from __future__ import annotations`: Dagster introspects the `context`/`config`
# annotations at definition time and needs the real types, not strings (scribe N.B.).
from pathlib import Path

import dagster as dg
from astra_akasha_backend.corpus import load_corpus
from astra_config import Config
from astra_lexicon import load_pronunciations
from astra_linguist.assets import session_episode_summary, session_transcripts
from astra_linguist.chronicle import recent_prior_entries, season_for, show_for_date
from astra_observe import get_logger, get_meter, get_tracer
from astra_pipeline_resources import (
    AstraConfig,
    LlmResource,
    PipelinePaths,
    default_resources,
    llm_failures_final,
)
from astra_pipeline_resources.partitions import SessionStage, launch_ready, sessions
from astra_sessions import atomic_write_text, parse_transcript_name

from . import clean, linguist_io
from .assemble import assemble_episode
from .continuity import build_continuity_block
from .episodes_index import (
    EpisodeHost,
    EpisodesIndex,
    build_index,
    discover_sessions,
)
from .grounding import pages_from_corpus
from .hosts import load_hosts
from .inputs import cleaned_turns_for
from .models import AudioManifest, HostConfig, Script, SessionDigest, VoiceConfig
from .producer.stage import produce_brief, script_brief_block
from .resources import TtsResource, default_tts
from .roster import build_roster_block
from .session import build_episode_script
from .tts.provider import TtsClientError
from .tts.synth import synthesize_script

_log = get_logger("astra.mouthpiece")
_meter = get_meter("astra.mouthpiece")
# Each asset body runs inside a span so the per-call astra.llm.* cost attributes
# (set on trace.get_current_span()) have a real span to land on, and so the LLM/TTS
# stages are timed in SigNoz. Without this they were attached to a no-op span.
_tracer = get_tracer("astra.mouthpiece")
_episodes_counter = _meter.create_counter(
    "astra.mouthpiece.episodes", description="episodes produced"
)
_brief_counter = _meter.create_counter(
    "astra.mouthpiece.script.brief", description="scripts written with / without a producer brief"
)


def _config():
    from astra_ontology_config import load as load_config

    return load_config().mouthpiece


def _llm_model(cfg: Config) -> str:
    """The configured LLM for clean/enrich/script (config-single-source) — mouthpiece's
    OWN `mouthpiece.model` pin (GLM 5.3), not the shared `llm.default-model` and not the
    LiteLLMClient constant default. An empty pin falls back to the shared default."""
    return cfg.mouthpiece.model or cfg.llm.default_model


def _out_root() -> Path:
    """`mouthpiece.episodes-path`, for the host-side catalog (the assets use their
    `pipeline_paths` resource)."""
    return Path(_config().episodes_path)


def _session_dir(root: Path, key: str) -> Path:
    d = root / key
    d.mkdir(parents=True, exist_ok=True)
    return d


def _voices(hosts: HostConfig) -> VoiceConfig:
    """The ElevenLabs voice ids from ontology-being."""
    return VoiceConfig(
        a=hosts.a.voice_id,
        b=hosts.b.voice_id,
        c=hosts.c.voice_id if hosts.c else None,
    )


def _read_digest(root: Path, key: str) -> SessionDigest:
    return SessionDigest.model_validate_json((_session_dir(root, key) / "digest.json").read_text())


def _read_script(root: Path, key: str) -> Script:
    return Script.model_validate_json((_session_dir(root, key) / "script.json").read_text())


# ── the 4-asset per-session graph ────────────────────────────────────────────

# A transient external-API failure (an OpenRouter 5xx, an ElevenLabs blip)
# shouldn't fail an unattended run — the sensor won't re-fire an already-partitioned
# session, so a one-off provider outage would otherwise need a manual re-run. Retry the
# step a few times with a growing delay to ride through a multi-minute outage (libs/py/llm
# also retries within each attempt). Applied only to the steps that hit an external API;
# the local ffmpeg assembly doesn't need it. The LLM steps run inside `llm_failures_final()`:
# once the client has spent its own retries on a bad reply, the step fails without this
# rerun (astra_llm.retry), so only transport failures are retried here.
_EXTERNAL_RETRY = dg.RetryPolicy(max_retries=3, delay=120, backoff=dg.Backoff.EXPONENTIAL)


@dg.asset(
    partitions_def=sessions,
    deps=[session_transcripts, session_episode_summary],
    group_name="mouthpiece",
    retry_policy=_EXTERNAL_RETRY,
)
def session_digest(
    context: dg.AssetExecutionContext,
    astra_config: AstraConfig,
    pipeline_paths: PipelinePaths,
    llm: LlmResource,
) -> dg.MaterializeResult:
    """linguist canonical transcript → clean + enrich `SessionDigest` (Stage 2, 0024 §3)."""
    date = context.partition_key
    with _tracer.start_as_current_span("mouthpiece.session_digest") as span:
        span.set_attribute("mouthpiece.date", date)
        tpath = linguist_io.transcript_for(date, pipeline_paths.transcripts)
        if tpath is None:
            raise FileNotFoundError(f"no linguist transcript for session {date}")
        session_id = parse_transcript_name(tpath).session_id
        turns = linguist_io.parse_canonical_transcript(tpath.read_text(encoding="utf-8"))
        with llm_failures_final():
            digest = clean.clean_session(
                llm.client("mouthpiece.session_digest"),
                session_id,
                turns,
                model=_llm_model(astra_config.get()),
            )
        atomic_write_text(
            _session_dir(pipeline_paths.episodes, date) / "digest.json",
            digest.model_dump_json(indent=2),
        )
        stats = digest.stats
        span.set_attribute("mouthpiece.lines", stats.lines)
        span.set_attribute("mouthpiece.kept_lines", stats.kept_lines)
        span.set_attribute("mouthpiece.windows", stats.windows)
        span.set_attribute("mouthpiece.dropped_windows", stats.dropped_windows)
        span.set_attribute("mouthpiece.hallucination_lines", stats.hallucination_lines)
        span.set_attribute("mouthpiece.wiki_refs", len(digest.wiki_refs))
        _log.info(
            "mouthpiece cleaned %s → %d/%d lines kept (%d/%d windows dropped)",
            date,
            stats.kept_lines,
            stats.lines,
            stats.dropped_windows,
            stats.windows,
        )
        return dg.MaterializeResult(
            metadata={
                "kept_lines": stats.kept_lines,
                "lines": stats.lines,
                "session_id": session_id,
            }
        )


@dg.asset(partitions_def=sessions, deps=[session_digest], group_name="mouthpiece")
def session_brief(
    context: dg.AssetExecutionContext, pipeline_paths: PipelinePaths
) -> dg.MaterializeResult:
    """The producer brief (0035): a read-only DeepSeek RLM reads the cleaned transcript +
    the live akasha wiki, the chronicle, earlier transcripts and scripts → `brief.json`.

    NO retry policy: a ~10-minute paid RLM must not run 4× (litellm retries transient
    provider errors per call). A failed producer still materializes — with no
    `brief.json` — so `session_script` falls back to the old prompt (0035 D2)."""
    key = context.partition_key
    with _tracer.start_as_current_span("mouthpiece.session_brief") as span:
        span.set_attribute("mouthpiece.key", key)
        meta = produce_brief(key, root=pipeline_paths.episodes)
        span.set_attribute("mouthpiece.brief.status", meta["status"])
        if meta.get("cost_usd") is not None:
            span.set_attribute("mouthpiece.brief.cost_usd", meta["cost_usd"])
        _log.info("mouthpiece brief %s → %s", key, meta["status"])
        return dg.MaterializeResult(
            metadata={k: v for k, v in meta.items() if v is not None and k != "run_dir"}
        )


@dg.asset(
    partitions_def=sessions,
    deps=[session_digest, session_brief],
    group_name="mouthpiece",
    retry_policy=_EXTERNAL_RETRY,
)
def session_script(
    context: dg.AssetExecutionContext,
    astra_config: AstraConfig,
    pipeline_paths: PipelinePaths,
    llm: LlmResource,
) -> dg.MaterializeResult:
    """digest + cleaned transcript + akasha grounding → the two-pass tavern-tone
    `Script` (Stage 3, 0024 §4)."""
    key = context.partition_key
    root = pipeline_paths.episodes
    transcripts = pipeline_paths.transcripts
    with _tracer.start_as_current_span("mouthpiece.session_script") as span:
        span.set_attribute("mouthpiece.key", key)
        digest = _read_digest(root, key)
        # Stage-3 re-read guard (§4.3) — shared with the 0034 producer (inputs.py).
        cleaned_turns = cleaned_turns_for(key, digest, transcript_dir=transcripts)
        pages = pages_from_corpus(load_corpus(pipeline_paths.akasha_content))
        hosts = load_hosts()
        # Recap continuity (0021 Change B): prior episodes + best-effort season arc of THIS
        # show. The ordering gate guarantees this session's episode (and so 1..N-1) exists;
        # a carve-out (excluded/unmatched → show is None) simply yields no continuity.
        show = show_for_date(key, transcript_dir=transcripts)
        prior = (
            recent_prior_entries(
                key, show.slug, limit=6, episodes_dir=pipeline_paths.chronicle_episodes
            )
            if show
            else []
        )
        season = season_for(key, show.slug, seasons_path=pipeline_paths.seasons) if show else None
        continuity_block = build_continuity_block(prior, season)
        # Deterministic character roster (§4.1.3) — same best-effort posture as
        # continuity: an unmatched/excluded show yields no roster block, not an error.
        roster_block = build_roster_block(show.slug) if show else ""
        # The producer brief (0035 D35-5): when present it replaces the wiki excerpts +
        # continuity in Pass A; absent/unreadable → today's prompt, unchanged.
        brief_block, brief_outcome = script_brief_block(key, hosts, root=root)
        span.set_attribute("mouthpiece.script.brief", "used" if brief_block else "fallback")
        _brief_counter.add(1, {"outcome": brief_outcome})
        with llm_failures_final():
            script = build_episode_script(
                llm.client("mouthpiece.session_script"),
                digest,
                cleaned_turns,
                pages,
                hosts,
                roster_block=roster_block,
                continuity_block=continuity_block,
                model=_llm_model(astra_config.get()),
                brief_block=brief_block,
            )
        span.set_attribute("mouthpiece.continuity_episodes", len(prior))
        span.set_attribute("mouthpiece.continuity_chars", len(continuity_block))
        span.set_attribute("mouthpiece.cleaned_lines", len(cleaned_turns))
        atomic_write_text(_session_dir(root, key) / "script.json", script.model_dump_json(indent=2))
        span.set_attribute("mouthpiece.turns", len(script.turns))
        _log.info("mouthpiece scripted %s → %d turns (%s)", key, len(script.turns), script.title)
        return dg.MaterializeResult(metadata={"turns": len(script.turns), "title": script.title})


@dg.asset(
    partitions_def=sessions,
    deps=[session_script],
    group_name="mouthpiece",
    retry_policy=_EXTERNAL_RETRY,
)
def session_audio_clips(
    context: dg.AssetExecutionContext, pipeline_paths: PipelinePaths, tts: TtsResource
) -> dg.MaterializeResult:
    """Script → TTS clips + manifest (Stage 4; ElevenLabs / mock).

    The dialogue path inlines the IPA of every `defs.kdl` entry that has one (M6)."""
    key = context.partition_key
    root = pipeline_paths.episodes
    with _tracer.start_as_current_span("mouthpiece.session_audio_clips") as span:
        span.set_attribute("mouthpiece.key", key)
        script = _read_script(root, key)
        hosts = load_hosts()
        pronunciations = load_pronunciations()
        span.set_attribute("mouthpiece.pronunciations", len(pronunciations))
        provider = tts.build()
        span.set_attribute("mouthpiece.tts_provider", tts.provider)
        try:
            manifest = synthesize_script(
                script,
                provider=provider,
                voices=_voices(hosts),
                out_dir=_session_dir(root, key),
                pronunciations=pronunciations,
            )
        except TtsClientError as err:
            # A 4xx is deterministic: the RetryPolicy would re-render (and re-bill) every
            # chunk before the bad one, then hit the same rejection — fail once, loudly.
            span.record_exception(err)
            raise dg.Failure(description=str(err), allow_retries=False) from err
        atomic_write_text(
            _session_dir(root, key) / "manifest.json", manifest.model_dump_json(indent=2)
        )
        span.set_attribute("mouthpiece.clips", len(manifest.clips))
        span.set_attribute("mouthpiece.mode", manifest.mode)
        _log.info(
            "mouthpiece synthesized %s → %d clips (%s)", key, len(manifest.clips), manifest.mode
        )
        return dg.MaterializeResult(
            metadata={
                "clips": len(manifest.clips),
                "mode": manifest.mode,
                "pronunciations": len(pronunciations),
            }
        )


@dg.asset(partitions_def=sessions, deps=[session_audio_clips], group_name="mouthpiece")
def session_episode(
    context: dg.AssetExecutionContext, pipeline_paths: PipelinePaths
) -> dg.MaterializeResult:
    """Clips → `episode.mp3` + `transcript.md` (Stage 5; ffmpeg concat + loudnorm)."""
    key = context.partition_key
    root = pipeline_paths.episodes
    with _tracer.start_as_current_span("mouthpiece.session_episode") as span:
        span.set_attribute("mouthpiece.key", key)
        script = _read_script(root, key)
        manifest = AudioManifest.model_validate_json(
            (_session_dir(root, key) / "manifest.json").read_text()
        )
        episode, transcript = assemble_episode(manifest, script, out_dir=_session_dir(root, key))
        # Publish sentinel: a flat, gitignored marker at the episodes root, bind-mounted to
        # the host, where the linguist-commit.path unit watches it (systemd path units are
        # not recursive, so a write inside the session dir can't trigger anything itself).
        atomic_write_text(root / ".last-rendered", key)
        _episodes_counter.add(1)
        _log.info("mouthpiece produced episode %s: %s", key, episode.name)
        return dg.MaterializeResult(
            metadata={"episode": str(episode), "transcript": str(transcript)}
        )


# ── the cross-episode catalog (D1, plan 0012) ────────────────────────────────


def _episode_hosts() -> dict[str, EpisodeHost]:
    """The current-roster persona block (A=Bram, B=Maeve, C=Nell) from ontology-being,
    used as the FALLBACK host block in build_index. Each episode normally carries its own
    stored hosts (so earlier rosters keep theirs); this covers a script that omits hosts
    entirely."""
    h = load_hosts()
    out = {
        "A": EpisodeHost(name=h.a.name, persona=h.a.persona),
        "B": EpisodeHost(name=h.b.name, persona=h.b.persona),
    }
    if h.c is not None:
        out["C"] = EpisodeHost(name=h.c.name, persona=h.c.persona)
    return out


def _arc_maps() -> tuple[dict[str, str], dict[str, bool]]:
    """arc slug → (campaign.name, campaign.main) from ontology-being (the arc title
    truth)."""
    from astra_ontology_being import load as load_being

    being = load_being()
    return (
        {c.slug: c.name for c in being.campaigns},
        {c.slug: c.main for c in being.campaigns},
    )


def build_episodes_index(root: Path | None = None) -> EpisodesIndex:
    """The cross-episode catalog over a corpus dir, built on the host by the snapshot
    publisher (``publish.py``): discover sessions + ontology arc/host maps → sorted,
    deduped index. Defaults to the configured episodes path."""
    sessions = discover_sessions(root or _out_root())
    arc_titles, arc_main = _arc_maps()
    return build_index(sessions, arc_titles=arc_titles, arc_main=arc_main, hosts=_episode_hosts())


# ── sensor: linguist → mouthpiece ────────────────────────────────────────────


def _has_transcript(key: str) -> bool:
    return linguist_io.transcript_for(key, linguist_io.TRANSCRIPT_DIR) is not None


#: What `linguist_output_sensor` launches, and when (``dagster/migrate_sessions.py`` reads it).
MOUTHPIECE_STAGE = SessionStage(
    upstream=session_episode_summary.key, stage=session_digest.key, keep=_has_transcript
)


@dg.sensor(
    target=[session_digest, session_brief, session_script, session_audio_clips, session_episode],
    minimum_interval_seconds=30,
    default_status=dg.DefaultSensorStatus.RUNNING,
)
def linguist_output_sensor(context: dg.SensorEvaluationContext) -> dg.SensorResult:
    """Run the episode graph for each session whose chronicle summary is materialized and
    whose `session_digest` was never tried, if it has a canonical transcript.

    The chronicle gate (0021 Change B) is the dependency on `session_episode_summary`, which
    also materializes (as skipped) for an excluded or unmatched show. A session that has
    no canonical transcript (an unmatched campaign) never runs. A failed or canceled run
    is not retried here; re-execute it. The sessions the old sensor adopted without running are
    marked materialized by the sessions migration, so the paid chain never replays them
    (the 2026-06-23 incident)."""
    return launch_ready(context, MOUTHPIECE_STAGE)


defs = dg.Definitions(
    assets=[
        session_digest,
        session_brief,
        session_script,
        session_audio_clips,
        session_episode,
    ],
    sensors=[linguist_output_sensor],
    resources={**default_resources(), "tts": default_tts()},
)
