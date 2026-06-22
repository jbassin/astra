/**
 * Proper-noun auto-linker — ported from faerrin `pkg/content/scripts/lib/linker.ts`.
 * Plain-text mentions of a wiki page's title/aliases (in transcript lines) are
 * rewritten to internal links. Correctness properties preserved from faerrin:
 *  - names regex-escaped (titles with metacharacters match literally);
 *  - a SINGLE combined pass, so inserted markup is never re-scanned;
 *  - alternatives longest-first, so multi-word titles beat a shorter substring;
 *  - global + case-insensitive, preserving the matched text's original casing.
 *
 * astra adaptation: faerrin emitted `[[target|match]]` wikilinks for the remark
 * chain to resolve. astra has no remark chain, so the linker resolves each target
 * to a real href here (`resolveRelative` against the source slug, N6-style — the
 * corpus is the parity-gated snapshot) and emits `<a class="internal">` directly.
 * Text is HTML-escaped first (transcript text is plain), then linked.
 */
import { type FullSlug, resolveRelative, type SimpleSlug, simplifySlug } from "./slug";

/** One linkable wiki page: every alias `name` maps to the page's `slug`. */
export interface LinkEntry {
  name: string;
  slug: FullSlug;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface Linker {
  /**
   * HTML-escape `text`, then auto-link proper-noun mentions to internal pages,
   * resolved relative to `fromSlug`. Each linked target's SimpleSlug is recorded
   * in `hits` (so the transcript page's edge/backlink set can be built).
   */
  link(text: string, fromSlug: FullSlug, hits?: Set<SimpleSlug>): string;
}

export function buildLinker(entries: LinkEntry[]): Linker {
  if (entries.length === 0) return { link: (t) => escapeHtml(t) };

  // Longest names first: in a regex alternation the first matching branch wins,
  // so "Ghosts of Raelion" beats "Raelion" at a shared position.
  const sorted = [...entries].sort((a, b) => b.name.length - a.name.length);

  // Keyed by the HTML-escaped, lowercased name — matches come from escaped text.
  // First (longest) registration wins on collision.
  const slugByName = new Map<string, FullSlug>();
  for (const { name, slug } of sorted) {
    const key = escapeHtml(name).toLowerCase();
    if (!slugByName.has(key)) slugByName.set(key, slug);
  }

  const alternation = sorted.map((e) => escapeRegex(escapeHtml(e.name))).join("|");
  const regex = new RegExp(`\\b(${alternation})\\b`, "gi");

  return {
    link(text, fromSlug, hits): string {
      return escapeHtml(text).replace(regex, (match) => {
        const slug = slugByName.get(match.toLowerCase());
        if (slug === undefined) return match;
        hits?.add(simplifySlug(slug));
        const href = resolveRelative(fromSlug, slug);
        return `<a href="${href}" class="internal">${match}</a>`;
      });
    },
  };
}
