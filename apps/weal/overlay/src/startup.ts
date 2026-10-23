/**
 * Startup guard — weal-overlay fails CLOSED (0037 SEC-12). Without the shared ingest
 * token, `POST /api/v1/roll` on the public host would accept anyone's rolls, so a
 * missing or blank token stops the process at boot instead of running open. The usual
 * cause is a container recreated with a plain `docker compose up -d` instead of
 * `just up`, which injects `${WEAL_TOKEN:-}` = "".
 */
import { isBlankSecret, type SecretRef } from "@astra/config";

type Ref = Pick<SecretRef, "ref" | "resolve"> | null | undefined;

/** Resolve the ingest token or throw. The error names the ref and env var, never the value. */
export function requireIngestToken(ref: Ref): string {
  if (!ref) {
    throw new Error(
      "cfg.wealOverlay.token has no ref= in config.kdl's weal-overlay {} block — " +
        "weal-overlay refuses to start with an unauthenticated ingest",
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
    const env = ref.ref.replace(/^sops:/, "").toUpperCase();
    throw new Error(
      `cfg.wealOverlay.token (${ref.ref}) is missing or empty — weal-overlay refuses to ` +
        `start with an unauthenticated ingest. Deploy with \`just up\` so $${env} is ` +
        `injected from SOPS${reason}`,
    );
  }
  return value;
}
