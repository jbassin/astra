import type { Application } from "pixi.js";
import { useEffect, useRef } from "react";
import styles from "./StarfieldBackground.module.css";

// A fixed, full-viewport animated starfield behind the page (z-index: -1).
// Self-contained — unlike strider's PixiHost it exposes no shared Pixi context
// (harrow has no on-canvas content), so it just owns one Application + the shader
// mesh. Pixi is dynamically imported so it never evaluates during SSR; mount this
// inside <ClientOnly> in __root for belt-and-suspenders.
export default function StarfieldBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    let app: Application | null = null;
    let destroy: (() => void) | null = null;
    let tick: (() => void) | null = null;

    (async () => {
      const [{ Application: PixiApp }, starMod] = await Promise.all([
        import("pixi.js"),
        import("./starfieldBackground"),
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

      const bg = starMod.createStarfieldBackground(a);
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
  }, []);

  return (
    // biome-ignore lint/a11y/noAriaHiddenOnFocusable: decorative pixi render target, not focusable (no tabindex)
    <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
  );
}
