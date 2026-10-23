/**
 * Lazy SOPS secret-ref resolution — the TS twin of `libs/py/config/secrets.py`
 * (roadmap Decision E). Same contract: KDL holds only `ref="sops:KEY"`; values live
 * in the SOPS-encrypted file and decrypt on `.resolve()`, env var (KEY upper-cased)
 * winning over the file.
 *
 * A BLANK value — empty, or only ASCII whitespace — counts as UNSET at both steps (0037
 * LIB-2). Compose injects every secret as `${KEY:-}`, so a container recreated without
 * `just up` sees the env var present but empty; that must not pass as a real secret. A
 * blank env var falls through to the SOPS file exactly like an absent one, and a blank
 * SOPS entry throws exactly like a missing one — so `resolve()` returns a non-blank value
 * or throws, never `""`. Same rule and same character set as the Python twin.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { parse as parseYaml } from "yaml";

const SOPS_SCHEME = "sops:";

// A blank secret is made only of these characters. An explicit ASCII set rather than
// `String.prototype.trim()`: JS's and Python's Unicode whitespace sets differ, and the
// Python twin must classify every value identically. A real value is returned verbatim.
const BLANK_SECRET = /^[ \t\n\r\f\v]*$/;

/** True when a secret value is absent, empty, or only ASCII whitespace (= unset). */
export function isBlankSecret(value: string | null | undefined): boolean {
  return value == null || BLANK_SECRET.test(value);
}

/** Walk up from a directory to the first ancestor containing `deploy/sops`. */
function findRepoRoot(startDir: string): string {
  let dir = resolve(startDir);
  for (;;) {
    if (existsSync(join(dir, "deploy", "sops"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(startDir);
    dir = parent;
  }
}

/** `$ASTRA_SOPS_FILE` or `<repo-root>/deploy/sops/secrets.enc.yaml`. */
export function defaultSecretsFile(): string {
  const override = process.env.ASTRA_SOPS_FILE;
  if (override) return override;
  return join(findRepoRoot(import.meta.dirname), "deploy", "sops", "secrets.enc.yaml");
}

const decryptCache = new Map<string, Record<string, string>>();

function decrypt(file: string): Record<string, string> {
  const cached = decryptCache.get(file);
  if (cached) return cached;
  if (!existsSync(file)) throw new Error(`SOPS secrets file not found: ${file}`);

  const env = { ...process.env };
  if (!env.SOPS_AGE_KEY_FILE) {
    env.SOPS_AGE_KEY_FILE = join(findRepoRoot(dirname(file)), "deploy", "sops", "age.key");
  }
  const out = execFileSync("sops", ["-d", file], { env, encoding: "utf8" });
  const data = (parseYaml(out) ?? {}) as Record<string, unknown>;
  delete data.sops; // SOPS metadata block is not a real secret
  const flat: Record<string, string> = {};
  // A YAML null (`key:` with no value) is an empty secret, not the string "null".
  for (const [k, v] of Object.entries(data)) flat[k] = v == null ? "" : String(v);
  decryptCache.set(file, flat);
  return flat;
}

/**
 * Resolve a `sops:KEY` pointer (env override → decrypted file). A blank env var or SOPS
 * entry counts as unset (see the module comment), so this returns a non-blank value or
 * throws.
 */
export function resolveSopsRef(ref: string, secretsFile?: string): string {
  if (!ref.startsWith(SOPS_SCHEME)) {
    throw new Error(`not a sops ref: ${JSON.stringify(ref)} (expected '${SOPS_SCHEME}KEY')`);
  }
  const key = ref.slice(SOPS_SCHEME.length);

  const envValue = process.env[key.toUpperCase()];
  if (envValue !== undefined && !isBlankSecret(envValue)) return envValue;

  const file = secretsFile ?? defaultSecretsFile();
  const decrypted = decrypt(file);
  const value = decrypted[key];
  if (value === undefined || isBlankSecret(value)) {
    throw new Error(
      `secret ${JSON.stringify(key)} is missing or blank in ${file} (and ` +
        `$${key.toUpperCase()} is unset or blank). ` +
        "Add it to deploy/sops/secrets.enc.yaml or inject the env var.",
    );
  }
  return value;
}

/**
 * A deferred secret pointer parsed from KDL (`ref="sops:KEY"`). Holds only the ref;
 * `resolve()` decrypts on demand. `toJSON`/`toString` never leak the value.
 */
export class SecretRef {
  readonly ref: string;
  readonly #secretsFile?: string;

  constructor(ref: string, secretsFile?: string) {
    this.ref = ref;
    this.#secretsFile = secretsFile;
  }

  /** Decrypt + return the secret value (throws if absent or blank). */
  resolve(): string {
    return resolveSopsRef(this.ref, this.#secretsFile);
  }

  toJSON(): string {
    return `SecretRef(${this.ref})`;
  }

  toString(): string {
    return `SecretRef(${this.ref})`;
  }
}
