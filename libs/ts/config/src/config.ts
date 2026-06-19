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
    model: z.string().default("large-v3"),
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
    port: z.number().default(8788),
    publicOrigin: z.string().default("http://localhost:8788"),
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

const Caddy = z.object({ cloudflareDnsToken: secret() }).strict();

// A missing namespace falls back to its all-defaults form (matches the py
// default_factory leniency). Zod v4 types `.default()` against the *output* shape,
// so we hand it the parsed all-defaults object rather than `{}`.
export const ConfigSchema = z
  .object({
    llm: Llm.default(() => Llm.parse({})),
    scribe: Scribe.default(() => Scribe.parse({})),
    linguist: Linguist.default(() => Linguist.parse({})),
    mouthpiece: Mouthpiece.default(() => Mouthpiece.parse({})),
    weal: Weal.default(() => Weal.parse({})),
    wealOverlay: WealOverlay.default(() => WealOverlay.parse({})),
    orator: Orator.default(() => Orator.parse({})),
    oratorController: OratorController.default(() => OratorController.parse({})),
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
