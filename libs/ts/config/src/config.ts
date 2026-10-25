/**
 * The TS config loader for the `config.kdl` namespaces TS apps read, in idiomatic
 * camelCase. The schema itself, `ConfigSchema`, is generated from the Pydantic models
 * (`libs/py/config` `models.py`) into `config.gen.ts` by `just ontology-gen`; edit the
 * models, never the generated file. `loadConfig()` drops every other top-level namespace
 * unvalidated, so a bad value in a Python-only block cannot stop a TS process. Python's
 * `WholeConfig` holds every namespace, and one CI test validates the real file against it.
 *
 * Every namespace and plaintext field is required: values live only in `config.kdl`. A
 * secret field is a lazy `SecretRef`, or undefined when the KDL sets no ref.
 * `.strict()` inside each namespace mirrors Pydantic's `extra="forbid"`: a mistyped KDL
 * key throws instead of being dropped.
 */
import { isAbsolute, join } from "node:path";

import type { z } from "zod";

import { ConfigSchema } from "./config.gen";
import { CONTENT_PATH_SCHEMAS, DATA_PATH_SCHEMAS } from "./fields";
import { decodeKdl, loadKdl } from "./kdl";
import { findRepoRoot } from "./root";

export { ConfigSchema };

/** Overrides `data.root` — a test/dev seam only (the py root conftest sets it). */
const DATA_ROOT_ENV = "ASTRA_DATA_ROOT";
/** Overrides `data.contentRoot` — the same variable @astra/content-build reads. */
const CONTENT_ROOT_ENV = "ASTRA_CONTENT_ROOT";

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
  for (const [name, namespace] of Object.entries(ConfigSchema.shape)) {
    const shape = namespace.shape as Record<string, z.ZodType>;
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
