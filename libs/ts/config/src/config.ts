/**
 * Typed config schema — the same field set as `libs/py/config` (Pydantic), in
 * idiomatic camelCase. Secret fields are `SecretRef | null` (lazy, Decision E);
 * plaintext fields carry the faerrin code-default. `.strict()` mirrors Pydantic's
 * `extra="forbid"` — a mistyped KDL key throws instead of being dropped.
 */
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { loadDocument, topLevelNamespaces } from "./kdl";
import { SecretRef } from "./secrets";

// `.nullish()` (nullable + optional) keeps secret fields input-optional so a sparse
// namespace still satisfies `.default({})`; an absent secret reads back as undefined.
const secret = () => z.instanceof(SecretRef).nullish();

const Llm = z
  .object({
    defaultModel: z.string().default("claude-opus-4-8"),
    defaultMaxTokens: z.number().default(16000),
    anthropicApiKey: secret(),
  })
  .strict();

const Scribe = z
  .object({
    dataPath: z.string().default(""),
    incomingPath: z.string().default(""),
    tmpPath: z.string().default(""),
    stateFile: z.string().default(""),
    downstreamCmd: z.string().default(""),
    keepZip: z.boolean().default(false),
    skipDownstream: z.boolean().default(false),
    model: z.string().default("groq/whisper-large-v3"), // full litellm id (Groq Whisper)
    device: z.string().default("cpu"),
    computeType: z.string().default("int8"),
    groqApiKey: secret(),
  })
  .strict();

const Linguist = z
  .object({
    ingestSource: z.string().default(""),
    ingestSavedDir: z.string().default(""),
    reviewPort: z.number().default(10116),
    podcastEpisodesPath: z.string().default(""),
    surfaceModelJudge: z.string().default("claude-haiku-4-5-20251001"),
    surfaceModelEscalate: z.string().default("claude-sonnet-4-6"),
    surfaceMaxNgram: z.number().default(3),
    surfaceMinTokenLen: z.number().default(3),
    surfaceKnownFloorUnigram: z.number().default(0.78),
    surfaceKnownFloorMulti: z.number().default(0.8),
    surfaceStrongScore: z.number().default(0.88),
    surfaceKnownNearFloor: z.number().default(0.6),
    surfaceJudgeChunkSize: z.number().default(150),
    surfaceJudgeOverlap: z.number().default(10),
    surfaceEscalateLow: z.number().default(0.4),
    surfaceEscalateHigh: z.number().default(0.75),
    surfaceConfidenceFloor: z.number().default(0.6),
    surfaceJudgeMaxTokens: z.number().default(4096),
  })
  .strict();

const Mouthpiece = z
  .object({
    episodesPath: z.string().default(""),
    elevenlabsApiKey: secret(),
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

const OratorController = z.object({ apiKey: secret() }).strict();

// The SSR frontend service (Decision I). serviceName + port are the single source
// for server.ts (bind + telemetry name) and vite's dev port; serviceName also
// derives the browser RUM name (`{serviceName}-rum`). (config-single-source)
const Strider = z
  .object({
    serviceName: z.string().default("astra.strider"),
    port: z.number().default(10360),
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

// The PNG render service (0013) — a Bun.serve + Playwright sidecar, a SEPARATE Compose
// unit from vellum-frontend (D2). serviceName names its telemetry; port is the bind
// port (the editor reaches it same-origin via Caddy). (config-single-source)
const VellumRender = z
  .object({
    serviceName: z.string().default("astra.vellum-render"),
    port: z.number().default(10368),
  })
  .strict();

const Caddy = z.object({ cloudflareDnsToken: secret() }).strict();

const Telemetry = z
  .object({
    // In-cluster SigNoz collector (services run on signoz-net; :4318 = OTLP/HTTP).
    // localhost:10353 is only host-reachable; a container needs this name.
    otlpEndpoint: z.string().default("http://signoz-otel-collector:4318"),
    rumEndpoint: z.string().default("http://localhost:10353"),
  })
  .strict();

// A missing namespace falls back to its all-defaults form (matches the py
// default_factory leniency). Zod v4 types `.default()` against the *output* shape,
// so we hand it the parsed all-defaults object rather than `{}`.
export const ConfigSchema = z
  .object({
    llm: Llm.default(() => Llm.parse({})),
    telemetry: Telemetry.default(() => Telemetry.parse({})),
    scribe: Scribe.default(() => Scribe.parse({})),
    linguist: Linguist.default(() => Linguist.parse({})),
    mouthpiece: Mouthpiece.default(() => Mouthpiece.parse({})),
    weal: Weal.default(() => Weal.parse({})),
    wealOverlay: WealOverlay.default(() => WealOverlay.parse({})),
    orator: Orator.default(() => Orator.parse({})),
    oratorController: OratorController.default(() => OratorController.parse({})),
    strider: Strider.default(() => Strider.parse({})),
    akashaFrontend: AkashaFrontend.default(() => AkashaFrontend.parse({})),
    mouthpieceFrontend: MouthpieceFrontend.default(() => MouthpieceFrontend.parse({})),
    vellumFrontend: VellumFrontend.default(() => VellumFrontend.parse({})),
    vellumRender: VellumRender.default(() => VellumRender.parse({})),
    caddy: Caddy.default(() => Caddy.parse({})),
  })
  .strict();

export type Config = z.infer<typeof ConfigSchema>;

function findRepoRoot(startDir: string): string {
  let dir = resolve(startDir);
  for (;;) {
    if (existsSync(join(dir, "ontology", "ontology-config"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(startDir);
    dir = parent;
  }
}

/** `<repo-root>/ontology/ontology-config/config.kdl`. */
export function defaultConfigFile(): string {
  return join(findRepoRoot(import.meta.dir), "ontology", "ontology-config", "config.kdl");
}

/** Parse `config.kdl` → validated `Config` (secrets stay lazy). */
export function loadConfig(path?: string, secretsFile?: string): Config {
  const configPath = path ?? defaultConfigFile();
  const namespaces = topLevelNamespaces(loadDocument(configPath), secretsFile);
  return ConfigSchema.parse(namespaces);
}
