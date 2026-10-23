import type { Delay } from "./throttle";
import { realDelay } from "./throttle";

export const AON_SEARCH_URL = "https://elasticsearch.aonprd.com/aon/_search";

// The endpoint is Origin-allowlisted for the browser client (D29-5) — a plain Node
// `fetch()` sends no Origin header at all, which is exactly why this works server-side.
// The descriptive contact UA is fetcher etiquette, not an auth requirement.
export const AON_USER_AGENT =
  "astra-codex-ingest/0.1 (personal reference project; contact: josh.r.bassin@gmail.com)";

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface AonClientOptions {
  fetchImpl?: FetchLike;
  userAgent?: string;
  maxRetries?: number;
  retryDelay?: Delay;
  backoffBaseMs?: number;
}

export type AonSearchFn = <T = unknown>(body: unknown) => Promise<T>;

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

/**
 * POSTs a JSON search/agg body to the AoN Elasticsearch `_search` endpoint, retrying
 * transient 429/5xx with bounded exponential backoff (D29-5). Non-retryable statuses
 * (any other 4xx, or retries exhausted) throw immediately — no silent partial results.
 * `fetchImpl`/`retryDelay` are injectable so tests never hit the real network or sleep.
 */
export function createAonClient(opts: AonClientOptions = {}): AonSearchFn {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const userAgent = opts.userAgent ?? AON_USER_AGENT;
  const maxRetries = opts.maxRetries ?? 3;
  const retryDelay = opts.retryDelay ?? realDelay;
  const backoffBaseMs = opts.backoffBaseMs ?? 500;

  return async function search<T = unknown>(body: unknown): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      const res = await fetchImpl(AON_SEARCH_URL, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": userAgent },
        body: JSON.stringify(body),
      });
      if (res.ok) return (await res.json()) as T;
      if (!isRetryableStatus(res.status) || attempt >= maxRetries) {
        throw new Error(`AoN search failed: ${res.status} ${res.statusText}`);
      }
      await retryDelay(backoffBaseMs * 2 ** attempt);
    }
  };
}
