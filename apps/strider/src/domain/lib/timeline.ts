import type { Layer } from "@/domain/lib/regions";

export const VISIBLE_SLOTS = 5;
export const MAX_VISIBLE_DOTS = 15;

// Match the shape of `M.YYY.DDD +HHMMhrs` so the null entry aligns vertically
// with real layer dates above it in the log.
export const NULL_DATE = "M.———.——— +————hrs";
export const NULL_MESSAGE = "++ VOX-INACTIVE ++";

export type TimelineEntry =
  | {
      key: string;
      kind: "layer";
      layerIdx: number;
      date: string;
      message: string;
    }
  | { key: "null"; kind: "null"; date: string; message: string };

export type Dot = { kind: "dot"; idx: number } | { kind: "ellipsis" };

export function visibleEntries(layers: Layer[], index: number): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  for (let i = index - 1; i >= 0 && out.length < VISIBLE_SLOTS; i--) {
    const layer = layers[i]!;
    out.push({
      key: `layer-${i}`,
      kind: "layer",
      layerIdx: i,
      date: imperialDate(layer.timestamp),
      message: layer.message || "(no message)",
    });
  }
  if (out.length < VISIBLE_SLOTS && (index === 0 || index <= VISIBLE_SLOTS - 1)) {
    out.push({
      key: "null",
      kind: "null",
      date: NULL_DATE,
      message: NULL_MESSAGE,
    });
  }
  return out;
}

// "863-07-13T14:21:00Z" → "M.863.194 +1421hrs". Day-of-year math uses Gregorian
// month lengths and ignores leap years — our fictional Imperial calendar
// doesn't need that precision and the fixed table keeps the helper pure.
const DAYS_BEFORE_MONTH = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

export function imperialDate(timestamp: string): string {
  const m = /^(\d+)-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(timestamp);
  if (!m) return timestamp.replace("T", " ").replace(/Z$/, "");
  const [, year, mm, dd, hh, mi] = m;
  const monthIdx = Number.parseInt(mm!, 10) - 1;
  const day = Number.parseInt(dd!, 10);
  const doy = (DAYS_BEFORE_MONTH[monthIdx] ?? 0) + day;
  return `M.${year}.${String(doy).padStart(3, "0")} +${hh}${mi}hrs`;
}

export function dotIndices(count: number, current: number): Dot[] {
  if (count <= MAX_VISIBLE_DOTS) {
    return Array.from({ length: count }, (_, i) => ({ kind: "dot", idx: i }));
  }
  const window = 2;
  const keep = new Set<number>([0, count - 1, current]);
  for (let i = current - window; i <= current + window; i++) {
    if (i >= 0 && i < count) keep.add(i);
  }
  const sorted = [...keep].sort((a, b) => a - b);
  const out: Dot[] = [];
  let prev = -1;
  for (const idx of sorted) {
    if (prev !== -1 && idx > prev + 1) out.push({ kind: "ellipsis" });
    out.push({ kind: "dot", idx });
    prev = idx;
  }
  return out;
}

// Constant dwell per layer. Playback used to accelerate line-by-line to keep a
// long full-history replay from dragging; now the auto catch-up only ever plays
// the layers added since the last visit (bounded — see MAX_PLAYBACK_LAYERS) and
// it only plays once, so every line gets the same readable hold.
export const LAYER_DWELL_MS = 1100;

// The auto catch-up is capped to at most this many trailing layers: anything
// older than the window snaps in instantly, so the intro length never grows as
// history accumulates. The opt-in "replay history" plays the full log instead.
export const MAX_PLAYBACK_LAYERS = 10;

// --- Tithe wave timing (shared by the HexMap animation and the playback dwell) ---
// The wave fills the board center→edge (a FILL travel window plus a per-tile
// FLIP), holds briefly at full purple, then fades the whole board out. The total
// is FIXED (budget-independent) so playback can dwell exactly long enough for the
// wave to finish before the next layer applies — otherwise the accelerated dwell
// floors at MIN_DWELL_MS and later layers start applying mid-wave.
export const TITHE_FILL_MS = 900; // center→edge travel of the flip-in wave
export const TITHE_FLIP_MS = 220; // per-tile flip-in duration
export const TITHE_HOLD_MS = 120; // dwell at full purple before fading
export const TITHE_FADE_MS = 300; // quick fade-out of the filled board
export const TITHE_TOTAL_MS = TITHE_FILL_MS + TITHE_FLIP_MS + TITHE_HOLD_MS + TITHE_FADE_MS;
// Hold a tithe layer on screen for the whole wave plus a short beat of black, so
// the wave is fully gone before the next layer is applied.
export const TITHE_DWELL_MS = TITHE_TOTAL_MS + 160;

export function slotOpacity(slot: number): number {
  const steps = [1, 0.78, 0.55, 0.32, 0.14];
  return steps[Math.min(slot, steps.length - 1)] ?? 0;
}

// Newest is bone-white; older entries grade toward amber like ink yellowing on vellum.
export function slotInk(slot: number): string {
  const steps = [100, 80, 60, 40, 20];
  const pct = steps[Math.min(slot, steps.length - 1)] ?? 0;
  return `color-mix(in srgb, var(--ink) ${pct}%, var(--accent-amber))`;
}
