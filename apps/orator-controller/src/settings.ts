/**
 * Plugin-wide settings, set via the Property Inspector and stored in Stream Deck
 * global settings.
 *
 * Lifted from faerrin `birdfeed`, with the key astra change (M4/slice 8): the
 * orator-backend **origin is configurable** (birdfeed hardcoded `lark.iridi.cc`).
 * The operator mints an API key in orator-backend's web UI (minting is session-
 * gated server-side — the plugin can't mint) and pastes it here alongside the
 * origin.
 */
export interface OratorGlobalSettings {
  /** orator-backend origin, e.g. `https://orator.iridi.cc`. Was hardcoded in birdfeed. */
  oratorOrigin?: string;
  /** An `orator_…` API key minted in orator-backend's web UI; sent as `Authorization: Bearer …`. */
  apiKey?: string;
}

/** Per-key settings. The plugin derives a key's role from coordinates + nav state, so none are needed. */
export type SlotSettings = Record<string, never>;

/** Configured only when both the origin and a key are present. */
export function isConfigured(s: OratorGlobalSettings): s is Required<OratorGlobalSettings> {
  return !!s.oratorOrigin && !!s.apiKey;
}

/** Normalize an origin: trim and strip any trailing slash (so `${origin}${path}` is clean). */
export function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, "");
}
