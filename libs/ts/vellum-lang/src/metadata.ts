/**
 * Metadata extraction + canonical serialization — the cross-language parity surface.
 * `extractMetadata` produces the `{frontmatter, crossrefs}` subset the Python extractor
 * also produces; `canonicalMetaJson` serializes it to the byte-stable shape both languages
 * assert against (the `.meta.json` parity gate). `canonicalAstJson` serializes the full
 * AST (TS-only) with mdast `position` stripped, for the `.ast.json` fixtures.
 */
import { collectCrossRefs } from "./crossref";
import type { CrossRef, Frontmatter, VellumDocument } from "./model";
import { parseDocument } from "./parse";

export interface Metadata {
  frontmatter: Frontmatter;
  crossrefs: CrossRef[];
}

export function extractMetadata(source: string): Metadata {
  const doc = parseDocument(source);
  return { frontmatter: doc.frontmatter, crossrefs: collectCrossRefs(doc) };
}

/** The metadata shape both parsers serialize: optional fields explicit as null. */
function canonicalMeta(meta: Metadata): unknown {
  return {
    frontmatter: {
      title: meta.frontmatter.title ?? null,
      tags: meta.frontmatter.tags,
      aliases: meta.frontmatter.aliases,
      img: meta.frontmatter.img ?? null,
      extra: meta.frontmatter.extra,
    },
    crossrefs: meta.crossrefs.map((r) => ({
      target: r.target,
      alias: r.alias ?? null,
      heading: r.heading ?? null,
    })),
  };
}

/** Recursively sort object keys + drop mdast `position` (arrays keep order). */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      if (key === "position") continue; // brittle source offsets — not part of the contract
      out[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/** Stable `{frontmatter, crossrefs}` JSON (sorted keys, trailing newline) — py↔ts parity. */
export function canonicalMetaJson(source: string): string {
  return `${JSON.stringify(canonicalize(canonicalMeta(extractMetadata(source))), null, 2)}\n`;
}

/** Stable full-AST JSON (TS reference only; `position` stripped). */
export function canonicalAstJson(doc: VellumDocument): string {
  return `${JSON.stringify(canonicalize(doc), null, 2)}\n`;
}
