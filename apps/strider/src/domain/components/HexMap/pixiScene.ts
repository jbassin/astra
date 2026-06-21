import type { Application } from "pixi.js";
import { Container, type Graphics } from "pixi.js";
import { hexCornersAtPixel } from "@/domain/lib/hexUtils";

export const WORLD_VIEWBOX = { width: 224, height: 256 };

// Pixi polygons want a flat [x0, y0, x1, y1, …] list; the corner geometry itself
// is owned by hexUtils so the renderer and the border walks never diverge.
export function hexVertsAtPixel(px: number, py: number): number[] {
  return hexCornersAtPixel(px, py).flat();
}

export function drawEdgesPath(
  g: Graphics,
  edges: ReadonlyArray<readonly [number, number, number, number]>,
): void {
  for (const [x1, y1, x2, y2] of edges) {
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
  }
}

// Stroke a polyline (moveTo + lineTo across the points). Caller applies the
// stroke style afterward. Shared by the skein line/curve renderers.
export function strokePolyline(
  g: Graphics,
  points: ReadonlyArray<readonly [number, number]>,
): void {
  if (points.length < 2) return;
  g.moveTo(points[0]![0], points[0]![1]);
  for (let i = 1; i < points.length; i++) g.lineTo(points[i]![0], points[i]![1]);
}

export interface WorldHandle {
  world: Container;
  fit: (width: number, height: number) => void;
}

export function attachWorld(app: Application): WorldHandle {
  const world = new Container();
  world.label = "world";
  app.stage.addChild(world);
  function fitToViewport(width: number, height: number) {
    const scale = Math.min(width / WORLD_VIEWBOX.width, height / WORLD_VIEWBOX.height);
    world.scale.set(scale);
    world.position.set(width / 2, height / 2);
  }
  fitToViewport(app.renderer.width, app.renderer.height);
  return { world, fit: fitToViewport };
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
