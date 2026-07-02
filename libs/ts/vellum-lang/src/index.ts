/**
 * @astra/vellum-lang — the reference parser for full-vellum (the single authored-content
 * format for the akasha wiki). Produces the `VellumDocument` AST; the React renderer lives
 * in gothic (0003). Cross-references are parsed, not resolved (akasha-backend, 0007).
 *
 *   import { parseDocument } from "@astra/vellum-lang";
 *   const doc = parseDocument(source); // { frontmatter, mode, nodes }
 */

export { CROSSREF_RE, collectCrossRefs, splitCrossRefs, transformCrossRefs } from "./crossref";
export { parseFieldItems, parseFields } from "./fields";
export { EMPTY_FRONTMATTER, parseFrontmatter, splitFrontmatter } from "./frontmatter";
export { canonicalAstJson, canonicalMetaJson, extractMetadata, type Metadata } from "./metadata";
export * from "./model";
export { parseDocument, parseMarkdown } from "./parse";
export { parseTimeline } from "./timeline";
export { compileVss } from "./vss";
