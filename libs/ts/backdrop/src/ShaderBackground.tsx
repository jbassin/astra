import type { Application } from "pixi.js";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import type { BackdropSpec } from "./types";

// A fixed, full-viewport animated shader background (z-index: -1, behind all page
// content, never intercepts clicks). The reusable spine of the astra "signature
// style" — pass it a BackdropSpec from the catalog (or your own).
//
// SSR-safe + self-contained (no <ClientOnly> needed at the call site): it renders
// nothing until mounted, so the <canvas> is absent from the SSR HTML and there's no
// hydration mismatch; pixi + the factory are dynamic-imported in the effect, so
// neither evaluates during SSR. Mount ONE per page (one Application = one WebGL
// context — don't stack a second pixi Application on the same page).
const CANVAS_STYLE: CSSProperties = {
  position: "fixed",
  inset: 0,
  width: "100%",
  height: "100%",
  zIndex: -1,
  display: "block",
  pointerEvents: "none",
};

export function ShaderBackground({ spec }: { spec: BackdropSpec }) {
  const [mounted, setMounted] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    let app: Application | null = null;
    let destroy: (() => void) | null = null;
    let tick: (() => void) | null = null;

    (async () => {
      const [{ Application: PixiApp }, { createShaderBackground }] = await Promise.all([
        import("pixi.js"),
        import("./createShaderBackground"),
      ]);

      const a = new PixiApp();
      await a.init({
        canvas,
        resizeTo: window,
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
        preference: "webgl",
      });
      if (cancelled) {
        a.destroy(true, { children: true, texture: true });
        return;
      }
      app = a;

      const bg = createShaderBackground(a, spec);
      bg.mesh.label = "background";
      a.stage.addChild(bg.mesh);

      const start = performance.now();
      tick = () => bg.update(performance.now() - start);
      a.ticker.add(tick);
      destroy = bg.destroy;
    })();

    return () => {
      cancelled = true;
      if (app) {
        if (tick) app.ticker.remove(tick);
        destroy?.();
        app.destroy(true, { children: true, texture: true });
      }
    };
  }, [mounted, spec]);

  if (!mounted) return null;
  return (
    // biome-ignore lint/a11y/noAriaHiddenOnFocusable: decorative pixi render target, not focusable (no tabindex)
    <canvas ref={canvasRef} style={CANVAS_STYLE} aria-hidden="true" />
  );
}
