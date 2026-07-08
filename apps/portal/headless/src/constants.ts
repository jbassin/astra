/**
 * portal-headless constants (spec 0027 D27-5/-6) — the supervised headless-Chromium GM
 * session that keeps a dedicated Foundry account ("Portal") logged into the live pf2e
 * "Faerrin" world 24/7, so portal's MCP tools never need a human browser tab open.
 * Split out so the entrypoint, the supervisor, and tests share one literal.
 */

/** De-collided from `astra.portal` per the heartwood lesson
 * ([[heartwood-0020-gotchas]]) — this is a separate Compose unit from portal-server
 * (D27-5) and needs its own identity in SigNoz even though it has no browser RUM
 * surface of its own. */
export const SERVICE_NAME = "astra.portal-headless";

/** First backoff delay for the classify/login probe loop. Mirrors the module's
 * `bridgeClient` constants exactly (`apps/portal/module/src/bridgeClient.ts`) — same
 * "never give up, but don't hammer" shape, applied here to Foundry `/join` instead of
 * the bridge WS. */
export const BASE_BACKOFF_MS = 1_000;

/** Backoff never grows past this (D27-6 — never give up). */
export const MAX_BACKOFF_MS = 30_000;

/** Continuous time in `in-world` before a subsequent drop counts as a fresh outage
 * (backoff resets to base) rather than a continuation of a still-unhealthy loop —
 * without this, a session that flaps faster than this window would reset to 1s and
 * hammer `/join`. */
export const HEALTHY_HOLD_MS = 10_000;

/** How often to re-probe while healthy (`in-world` — nothing to do but monitor + check
 * the reload knob). Not a backoff value; a steady monitoring cadence. */
export const DEFAULT_POLL_INTERVAL_MS = 30_000;
