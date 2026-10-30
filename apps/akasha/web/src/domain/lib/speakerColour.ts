/**
 * Speaker colours for the light theme. being.kdl's identity colours are pastels made for a
 * dark page; as text on akasha's light page they fall far below 4.5:1. `readableOn` keeps
 * each colour's hue (OKLCH), deepens its chroma a little and lowers its lightness until it
 * reaches the contrast target on every background given. build-content emits the results as
 * literal hex (`--sp<Name>`), so the browser does no colour maths.
 *
 * Build-only and pure: imported by scripts/build-content.ts and the tests.
 */

type Rgb = [number, number, number];

/** Parses `rgb(r,g,b)` or `#rrggbb` into 0..255 channels. */
export function parseColour(css: string): Rgb {
  const s = css.trim();
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(s);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  const hex = /^#([0-9a-f]{6})$/i.exec(s);
  if (hex?.[1]) {
    const n = Number.parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  throw new Error(`unsupported colour: ${css}`);
}

const toHex = ([r, g, b]: Rgb): string =>
  `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;

const toLinear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (v: number) =>
  255 * (v <= 0.003_130_8 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

/** Applies `f` to each channel. */
const each = ([r, g, b]: Rgb, f: (v: number, i: number) => number): Rgb => [
  f(r, 0),
  f(g, 1),
  f(b, 2),
];

/** WCAG relative luminance. */
function luminance(c: Rgb): number {
  const [r, g, b] = each(c, toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours. */
export function contrast(a: string, b: string): number {
  const la = luminance(parseColour(a));
  const lb = luminance(parseColour(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** sRGB to OKLCH (Björn Ottosson's OKLab). */
function toOklch(c: Rgb): [number, number, number] {
  const [r, g, b] = each(c, toLinear);
  const l = Math.cbrt(0.412_221_470_8 * r + 0.536_332_536_3 * g + 0.051_445_992_9 * b);
  const m = Math.cbrt(0.211_903_498_2 * r + 0.680_699_545_1 * g + 0.107_396_956_6 * b);
  const s = Math.cbrt(0.088_302_461_9 * r + 0.281_718_837_6 * g + 0.629_978_700_5 * b);
  const L = 0.210_454_255_3 * l + 0.793_617_785 * m - 0.004_072_046_8 * s;
  const A = 1.977_998_495_1 * l - 2.428_592_205 * m + 0.450_593_709_9 * s;
  const B = 0.025_904_037_1 * l + 0.782_771_766_2 * m - 0.808_675_766 * s;
  return [L, Math.hypot(A, B), Math.atan2(B, A)];
}

/** OKLCH to linear sRGB, unclamped (a channel outside 0..1 is out of gamut). */
function oklchToLinear(L: number, C: number, h: number): Rgb {
  const A = C * Math.cos(h);
  const B = C * Math.sin(h);
  const l = (L + 0.396_337_777_4 * A + 0.215_803_757_3 * B) ** 3;
  const m = (L - 0.105_561_345_8 * A - 0.063_854_172_8 * B) ** 3;
  const s = (L - 0.089_484_177_5 * A - 1.291_485_548 * B) ** 3;
  return [
    4.076_741_662_1 * l - 3.307_711_591_3 * m + 0.230_969_929_2 * s,
    -1.268_438_004_6 * l + 2.609_757_401_1 * m - 0.341_319_396_5 * s,
    -0.004_196_086_3 * l - 0.703_418_614_7 * m + 1.707_614_701 * s,
  ];
}

const inGamut = (c: Rgb) => c.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

/** The OKLCH colour as sRGB, with chroma reduced until it fits the gamut. */
function oklchToRgb(L: number, C: number, h: number): Rgb {
  let chroma = C;
  let lin = oklchToLinear(L, chroma, h);
  while (!inGamut(lin) && chroma > 0) {
    chroma = Math.max(0, chroma - 0.002);
    lin = oklchToLinear(L, chroma, h);
  }
  return each(lin, (v) => fromLinear(Math.min(1, Math.max(0, v))));
}

/** How much deeper the light-theme colour's chroma is than the pastel's. */
const CHROMA_BOOST = 1.6;

/** `share` of `a` mixed into `b` in sRGB, as CSS `color-mix(in srgb, a share%, b)`. */
function mix(a: string, b: string, share: number): string {
  const ca = parseColour(a);
  const cb = parseColour(b);
  return toHex(each(ca, (v, i) => v * share + (cb[i] ?? 0) * (1 - share)));
}

/**
 * The colour, darkened in OKLCH (same hue, richer chroma) until it reaches `ratio` against
 * every background, and against each background tinted with `tint` of the colour itself
 * (the playing line's wash). Returns `#rrggbb`.
 */
export function readableOn(
  colour: string,
  backgrounds: readonly string[],
  { ratio = 4.6, tint = 0 }: { ratio?: number; tint?: number } = {},
): string {
  const [L0, C0, h] = toOklch(parseColour(colour));
  const chroma = C0 * CHROMA_BOOST;
  for (let L = L0; L > 0; L -= 0.005) {
    const hex = toHex(oklchToRgb(L, chroma, h));
    const grounds = tint > 0 ? backgrounds.map((bg) => mix(hex, bg, tint)) : [];
    if ([...backgrounds, ...grounds].every((bg) => contrast(hex, bg) >= ratio)) return hex;
  }
  return "#000000";
}

/** The light theme's page and surface (tokens.css), which light speaker colours must clear. */
const LIGHT_GROUNDS = ["#f3f3f7", "#ffffff"] as const;
/** The playing line's wash of its speaker colour (transcript.css `.is-playing`). */
const PLAYING_TINT = 0.12;

/**
 * The speaker stylesheet (SPEAKER_CSS). Per speaker: `--text<Name>` (the identity pastel),
 * `--sp<Name>` (the colour the page uses: the pastel in the dark theme, a deeper shade of the
 * same hue that clears 4.5:1 in the light theme), `--sp` on that speaker's lines and rail row,
 * and the `hide-<Name>` rule the speaker checkboxes use. The two dark blocks mirror tokens.css.
 */
export function speakerCss(speakers: readonly { name: string; color: string }[]): string {
  const pastels = speakers.map((s) => `--text${s.name}:${s.color};`).join("");
  const light = speakers
    .map((s) => `--sp${s.name}:${readableOn(s.color, LIGHT_GROUNDS, { tint: PLAYING_TINT })};`)
    .join("");
  const dark = speakers.map((s) => `--sp${s.name}:var(--text${s.name});`).join("");
  const rules = speakers
    .map(
      (s) =>
        `.transcript-line.${s.name},.tp-speaker.${s.name}{--sp:var(--sp${s.name})}` +
        `.transcript-root.hide-${s.name} .transcript-line.${s.name}{display:none}`,
    )
    .join("\n");
  return (
    `:root{${pastels}${light}}\n` +
    `:root[data-theme="dark"]{${dark}}\n` +
    `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${dark}}}\n` +
    `${rules}\n`
  );
}
