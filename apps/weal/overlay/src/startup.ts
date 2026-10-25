/**
 * Startup guard — weal-overlay fails CLOSED. Without the shared ingest
 * token, `POST /api/v1/roll` on the public host would accept anyone's rolls, so a
 * missing or blank token stops the process at boot instead of running open. The usual
 * cause is a container recreated with a plain `docker compose up -d` instead of
 * `just up`, which injects `${WEAL_TOKEN:-}` = "".
 */
import type { SecretRef } from "@astra/config";

/**
 * Resolve the ingest token or throw: `require()` refuses an unset or blank value. The error
 * names the config key and env var, never the value.
 */
export function requireIngestToken(ref: SecretRef | null | undefined): string {
  if (!ref) {
    throw new Error(
      "weal-overlay.token has no ref= in config.kdl's weal-overlay {} block — " +
        "weal-overlay refuses to start with an unauthenticated ingest",
    );
  }
  return ref.require();
}
