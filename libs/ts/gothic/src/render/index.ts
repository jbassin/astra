/**
 * The gothic vellum renderer — the `VellumDocument` AST (from `@astra/vellum-lang`,
 * 0004) → React, in the amber/teal 40k-gothic skin. gothic RENDERS the AST; it
 * never parses (that's vellum-lang) and never resolves a `[[crossref]]` target
 * (that's akasha-backend, 0007). `<DocumentView>` is the `[data-vellum-export]`
 * boundary the render service screenshots.
 */

export { CrossRef } from "./components/CrossRef";
export { DocumentView } from "./components/DocumentView";
export { ErrorChip } from "./components/ErrorChip";
export { Fields } from "./components/Fields";
export { Frontmatter, hasFrontmatterHeader } from "./components/Frontmatter";
export { ProseCard } from "./components/ProseCard";
export { Redaction } from "./components/Redaction";
export { StatCard } from "./components/StatCard";
export { TimelineBlock } from "./components/TimelineBlock";
export { TraitPill } from "./components/TraitPill";
export { type ActionCost, ActionGlyph, normalizeActionCost } from "./glyphs/actions";
export { grimeStyle } from "./grimeStyle";
export { collectText, type RenderableNode, renderNodes } from "./mdastToReact";
export { type Grime, grimeFor, hashString, seededGrime } from "./seed";
