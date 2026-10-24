// @astra/codex-corpus — the codex corpus contract, shared by the site and the ingest
// pipeline. This entry is browser-safe (Zod schemas and pure functions only); the
// `node:fs` reader is the separate `@astra/codex-corpus/reader` subpath.

export * from "./schema/corpusVersion";
export * from "./schema/entity";
export * from "./schema/facetKeys";
export * from "./schema/manifest";
export * from "./schema/nodes";
export * from "./schema/rulesTree";
export * from "./schema/sourcesIndex";
export * from "./embeds";
export * from "./sluggify";
export * from "./text";
