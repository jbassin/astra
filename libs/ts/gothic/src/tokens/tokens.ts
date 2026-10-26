/**
 * astra's one design-token source (ADR 0032). Every theme colour, font stack and motion value
 * is written here once; `just tokens-gen` turns it into the files under `src/generated/`:
 *
 * - `gothic-theme.css`: the gothic theme, a Tailwind `@theme` block that `theme.css` imports.
 * - `parchment-theme.css`: the parchment theme, a plain `:root` block (codex, menhir).
 * - `graph-palette.css`: concrete hex for the akasha graph, which reads CSS variables in canvas.
 * - `palette.ts`: each theme's opaque colours as hex strings, pixi numbers and RGB floats for
 *   pixi code and GLSL uniforms.
 *
 * A name means the same role in both themes: `page` is the page background in gothic (near
 * black) and in parchment (cream). The old names, which named a lightness or hue (`void`,
 * `ink`, `accent-amber`, `rule-bright`), stay as aliases until every consumer moves; the
 * README has the map.
 */

/** A token's value: a CSS literal, or a reference to another token of the same theme. */
export type TokenValue = string | { readonly ref: string };

const ref = (name: string): TokenValue => ({ ref: name });

/** One CSS custom property. `name` excludes its namespace prefix (`--color-`, `--font-`, …). */
export interface Token {
  readonly name: string;
  /** What the token is for. Shared names carry the same role in every theme. */
  readonly role: string;
  readonly value: TokenValue;
  /** The name this token had before the shared names, emitted as an alias. */
  readonly legacy?: string;
}

export interface Theme {
  readonly colors: readonly Token[];
  readonly fonts: readonly Token[];
  /** Raw custom properties outside the colour and font namespaces (gothic's motion). */
  readonly other: readonly Token[];
}

const EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"';

/** gothic: the teal and amber dark theme, plus the parchment substrate of diegetic cards. */
export const gothic: Theme = {
  colors: [
    // The page and the surfaces on it: a teal cogitator-dataslate.
    { name: "page", role: "page background", value: "#090c10", legacy: "void" },
    { name: "panel", role: "panel fill, one step above the page", value: "#0f1318" },
    { name: "elevated", role: "raised card, panel or dropdown surface", value: "#171c24" },
    { name: "hover", role: "hover wash on rows and controls", value: "#1e2530" },

    { name: "fg", role: "body text", value: "#dce8f0", legacy: "ink" },
    { name: "fg-muted", role: "secondary text", value: "#7a8a99", legacy: "ink-dim" },
    {
      name: "fg-faint",
      role: "tertiary text and disabled marks",
      value: "#3a434f",
      legacy: "ink-faint",
    },

    { name: "accent", role: "primary accent (phosphor teal)", value: "#6dd5c0" },
    {
      name: "accent-secondary",
      role: "secondary accent (amber)",
      value: "#f0b46e",
      legacy: "accent-amber",
    },

    { name: "rule", role: "hairline dividers", value: "#1e2730" },
    {
      name: "rule-strong",
      role: "input borders and stronger dividers",
      value: "#2f3c4e",
      legacy: "rule-bright",
    },

    // The diegetic substrate: aged Imperial parchment, for `data-mode="diegetic"` cards.
    { name: "parchment", role: "diegetic card fill", value: "#d8c9a3" },
    { name: "parchment-shade", role: "diegetic card shading", value: "#c2ad80" },
    { name: "parchment-edge", role: "diegetic card edge and rules", value: "#a98f5f" },
    { name: "parchment-ink", role: "text on a diegetic card", value: "#2c2114" },
    { name: "parchment-ink-dim", role: "secondary text on a diegetic card", value: "#5c4a30" },
    { name: "wax", role: "seal red: diegetic headings and links", value: "#7c2a22" },
    { name: "gold-leaf", role: "illuminated drop-cap bronze", value: "#b4842f" },
    { name: "redaction", role: "the [DATA EXPUNGED] bar", value: "#120f0b" },
  ],
  // The emoji fallbacks match only emoji codepoints, so they never take over the serif or mono
  // text; they keep emoji in user-authored content (the akasha chat logs) from rendering as tofu.
  fonts: [
    { name: "display", role: "display face", value: '"ITC Serif Gothic", serif' },
    { name: "body", role: "body face", value: `"Caslon Antique", ${EMOJI}, serif` },
    {
      name: "mono",
      role: "mechanical voice: data, statblocks, labels",
      value: `"IBM Plex Mono", ui-monospace, ${EMOJI}, monospace`,
    },
  ],
  other: [
    { name: "ease-out", role: "default easing", value: "cubic-bezier(0.22, 1, 0.36, 1)" },
    { name: "duration-fast", role: "short transition", value: "120ms" },
    { name: "duration-base", role: "default transition", value: "220ms" },
    { name: "duration-slow", role: "long transition", value: "400ms" },
  ],
};

/**
 * parchment: the "Liturgy of the Iridite" print-sourcebook theme that codex and menhir share.
 * The hex values are the style-tokens doc's extraction from 36 reference pages
 * (`thoughts/archive/research/2026-07-14-codex-0029-p45-style-tokens.md`). App-only tokens
 * (codex's pills and density, menhir's answer shapes and medals) stay in each app's tokens.css.
 */
export const parchment: Theme = {
  colors: [
    { name: "page-bg-alt", role: "alternate page fill", value: "#e9e1ce" },
    { name: "page-vignette", role: "page edge vignette", value: "rgb(0 0 0 / 8%)" },
    { name: "heading-maroon", role: "heading colour", value: "#7a2e2c" },
    {
      name: "heading-maroon-dark",
      role: "heading colour, pressed or emphasised",
      value: "#5e211f",
    },
    { name: "gold-rule", role: "gold rules and dividers", value: "#b99b5d" },
    { name: "gold-frame", role: "gold frame borders", value: "#c2a46d" },
    { name: "gold-frame-dark", role: "gold frame shadow edge", value: "#8c7038" },
    { name: "callout-tan-bg", role: "tan callout fill", value: "#e7d6b3" },
    { name: "callout-tan-border", role: "tan callout border", value: "#3a2e22" },

    { name: "page", role: "page background", value: "#eee7d8", legacy: "void" },
    { name: "fg", role: "body text", value: "#231f1a", legacy: "ink" },
    { name: "fg-muted", role: "secondary text", value: "#4a4238", legacy: "ink-dim" },
    {
      name: "fg-faint",
      role: "tertiary text and disabled marks",
      value: "#8a7c63",
      legacy: "ink-faint",
    },
    { name: "accent", role: "primary accent (maroon)", value: ref("heading-maroon") },
    {
      name: "accent-secondary",
      role: "secondary accent (gold)",
      value: ref("gold-rule"),
      legacy: "accent-amber",
    },
    {
      name: "rule",
      role: "hairline dividers (gold rule, low opacity)",
      value: "rgb(185 155 93 / 40%)",
    },
    {
      name: "rule-strong",
      role: "input borders and stronger dividers",
      value: ref("gold-frame"),
      legacy: "rule-bright",
    },
    {
      name: "elevated",
      role: "raised card, panel or dropdown surface",
      value: ref("callout-tan-bg"),
    },
    {
      name: "hover",
      role: "hover wash on rows (blue callout tint)",
      value: "rgb(220 231 236 / 70%)",
    },
  ],
  // Self-hosted through @fontsource in each app.
  fonts: [
    {
      name: "display",
      role: "display face (H1 chapter titles, wordmarks)",
      value: '"Cinzel", serif',
    },
    { name: "heading", role: "H2 and H3 face", value: '"Cormorant SC", serif' },
    { name: "body", role: "body face", value: '"EB Garamond", serif' },
    {
      name: "condensed",
      role: "mechanical voice: data, statblocks, timers",
      value: '"Oswald", sans-serif',
    },
  ],
  other: [],
};

/**
 * The akasha graph's palette. The graph is a port of Quartz's and reads these Quartz variable
 * names through `getComputedStyle`, which may return an unresolved `var()`, so they are emitted
 * as concrete hex resolved from the gothic theme.
 */
export const graphPalette: readonly { readonly name: string; readonly value: TokenValue }[] = [
  { name: "secondary", value: ref("accent") }, // current page node
  { name: "tertiary", value: ref("accent-secondary") }, // visited and tag nodes
  { name: "gray", value: ref("fg-muted") }, // default node and active link
  { name: "light", value: ref("page") }, // tag fill
  { name: "lightgray", value: ref("rule") }, // idle link and borders
  { name: "dark", value: ref("fg") }, // label text
  { name: "darkgray", value: ref("fg-muted") },
  { name: "bodyFont", value: '"Caslon Antique", serif' }, // label font
];
