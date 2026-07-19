import { sluggify } from "../../ingest/sluggify";

/**
 * D29-109b (P11 S5, #15) — GitHub-slugger-style heading anchor ids. Reuses
 * the ingest lane's own `sluggify` (verbatim-ported from foundryvtt/pf2e,
 * `src/ingest/sluggify.ts`) as the base slug function rather than
 * reimplementing lowercase/apostrophe-strip/non-word-collapse a second
 * time — `traits.tsx` already imports across this same ingest/render
 * boundary (D29-24's own precedent), and the algorithm is already exactly
 * the GitHub-slugger shape the spec asks for (lowercase, strip apostrophes,
 * collapse runs of non-word characters to single hyphens, trim). Diacritics
 * are preserved (not stripped) — a literal accented heading keeps its own
 * character in the anchor, matching GitHub's own slugger behavior; this is
 * a different posture from `pagefindClient.ts`'s NFD-strip search-match
 * normalizer, which is solving a different problem (fuzzy name matching,
 * not a stable per-page anchor).
 *
 * `createHeadingIdAssigner` layers PER-PAGE collision tracking on top: the
 * first heading with a given base slug on one page keeps the bare slug: the
 * second gets `-2`, the third `-3`, and so on (the spec's own literal
 * "-2/-3 per-page collision suffixes" — NOT github-slugger's own real `-1`/
 * `-2` numbering, which the spec text deliberately doesn't match). A fresh
 * assigner must be created per PAGE render (never reused across pages/
 * entities) — see `EntityRenderPane.tsx` and `scripts/regen-goldens.ts` for
 * the two page-level composition roots that each create one.
 */
export function slugifyHeading(text: string): string {
  const slug = sluggify(text);
  return slug.length > 0 ? slug : "section";
}

/** A per-page heading-id assigner: call once per heading's plain text, in
 * document order, to get its unique `id`. Fresh state per call to this
 * factory — never share one assigner across two different pages/entities
 * (the goldens' own two-member `spell/heal` + `spell/heal@legacy`
 * concatenation is the one place this app renders two "pages" into one
 * HTML file, and deliberately gets two independent assigners, matching
 * production's one-assigner-per-URL reality). */
export function createHeadingIdAssigner(): (text: string) => string {
  const seen = new Map<string, number>();
  return (text: string): string => {
    const base = slugifyHeading(text);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count + 1}`;
  };
}
