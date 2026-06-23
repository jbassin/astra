"""Typed config schema — the same field set as `libs/ts/config` (Zod).

Every namespace mirrors a top-level node in `ontology/ontology-config/config.kdl`.
Secret fields are `SecretRef | None` (lazy, Decision E); plaintext fields carry the
faerrin code-default so a sparse `config.kdl` still validates. `extra="forbid"`
turns a mistyped KDL key into a loud error instead of a silent drop.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from .secrets import SecretRef


class _Base(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True, extra="forbid")


class LlmConfig(_Base):
    default_model: str = "claude-opus-4-8"
    default_max_tokens: int = 16000
    anthropic_api_key: SecretRef | None = None


class TelemetryConfig(_Base):
    # In-cluster SigNoz collector (services run on signoz-net; :4318 = OTLP/HTTP).
    # localhost:10353 is only host-reachable; a container needs this name.
    otlp_endpoint: str = "http://signoz-otel-collector:4318"
    rum_endpoint: str = "http://localhost:10353"


class ScribeConfig(_Base):
    data_path: str = ""
    incoming_path: str = ""
    tmp_path: str = ""
    state_file: str = ""
    downstream_cmd: str = ""
    keep_zip: bool = False
    skip_downstream: bool = False
    model: str = "groq/whisper-large-v3"  # full litellm id (Groq Whisper, Decision G)
    device: str = "cpu"
    compute_type: str = "int8"
    groq_api_key: SecretRef | None = None


class LinguistConfig(_Base):
    ingest_source: str = ""
    ingest_saved_dir: str = ""
    review_port: int = 10116
    podcast_episodes_path: str = ""
    # Phase-2 judge models + Phase-1 filter / windowing tuning (faerrin `config.ts` `surface`).
    surface_model_judge: str = "claude-haiku-4-5-20251001"
    surface_model_escalate: str = "claude-sonnet-4-6"
    surface_max_ngram: int = 3
    surface_min_token_len: int = 3
    surface_known_floor_unigram: float = 0.78
    surface_known_floor_multi: float = 0.8
    surface_strong_score: float = 0.88
    surface_known_near_floor: float = 0.6
    surface_judge_chunk_size: int = 150
    surface_judge_overlap: int = 10
    surface_escalate_low: float = 0.4
    surface_escalate_high: float = 0.75
    surface_confidence_floor: float = 0.6
    surface_judge_max_tokens: int = 4096


class MouthpieceConfig(_Base):
    episodes_path: str = ""
    elevenlabs_api_key: SecretRef | None = None


class WealConfig(_Base):
    database_url: str = ""
    feed_ws_url: str = ""
    chart_base_url: str = ""
    bind_addr: str = "127.0.0.1:10203"
    players_path: str = "players.toml"
    rust_log: str = "info"
    discord_token: SecretRef | None = None
    feed_token: SecretRef | None = None
    dice_feed_url: SecretRef | None = None  # rotated webhook — resolves at cutover (Phase 6)


class WealOverlayConfig(_Base):
    port: int = 10360
    token: SecretRef | None = None  # shared weal↔overlay secret (=weal.feed_token)


class OratorConfig(_Base):
    guild_id: str = ""
    spike_channel_id: str = ""
    database_url: str = ""
    port: int = 10363
    public_origin: str = "https://orator.iridi.cc"
    # Audio + data dir (the Compose volume mount); single source for the service + migrator.
    data_dir: str = "/data"
    allowed_user_ids: str = ""
    target_lufs: int = -16
    ingest_concurrency: int = 2
    measure_loudness: bool = True
    discord_token: SecretRef | None = None
    discord_client_id: SecretRef | None = None
    discord_client_secret: SecretRef | None = None
    session_secret: SecretRef | None = None


class OratorControllerConfig(_Base):
    api_key: SecretRef | None = None


class StriderConfig(_Base):
    # The SSR frontend service (Decision I). service_name + port are the single
    # source for server.ts (bind + telemetry name) and vite's dev port; service_name
    # also derives the browser RUM name (``{service_name}-rum``).
    service_name: str = "astra.strider"
    port: int = 10360


class AkashaFrontendConfig(_Base):
    # The akasha wiki read-surface (0011) — same SSR-frontend contract as Strider
    # (Decision I). service_name + port are the single source for server.ts +
    # vite's dev port; service_name also derives the browser RUM name.
    service_name: str = "astra.akasha-frontend"
    port: int = 10365
    # Absolute base URL baked into the build-emitted RSS/sitemap/og links.
    public_origin: str = "https://akasha.iridi.cc"


class MouthpieceFrontendConfig(_Base):
    # The podcast read-surface (0012) — same SSR-frontend contract as Strider
    # (Decision I). service_name + port are the single source for server.ts +
    # vite's dev port; service_name also derives the browser RUM name. Distinct
    # from MouthpieceConfig (the backend).
    service_name: str = "astra.mouthpiece-frontend"
    port: int = 10366
    # Absolute base URL baked into the build-emitted /episodes.json deep-link map.
    public_origin: str = "https://mouthpiece.iridi.cc"
    # In-container dir the audio volume mounts at; served same-origin at /audio/ (D2).
    audio_dir: str = "/audio"


class CaddyConfig(_Base):
    cloudflare_dns_token: SecretRef | None = None


class Config(_Base):
    llm: LlmConfig = Field(default_factory=LlmConfig)
    telemetry: TelemetryConfig = Field(default_factory=TelemetryConfig)
    scribe: ScribeConfig = Field(default_factory=ScribeConfig)
    linguist: LinguistConfig = Field(default_factory=LinguistConfig)
    mouthpiece: MouthpieceConfig = Field(default_factory=MouthpieceConfig)
    weal: WealConfig = Field(default_factory=WealConfig)
    weal_overlay: WealOverlayConfig = Field(default_factory=WealOverlayConfig)
    orator: OratorConfig = Field(default_factory=OratorConfig)
    orator_controller: OratorControllerConfig = Field(default_factory=OratorControllerConfig)
    strider: StriderConfig = Field(default_factory=StriderConfig)
    akasha_frontend: AkashaFrontendConfig = Field(default_factory=AkashaFrontendConfig)
    mouthpiece_frontend: MouthpieceFrontendConfig = Field(default_factory=MouthpieceFrontendConfig)
    caddy: CaddyConfig = Field(default_factory=CaddyConfig)
