/**
 * YAML frontmatter. The leading `---…---` block is split off the
 * source (the SAME split the Python extractor does, so the two agree), parsed with the
 * `yaml` package, and normalized into the typed `Frontmatter`. Total — bad or absent
 * YAML yields empty frontmatter, never throws.
 */
import { parse as parseYaml } from "yaml";

import type { Frontmatter } from "./model";

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/;

export const EMPTY_FRONTMATTER: Frontmatter = Object.freeze({
  tags: [],
  aliases: [],
  campaigns: [],
  extra: {},
});

/** Split a leading `---…---` YAML block off the source; `yaml` is the block's body. */
export function splitFrontmatter(source: string): { yaml: string; body: string } {
  const m = FRONTMATTER_RE.exec(source);
  if (!m) return { yaml: "", body: source };
  return { yaml: m[1] ?? "", body: source.slice(m[0].length) };
}

function toStringArray(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map((v) => String(v));
  return [String(value)];
}

/** `toStringArray`, then drop repeats; the first occurrence keeps its place. */
function toUniqueStringArray(value: unknown): string[] {
  return [...new Set(toStringArray(value))];
}

/** Parse + normalize a frontmatter YAML body into the typed struct (total). */
export function parseFrontmatter(yamlText: string): Frontmatter {
  if (yamlText.trim() === "") return { tags: [], aliases: [], campaigns: [], extra: {} };
  let raw: unknown;
  try {
    raw = parseYaml(yamlText);
  } catch {
    return { tags: [], aliases: [], campaigns: [], extra: {} };
  }
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return { tags: [], aliases: [], campaigns: [], extra: {} };
  }

  const { title, tags, aliases, campaigns, img, ...extra } = raw as Record<string, unknown>;
  return {
    title: title != null ? String(title) : undefined,
    tags: toStringArray(tags),
    aliases: toStringArray(aliases),
    campaigns: toUniqueStringArray(campaigns),
    img: img != null ? String(img) : undefined,
    extra,
  };
}
