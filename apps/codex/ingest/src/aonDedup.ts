import type { AonDocMeta } from "./aonFacets";
import { normalizeUrlKey, urlQueryId } from "./aonLinkTable";

/**
 * The AoN url-duplicate dedup — a prerequisite to the AoN-primary drop
 * pass. Runs BEFORE `join.ts` ever sees the AoN metas.
 *
 * ## The real, measured phenomenon (2026-07-13 snapshot)
 *
 * 982 of 43,631 extracted AoN metas (814 groups) share the exact SAME
 * `(category, slug, normalized aonUrl, edition)` as another meta — genuine
 * duplicate ES entries, not a tiering/reprint pattern. The dominant real
 * example: `equipment-4778` ("Accursed Staff", AoN's own "page owner" doc,
 * carrying an `item_child_id` array) and `equipment-4778-4291` (the SAME
 * name "Accursed Staff", AoN's own base-TIER child doc, carrying an
 * `item_parent_id` back-pointer) — identical markdown, identical slug,
 * identical url, identical edition. Left undeduped, BOTH survive
 * extraction as separate `AonDocMeta`s; at most one can ever be the Foundry
 * join's match (`join.ts`'s `aonSlugIndex` keeps one winner per
 * `category/slug` key), so the LOSER becomes its own AoN-only entity at the
 * exact same pre-collision id as the winner's (possibly Foundry-joined)
 * entity — minting a phantom `-2`/`-3`/`-4` residual-collision suffix for
 * what is, in reality, ONE real-world item (verified: `equipment/
 * accursed-staff-3`/`-4` in the pre-dedup corpus both trace back to aonUrl
 * ID 4778's parent+child duplicate, not to any genuine tier variation — the
 * `(Greater)`/`(Major)` tiers are already correctly DIFFERENT slugs and never
 * collide). 600 of the 982 duplicate docs are this equipment parent/child
 * shape; the remaining 375 are `item-bonus` sub-entries (aeon stone /
 * cloak-of-elvenkind-style "choose one of N" bonus options that AoN indexes
 * once per option under the SAME parent url, slug, and edition).
 *
 * ## The (deliberately narrow) dedup key
 *
 * `category + slug + normalizeUrlKey(aonUrl) + edition` — NOT just
 * `category + slug` (that would also swallow the 850 genuine same-slug,
 * DIFFERENT-url creature reprints across sourcebooks investigated for the
 * "hidden join candidate" trace below, which are real distinct AoN docs, not
 * duplicates) and NOT just `aonUrl` alone (a shared url legitimately holds
 * several distinct-slugged tier siblings, `aonLinkTable.ts`'s own gotcha #1
 * — those must stay separate metas, only their MARKDOWN LINK resolution
 * collapses to one page owner).
 *
 * ## Winner pick — reuses `aonLinkTable.ts`'s own `urlQueryId` rule
 *
 * Same rule, same rationale, one step earlier: prefer the doc whose OWN
 * `aonId` reconstructs `{category}-{urlQueryId(aonUrl)}` (the url's "page
 * owner" — verified to resolve all 600 real equipment duplicate groups
 * unambiguously). When that rule can't pick a unique winner (0 or >1 exact
 * reconstructions — the real `item-bonus` case, whose ids never reconstruct
 * their parent's query id at all), fall back deterministically: prefer a doc
 * that carries markdown, then the lexicographically smallest `aonId` — never
 * arbitrary, never re-derived differently between runs (determinism).
 *
 * ## The "hidden join candidate" trace
 *
 * A related question: does `join.ts`'s `aonSlugIndex` one-winner-per-slug
 * pick (a SEPARATE mechanism, unrelated to this dedup — it always keeps
 * exactly one meta per `category/slug` key even when several real, distinct
 * AoN docs share it) silently hide a real join candidate from some Foundry
 * entity, contributing to creature's 2,242 unjoined-Foundry residue?
 * MEASURED directly against the real 2026-07-13 snapshot (not re-derived
 * here): of the full 2,242 unjoined-Foundry creature list, ZERO have a matching AoN
 * `creature` meta at their own slug (exact OR any `qualifierCandidates`
 * form) ANYWHERE in the full (pre-dedup) meta set — not merely "lost to the
 * one-winner pick", genuinely absent from AoN. The theory is REFUTED for
 * creature: `aonSlugIndex` cannot hide a candidate that doesn't exist, and
 * by construction (every meta with a given slug key always leaves SOME
 * meta at that key) it never drops a key to zero either. The creature carve-out
 * count is accurate as pure source asymmetry, not a join-mechanism bug. This
 * dedup pass still matters independently — collapsing genuine duplicates
 * before `aonSlugIndex` is built removes noise that would otherwise mint
 * spurious residual collisions for entities that DO join correctly.
 */

type ReportFn = (cls: string, detail: string) => void;

function dedupKey(m: AonDocMeta): string {
  return `${m.category}\u0000${m.slug}\u0000${normalizeUrlKey(m.aonUrl)}\u0000${m.edition}`;
}

/** Picks the one canonical meta for a duplicate group (`group.length > 1`,
 * all members sharing category/slug/normalized-url/edition by construction —
 * see `dedupKey`). Mirrors `aonLinkTable.ts`'s `pickCanonical` url-collision
 * rule; see the file header for why. */
function pickDedupWinner(group: readonly AonDocMeta[]): AonDocMeta {
  const first = group[0];
  if (first === undefined) throw new Error("pickDedupWinner: empty group (unreachable)");
  if (group.length === 1) return first;

  const queryId = urlQueryId(normalizeUrlKey(first.aonUrl));
  const exact =
    queryId !== undefined ? group.filter((d) => d.aonId === `${d.category}-${queryId}`) : [];
  if (exact.length === 1) {
    const winner = exact[0];
    if (winner === undefined) throw new Error("pickDedupWinner: unreachable");
    return winner;
  }

  const withMarkdown = group.filter((d) => d.hasMarkdown);
  const pool = withMarkdown.length > 0 ? withMarkdown : group;
  const sorted = [...pool].sort((a, b) => (a.aonId < b.aonId ? -1 : a.aonId > b.aonId ? 1 : 0));
  const winner = sorted[0];
  if (winner === undefined) throw new Error("pickDedupWinner: unreachable (empty pool)");
  return winner;
}

/**
 * Collapses same-`(category, slug, aonUrl, edition)` AoN metas to one
 * deterministic winner. Pure: takes the full extracted meta list +
 * a report sink, returns the deduped list — sorted by `(category, slug,
 * aonId)` regardless of input/grouping order (determinism: two runs over the
 * same snapshot must produce byte-identical output, and `Map` grouping order
 * alone isn't a strong enough guarantee to rely on for that). Every dropped
 * meta is report-counted (`aonUrlDuplicateCollapsed`) with the full group's
 * ids, never silently discarded.
 */
export function dedupeAonMetas(
  metas: readonly AonDocMeta[],
  report: ReportFn,
): readonly AonDocMeta[] {
  const groups = new Map<string, AonDocMeta[]>();
  for (const m of metas) {
    const key = dedupKey(m);
    const arr = groups.get(key);
    if (arr) arr.push(m);
    else groups.set(key, [m]);
  }

  const winners: AonDocMeta[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      const only = group[0];
      if (only) winners.push(only);
      continue;
    }
    const winner = pickDedupWinner(group);
    winners.push(winner);
    report(
      "aonUrlDuplicateCollapsed",
      `${winner.category}/${winner.slug}: kept ${winner.aonId}, dropped ${group
        .filter((d) => d.aonId !== winner.aonId)
        .map((d) => d.aonId)
        .join(", ")}`,
    );
  }

  return winners.sort((a, b) => {
    if (a.category !== b.category) return a.category < b.category ? -1 : 1;
    if (a.slug !== b.slug) return a.slug < b.slug ? -1 : 1;
    return a.aonId < b.aonId ? -1 : a.aonId > b.aonId ? 1 : 0;
  });
}
