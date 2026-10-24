/**
 * Typed config schema for the `config.kdl` namespaces TS apps read, in idiomatic
 * camelCase (0037 LIB-1 interim). `loadConfig()` drops every other top-level namespace
 * unvalidated, so a bad value in a Python-only block cannot stop a TS process. Python's
 * `WholeConfig` (`libs/py/config` `models.py`) holds every namespace, and one CI test
 * validates the real file against it; that docstring records who reads which block.
 *
 * Each namespace here is mirrored field for field in Pydantic. Secret fields are
 * `SecretRef | null` (lazy, Decision E); plaintext fields carry the faerrin code-default.
 * `.strict()` inside each namespace mirrors Pydantic's `extra="forbid"`: a mistyped KDL
 * key throws instead of being dropped.
 */
import { isAbsolute, join } from "node:path";

import { z } from "zod";

import { decodeKdl, loadKdl } from "./kdl";
import { findRepoRoot } from "./root";
import { SecretRef } from "./secrets";

// `.nullish()` (nullable + optional) keeps secret fields input-optional so a sparse
// namespace still satisfies `.default({})`; an absent secret reads back as undefined.
const secret = () => z.instanceof(SecretRef).nullish();

// A data path (py `DataPath`): a relative value is resolved against `data.root` when the
// config loads, so code always sees an absolute path. An absolute value (e.g. a
// container-only path) and an empty value (unset) pass through unchanged.
const DATA_PATH_SCHEMAS = new WeakSet<z.ZodType>();
const dataPath = (def: string) => {
  const schema = z.string().default(def);
  DATA_PATH_SCHEMAS.add(schema);
  return schema;
};

// A published dataset (py `ContentPath`): like a data path, but a relative value is
// resolved against `data.contentRoot` (the astra-data clone) instead of `data.root`.
const CONTENT_PATH_SCHEMAS = new WeakSet<z.ZodType>();
const contentPath = (def: string) => {
  const schema = z.string().default(def);
  CONTENT_PATH_SCHEMAS.add(schema);
  return schema;
};

/** Overrides `data.root` — a test/dev seam only (the py root conftest sets it). */
const DATA_ROOT_ENV = "ASTRA_DATA_ROOT";
/** Overrides `data.contentRoot` — the same variable @astra/content-build reads. */
const CONTENT_ROOT_ENV = "ASTRA_CONTENT_ROOT";

// The one root every data path in this config is relative to (each service's own state
// paths), plus the astra-data clone the bots commit the published datasets to.
const Data = z
  .object({
    root: z.string().default(""),
    // Relative → under `root`. The datasets below are relative to it (astra-data layout).
    contentRoot: z.string().default("astra-data"),
    linguistTranscripts: contentPath("linguist/transcripts"),
    linguistData: contentPath("linguist/data"),
    linguistTimeline: contentPath("linguist/timeline"),
    mouthpieceSnapshot: contentPath("mouthpiece/snapshot"),
    akashaContent: contentPath("akasha/content"),
    akashaSnapshot: contentPath("akasha/snapshot"),
    heartwoodLedger: contentPath("heartwood/agent-runs.jsonl"),
    entityRegistry: contentPath("entity/entity.kdl"),
  })
  .strict();

const Weal = z
  .object({
    databaseUrl: z.string().default(""),
    feedWsUrl: z.string().default(""),
    chartBaseUrl: z.string().default(""),
    bindAddr: z.string().default("127.0.0.1:10203"),
    playersPath: z.string().default("players.toml"),
    rustLog: z.string().default("info"),
    discordToken: secret(),
    feedToken: secret(),
    diceFeedUrl: secret(), // rotated webhook — resolves at cutover (Phase 6)
  })
  .strict();

const WealOverlay = z
  .object({
    port: z.number().default(10360),
    token: secret(), // shared weal↔overlay secret (=weal.feedToken)
  })
  .strict();

const Orator = z
  .object({
    guildId: z.string().default(""),
    spikeChannelId: z.string().default(""),
    databaseUrl: z.string().default(""),
    port: z.number().default(10363),
    publicOrigin: z.string().default("https://orator.iridi.cc"),
    /** Audio + data dir (the Compose volume mount); single source for the service + migrator. */
    dataDir: z.string().default("/data"),
    allowedUserIds: z.string().default(""),
    targetLufs: z.number().default(-16),
    ingestConcurrency: z.number().default(2),
    measureLoudness: z.boolean().default(true),
    discordToken: secret(),
    discordClientId: secret(),
    discordClientSecret: secret(),
    sessionSecret: secret(),
  })
  .strict();

// The SSR frontend service (Decision I). serviceName + port are the single source
// for server.ts (bind + telemetry name) and vite's dev port; serviceName also
// derives the browser RUM name (`{serviceName}-rum`). (config-single-source)
const Strider = z
  .object({
    serviceName: z.string().default("astra.strider"),
    port: z.number().default(10360),
    // Absolute base URL — the canonical entry the ledger landing page links to.
    publicOrigin: z.string().default("https://strider.iridi.cc"),
  })
  .strict();

// The akasha wiki read-surface (0011) — same SSR-frontend contract as Strider
// (Decision I): serviceName + port are the single source for server.ts + vite's
// dev port; serviceName derives the browser RUM name. (config-single-source)
const AkashaFrontend = z
  .object({
    serviceName: z.string().default("astra.akasha-frontend"),
    port: z.number().default(10365),
    // Absolute base URL baked into the build-emitted RSS/sitemap/og links.
    publicOrigin: z.string().default("https://akasha.iridi.cc"),
    // In-container dir the session-audio volume mounts at; the combined Craig recording
    // each transcript plays is served same-origin at /audio/<date>.mp3 (replaces the
    // surviving faerrin static-audio.iridi.cc dependency).
    audioDir: z.string().default("/audio"),
  })
  .strict();

// The podcast read-surface (0012) — same SSR-frontend contract as AkashaFrontend
// (Decision I). serviceName + port are the single source for server.ts + vite's dev
// port; serviceName derives the browser RUM name. Distinct from `mouthpiece` (the
// backend). (config-single-source)
const MouthpieceFrontend = z
  .object({
    serviceName: z.string().default("astra.mouthpiece-frontend"),
    port: z.number().default(10366),
    // Absolute base URL baked into the build-emitted /episodes.json deep-link map.
    publicOrigin: z.string().default("https://mouthpiece.iridi.cc"),
    // In-container dir the audio volume mounts at; served same-origin at /audio/ (D2).
    audioDir: z.string().default("/audio"),
  })
  .strict();

// The PF2e document-forge editor (0013) — same SSR-frontend contract as the other
// frontends (Decision I). serviceName + port are the single source for server.ts +
// vite's dev port; serviceName derives the browser RUM name. The PNG export POSTs
// same-origin to /render (Caddy routes it to vellum-render). (config-single-source)
const VellumFrontend = z
  .object({
    serviceName: z.string().default("astra.vellum-frontend"),
    port: z.number().default(10367),
    // Absolute base URL — the share-link origin + the same-origin host for /render.
    publicOrigin: z.string().default("https://vellum.iridi.cc"),
  })
  .strict();

// The PNG render service (0013) — a Node + Playwright sidecar, a SEPARATE Compose
// unit from vellum-frontend (D2). serviceName names its telemetry; port is the bind
// port (the editor reaches it same-origin via Caddy). (config-single-source)
const VellumRender = z
  .object({
    serviceName: z.string().default("astra.vellum-render"),
    port: z.number().default(10368),
  })
  .strict();

// The tarot deck reader (0017) — a standalone SSR frontend on the strider template
// (Decision I), a sibling of strider (interactive, backend-less). serviceName + port
// are the single source for server.ts + vite's dev port; serviceName derives the
// browser RUM name. No backend/audio — every card glyph is inline SVG.
const Harrow = z
  .object({
    serviceName: z.string().default("astra.harrow"),
    port: z.number().default(10369),
    publicOrigin: z.string().default("https://harrow.iridi.cc"),
  })
  .strict();

// The astra landing page (0018) — a backend-less SSR frontend on the strider
// template (Decision I), a sibling of Harrow. serviceName + port are the single
// source for server.ts + vite's dev port; serviceName derives the browser RUM
// name. It links to the other sites by reading their publicOrigin from this same
// config at build time — no hardcoded URLs. (config-single-source)
const Ledger = z
  .object({
    serviceName: z.string().default("astra.ledger"),
    port: z.number().default(10370),
    publicOrigin: z.string().default("https://ledger.iridi.cc"),
  })
  .strict();

// portal (0023) — MCP+WS server for the live FoundryVTT "Faerrin" world, on the
// orator-backend template. No serviceName field (D3): unlike the SSR frontends
// there's no browser RUM surface, so `astra.portal` is hardcoded in
// server/src/index.ts, mirroring Orator.
const Portal = z
  .object({
    port: z.number().default(10372),
    publicOrigin: z.string().default("https://portal.iridi.cc"),
    // Two-hop auth (D6): mcpApiKey bearer-gates /mcp (MCP client -> server);
    // bridgeApiKey gates the Foundry module's WS handshake (module -> server).
    bridgeTimeoutMs: z.number().default(15000),
    maxCreatesPerRequest: z.number().default(10), // the D8 write-gate cap
    // The Foundry user id the server lets hold the bridge socket; "" = no designation.
    bridgeUserId: z.string().default(""),
    mcpApiKey: secret(),
    // 0028 D28-1: the player-facing static key, a second bearer compared alongside
    // mcpApiKey in the /mcp auth branch — resolves the read-only D28-8 tool subset.
    playerMcpApiKey: secret(),
    bridgeApiKey: secret(),
    // 0025 D-2: the bind-mounted JSON file holding OAuth-registered clients +
    // hashed tokens, on the new portal-oauth bind mount — survives `just up`
    // redeploys (unlike the in-memory pending-consent/auth-code state).
    oauthStatePath: z.string().default("/data/oauth/state.json"),
  })
  .strict();

// portal-headless (0027 D27-5/-13) — the supervised headless-Chromium GM session, a
// SEPARATE Compose unit from portal-server (health-only, not edge-routed). No
// serviceName field (D27-5, same rationale as Portal — no browser RUM surface; the
// name is hardcoded in the entrypoint). `gmPassword` is the D27-4 dedicated "Portal"
// Foundry account's password, resolved only at login time (D27-14 — never logged).
const PortalHeadless = z
  .object({
    port: z.number().default(10373),
    // D27-3: the public edge, identical to a human browser's path.
    foundryOrigin: z.string().default("https://btl.iridi.cc"),
    world: z.string().default("faerrin"),
    gmUsername: z.string().default("Portal"),
    gmPassword: secret(),
    // D27-10's slow-leak insurance knob — a periodic page reload while healthy; 0
    // disables it.
    reloadIntervalHours: z.number().default(24),
  })
  .strict();

// The PF2e reference site (0029) — a public-but-noindexed build-time ingest + SSR
// frontend on the strider template (Decision I), sibling of portal-headless (flat
// package, no browser RUM surface yet). serviceName + port are the single source
// for the server bind; no PORT env. dataPath is the gitignored corpus dir the
// ingest pipeline writes to. (config-single-source)
const Codex = z
  .object({
    serviceName: z.string().default("astra.codex"),
    port: z.number().default(10374),
    publicOrigin: z.string().default("https://codex.iridi.cc"),
    dataPath: dataPath("codex/data"),
  })
  .strict();

// menhir (0031) — a Kahoot-style session-opener quiz, on the weal-overlay template
// (srvx server + SSE fan-out + vite React SPA, no auth per R4). Same config-
// single-source contract as the other services: server.ts binds this port + names
// telemetry; no PORT env. resultsPath is the JSONL append target (a data path; the
// container mounts it at the same absolute path, D29-53 convention).
const Menhir = z
  .object({
    serviceName: z.string().default("astra.menhir"),
    port: z.number().default(10375),
    publicOrigin: z.string().default("https://menhir.iridi.cc"),
    resultsPath: dataPath("menhir/results.jsonl"),
  })
  .strict();

const Telemetry = z
  .object({
    // In-cluster SigNoz collector (services run on signoz-net; :4318 = OTLP/HTTP).
    // localhost:10353 is only host-reachable; a container needs this name.
    otlpEndpoint: z.string().default("http://signoz-otel-collector:4318"),
    rumEndpoint: z.string().default("http://localhost:10353"),
    // The collector as a HOST-run process reaches it (published port). For host CLIs
    // that export (the heartwood agent, 0033 D33-10); containers use otlpEndpoint.
    hostOtlpEndpoint: z.string().default("http://localhost:10353"),
  })
  .strict();

// A missing namespace falls back to its all-defaults form (matches the py
// default_factory leniency). Zod v4 types `.default()` against the *output* shape,
// so we hand it the parsed all-defaults object rather than `{}`.
export const ConfigSchema = z.object({
  data: Data.default(() => Data.parse({})),
  telemetry: Telemetry.default(() => Telemetry.parse({})),
  weal: Weal.default(() => Weal.parse({})),
  wealOverlay: WealOverlay.default(() => WealOverlay.parse({})),
  orator: Orator.default(() => Orator.parse({})),
  strider: Strider.default(() => Strider.parse({})),
  akashaFrontend: AkashaFrontend.default(() => AkashaFrontend.parse({})),
  mouthpieceFrontend: MouthpieceFrontend.default(() => MouthpieceFrontend.parse({})),
  vellumFrontend: VellumFrontend.default(() => VellumFrontend.parse({})),
  vellumRender: VellumRender.default(() => VellumRender.parse({})),
  harrow: Harrow.default(() => Harrow.parse({})),
  ledger: Ledger.default(() => Ledger.parse({})),
  portal: Portal.default(() => Portal.parse({})),
  portalHeadless: PortalHeadless.default(() => PortalHeadless.parse({})),
  codex: Codex.default(() => Codex.parse({})),
  menhir: Menhir.default(() => Menhir.parse({})),
}); // Not `.strict()`: Zod's default strip drops the namespaces only Python reads.

export type Config = z.infer<typeof ConfigSchema>;

/** `<repo-root>/ontology/ontology-config/config.kdl` (throws outside a checkout). */
export function defaultConfigFile(): string {
  return join(findRepoRoot(), "ontology", "ontology-config", "config.kdl");
}

/** Resolve relative data-path fields against `data.root` and relative content-path
 * fields against `data.contentRoot` (mirrors the py `Config._resolve_data_paths`
 * validator). Mutates and returns `cfg`. */
function resolveDataPaths(cfg: Config): Config {
  const root = process.env[DATA_ROOT_ENV] || cfg.data.root;
  let content = process.env[CONTENT_ROOT_ENV] || cfg.data.contentRoot;
  if (root && content && !isAbsolute(content)) content = join(root, content);
  cfg.data.root = root;
  cfg.data.contentRoot = content;
  const namespaces = cfg as unknown as Record<string, Record<string, unknown>>;
  for (const [name, wrapped] of Object.entries(ConfigSchema.shape)) {
    const shape = wrapped.unwrap().shape as Record<string, z.ZodType>;
    const values = namespaces[name];
    if (!values) continue;
    for (const [field, schema] of Object.entries(shape)) {
      const value = values[field];
      if (typeof value !== "string" || !value || isAbsolute(value)) continue;
      if (DATA_PATH_SCHEMAS.has(schema) && root) values[field] = join(root, value);
      else if (CONTENT_PATH_SCHEMAS.has(schema) && content) values[field] = join(content, value);
    }
  }
  return cfg;
}

/** Parse `config.kdl` → validated `Config` (secrets stay lazy; data paths absolute). */
export function loadConfig(path?: string, secretsFile?: string): Config {
  const configPath = path ?? defaultConfigFile();
  return resolveDataPaths(decodeKdl(ConfigSchema, loadKdl(configPath), { secretsFile }));
}
