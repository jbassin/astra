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


class ScribeConfig(_Base):
    data_path: str = ""
    incoming_path: str = ""
    tmp_path: str = ""
    state_file: str = ""
    downstream_cmd: str = ""
    keep_zip: bool = False
    skip_downstream: bool = False
    model: str = "large-v3"
    device: str = "cpu"
    compute_type: str = "int8"
    groq_api_key: SecretRef | None = None


class LinguistConfig(_Base):
    ingest_source: str = ""
    ingest_saved_dir: str = ""
    review_port: int = 10116
    podcast_episodes_path: str = ""
    surface_model_judge: str = "claude-haiku-4-5-20251001"
    surface_model_escalate: str = "claude-sonnet-4-6"


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
    port: int = 8788
    public_origin: str = "http://localhost:8788"
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


class CaddyConfig(_Base):
    cloudflare_dns_token: SecretRef | None = None


class Config(_Base):
    llm: LlmConfig = Field(default_factory=LlmConfig)
    scribe: ScribeConfig = Field(default_factory=ScribeConfig)
    linguist: LinguistConfig = Field(default_factory=LinguistConfig)
    mouthpiece: MouthpieceConfig = Field(default_factory=MouthpieceConfig)
    weal: WealConfig = Field(default_factory=WealConfig)
    weal_overlay: WealOverlayConfig = Field(default_factory=WealOverlayConfig)
    orator: OratorConfig = Field(default_factory=OratorConfig)
    orator_controller: OratorControllerConfig = Field(default_factory=OratorControllerConfig)
    caddy: CaddyConfig = Field(default_factory=CaddyConfig)
