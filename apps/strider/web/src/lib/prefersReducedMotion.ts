// The viewer's reduced-motion preference. The MediaQueryList is created once and read
// live, so a per-frame check is cheap and follows a change without a reload.

let media: MediaQueryList | null | undefined;

export function prefersReducedMotion(): boolean {
  if (media === undefined) {
    media =
      typeof window === "undefined" || !window.matchMedia
        ? null
        : window.matchMedia("(prefers-reduced-motion: reduce)");
  }
  return media?.matches ?? false;
}
