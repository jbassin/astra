import type { CSSProperties } from "react";

/**
 * Identity-color seam (Decision I5). Per-player/host colors are NOT part of
 * gothic's framework palette — their VALUES live in ontology-being
 * (`Player.color`, `WealHost.color`, `guest_color`). gothic only applies them as
 * a RUNTIME CSS variable (`--identity-color`), because Tailwind is static and
 * can't encode per-player values. Components/consumers then reference it via an
 * arbitrary value, e.g. `className="text-[var(--identity-color)]"` or
 * `border-[var(--identity-color)]`.
 *
 * A missing/blank color falls back VISIBLY to a neutral (never crashes, never
 * an invalid CSS value) — ink-dim, so an un-themed speaker still reads.
 *
 * gothic does NOT import `@astra/ontology` (grow-as-consumed, J3): the FRONTEND
 * imports ontology-being, reads `Player.color` / `WealHost.color` / `guest_color`,
 * and hands the value here. Those entities are structurally `IdentityColorable`
 * (`{ color: string }`), so they pass straight through.
 */

/** The visible neutral used when an entity has no color (ink-dim). */
export const FALLBACK_IDENTITY_COLOR = "#7a8a99";

/** The CSS custom property gothic exposes identity color through. */
export const IDENTITY_COLOR_VAR = "--identity-color";

/** Anything ontology-being exposes a `color` on (Player, WealHost, …). */
export interface IdentityColorable {
  color?: string | null;
}

/** Resolve a color from a raw string or an ontology entity, with the fallback. */
export function identityColor(source: string | IdentityColorable | null | undefined): string {
  const raw = typeof source === "string" ? source : source?.color;
  return raw && raw.trim() !== "" ? raw : FALLBACK_IDENTITY_COLOR;
}

/**
 * A `style` object setting `--identity-color`, ready to spread onto a wrapper:
 *   <span style={identityStyle(player)} className="text-[var(--identity-color)]">
 */
export function identityStyle(
  source: string | IdentityColorable | null | undefined,
): CSSProperties {
  return { [IDENTITY_COLOR_VAR]: identityColor(source) } as CSSProperties;
}
