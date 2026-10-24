"""Typed config schema: every namespace of `ontology/ontology-config/config.kdl`.

Each language validates only the namespaces its apps read (0037 LIB-1 interim):

* `Config` holds the Python-read namespaces; `load_config()` returns it and ignores the
  rest, so a bad value in a TS-only block cannot stop a Python process.
* `libs/ts/config` (Zod) holds the TS-read namespaces the same way.
* `WholeConfig` is the union, every namespace in the file. Only the CI test
  `test_whole_config_kdl_validates` loads it, so nothing in the file goes unvalidated.

Ownership (who reads each block, from a grep of the apps): both languages read `data`,
`telemetry` and `codex`. Only Python reads `llm`, `scribe`, `linguist`, `mouthpiece`,
`heartwood` and `mouthpiece-producer`. Only TS reads `weal`, `weal-overlay`, `orator`,
`strider`, `akasha-frontend`, `mouthpiece-frontend`, `vellum-frontend`, `vellum-render`,
`harrow`, `ledger`, `portal`, `portal-headless` and `menhir`. Nothing reads
`orator-controller` or `caddy`. A namespace read by both is mirrored in both schemas; a
TS-only one is mirrored here (in `WholeConfig`) and in Zod.

Secret fields are `SecretRef | None` (lazy, Decision E); plaintext fields carry the
faerrin code-default so a sparse `config.kdl` still validates. `extra="forbid"` inside
each namespace turns a mistyped KDL key into a loud error instead of a silent drop.
"""

from __future__ import annotations

import os
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .secrets import SecretRef

#: Marks a field as a data path: a relative value is resolved against ``data.root``
#: when the config loads, so code always sees an absolute path. An absolute value
#: (e.g. a container-only path) and an empty value (unset) pass through unchanged.
DATA_PATH = "astra:data-path"
DataPath = Annotated[str, DATA_PATH]

#: Marks a field as a published dataset: a relative value is resolved against
#: ``data.content-root`` (the astra-data clone), not ``data.root``.
CONTENT_PATH = "astra:content-path"
ContentPath = Annotated[str, CONTENT_PATH]

#: Overrides ``data.root``. A test and dev seam only: the repo's root conftest points it
#: at the checkout so pytest never resolves a path into the live data root.
DATA_ROOT_ENV = "ASTRA_DATA_ROOT"
#: Overrides ``data.content-root``. The same name the frontends' build-content reads
#: (@astra/content-build): the root of a tree laid out like astra-data. The root conftest
#: points it at fixtures/astra-data so pytest never needs the real datasets.
CONTENT_ROOT_ENV = "ASTRA_CONTENT_ROOT"


class _Base(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True, extra="forbid")


class DataConfig(_Base):
    # The one root every data path in this config is relative to: the pipeline's
    # published datasets below, and each service's own state paths (scribe.data-path,
    # mouthpiece.episodes-path, ...). Moving the data is a change of these values.
    root: str = ""
    # The astra-data clone: the pipeline's published datasets, written and committed by
    # the bots (linguist-commit, heartwood), never by the code repo. Relative → under
    # `root`. The datasets below are relative to it, in the astra-data layout.
    content_root: str = "astra-data"
    linguist_transcripts: ContentPath = "linguist/transcripts"
    linguist_data: ContentPath = "linguist/data"
    linguist_timeline: ContentPath = "linguist/timeline"
    mouthpiece_snapshot: ContentPath = "mouthpiece/snapshot"
    akasha_content: ContentPath = "akasha/content"
    akasha_snapshot: ContentPath = "akasha/snapshot"
    heartwood_ledger: ContentPath = "heartwood/agent-runs.jsonl"
    entity_registry: ContentPath = "entity/entity.kdl"


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
    # The collector as a HOST-run process reaches it (published port). For host CLIs
    # that export (the heartwood agent, 0033 D33-10); containers use otlp_endpoint.
    host_otlp_endpoint: str = "http://localhost:10353"


class ScribeConfig(_Base):
    data_path: DataPath = ""
    incoming_path: DataPath = ""
    tmp_path: DataPath = ""
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
    ingest_saved_dir: DataPath = ""
    # Runtime outputs of session_transcripts that are not published datasets.
    script_path: DataPath = "linguist/script"
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
    episodes_path: DataPath = ""
    # The LLM for mouthpiece's clean/enrich/script calls — its OWN pin, separate from
    # `llm.default-model` (linguist's compiled judge + heartwood stay on that one).
    model: str = "openrouter/z-ai/glm-5.3"
    # Which TTS backend renders episodes. "elevenlabs" (dialogue) is the live default;
    # "cartesia" (Sonic-3, per-turn) is wired but was rejected on voice quality (2026-09);
    # "mock" is offline silence. The asset layer fails LOUD if the chosen provider's
    # key/voices are missing — never a silent fallback to another backend.
    tts_provider: Literal["cartesia", "elevenlabs", "mock"] = "elevenlabs"
    # ElevenLabs model id for the dialogue + single-turn calls (v4 since 2026-09-28).
    elevenlabs_model: str = "eleven_v4"
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
    # The heartwood wiki-maintainer agent (0033 D33-7) — a host-run dspy.RLM. model
    # drives the main loop, sub_model serves llm_query/llm_query_batched (two distinct
    # LM instances even when equal). max_iterations bounds main-LM calls, max_llm_calls
    # sub-LM calls; max_tokens is per call (reasoning shares it). backfill_budget_usd
    # is the cumulative ceiling `just heartwood-backfill` enforces from the run ledger.
    model: str = "openrouter/deepseek/deepseek-v4.1-flash"
    sub_model: str = "openrouter/deepseek/deepseek-v4.1-flash"
    max_iterations: int = 60
    max_llm_calls: int = 100
    max_tokens: int = 64000
    max_output_chars: int = 10000
    backfill_budget_usd: float = 100.0
    # 0036: the Dagster↔host request dir (same path in the containers) and how long the
    # session_wiki asset waits for the host runner's result before failing.
    requests_path: DataPath = "heartwood/requests"
    request_timeout_minutes: int = 180
    # Per-run agent artifacts (staging, diff, summary) + the backfill lock.
    artifacts_path: DataPath = "heartwood"


class MouthpieceProducerConfig(_Base):
    # The mouthpiece producer (0034 D34-3) — a host-run, read-only dspy.RLM that writes
    # the recap script's brief. model/sub_model/max_* mirror HeartwoodConfig. The
    # experiment's script arms pair experiment_models[i] with experiment_max_tokens[i].
    # A one-argument KDL node loads as a scalar, so both lists accept a bare value.
    model: str = "openrouter/deepseek/deepseek-v4.1-flash"
    sub_model: str = "openrouter/deepseek/deepseek-v4.1-flash"
    max_iterations: int = 30
    max_llm_calls: int = 60
    max_tokens: int = 64000
    max_output_chars: int = 10000
    experiment_models: list[str] = [
        "openrouter/z-ai/glm-5.3",
        "openrouter/deepseek/deepseek-v4.1-flash",
    ]
    experiment_max_tokens: list[int] = [128000, 64000]
    # Per-run producer/experiment/roundtable artifacts.
    artifacts_path: DataPath = "mouthpiece/experiments"

    @field_validator("experiment_models", "experiment_max_tokens", mode="before")
    @classmethod
    def _scalar_to_list(cls, value: object) -> object:
        return value if isinstance(value, list) else [value]


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
    # The Foundry user id the server lets hold the bridge socket; "" = no designation.
    bridge_user_id: str = ""
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
    data_path: DataPath = "codex/data"


class MenhirConfig(_Base):
    # menhir (0031) — a Kahoot-style session-opener quiz, on the weal-overlay
    # template (srvx server + SSE fan-out + vite React SPA, no auth per R4). Same
    # config-single-source contract: server.ts binds this port + names telemetry;
    # no PORT env. results_path is the JSONL append target (a data path; the
    # container mounts it at the same absolute path, D29-53 convention).
    service_name: str = "astra.menhir"
    port: int = 10375
    public_origin: str = "https://menhir.iridi.cc"
    results_path: DataPath = "menhir/results.jsonl"


class CaddyConfig(_Base):
    cloudflare_dns_token: SecretRef | None = None


class Config(_Base):
    """The namespaces Python code reads: what `load_config()` validates and returns.

    Unknown top-level namespaces are ignored here (they belong to the TS apps, see
    `WholeConfig`), so a bad value in a TS-only block cannot stop a Python process. Each
    namespace below still forbids unknown keys. `data` and `telemetry` and `codex` are
    read by both languages; the rest only by Python.
    """

    model_config = ConfigDict(arbitrary_types_allowed=True, extra="ignore")

    data: DataConfig = Field(default_factory=DataConfig)
    llm: LlmConfig = Field(default_factory=LlmConfig)
    telemetry: TelemetryConfig = Field(default_factory=TelemetryConfig)
    scribe: ScribeConfig = Field(default_factory=ScribeConfig)
    linguist: LinguistConfig = Field(default_factory=LinguistConfig)
    mouthpiece: MouthpieceConfig = Field(default_factory=MouthpieceConfig)
    heartwood: HeartwoodConfig = Field(default_factory=HeartwoodConfig)
    mouthpiece_producer: MouthpieceProducerConfig = Field(default_factory=MouthpieceProducerConfig)
    codex: CodexConfig = Field(default_factory=CodexConfig)

    @model_validator(mode="after")
    def _resolve_data_paths(self) -> Self:
        """Resolve relative ``DataPath`` fields against ``data.root`` and relative
        ``ContentPath`` fields against ``data.content-root`` (itself under the root)."""
        # The config fields are str paths, joined as strings like the TS loader does;
        # pathlib would normalise them and could change the resolved values.
        root = os.environ.get(DATA_ROOT_ENV) or self.data.root
        content = os.environ.get(CONTENT_ROOT_ENV) or self.data.content_root
        if root and content and not os.path.isabs(content):  # noqa: PTH117 -- str paths, see above
            content = os.path.join(root, content)  # noqa: PTH118 -- str paths, see above
        self.data.root, self.data.content_root = root, content
        bases = {DATA_PATH: root, CONTENT_PATH: content}
        for name in type(self).model_fields:
            namespace = getattr(self, name)
            for field, info in type(namespace).model_fields.items():
                value = getattr(namespace, field)
                for marker, base in bases.items():
                    if marker not in info.metadata or not (base and value):
                        continue
                    if not os.path.isabs(value):  # noqa: PTH117 -- str paths, see above
                        joined = os.path.join(base, value)  # noqa: PTH118 -- str paths, see above
                        setattr(namespace, field, joined)
        return self


class WholeConfig(Config):
    """Every namespace in `config.kdl`: the union of what Python and TS read, plus the two
    blocks nothing reads yet (`orator-controller`, `caddy`).

    No process loads this. One CI test validates the real file against it
    (`load_whole_config()`), so a typo in any block, or an unknown block, still fails
    somewhere. The namespaces added here are read only by TS (`libs/ts/config`), whose Zod
    schema mirrors them field for field.
    """

    model_config = ConfigDict(arbitrary_types_allowed=True, extra="forbid")

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
    portal: PortalConfig = Field(default_factory=PortalConfig)
    portal_headless: PortalHeadlessConfig = Field(default_factory=PortalHeadlessConfig)
    menhir: MenhirConfig = Field(default_factory=MenhirConfig)
    caddy: CaddyConfig = Field(default_factory=CaddyConfig)
