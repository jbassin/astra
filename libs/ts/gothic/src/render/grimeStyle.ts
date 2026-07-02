import type { CSSProperties } from "react";

import { grimeFor } from "./seed";

/**
 * Deterministic grime as CSS custom properties for a card. The values are pure
 * data (rotation, ring position) — the diegetic utilities decide whether to use
 * them, so components stay theme-agnostic. Mechanical mode ignores them.
 */
export function grimeStyle(content: string): CSSProperties {
  const g = grimeFor(content);
  return {
    "--vellum-rotate": `${g.rotateDeg}deg`,
    "--vellum-ring-x": `${g.ringX}%`,
    "--vellum-ring-y": `${g.ringY}%`,
    "--vellum-ring-scale": String(g.ringScale),
  } as CSSProperties;
}
