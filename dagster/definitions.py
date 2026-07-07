"""The astra Dagster code location — the Phase-3 asset graph lands here.

The full pipeline (one partition per session: scribe -> linguist -> akasha ->
mouthpiece) grows here per subsystem. First real member: akasha-backend's
corpus-snapshot asset (0007). The trivial Phase-0 smoke asset stays so the code
location is always non-empty/materializable.
"""

import dagster as dg
from astra_akasha_backend.assets import akasha_corpus_snapshot
from astra_heartwood.assets import session_noun_facts, session_page_proposals
from astra_linguist.assets import (
    campaign_timeline,
    campaign_timeline_job,
    campaign_timeline_schedule,
    correction_candidates,
    scribe_output_sensor,
    session_episode_summary,
    session_transcripts,
)
from astra_mouthpiece.assets import (
    episodes_index,
    linguist_output_sensor,
    session_audio_clips,
    session_digest,
    session_episode,
    session_script,
)
from astra_observe import init_telemetry
from astra_scribe.assets import (
    craig_drop_sensor,
    session_audio,
    session_cleanup,
    session_tracks,
    session_transcript,
)

# Telemetry from day one (CLAUDE.md): every process that loads this code location — the
# Dagster daemon and each run worker — installs the OTel providers here, so the pipeline's
# spans, metrics, and logs actually flow to SigNoz (without this, the assets' instrumentation
# is a no-op in the runtime). Idempotent; endpoint comes from config.kdl.
init_telemetry("astra.pipeline")


@dg.asset(group_name="smoke")
def hello_astra() -> str:
    """Trivial asset so the code location is non-empty and materializable."""
    return "astra pipeline online"


# The Phase-3 pipeline: scribe (audio→transcript) → linguist (processing) → akasha
# (corpus snapshot) → mouthpiece (digest → two-pass script → clips → episode). Each
# asset carries its DynamicPartitionsDefinition; the sensors chain it — craig zip →
# scribe, scribe's script.json → linguist, then linguist's transcript → mouthpiece.
defs = dg.Definitions(
    assets=[
        hello_astra,
        akasha_corpus_snapshot,
        session_tracks,
        session_audio,
        session_transcript,
        session_cleanup,
        session_transcripts,
        correction_candidates,
        session_episode_summary,
        campaign_timeline,
        session_digest,
        session_script,
        session_audio_clips,
        session_episode,
        episodes_index,
        session_noun_facts,
        session_page_proposals,
    ],
    sensors=[craig_drop_sensor, scribe_output_sensor, linguist_output_sensor],
    schedules=[campaign_timeline_schedule],
    jobs=[campaign_timeline_job],
)
