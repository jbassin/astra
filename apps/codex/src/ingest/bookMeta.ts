import { licenseForBook } from "../../scripts/licenseMap";
import type { Edition, License } from "../schema/entity";

/**
 * P4 (D29-39): book-LEVEL `edition`/`license` derivation — shared by the
 * rules-tree builder (`rulesTree.ts`) and the sources-index builder
 * (`sourcesIndexBuild.ts`), since both need the exact same rule (books
 * aren't entities, so neither `CodexEntity.edition`/`.source.license`
 * applies directly — spec's adversarial M11).
 */

const REMASTERED_TITLE_RE = /\(Remastered\)\s*$/i;

/**
 * Edition: a title ending "(Remastered)" (case-insensitive) is ALWAYS
 * remaster — the load-bearing override (Treasure Vault (Remastered)'s own
 * member docs measure 57 legacy / 12 remaster off a shared `release_date`,
 * so the naive majority-of-members rule alone would mislabel it legacy).
 * Every other book: majority edition among its own member docs (ties
 * resolve to legacy — the conservative/non-remaster default, matching
 * `foundryEntities.ts`'s own missing-publication fallback posture).
 */
export function deriveBookEdition(book: string, memberEditions: readonly Edition[]): Edition {
  if (REMASTERED_TITLE_RE.test(book.trim())) return "remaster";
  let remaster = 0;
  let legacy = 0;
  for (const e of memberEditions) {
    if (e === "remaster") remaster++;
    else legacy++;
  }
  return remaster > legacy ? "remaster" : "legacy";
}

/**
 * License: the committed `licenseMap.ts` table first (`licenseForBook`,
 * already CRLF/whitespace-normalizing internally); when the book isn't in
 * that table, fall back to a matching `source`-category entity's own
 * `source.license` (a Foundry-derived book can carry real in-source license
 * data with no AoN `licenseMap` entry at all); `"unknown"` only when NEITHER
 * source has an answer — never a guessed OGL/ORC (D29-39's explicit pin).
 */
export function deriveBookLicense(book: string, sourceEntityLicense?: License): License {
  const fromTable = licenseForBook(book);
  if (fromTable !== "unknown") return fromTable;
  return sourceEntityLicense ?? "unknown";
}
