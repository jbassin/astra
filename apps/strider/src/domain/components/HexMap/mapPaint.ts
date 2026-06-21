// Shared region fill/border painting + the map theme tokens, so HexMap and
// EditorHexMap render regions identically (the two used to inline byte-identical
// blocks). `active` = hovered (map) or picked (editor) — same visual treatment.
import type { Graphics } from "pixi.js";
import type { GlowFilter } from "pixi-filters/glow";
import { computeRegionBorders, hexPixel } from "@/domain/lib/hexUtils";
import type { Region } from "@/domain/lib/layers";
import { drawEdgesPath, hexVertsAtPixel } from "./pixiScene";

export const mapTheme = {
  regionFill: "#0a0d12",
  regionFillAlpha: { active: 0.55, idle: 0.4 },
  regionBorderColor: { active: "#6dd5c0", idle: "#f0b46e" },
  regionBorderWidth: { active: 0.35, idle: 0.22 },
  regionBorderAlpha: { active: 0.9, idle: 0.55 },
  regionBorderGlowColor: { active: 0x6dd5c0, idle: 0xf0b46e },
  regionBorderGlowStrength: { active: 1.4, idle: 0.8 },
} as const;

export function paintRegionFill(g: Graphics, region: Region, active: boolean): void {
  g.clear();
  for (const [q, r] of region.hexes) {
    const [cx, cy] = hexPixel(q, r);
    g.poly(hexVertsAtPixel(cx, cy));
    g.fill({
      color: mapTheme.regionFill,
      alpha: active ? mapTheme.regionFillAlpha.active : mapTheme.regionFillAlpha.idle,
    });
  }
}

export function paintRegionBorder(g: Graphics, region: Region, active: boolean): void {
  g.clear();
  drawEdgesPath(g, computeRegionBorders(region.hexes));
  g.stroke({
    color: active ? mapTheme.regionBorderColor.active : mapTheme.regionBorderColor.idle,
    width: active ? mapTheme.regionBorderWidth.active : mapTheme.regionBorderWidth.idle,
    alpha: active ? mapTheme.regionBorderAlpha.active : mapTheme.regionBorderAlpha.idle,
    cap: "round",
  });
  // The border Graphics carries a single GlowFilter, tinted to match the stroke.
  const glow = g.filters?.[0] as GlowFilter | undefined;
  if (glow) {
    glow.color = active
      ? mapTheme.regionBorderGlowColor.active
      : mapTheme.regionBorderGlowColor.idle;
    glow.outerStrength = active
      ? mapTheme.regionBorderGlowStrength.active
      : mapTheme.regionBorderGlowStrength.idle;
  }
}
