// The live tell-lint — a TS mirror of the backend proposer/lint.py (faerrin
// voice-warnings.ts + page-type.ts), so a human's edits stay checked as they type.
// Warnings only, NEVER a hard gate (faerrin's load-bearing principle — the human is
// the gate). The authoritative lints are the backend's (shown statically on the card);
// this re-runs the self-contained prose-cadence tells + empty live, page-type-aware
// (P4.17). broken_wikilink runs only when a known-page set is supplied (the snapshot
// slug set ∪ in-batch creates); name-form links are checked by stem (akasha crossref),
// since the registry resolve() is a backend-only concern.

import type { VoiceWarning } from "./manifest";

export type PageType = "lore" | "stub" | "deity-statblock" | "timeline" | "flavor-pre";

const PROSE_PAGE_TYPES = new Set<PageType>(["lore", "stub"]);

// "{Name} is a/an/the {type}…" — the dictionary-entry cadence the house voice avoids.
const OPENER_RE = /^\s*(?:\[\[)?[A-Z][\w'’ -]*?(?:\]\])?\s+is\s+(?:a|an|the)\s+\w+/;
const IT_IS_RE = /^it\s+is\b/i;
// [[target]] / [[target|alias]] / [[target#anchor]] — group 1 is the bare target.
const WIKILINK_RE = /\[\[([^[\]|#]+)(?:#[^[\]|]+)?(?:\|[^[\]]+)?\]\]/g;
const INTENSIFIERS = new Set([
  "large",
  "vast",
  "expansive",
  "numerous",
  "various",
  "many",
  "massive",
  "huge",
  "enormous",
]);

/** Drop a `---`…`---` frontmatter block (mirrors corpus.split_frontmatter). */
function stripFrontmatter(text: string): string {
  if (!text.startsWith("---")) return text;
  const end = text.indexOf("\n---", 3);
  if (end === -1) return text;
  const after = text.indexOf("\n", end + 1);
  return after === -1 ? "" : text.slice(after + 1);
}

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Classify a `.vellum` body (ported from page-type.ts / detect_page_type). */
export function detectPageType(text: string, path?: string): PageType {
  const body = stripFrontmatter(text);
  const stripped = body.trim();
  if (path && path.split("/").at(-1) === "Timeline") return "timeline";
  if (body.includes("@timeline") || body.includes(":::timeline")) return "timeline";
  if (body.includes("<pre")) return "flavor-pre";
  if (body.includes("@deity") || body.includes(":::deity")) return "deity-statblock";
  if (body.split("\n").filter((l) => l.includes(" :: ")).length >= 2) return "deity-statblock";
  if (!stripped) return "stub";
  if (stripped.length < 40) return "stub";
  return "lore";
}

function proseTells(text: string): VoiceWarning[] {
  const out: VoiceWarning[] = [];
  const sents = sentences(text);
  if (sents[0] && OPENER_RE.test(sents[0])) {
    out.push({
      type: "encyclopedia_opener",
      message:
        'Encyclopedia opener ("X is a/the …"). Lead with a point of view or tension, not the dictionary-entry cadence.',
      hit: null,
    });
  }
  if (sents.length > 1 && sents[1] && IT_IS_RE.test(sents[1])) {
    out.push({
      type: "it_is_template",
      message: '"It is …" follow-on reads as templated. Vary the cadence.',
      hit: null,
    });
  }
  const seen = new Set<string>();
  for (const word of text.split(/\s+/)) {
    const token = word.toLowerCase().replace(/[^a-z]/g, "");
    if (INTENSIFIERS.has(token) && !seen.has(token)) {
      seen.add(token);
      out.push({
        type: "intensifier",
        message: `Filler intensifier: ${token}. Prefer specific, consequence-bearing detail.`,
        hit: token,
      });
    }
  }
  return out;
}

function brokenWikilinks(text: string, knownPages: Set<string>): VoiceWarning[] {
  // Stem index for name-form resolution (akasha crossref: filename-stem match). An
  // `index` page is referenced by its PARENT folder name (e.g. `[[Iconoclasm]]` →
  // `Org/Iconoclasm/index`), so index both its last segment and its folder name.
  const stems = new Set<string>();
  for (const p of knownPages) {
    const segs = p.split("/");
    stems.add(segs.at(-1) ?? p);
    if (segs.at(-1) === "index" && segs.length >= 2) stems.add(segs.at(-2) ?? p);
  }
  const out: VoiceWarning[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(WIKILINK_RE)) {
    const target = (m[1] ?? "").trim();
    if (!target || seen.has(target)) continue;
    seen.add(target);
    const ok = target.includes("/")
      ? knownPages.has(target) || knownPages.has(`${target}/index`)
      : knownPages.has(target) || stems.has(target);
    if (!ok) {
      out.push({
        type: "broken_wikilink",
        message: `Wikilink target not found: ${target}. Check the page exists (or create it).`,
        hit: target,
      });
    }
  }
  return out;
}

/**
 * Run the live tell-lint over a draft body. `pageType` (default: detect from the body)
 * gates the prose-cadence tells to lore/stub. `knownPages` (the snapshot slug set ∪
 * in-batch creates) enables broken_wikilink — omit it to skip link checking.
 */
export function voiceLint(
  text: string,
  opts: { pageType?: PageType; knownPages?: Set<string> } = {},
): VoiceWarning[] {
  if (!text.trim()) return [{ type: "empty", message: "No prose written yet.", hit: null }];
  const pageType = opts.pageType ?? detectPageType(text);
  const out: VoiceWarning[] = [];
  if (opts.knownPages && opts.knownPages.size > 0) {
    out.push(...brokenWikilinks(text, opts.knownPages));
  }
  if (PROSE_PAGE_TYPES.has(pageType)) out.push(...proseTells(text));
  return out;
}
