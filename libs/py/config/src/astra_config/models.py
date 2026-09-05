"""Typed config schema — the same field set as `libs/ts/config` (Zod).

Every namespace mirrors a top-level node in `ontology/ontology-config/config.kdl`.
Secret fields are `SecretRef | None` (lazy, Decision E); plaintext fields carry the
faerrin code-default so a sparse `config.kdl` still validates. `extra="forbid"`
turns a mistyped KDL key into a loud error instead of a silent drop.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .secrets import SecretRef


class _Base(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True, extra="forbid")


class LlmConfig(_Base):
    default_model: str = "openrouter/z-ai/glm-5.2"
    default_max_tokens: int = 16000
    anthropic_api_key: SecretRef | None = None
    openrouter_api_key: SecretRef | None = None


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
    surface_model_judge: str = "openrouter/z-ai/glm-5.2"
    surface_model_escalate: str = "openrouter/z-ai/glm-5.2"
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
    # The LLM for mouthpiece's clean/enrich/script calls — its OWN pin, separate from
    # `llm.default-model` (linguist's compiled judge + heartwood stay on that one).
    model: str = "openrouter/z-ai/glm-5.3"
    # Which TTS backend renders episodes. "elevenlabs" (v3 dialogue) is the live default;
    # "cartesia" (Sonic-3, per-turn) is wired but was rejected on voice quality (2026-09);
    # "mock" is offline silence. The asset layer fails LOUD if the chosen provider's
    # key/voices are missing — never a silent fallback to another backend.
    tts_provider: Literal["cartesia", "elevenlabs", "mock"] = "elevenlabs"
    elevenlabs_api_key: SecretRef | None = None
    cartesia_api_key: SecretRef | None = None


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
    # Absolute base URL — the canonical entry the ledger landing page links to.
    public_origin: str = "https://strider.iridi.cc"


class AkashaFrontendConfig(_Base):
    # The akasha wiki read-surface (0011) — same SSR-frontend contract as Strider
    # (Decision I). service_name + port are the single source for server.ts +
    # vite's dev port; service_name also derives the browser RUM name.
    service_name: str = "astra.akasha-frontend"
    port: int = 10365
    # Absolute base URL baked into the build-emitted RSS/sitemap/og links.
    public_origin: str = "https://akasha.iridi.cc"
    # In-container dir the session-audio volume mounts at; the combined Craig recording
    # each transcript plays is served same-origin at /audio/<date>.mp3 (replaces the
    # surviving faerrin static-audio.iridi.cc dependency).
    audio_dir: str = "/audio"


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


class VellumFrontendConfig(_Base):
    # The PF2e document-forge editor (0013) — same SSR-frontend contract as the
    # other frontends (Decision I). service_name + port are the single source for
    # server.ts + vite's dev port; service_name also derives the browser RUM name.
    # The PNG export POSTs same-origin to /render (Caddy routes it to vellum-render).
    service_name: str = "astra.vellum-frontend"
    port: int = 10367
    # Absolute base URL — the share-link origin + the same-origin host for /render.
    public_origin: str = "https://vellum.iridi.cc"


class VellumRenderConfig(_Base):
    # The PNG render service (0013) — a Bun.serve + Playwright sidecar, a SEPARATE
    # Compose unit from vellum-frontend (D2). service_name names its telemetry; port
    # is the bind port (the editor reaches it same-origin via Caddy).
    service_name: str = "astra.vellum-render"
    port: int = 10368


class HarrowConfig(_Base):
    # The tarot deck reader (0017) — a standalone SSR frontend on the strider
    # template (Decision I), a sibling of strider (interactive, backend-less).
    # service_name + port are the single source for server.ts + vite's dev port;
    # service_name also derives the browser RUM name. No backend/audio — every card
    # glyph is inline SVG.
    service_name: str = "astra.harrow"
    port: int = 10369
    public_origin: str = "https://harrow.iridi.cc"


class LedgerConfig(_Base):
    # The astra landing page (0018) — a backend-less SSR frontend on the strider
    # template (Decision I), a sibling of Harrow. service_name + port are the single
    # source for server.ts + vite's dev port; service_name also derives the browser
    # RUM name. It links to the other sites by reading their public_origin from this
    # same config at build time — no hardcoded URLs.
    service_name: str = "astra.ledger"
    port: int = 10370
    public_origin: str = "https://ledger.iridi.cc"


class HeartwoodConfig(_Base):
    # The heartwood review surface (0020 Phase 4) — a PR-style review app on the
    # strider/vellum-editor template (Decision I). service_name + port are the single
    # source for server.ts + vite's dev port; service_name derives the browser RUM
    # name. Reads its content at runtime from narrow bind-mounts (no baked content);
    # the write-back is a host-run `just heartwood-apply`, not a public endpoint.
    service_name: str = "astra.heartwood-frontend"
    port: int = 10371
    public_origin: str = "https://heartwood.iridi.cc"


class PortalConfig(_Base):
    # portal (0023) — MCP+WS server for the live FoundryVTT "Faerrin" world, on the
    # orator-backend template. No service_name field (D3): unlike the SSR frontends
    # there's no browser RUM surface, so astra.portal is hardcoded in
    # server/src/index.ts, mirroring OratorConfig.
    port: int = 10372
    public_origin: str = "https://portal.iridi.cc"
    # Two-hop auth (D6): mcp_api_key bearer-gates /mcp (MCP client -> server);
    # bridge_api_key gates the Foundry module's WS handshake (module -> server).
    bridge_timeout_ms: int = 15000
    max_creates_per_request: int = 10  # the D8 write-gate cap
    mcp_api_key: SecretRef | None = None
    # 0028 D28-1: the player-facing static key, a second bearer compared alongside
    # mcp_api_key in the /mcp auth branch — resolves the read-only D28-8 tool subset.
    player_mcp_api_key: SecretRef | None = None
    bridge_api_key: SecretRef | None = None
    # 0025 D-2: the bind-mounted JSON file holding OAuth-registered clients +
    # hashed tokens, on the new portal-oauth bind mount — survives `just up`
    # redeploys (unlike the in-memory pending-consent/auth-code state).
    oauth_state_path: str = "/data/oauth/state.json"


class PortalHeadlessConfig(_Base):
    # portal-headless (0027 D27-5/-13) — the supervised headless-Chromium GM session, a
    # SEPARATE Compose unit from portal-server (health-only, not edge-routed). No
    # service_name field (D27-5, same rationale as PortalConfig — no browser RUM
    # surface). gm_password is the D27-4 dedicated "Portal" Foundry account's password,
    # resolved only at login time (D27-14 — never logged).
    port: int = 10373
    foundry_origin: str = "https://btl.iridi.cc"  # D27-3: the public edge
    world: str = "faerrin"
    gm_username: str = "Portal"
    gm_password: SecretRef | None = None
    reload_interval_hours: int = 24  # D27-10 slow-leak insurance knob; 0 disables it


class CodexConfig(_Base):
    # The PF2e reference site (0029) — a public-but-noindexed build-time ingest +
    # SSR frontend on the strider template (Decision I), sibling of portal-headless
    # (flat package, no browser RUM surface yet). service_name + port are the single
    # source for the server bind; no PORT env. data_path is the gitignored corpus
    # dir the ingest pipeline writes to.
    service_name: str = "astra.codex"
    port: int = 10374
    public_origin: str = "https://codex.iridi.cc"
    data_path: str = "/ruby/data/experiments/astra/apps/codex/data"


class MenhirConfig(_Base):
    # menhir (0031) — a Kahoot-style session-opener quiz, on the weal-overlay
    # template (srvx server + SSE fan-out + vite React SPA, no auth per R4). Same
    # config-single-source contract: server.ts binds this port + names telemetry;
    # no PORT env. results_path is the host-absolute JSONL append target
    # (identical-path bind mount, D29-53 convention).
    service_name: str = "astra.menhir"
    port: int = 10375
    public_origin: str = "https://menhir.iridi.cc"
    results_path: str = "/ruby/data/experiments/astra/artifacts/menhir/results.jsonl"


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
    vellum_frontend: VellumFrontendConfig = Field(default_factory=VellumFrontendConfig)
    vellum_render: VellumRenderConfig = Field(default_factory=VellumRenderConfig)
    harrow: HarrowConfig = Field(default_factory=HarrowConfig)
    ledger: LedgerConfig = Field(default_factory=LedgerConfig)
    heartwood: HeartwoodConfig = Field(default_factory=HeartwoodConfig)
    portal: PortalConfig = Field(default_factory=PortalConfig)
    portal_headless: PortalHeadlessConfig = Field(default_factory=PortalHeadlessConfig)
    codex: CodexConfig = Field(default_factory=CodexConfig)
    menhir: MenhirConfig = Field(default_factory=MenhirConfig)
    caddy: CaddyConfig = Field(default_factory=CaddyConfig)
