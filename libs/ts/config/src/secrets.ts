/**
 * Lazy SOPS secret-ref resolution — the TS twin of `libs/py/config/secrets.py`
 * Same contract: KDL holds only `ref="sops:KEY"`; values live
 * in the SOPS-encrypted file and decrypt on `.resolve()`, env var (KEY upper-cased)
 * winning over the file.
 *
 * A BLANK value — empty, or only ASCII whitespace — counts as UNSET at both steps.
 * Compose injects every secret as `${KEY:-}`, so a container recreated without
 * `just up` sees the env var present but empty; that must not pass as a real secret. A
 * blank env var falls through to the SOPS file exactly like an absent one, and a blank
 * SOPS entry throws exactly like a missing one — so `resolve()` returns a non-blank value
 * or throws, never `""`. Same rule and same character set as the Python twin.
 *
 * Read a secret through `SecretRef.require()` (load-bearing: throws a `SecretUnsetError`
 * naming the config key) or `SecretRef.optional()` (feature switch: unset → undefined).
 * App code doesn't wrap `resolve()` itself.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

import { parse as parseYaml } from "yaml";

import { findRepoRoot } from "./root";

const SOPS_SCHEME = "sops:";

// A blank secret is made only of these characters. An explicit ASCII set rather than
// `String.prototype.trim()`: JS's and Python's Unicode whitespace sets differ, and the
// Python twin must classify every value identically. A real value is returned verbatim.
const BLANK_SECRET = /^[ \t\n\r\f\v]*$/;

/** A required secret is unset, blank or unresolvable. The message never holds a value. */
export class SecretUnsetError extends Error {
  override name = "SecretUnsetError";
}

/** Thrown when a secret is absent or blank; `optional()` reads it as "unset". */
class MissingSecretError extends Error {}

/** True when a secret value is absent, empty, or only ASCII whitespace (= unset). */
export function isBlankSecret(value: string | null | undefined): boolean {
  return value == null || BLANK_SECRET.test(value);
}

/** `$ASTRA_SOPS_FILE` or `<repo-root>/deploy/sops/secrets.enc.yaml`. Outside a checkout
 * there is no default file: that throws the "missing" error `optional()` reads as unset,
 * exactly like an absent file. */
export function defaultSecretsFile(): string {
  const override = process.env.ASTRA_SOPS_FILE;
  if (override) return override;
  let root: string;
  try {
    root = findRepoRoot();
  } catch (err) {
    throw new MissingSecretError(`no SOPS secrets file: ${(err as Error).message}`);
  }
  return join(root, "deploy", "sops", "secrets.enc.yaml");
}

/** The checkout holding the SOPS file, else this library's own checkout. */
function ageKeyFile(secretsFile: string): string {
  let root: string;
  try {
    root = findRepoRoot(dirname(secretsFile));
  } catch {
    root = findRepoRoot();
  }
  return join(root, "deploy", "sops", "age.key");
}

const decryptCache = new Map<string, Record<string, string>>();

function decrypt(file: string): Record<string, string> {
  const cached = decryptCache.get(file);
  if (cached) return cached;
  if (!existsSync(file)) throw new MissingSecretError(`SOPS secrets file not found: ${file}`);

  const env = { ...process.env };
  if (!env.SOPS_AGE_KEY_FILE) {
    env.SOPS_AGE_KEY_FILE = ageKeyFile(file);
  }
  const out = execFileSync("sops", ["-d", file], { env, encoding: "utf8" });
  let parsed: unknown;
  try {
    parsed = parseYaml(out);
  } catch {
    // No cause and no message from the YAML error: its code frame quotes the plaintext.
    throw new Error(`sops -d output for ${file} is not valid YAML`);
  }
  const data = (parsed ?? {}) as Record<string, unknown>;
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
    throw new MissingSecretError(
      `secret ${JSON.stringify(key)} is missing or blank in ${file} (and ` +
        `$${key.toUpperCase()} is unset or blank). ` +
        "Add it to deploy/sops/secrets.enc.yaml or inject the env var.",
    );
  }
  return value;
}

/**
 * A deferred secret pointer parsed from KDL (`ref="sops:KEY"`). Holds only the ref (and
 * the config key it was read from, e.g. `orator.session-secret`); `require()` /
 * `optional()` decrypt on demand. `toJSON`/`toString` never leak the value.
 */
export class SecretRef {
  readonly ref: string;
  readonly configKey?: string;
  readonly #secretsFile?: string;

  constructor(ref: string, secretsFile?: string, configKey?: string) {
    this.ref = ref;
    this.configKey = configKey;
    this.#secretsFile = secretsFile;
  }

  /** Decrypt + return the secret value (throws if absent or blank). */
  resolve(): string {
    return resolveSopsRef(this.ref, this.#secretsFile);
  }

  /**
   * The secret's value, or a `SecretUnsetError` naming the config key and env var. Every
   * resolution failure (unset, blank, no SOPS file, `sops -d` failed) throws, so a caller
   * can never proceed with an empty secret.
   */
  require(): string {
    try {
      return this.resolve();
    } catch (err) {
      const key = this.ref.slice(SOPS_SCHEME.length);
      const env = key.toUpperCase();
      const name = this.configKey ? `config key ${this.configKey} (${this.ref})` : this.ref;
      const cause = err instanceof Error ? err.message : String(err);
      throw new SecretUnsetError(
        `${name} is unset, blank or unresolvable: add ${JSON.stringify(key)} to ` +
          `deploy/sops/secrets.enc.yaml and deploy with \`just up\` (which injects $${env}), ` +
          `or set $${env} for a host run (${cause})`,
        { cause: err },
      );
    }
  }

  /**
   * The secret's value, or undefined when it is unset or blank (no SOPS file counts).
   * A `sops -d` failure still throws: a broken age key is not an unset secret.
   */
  optional(): string | undefined {
    try {
      return this.resolve();
    } catch (err) {
      if (err instanceof MissingSecretError) return undefined;
      throw err;
    }
  }

  toJSON(): string {
    return `SecretRef(${this.ref})`;
  }

  toString(): string {
    return `SecretRef(${this.ref})`;
  }
}
