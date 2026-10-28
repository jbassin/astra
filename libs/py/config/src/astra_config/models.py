"""Typed config schema: every namespace of `ontology/ontology-config/config.kdl`.

Each language validates only the namespaces its apps read:

* `Config` holds the Python-read namespaces; `load_config()` returns it and ignores the
  rest, so a bad value in a TS-only block cannot stop a Python process.
* `libs/ts/config` (Zod, generated from these models) holds the TS-read namespaces
  the same way.
* `WholeConfig` is the union, every namespace in the file. Only the CI test
  `test_whole_config_kdl_validates` loads it, so nothing in the file goes unvalidated.

Ownership (who reads each block, from a grep of the apps): both languages read `data`,
`telemetry` and `codex`. Only Python reads `llm`, `scribe`, `linguist`, `mouthpiece`,
`heartwood`, `mouthpiece-producer` and `ops`. Only TS reads `weal`, `weal-overlay`, `orator`,
`strider`, `akasha-frontend`, `mouthpiece-frontend`, `vellum-frontend`, `vellum-render`,
`harrow`, `ledger`, `portal`, `portal-headless` and `menhir`. `TS_NAMESPACES` below
lists the TS-read ones; a TS-only namespace lives here in `WholeConfig`.

Every field has a reader outside the config libraries and tests: the CI test
`tests/test_config_readers.py` fails on a field nothing reads, so delete a field when its
last reader goes.

Values live only in `config.kdl`: every namespace and every plaintext field
is required and has no default, so a missing key fails the load instead of falling back to
a code value. A secret field is `SecretRef | None` (resolved lazily); an absent ref reads
as `None`, which `SecretRef.require()` callers treat as unset. `extra="forbid"` inside each
namespace turns a mistyped KDL key into a loud error instead of a silent drop.

The TS schema is generated from this file: `just ontology-gen` writes
`libs/ts/config/src/config.gen.ts` (Zod, camelCase) for the `TS_NAMESPACES` from
`WholeConfig.model_json_schema()`, and `just ontology-check` fails CI when it is stale.
Edit a TS-read namespace here, then run `just ontology-gen`.
"""

from __future__ import annotations

import os
from typing import Annotated, Literal, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    WithJsonSchema,
    field_validator,
    model_validator,
)

from .secrets import SecretRef

#: Marks a field as a data path: a relative value is resolved against ``data.root``
#: when the config loads, so code always sees an absolute path. An absolute value
#: (e.g. a container-only path) and an empty value (unset) pass through unchanged.
DATA_PATH = "astra:data-path"
DataPath = Annotated[str, DATA_PATH, WithJsonSchema({"type": "string", "x-astra-path": "data"})]

#: Marks a field as a published dataset: a relative value is resolved against
#: ``data.content-root`` (the astra-data clone), not ``data.root``.
CONTENT_PATH = "astra:content-path"
ContentPath = Annotated[
    str, CONTENT_PATH, WithJsonSchema({"type": "string", "x-astra-path": "content"})
]

#: A secret: a lazy `SecretRef` (a `ref="sops:KEY"` node in the KDL). Its JSON Schema is
#: the `x-astra-secret` keyword, which the Zod generator turns into a `SecretRef` field.
Secret = Annotated[SecretRef, WithJsonSchema({"x-astra-secret": True})]

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
    root: str
    # The astra-data clone: the pipeline's published datasets, written and committed by
    # the bots (linguist-commit, heartwood), never by the code repo. Relative → under
    # `root`. The datasets below are relative to it, in the astra-data layout.
    content_root: str
    linguist_transcripts: ContentPath
    linguist_data: ContentPath
    linguist_timeline: ContentPath
    mouthpiece_snapshot: ContentPath
    akasha_content: ContentPath
    akasha_snapshot: ContentPath
    heartwood_ledger: ContentPath
    entity_registry: ContentPath


class LlmConfig(_Base):
    default_model: str
    openrouter_api_key: Secret | None = None


class TelemetryConfig(_Base):
    # In-cluster SigNoz collector (on the telemetry/pipeline nets; :4318 = OTLP/HTTP).
    # localhost:10353 is only host-reachable; a container needs this name.
    otlp_endpoint: str
    rum_endpoint: str
    # The collector as a HOST-run process reaches it (published port). astra_observe
    # uses it unless ASTRA_RUNTIME=container; containers use otlp_endpoint.
    host_otlp_endpoint: str
    # A Node service's whole SIGTERM shutdown budget (@astra/observe; TS only).
    shutdown_timeout_ms: int


class ScribeConfig(_Base):
    data_path: DataPath
    incoming_path: DataPath
    tmp_path: DataPath
    model: str  # full litellm id (Groq Whisper)
    groq_api_key: Secret | None = None


class LinguistConfig(_Base):
    ingest_saved_dir: DataPath
    # Runtime outputs of session_transcripts that are not published datasets.
    script_path: DataPath


class MouthpieceConfig(_Base):
    episodes_path: DataPath
    # The LLM for mouthpiece's clean/enrich/script calls — its OWN pin, separate from
    # `llm.default-model` (linguist's compiled judge + heartwood stay on that one).
    model: str
    # The LLM that writes the recap script (session_script's Pass A only); clean, enrich and
    # Pass B's typesetting stay on `model`. Kimi `kimi-k3.1-pro` since 2026-10-28: it follows
    # the spoken-style turn and length rules that GLM 5.3 ignored. Empty falls back to `model`.
    script_model: str = ""
    # Which TTS backend renders episodes: "elevenlabs" (dialogue, live) or "mock" (offline
    # silence). The asset layer fails LOUD if the ElevenLabs key is missing — never a
    # silent fallback to the mock.
    tts_provider: Literal["elevenlabs", "mock"]
    # ElevenLabs model id for the dialogue + single-turn calls (v4 since 2026-09-28).
    elevenlabs_model: str
    # ElevenLabs voice stability, 0 to 1, sent on every request (the API defaults to 0.5).
    # Lower is more expressive and less monotone.
    elevenlabs_stability: Annotated[float, Field(ge=0.0, le=1.0)]
    elevenlabs_api_key: Secret | None = None


class WealConfig(_Base):
    service_name: str
    database_url: str
    feed_ws_url: str
    bind_addr: str
    discord_token: Secret | None = None
    feed_token: Secret | None = None


class WealOverlayConfig(_Base):
    service_name: str
    port: int
    token: Secret | None = None  # shared weal↔overlay secret (=weal.feed_token)


class OratorConfig(_Base):
    service_name: str
    guild_id: str
    database_url: str
    port: int
    public_origin: str
    # Audio + data dir (the Compose volume mount); single source for the service + migrator.
    data_dir: str
    allowed_user_ids: str
    target_lufs: int
    ingest_concurrency: int
    measure_loudness: bool
    # Wall-clock limits on one yt-dlp run; on expiry orator kills its whole process tree.
    ytdlp_enumerate_timeout_s: int
    ytdlp_download_timeout_s: int
    discord_token: Secret | None = None
    discord_client_id: Secret | None = None
    discord_client_secret: Secret | None = None
    session_secret: Secret | None = None


class StriderConfig(_Base):
    # The SSR frontend service. service_name + port are the single
    # source for server.ts (bind + telemetry name) and vite's dev port; service_name
    # also derives the browser RUM name (``{service_name}-rum``).
    service_name: str
    port: int
    # Absolute base URL — the canonical entry the ledger landing page links to.
    public_origin: str


class AkashaFrontendConfig(_Base):
    # The akasha wiki read-surface — same SSR-frontend contract as Strider.
    # service_name + port are the single source for server.ts + vite's dev port;
    # service_name also derives the browser RUM name.
    service_name: str
    port: int
    # Absolute base URL baked into the build-emitted RSS/sitemap/og links.
    public_origin: str
    # In-container dir the session-audio volume mounts at; the combined Craig recording
    # each transcript plays is served same-origin at /audio/<date>.mp3 (replaces the
    # surviving faerrin static-audio.iridi.cc dependency).
    audio_dir: str


class MouthpieceFrontendConfig(_Base):
    # The podcast read-surface — same SSR-frontend contract as Strider.
    # service_name + port are the single source for server.ts + vite's dev port;
    # service_name also derives the browser RUM name. Distinct
    # from MouthpieceConfig (the backend).
    service_name: str
    port: int
    # Absolute base URL baked into the build-emitted /episodes.json deep-link map.
    public_origin: str
    # In-container dir the audio volume mounts at; served same-origin at /audio/.
    audio_dir: str


class VellumFrontendConfig(_Base):
    # The PF2e document-forge editor — same SSR-frontend contract as the other
    # frontends. service_name + port are the single source for
    # server.ts + vite's dev port; service_name also derives the browser RUM name.
    # The PNG export POSTs same-origin to /render (Caddy routes it to vellum-render).
    service_name: str
    port: int
    # Absolute base URL — the share-link origin + the same-origin host for /render.
    public_origin: str


class VellumRenderConfig(_Base):
    # The PNG render service — a Bun.serve + Playwright sidecar, a SEPARATE
    # Compose unit from vellum-frontend. service_name names its telemetry; port
    # is the bind port (the editor reaches it same-origin via Caddy).
    service_name: str
    port: int


class HarrowConfig(_Base):
    # The tarot deck reader — a standalone SSR frontend on the strider
    # template, a sibling of strider (interactive, backend-less).
    # service_name + port are the single source for server.ts + vite's dev port;
    # service_name also derives the browser RUM name. No backend/audio — every card
    # glyph is inline SVG.
    service_name: str
    port: int
    public_origin: str


class LedgerConfig(_Base):
    # The astra landing page — a backend-less SSR frontend on the strider
    # template, a sibling of Harrow. service_name + port are the single
    # source for server.ts + vite's dev port; service_name also derives the browser
    # RUM name. It links to the other sites by reading their public_origin from this
    # same config at build time — no hardcoded URLs.
    service_name: str
    port: int


class HeartwoodConfig(_Base):
    # The heartwood wiki-maintainer agent — a host-run dspy.RLM. model
    # drives the main loop, sub_model serves llm_query/llm_query_batched (two distinct
    # LM instances even when equal). max_iterations bounds main-LM calls, max_llm_calls
    # sub-LM calls; max_tokens is per call (reasoning shares it). backfill_budget_usd
    # is the cumulative ceiling `just heartwood-backfill` enforces from the run ledger.
    model: str
    sub_model: str
    max_iterations: int
    max_llm_calls: int
    max_tokens: int
    max_output_chars: int
    backfill_budget_usd: float
    # The Dagster↔host request dir (same path in the containers) and how long the
    # session_wiki asset waits for the host runner's result before failing.
    requests_path: DataPath
    request_timeout_minutes: int
    # Per-run agent artifacts (staging, diff, summary) + the backfill lock.
    artifacts_path: DataPath


class MouthpieceProducerConfig(_Base):
    # The mouthpiece producer — a host-run, read-only dspy.RLM that writes
    # the recap script's brief. model/sub_model/max_* mirror HeartwoodConfig. The
    # experiment's script arms pair experiment_models[i] with experiment_max_tokens[i].
    # A one-argument KDL node loads as a scalar, so both lists accept a bare value.
    model: str
    sub_model: str
    max_iterations: int
    max_llm_calls: int
    max_tokens: int
    max_output_chars: int
    experiment_models: list[str]
    experiment_max_tokens: list[int]
    # Per-run producer/experiment/roundtable artifacts.
    artifacts_path: DataPath

    @field_validator("experiment_models", "experiment_max_tokens", mode="before")
    @classmethod
    def _scalar_to_list(cls, value: object) -> object:
        return value if isinstance(value, list) else [value]


class PortalConfig(_Base):
    # portal — MCP+WS server for the live FoundryVTT "Faerrin" world, on the
    # orator-backend template. service_name names its telemetry (the
    # @astra/observe/register hook reads it; portal has no browser RUM surface).
    service_name: str
    port: int
    public_origin: str
    # Two-hop auth: mcp_api_key bearer-gates /mcp (MCP client -> server);
    # bridge_api_key gates the Foundry module's WS handshake (module -> server).
    bridge_timeout_ms: int
    max_creates_per_request: int  # the write-gate cap
    # The Foundry user id the server lets hold the bridge socket; "" = no designation.
    bridge_user_id: str
    mcp_api_key: Secret | None = None
    # The player-facing static key, a second bearer compared alongside
    # mcp_api_key in the /mcp auth branch — resolves the read-only player tool subset.
    player_mcp_api_key: Secret | None = None
    bridge_api_key: Secret | None = None
    # The bind-mounted JSON file holding OAuth-registered clients +
    # hashed tokens, on the new portal-oauth bind mount — survives `just up`
    # redeploys (unlike the in-memory pending-consent/auth-code state).
    oauth_state_path: str


class PortalHeadlessConfig(_Base):
    # portal-headless — the supervised headless-Chromium GM session, a SEPARATE
    # Compose unit from portal-server (health-only, not edge-routed). service_name
    # names its telemetry, as in PortalConfig. gm_password is the dedicated "Portal"
    # Foundry account's password, resolved only at login time and never logged.
    service_name: str
    port: int
    foundry_origin: str  # the public edge
    world: str
    gm_username: str
    gm_password: Secret | None = None
    reload_interval_hours: int  # slow-leak insurance knob; 0 disables it


class CodexConfig(_Base):
    # The PF2e reference site — a public-but-noindexed build-time ingest +
    # SSR frontend on the strider template, sibling of portal-headless
    # (flat package, no browser RUM surface yet). service_name + port are the single
    # source for the server bind; no PORT env. data_path is the gitignored corpus
    # dir the ingest pipeline writes to.
    service_name: str
    port: int
    data_path: DataPath


class AssayConfig(_Base):
    # assay's book build (`assay export-book`). book_out_path is the dir the compiled
    # Liturgy PDF is written to: a build output under data.root, never in a checkout.
    book_out_path: DataPath


class OpsConfig(_Base):
    # The host ops CLI (libs/py/ops). signoz_url is the SigNoz API as the HOST sees it (the
    # published port); signoz_api_key is a SigNoz service-account key (Viewer for
    # signoz-rules-check, Editor for signoz-rules-apply). metrics_textfile is the
    # Prometheus textfile `astra-ops host-metrics` writes into node-exporter's textfile dir;
    # smoke_textfile is the one `astra-ops smoke` writes there.
    signoz_url: str
    signoz_api_key: Secret | None = None
    metrics_textfile: DataPath
    smoke_textfile: DataPath


class MenhirConfig(_Base):
    # menhir — a Kahoot-style session-opener quiz, on the weal-overlay
    # template (srvx server + SSE fan-out + vite React SPA, no auth). Same
    # config-single-source contract: server.ts binds this port + names telemetry;
    # no PORT env. results_path is the JSONL append target (a data path; the
    # container mounts it at the same absolute path, the data-path convention).
    service_name: str
    port: int
    public_origin: str
    results_path: DataPath


class Config(_Base):
    """The namespaces Python code reads: what `load_config()` validates and returns.

    Unknown top-level namespaces are ignored here (they belong to the TS apps, see
    `WholeConfig`), so a bad value in a TS-only block cannot stop a Python process. Each
    namespace below still forbids unknown keys. `data` and `telemetry` and `codex` are
    read by both languages; the rest only by Python.
    """

    model_config = ConfigDict(arbitrary_types_allowed=True, extra="ignore")

    data: DataConfig
    llm: LlmConfig
    telemetry: TelemetryConfig
    scribe: ScribeConfig
    linguist: LinguistConfig
    mouthpiece: MouthpieceConfig
    heartwood: HeartwoodConfig
    mouthpiece_producer: MouthpieceProducerConfig
    codex: CodexConfig
    assay: AssayConfig
    ops: OpsConfig

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
    """Every namespace in `config.kdl`: the union of what Python and TS read.

    No process loads this. One CI test validates the real file against it
    (`load_whole_config()`), so a typo in any block, or an unknown block, still fails
    somewhere. The namespaces added here are read only by TS (`libs/ts/config`), whose Zod
    schema `just ontology-gen` generates from them.
    """

    model_config = ConfigDict(arbitrary_types_allowed=True, extra="forbid")

    weal: WealConfig
    weal_overlay: WealOverlayConfig
    orator: OratorConfig
    strider: StriderConfig
    akasha_frontend: AkashaFrontendConfig
    mouthpiece_frontend: MouthpieceFrontendConfig
    vellum_frontend: VellumFrontendConfig
    vellum_render: VellumRenderConfig
    harrow: HarrowConfig
    ledger: LedgerConfig
    portal: PortalConfig
    portal_headless: PortalHeadlessConfig
    menhir: MenhirConfig


#: The namespaces TS reads, in the order `libs/ts/config/src/config.gen.ts` declares them:
#: the Zod schema `just ontology-gen` generates holds exactly these (Python spelling).
TS_NAMESPACES: tuple[str, ...] = (
    "data",
    "telemetry",
    "weal",
    "weal_overlay",
    "orator",
    "strider",
    "akasha_frontend",
    "mouthpiece_frontend",
    "vellum_frontend",
    "vellum_render",
    "harrow",
    "ledger",
    "portal",
    "portal_headless",
    "codex",
    "menhir",
)
