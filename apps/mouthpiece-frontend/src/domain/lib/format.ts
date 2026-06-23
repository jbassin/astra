// Display helpers ported from faerrin face/src/lib/episodes.ts. The only pure logic
// the frontend still ports (the backend owns all the catalog/transcript shaping —
// D6, revised); kept here in src/domain/lib like the akasha template.

/** Format a millisecond runtime as "M:SS" (or "H:MM:SS" past an hour). */
export function formatRuntime(ms: number): string {
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Summed runtime across episodes (0 until audio is seeded — durationMs is 0 then). */
export function sumRuntimeMs(episodes: ReadonlyArray<{ durationMs: number }>): number {
  return episodes.reduce((sum, e) => sum + (e.durationMs || 0), 0);
}
