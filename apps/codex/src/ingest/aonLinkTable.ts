import type { InlineNode } from "../schema/nodes";
import type { AonDocMeta } from "./aonFacets";

/**
 * D29-7: the AoN-URL → codex-id link table + resolver — what lets an
 * AoN-internal markdown link (`[Agile](/Traits.aspx?ID=170)`, in the `markdown`
 * field `aonMarkup.ts` parses) become a `crossref` node pointing at a codex
 * entity, instead of leaking a raw AoN URL into the canonical corpus.
 *
 * ## The table is keyed on every doc's OWN `url` field, not a guessed scheme
 *
 * Every one of the 43,684 real AoN docs carries `_source.url`
 * (`/Spells.aspx?ID=2335`-shaped, verified: 0 empty). Building the table is
 * "index every doc by its own url" — no separate aspx-path→category mapping
 * is needed, because a markdown link and the linked doc's own `url` field use
 * the exact same path (verified: creature docs alone use at least two
 * different path prefixes, `Monsters.aspx` and `NPCs.aspx`, both captured
 * correctly just by trusting each doc's own field).
 *
 * ## Real gotcha #1 — urls are NOT unique (spec's "should be unique — verify,
 * report if not" caught something real)
 *
 * 2,270 of 36,422 distinct urls (out of 43,684 total docs) are shared by ≥2
 * docs. This is not corpus noise — AoN presents several DISTINCT doc records
 * under one page URL by design:
 *   - a "parent" item + its heightened/tiered sub-entries (e.g. `Scroll` at
 *     `/Equipment.aspx?ID=640` plus ten `Nth-Level Scroll` sub-docs, all ten
 *     with their OWN `_id`s but the SAME `url`)
 *   - a class + all its `class-feature` docs (one class page lists every
 *     feature as an anchor on that one page)
 *   - a bloodline + all its named sub-options (`draconic-exemplar` for
 *     Draconic), an archetype/rules/ancestry/etc. page + its embedded
 *     `sidebar` box
 * In every one of these families exactly ONE doc is the page's actual
 * "owner" — a link to that bare URL means the parent, not the buried
 * sub-entry — and the doc IDs make that recoverable: AoN's `_id` scheme is
 * `{category}-{n}`, and the page owner's `n` matches the URL's own `?ID=`
 * query value exactly (e.g. `equipment-640` under `?ID=640`; the ten scroll
 * sub-docs are `equipment-640-639`..`equipment-640-648`, whose full `_id`
 * does NOT equal `equipment-640`). `pickCanonical` below implements exactly
 * this "does `{category}-{urlQueryId}` reconstruct this doc's own `_id`"
 * rule, verified to resolve 2,208 of the 2,270 real groups unambiguously.
 *
 * ## Real gotcha #2 — the id-reconstruction rule has real (rare) collisions
 * too
 *
 * 62 of the 2,270 groups don't resolve to exactly one match: either no doc's
 * id reconstructs the URL's `?ID=` (59 groups — bare category-overview pages
 * like `/Traits.aspx` with no `?ID=` at all, themselves duplicated as a
 * `category-page` pair/triple with no separating signal), or — the
 * genuinely funny case — TWO different categories' docs coincidentally carry
 * the same small integer as their OWN id (`bloodline-23` "Draconic" AND
 * `draconic-exemplar-23` "Phase" both exist, and Draconic's own bloodline
 * page happens to be `/Bloodlines.aspx?ID=23`). These 62 fall back to a
 * deterministic tiebreak (demote known-auxiliary categories — `sidebar`,
 * `class-feature`, `draconic-exemplar`, `item-bonus` — then sort by `_id`)
 * and are report-counted (`duplicateUrlAmbiguous`) so the pick is visible,
 * never silently arbitrary.
 *
 * ## Href normalization (defensive — `aonMarkup.ts`'s exact href shapes
 * aren't known yet at the time this module was written)
 *
 * Real markdown hrefs vary in ways this resolver normalizes before lookup:
 * `&amp;`-entity-encoded multi-param query strings (675 real occurrences),
 * no leading slash (525 real occurrences, mostly bare category-overview
 * pages), and case — AoN's own ES `sort` keyword field lowercases urls
 * (`/spells.aspx?id=2335`, confirmed against the raw `sort` tuple), so the
 * SOURCE treats its own urls case-insensitively; this resolver does too, by
 * lowercasing both the table's keys and every href before lookup. No real
 * `#fragment` forms were found in a census of 452,208 internal links, but a
 * trailing fragment is stripped anyway (defensive, cheap).
 *
 * ## External vs. internal vs. broken
 *
 * A genuine AoN-internal reference always resolves to a `*.aspx` path
 * (verified against every real internal link) — so "no `.aspx` anywhere in
 * the href" is what marks an href external, alongside the explicit
 * `http(s)://` prefix check (real markdown also carries bare-domain external
 * refs with no protocol at all, e.g. `paizo.com`, `PathfinderSociety.club`).
 * An href that DOES look internal but isn't in the table (a link into a
 * category/doc this snapshot doesn't have, or a genuinely broken source
 * link) becomes a `brokenRef`, never silently dropped.
 */

// ---------------------------------------------------------------------------
// input + report shapes
// ---------------------------------------------------------------------------

/** The subset of `AonDocMeta` the table needs — a structural (not nominal)
 * pick, so callers can build a table from real `AonDocMeta[]` OR from a
 * lightweight test fixture without constructing a full `AonDocMeta`. */
export type LinkTableDoc = Pick<AonDocMeta, "aonId" | "category" | "slug" | "aonUrl" | "name">;

export type LinkTableReportClass = "duplicateUrlCollision" | "duplicateUrlAmbiguous";
export type LinkResolverReportClass = "aonBrokenLink" | "externalLinkDropped";

export type ReportFn<Cls extends string = string> = (cls: Cls, detail: string) => void;

export interface AonLinkEntry {
  readonly codexId: string;
  readonly name: string;
}

/** `byUrl` is keyed on the NORMALIZED form (`normalizeUrlKey`) of every
 * indexed doc's own `aonUrl` — never the raw/original casing, since lookups
 * normalize the same way. Pre-join: `codexId` is always the PLAIN
 * `{category}/{slug}` form (D29-1's `@legacy` suffix is a join-time decision
 * that needs cross-corpus pairing info this S3-only table doesn't have —
 * S4's `join.ts` is expected to patch any link resolved here that turns out
 * to target a renamed-to-`@legacy` id). */
export interface AonLinkTable {
  readonly byUrl: ReadonlyMap<string, AonLinkEntry>;
}

// ---------------------------------------------------------------------------
// url normalization
// ---------------------------------------------------------------------------

/** Decodes the one real named entity found at scale in AoN markdown hrefs
 * (`&amp;`, 675 real occurrences) plus the handful of others that could
 * plausibly appear, ensures a leading slash, strips a trailing fragment
 * (defensive — none found live), and lowercases the whole thing (matches
 * AoN's own ES `sort` keyword field, which lowercases urls too). */
export function normalizeUrlKey(rawHref: string): string {
  let href = rawHref
    .trim()
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
  const hashIndex = href.indexOf("#");
  if (hashIndex >= 0) href = href.slice(0, hashIndex);
  if (!href.startsWith("/")) href = `/${href}`;
  return href.toLowerCase();
}

/** Every genuine AoN-internal reference resolves to a `*.aspx` path
 * (verified against the real corpus's 452,208 internal markdown links) — the
 * absence of `.aspx` anywhere in the href is what marks it external, on top
 * of the explicit protocol check (real markdown also carries bare-domain
 * external refs with no `http(s)://` at all). */
export function looksExternal(href: string): boolean {
  const trimmed = href.trim();
  if (/^https?:\/\//i.test(trimmed)) return true;
  return !/\.aspx\b/i.test(trimmed);
}

/** Pulls the `?ID=`/`&ID=` numeric query value out of an (already
 * lowercased-safe, case-insensitive-matched) url, or `undefined` when the url
 * has none (the bare category-overview pages, e.g. `/Traits.aspx`). Exported
 * for `aonDedup.ts` (D29-18), which reuses the EXACT same "does
 * `{category}-{urlQueryId}` reconstruct this doc's own `_id`" rule to pick the
 * canonical member of a same-category+slug+url+edition duplicate group — the
 * real 2026-07-13 snapshot's "parent doc + its own base-tier child doc share
 * one name" shape (`equipment-4778`/`equipment-4778-4291`, both "Accursed
 * Staff") is structurally the SAME phenomenon this function already resolves
 * for the url→codex-id link table, just applied one step earlier in the
 * pipeline. */
export function urlQueryId(url: string): string | undefined {
  const match = /[?&]id=(\d+)\b/i.exec(url);
  return match?.[1];
}

/** Categories whose docs are never a shared-URL page's own "owner" even when
 * their `_id` happens to coincidentally reconstruct the url's `?ID=` value —
 * verified real collision: `draconic-exemplar-23` ("Phase") sits at the same
 * `/Bloodlines.aspx?ID=23` as `bloodline-23` ("Draconic"), and `class-feature`
 * ids can likewise coincide with a class's own numeric id. Used only as the
 * deterministic tiebreak's FIRST sort key — never as an exclusion filter (a
 * `sidebar` doc is still the resolved winner when it's the ONLY doc at a url,
 * which does happen for standalone sidebar pages with a unique url). */
const AUXILIARY_CATEGORIES: ReadonlySet<string> = new Set([
  "sidebar",
  "class-feature",
  "draconic-exemplar",
  "item-bonus",
]);

/**
 * Picks the one canonical doc for a url shared by `group.length > 1` docs.
 * See the file-level doc comment for the two real gotchas this resolves.
 * Reports (never throws) when the exact-id-reconstruction rule alone can't
 * pick a unique winner.
 */
function pickCanonical(
  normalizedUrl: string,
  group: readonly LinkTableDoc[],
  report: ReportFn<LinkTableReportClass>,
): LinkTableDoc {
  const first = group[0];
  if (first === undefined) throw new Error("pickCanonical: empty group (unreachable)");
  if (group.length === 1) return first;

  report(
    "duplicateUrlCollision",
    `${normalizedUrl}: ${group.length} docs share this url (${group.map((d) => d.aonId).join(", ")})`,
  );

  const queryId = urlQueryId(normalizedUrl);
  const exact =
    queryId !== undefined ? group.filter((d) => d.aonId === `${d.category}-${queryId}`) : [];
  if (exact.length === 1) {
    const winner = exact[0];
    if (winner === undefined) throw new Error("pickCanonical: unreachable");
    return winner;
  }

  // Ambiguous: either no doc's id reconstructs the url's own `?ID=` (bare
  // category-overview pages), or more than one does (the coincidental-id
  // collision, e.g. bloodline-23 / draconic-exemplar-23). Deterministic
  // fallback: demote known-auxiliary categories, then sort by `aonId`.
  const pool = exact.length > 0 ? exact : group;
  const sorted = [...pool].sort((a, b) => {
    const auxA = AUXILIARY_CATEGORIES.has(a.category) ? 1 : 0;
    const auxB = AUXILIARY_CATEGORIES.has(b.category) ? 1 : 0;
    if (auxA !== auxB) return auxA - auxB;
    return a.aonId < b.aonId ? -1 : a.aonId > b.aonId ? 1 : 0;
  });
  const winner = sorted[0];
  if (winner === undefined) throw new Error("pickCanonical: unreachable (empty pool)");
  report(
    "duplicateUrlAmbiguous",
    `${normalizedUrl}: exact-id rule matched ${exact.length} of ${group.length} docs — picked ${winner.aonId}`,
  );
  return winner;
}

// ---------------------------------------------------------------------------
// table construction
// ---------------------------------------------------------------------------

/**
 * Builds the url → codex-id table from every doc across the snapshot. Pure:
 * takes the full doc list + a report sink, returns the table. `docs` should
 * be every entity-eligible AoN doc in the snapshot (all 93 categories, C-5) —
 * a link can legitimately target any of them.
 */
export function buildAonLinkTable(
  docs: readonly LinkTableDoc[],
  report: ReportFn<LinkTableReportClass>,
): AonLinkTable {
  const groups = new Map<string, LinkTableDoc[]>();
  for (const doc of docs) {
    const key = normalizeUrlKey(doc.aonUrl);
    const existing = groups.get(key);
    if (existing) {
      existing.push(doc);
    } else {
      groups.set(key, [doc]);
    }
  }

  const byUrl = new Map<string, AonLinkEntry>();
  for (const [key, group] of groups) {
    const winner = pickCanonical(key, group, report);
    byUrl.set(key, { codexId: `${winner.category}/${winner.slug}`, name: winner.name });
  }
  return { byUrl };
}

// ---------------------------------------------------------------------------
// resolver — the pinned `resolveLink(href, display) => InlineNode` contract
// ---------------------------------------------------------------------------

export type ResolveLinkFn = (href: string, display: string) => InlineNode;

const NO_MARKS = { bold: false, italic: false, superscript: false };

/**
 * Builds the `resolveLink` function `aonMarkup.ts` calls for every markdown
 * link it parses: known AoN-internal url → `crossref`; AoN-internal-shaped
 * but unresolvable url → `brokenRef` (report class `aonBrokenLink`); anything
 * that looks external (`http(s)://` or no `.aspx` at all — codex hosts no
 * outbound link policy in P1, spec D29-7) → a plain `text` node carrying just
 * the link's display text (report class `externalLinkDropped`).
 */
export function createLinkResolver(
  table: AonLinkTable,
  report: ReportFn<LinkResolverReportClass>,
): ResolveLinkFn {
  return (href: string, display: string): InlineNode => {
    if (looksExternal(href)) {
      report("externalLinkDropped", href.trim());
      return { kind: "text", content: display, marks: NO_MARKS };
    }
    const key = normalizeUrlKey(href);
    const entry = table.byUrl.get(key);
    if (entry) {
      return { kind: "crossref", targetId: entry.codexId, display };
    }
    report("aonBrokenLink", href.trim());
    return { kind: "brokenRef", target: href.trim(), display };
  };
}
