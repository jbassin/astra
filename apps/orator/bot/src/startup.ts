/**
 * Startup guards — orator fails CLOSED. A missing or blank session secret
 * would sign forgeable admin cookies, and an empty operator allowlist used to admit every
 * Discord account (the app now admits no one with an empty set). Either one stops the
 * process at boot, so the misconfiguration is loud instead of running (and reporting
 * healthy) with no security or no operators. The usual cause is a container recreated
 * with a plain `docker compose up -d` instead of `just up`, which injects `${KEY:-}` = "".
 *
 * Optional secrets (the Discord bot token, the OAuth client pair) keep the
 * "unresolved → feature off" behaviour via `SecretRef.optional()`.
 */
import type { SecretRef } from "@astra/config";

/** Session-secret floor: HMAC-SHA256's own output size, so the key is not the weak link. */
export const MIN_SESSION_SECRET_BYTES = 32;

/**
 * Resolve the session secret or throw: `require()` refuses an unset or blank value, and
 * this adds the length floor. The error names the config key and env var, never the value.
 */
export function requireSessionSecret(ref: SecretRef | null | undefined): string {
  if (!ref) {
    throw new Error(
      "orator.session-secret has no ref= in config.kdl's orator {} block — " +
        "orator refuses to start without it",
    );
  }
  const value = ref.require();
  if (Buffer.byteLength(value, "utf8") < MIN_SESSION_SECRET_BYTES) {
    throw new Error(
      `orator.session-secret (${ref.ref}) is shorter than ${MIN_SESSION_SECRET_BYTES} ` +
        "bytes — orator refuses to start with a weak key",
    );
  }
  return value;
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
