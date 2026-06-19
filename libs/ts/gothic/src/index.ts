/**
 * @astra/gothic — astra's UI framework: the amber/teal 40k-gothic design system
 * (Tailwind v4 theme + React 19 primitives) and the vellum AST→React renderer.
 *
 *   import "@astra/gothic/theme.css";              // tokens + fonts + Tailwind
 *   import { DocumentView } from "@astra/gothic";   // render a VellumDocument
 *   import { Panel, Title, Button } from "@astra/gothic";
 *
 * The framework palette lives in the theme; per-player/host IDENTITY colors come
 * from ontology-being (I5) and are applied via `identityStyle` as runtime CSS
 * vars. gothic renders the vellum-lang AST (0004); it never parses or resolves
 * crossrefs.
 */

export { cx } from "./cx";
export {
  FALLBACK_IDENTITY_COLOR,
  IDENTITY_COLOR_VAR,
  type IdentityColorable,
  identityColor,
  identityStyle,
} from "./identity";
export * from "./primitives";
export * from "./render";
