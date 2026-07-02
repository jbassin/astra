/**
 * Lazy SOPS secret-ref resolution — the TS twin of `libs/py/config/secrets.py`
 * (roadmap Decision E). Same contract: KDL holds only `ref="sops:KEY"`; values live
 * in the SOPS-encrypted file and decrypt on `.resolve()`, env var (KEY upper-cased)
 * winning over the file.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";

const SOPS_SCHEME = "sops:";

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
  for (const [k, v] of Object.entries(data)) flat[k] = String(v);
  decryptCache.set(file, flat);
  return flat;
}

/** Resolve a `sops:KEY` pointer (env override → decrypted file). */
export function resolveSopsRef(ref: string, secretsFile?: string): string {
  if (!ref.startsWith(SOPS_SCHEME)) {
    throw new Error(`not a sops ref: ${JSON.stringify(ref)} (expected '${SOPS_SCHEME}KEY')`);
  }
  const key = ref.slice(SOPS_SCHEME.length);

  const envValue = process.env[key.toUpperCase()];
  if (envValue !== undefined) return envValue;

  const file = secretsFile ?? defaultSecretsFile();
  const decrypted = decrypt(file);
  const value = decrypted[key];
  if (value === undefined) {
    throw new Error(
      `secret ${JSON.stringify(key)} not in ${file} (and $${key.toUpperCase()} unset). ` +
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
  constructor(
    readonly ref: string,
    private readonly secretsFile?: string,
  ) {}

  resolve(): string {
    return resolveSopsRef(this.ref, this.secretsFile);
  }

  toJSON(): string {
    return `SecretRef(${this.ref})`;
  }

  toString(): string {
    return `SecretRef(${this.ref})`;
  }
}
