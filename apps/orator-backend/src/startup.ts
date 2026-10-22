/**
 * Startup guards — orator fails CLOSED (0037 SVC-2). A missing or blank session secret
 * would sign forgeable admin cookies, and an empty operator allowlist used to admit every
 * Discord account (the app now admits no one with an empty set). Either one stops the
 * process at boot, so the misconfiguration is loud instead of running (and reporting
 * healthy) with no security or no operators. The usual cause is a container recreated
 * with a plain `docker compose up -d` instead of `just up`, which injects `${KEY:-}` = "".
 *
 * Optional secrets (the Discord bot token, the OAuth client pair) keep the
 * "unresolved → feature off" behaviour via `optionalSecret`.
 */
import { isBlankSecret, type SecretRef } from "@astra/config";

/** Session-secret floor: HMAC-SHA256's own output size, so the key is not the weak link. */
export const MIN_SESSION_SECRET_BYTES = 32;

type Ref = Pick<SecretRef, "ref" | "resolve"> | null | undefined;

/** `sops:orator_session_secret` → `ORATOR_SESSION_SECRET` (the name `just up` injects). */
function envName(ref: string): string {
  return ref.replace(/^sops:/, "").toUpperCase();
}

/**
 * Resolve a load-bearing secret or throw. The error names the config field, the ref and
 * the env var — never the value. `minBytes` rejects a present-but-weak value.
 */
export function requireSecret(ref: Ref, field: string, minBytes = 1): string {
  if (!ref) {
    throw new Error(
      `cfg.orator.${field} has no ref= in config.kdl's orator {} block — ` +
        "orator refuses to start without it",
    );
  }
  let value: string | undefined;
  let reason = "";
  try {
    value = ref.resolve();
  } catch (err) {
    reason = ` (${err instanceof Error ? err.message : String(err)})`;
  }
  if (value === undefined || isBlankSecret(value)) {
    throw new Error(
      `cfg.orator.${field} (${ref.ref}) is missing or empty — orator refuses to start ` +
        `without it. Deploy with \`just up\` so $${envName(ref.ref)} is injected from ` +
        `SOPS${reason}`,
    );
  }
  if (Buffer.byteLength(value, "utf8") < minBytes) {
    throw new Error(
      `cfg.orator.${field} (${ref.ref}) is shorter than ${minBytes} bytes — ` +
        "orator refuses to start with a weak key",
    );
  }
  return value;
}

/** Resolve an optional secret; unresolved or blank → "" (feature off). */
export function optionalSecret(ref: Ref): string {
  try {
    return ref?.resolve() ?? "";
  } catch {
    return "";
  }
}

/** Refuse an empty operator allowlist: a service no operator can use is a misconfiguration. */
export function requireAllowlist(allowlist: Set<string>): Set<string> {
  if (allowlist.size === 0) {
    throw new Error(
      "the operator allowlist is empty (no is-admin player snowflakes in being.kdl and no " +
        "orator.allowed-user-ids override) — orator refuses to start with no operators",
    );
  }
  return allowlist;
}
