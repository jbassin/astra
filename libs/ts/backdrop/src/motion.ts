// Reduced motion for the animated backdrops. A viewer who asks for reduced motion
// (`prefers-reduced-motion: reduce`) gets one still frame of the same shader instead of
// the animation; everyone else sees no change. The preference is followed live, so
// toggling it in the OS stops or restarts the animation without a reload.

/** The media query a backdrop follows. */
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** The query in this browser, or undefined where there is no `matchMedia` (SSR, old engines). */
export function reducedMotionMedia(): MediaQueryList | undefined {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
  return window.matchMedia(REDUCED_MOTION_QUERY);
}

/** The animation loop a backdrop runs. */
export interface MotionLoop {
  /** Start (or resume) the per-frame animation. */
  start: () => void;
  /** Stop the per-frame animation. */
  stop: () => void;
  /** Draw one still frame (the shader at time 0) at the current size. */
  renderStill: () => void;
}

/**
 * Run `loop` while motion is allowed, and switch to one still frame while the viewer
 * prefers reduced motion, following changes to the preference. Without a media query
 * (no `matchMedia`) the loop just runs. Returns the cleanup that stops listening.
 */
export function followMotionPreference(
  loop: MotionLoop,
  media: Pick<MediaQueryList, "matches" | "addEventListener" | "removeEventListener"> | undefined,
): () => void {
  const apply = () => {
    if (media?.matches) {
      loop.stop();
      loop.renderStill();
    } else {
      loop.start();
    }
  };
  apply();
  media?.addEventListener("change", apply);
  return () => media?.removeEventListener("change", apply);
}
