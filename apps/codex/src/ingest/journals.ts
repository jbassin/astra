import type { CodexEntity } from "../schema/entity";
import type { BlockNode, CodexNode } from "../schema/nodes";
import type { EnricherContext, ReportClass as EnricherReportClass } from "./enrichers";
import { parseFoundryHtml } from "./foundryHtml";
import { sluggify } from "./sluggify";
import type { UuidIndex } from "./uuidResolve";

/**
 * D29-8: JournalEntry `pages[]` assembly (Deliverable 4). A JournalEntry is
 * ONE doc with `pages[]` — a different shape from Item/Actor docs
 * (`foundryEntities.ts`), so it gets its own module.
 *
 * Two-PHASE process per journal (not one pass), because 900 real `@UUID`
 * references FROM ordinary Item/Actor docs target a specific journal PAGE
 * (e.g. every ancestry Item links to its own lore page) — every page's
 * merge/standalone target must be DECIDED and registered in the uuid index
 * BEFORE any document's HTML (Item/Actor OR journal page) is parsed:
 *
 *   1. `decideJournalPages` — pure slug/id logic, no HTML parsing: for each
 *      page, `sluggify(page.name)` under the journal's target category
 *      (`JOURNAL_TARGET_CATEGORY`) either matches an already-assembled
 *      Item-derived entity id (→ `merge`, D29-8's "journal page 'Anadi'
 *      enriches the ancestry entity `anadi`, it does NOT become `anadi-2`")
 *      or doesn't (→ `standalone`, a `proseOnly` entity, report-counted).
 *      The caller registers every decision into the shared `UuidIndex`
 *      (`registerJournalPage`) right after this returns, for ALL FOUR target
 *      journals, before assembling anything.
 *   2. `assembleJournalPages` — now that every page (in every journal) has a
 *      registered resolution, parses each page's HTML body and produces the
 *      real merge/standalone results.
 *
 * `gm-screen`/`hero-point-deck` (D29-8's excluded journals) and `criticaldeck`
 * (S2 extension, `categoryMap.ts`) never reach this module at all — the
 * caller only walks the four journals named below. `remaster-changes` is
 * parsed by `parseRemasterChanges` instead — NOT an entity (D29-8), a
 * redirect-table input for D29-7's legacy/remaster pairing at S4.
 */

// ---------------------------------------------------------------------------
// raw JournalEntry shape
// ---------------------------------------------------------------------------

export interface JournalPageRaw {
  _id: string;
  name: string;
  type?: string;
  text?: { content?: string };
}

export interface JournalDoc {
  _id: string;
  name: string;
  pages: readonly JournalPageRaw[];
}

/** Journal pack basename → target codex category (D29-8; the real journal
 * files present in `packs/pf2e/journals/` — verified: exactly 7 docs total,
 * `ancestries`/`archetypes`/`classes`/`domains` (these four) plus
 * `gm-screen`/`hero-point-deck` (excluded) plus `remaster-changes` (its own
 * redirect-table parse below). Any OTHER prose journal appearing in a future
 * refresh is a deliberate decision to make here, not silence — an unmapped
 * journal basename passed to `decideJournalPages` throws. */
export const JOURNAL_TARGET_CATEGORY: Readonly<Record<string, string>> = {
  ancestries: "ancestry",
  archetypes: "archetype",
  classes: "class",
  domains: "domain",
};

/** The `journals` pack's other 3 docs (of its real 7 total) — D29-8's
 * `gm-screen`/`hero-point-deck` exclusions, plus `remaster-changes` (never an
 * entity, D29-7's redirect-table input instead). Registered as `excluded`
 * targets (`registerExcludedJournal` below), NOT `broken` — a real `@UUID`
 * reference into gm-screen IS a legitimate GM-reference call-out in the
 * source material, same treatment as a Macro/RollTable reference (verified:
 * fixing this from an earlier "falls through to broken" draft measurably
 * shrank the real snapshot's `brokenRef` count). */
export const EXCLUDED_JOURNAL_BASENAMES: ReadonlySet<string> = new Set([
  "gm-screen",
  "hero-point-deck",
  "remaster-changes",
]);

/** Registers `doc` (one of `EXCLUDED_JOURNAL_BASENAMES`) and every one of its
 * pages as `excluded` targets in the shared uuid index — called by the
 * orchestrator once per excluded journal doc, alongside the real 4 journals'
 * `decideJournalPages`/`registerJournalPage` calls (any order — independent
 * map insertions). */
export function registerExcludedJournal(index: UuidIndex, packName: string, doc: JournalDoc): void {
  index.registerDoc(packName, doc._id, doc.name, { kind: "excluded", display: doc.name });
  for (const page of doc.pages) {
    index.registerJournalPage(doc._id, page._id, { kind: "excluded", display: page.name });
  }
}

export type ReportFn = (cls: string, detail: string) => void;

// ---------------------------------------------------------------------------
// phase 1: decide merge/standalone targets (no HTML parsing)
// ---------------------------------------------------------------------------

export type JournalPageDecision =
  | {
      readonly kind: "merge";
      readonly targetId: string;
      readonly pageId: string;
      readonly pageName: string;
    }
  | {
      readonly kind: "standalone";
      readonly entityId: string;
      readonly category: string;
      readonly pageId: string;
      readonly pageName: string;
    };

/**
 * Phase 1 (D29-8): for each page, decide whether it merges into an existing
 * Item-derived entity (by `{category}/{slug}` match) or becomes its own
 * standalone `proseOnly` entity. `knownEntityIds` is every entity id already
 * assigned by `foundryEntities.ts`'s walk over Item/Actor packs (S2 scope:
 * plain `{category}/{slug}` form, no `@legacy` suffix yet — see
 * `foundryEntities.ts`'s file header).
 */
export function decideJournalPages(
  journalBasename: string,
  doc: JournalDoc,
  knownEntityIds: ReadonlySet<string>,
  report: ReportFn,
): JournalPageDecision[] {
  const category = JOURNAL_TARGET_CATEGORY[journalBasename];
  if (category === undefined) {
    throw new Error(
      `journals.ts: no target category for journal "${journalBasename}" — extend JOURNAL_TARGET_CATEGORY`,
    );
  }
  return doc.pages.map((page): JournalPageDecision => {
    const slug = sluggify(page.name);
    const candidateId = `${category}/${slug}`;
    if (knownEntityIds.has(candidateId)) {
      return { kind: "merge", targetId: candidateId, pageId: page._id, pageName: page.name };
    }
    report("journalProseOnly", candidateId);
    return {
      kind: "standalone",
      entityId: candidateId,
      category,
      pageId: page._id,
      pageName: page.name,
    };
  });
}

/** Registers every page decision's resolution into the shared uuid index
 * (the `index.registerJournalPage` calls D29-6's `uuidResolve.ts` exposes) —
 * called once per journal, for ALL FOUR journals, before any HTML parsing
 * starts (see the module doc's ordering note). Kept here (not inlined at the
 * call site) since it's the one place that knows how to turn a
 * `JournalPageDecision` into the `{kind:"crossref", id, display}` shape the
 * index wants. */
export function decisionToResolution(decision: JournalPageDecision): {
  id: string;
  display: string;
} {
  return decision.kind === "merge"
    ? { id: decision.targetId, display: decision.pageName }
    : { id: decision.entityId, display: decision.pageName };
}

// ---------------------------------------------------------------------------
// phase 2: parse bodies, produce merge results + standalone entities
// ---------------------------------------------------------------------------

export interface JournalMergeResult {
  targetId: string;
  loreBody: BlockNode[];
}

export interface JournalAssembly {
  merges: JournalMergeResult[];
  standalone: CodexEntity[];
}

/**
 * Phase 2: parses every page's `text.content` and produces either a merge
 * result (`{targetId, loreBody}`, for the caller to attach to the matching
 * entity) or a standalone `proseOnly` `CodexEntity`. `ctx` must already be
 * bound to THIS journal as its "containing document" (`createResolveUuid(index,
 * {_id: doc._id, pages: doc.pages})`, D29-6) so relative `@UUID[.<id>]`
 * sibling-page refs resolve.
 *
 * Standalone entities have no in-source publication data at all (JournalEntry
 * docs carry none — verified) — `source`/`edition` fall back the same way
 * `foundryEntities.ts` falls back for a doc with missing publication
 * (`license: "unknown"`, `edition: "legacy"`, reported), pending S3's
 * `licenseMap.ts` + the S4 AoN join backfilling a real book/page citation.
 */
export function assembleJournalPages(
  journalDisplayName: string,
  doc: JournalDoc,
  decisions: readonly JournalPageDecision[],
  ctx: EnricherContext,
  report: ReportFn,
): JournalAssembly {
  const pageById = new Map(doc.pages.map((p) => [p._id, p] as const));
  const merges: JournalMergeResult[] = [];
  const standalone: CodexEntity[] = [];

  for (const decision of decisions) {
    const page = pageById.get(decision.pageId);
    const html = page?.text?.content ?? "";
    const body: BlockNode[] = html.length > 0 ? parseFoundryHtml(html, ctx) : [];

    if (decision.kind === "merge") {
      merges.push({ targetId: decision.targetId, loreBody: body });
      continue;
    }

    report("missingPublication", `journal page has no publication data (${decision.entityId})`);
    standalone.push({
      id: decision.entityId,
      slug: sluggify(decision.pageName),
      category: decision.category,
      name: decision.pageName,
      edition: "legacy",
      source: { book: `Foundry Journal: ${journalDisplayName}`, license: "unknown" },
      traits: [],
      body,
      proseOnly: true,
      facets: {},
    });
  }

  return { merges, standalone };
}

// ---------------------------------------------------------------------------
// remaster-changes redirect table (D29-7's pairing cross-check input)
// ---------------------------------------------------------------------------

export interface RemasterRedirectEntry {
  /** Which sub-table this row came from ("Class Features", "Feats", "Spells",
   * "Equipment", "Bestiaries" — the 5 real pages with a table; the intro and
   * "Rules and Languages" pages carry no table and contribute zero entries). */
  page: string;
  oldName: string;
  /** Set when the "old name" cell resolved to a crossref (an @UUID pointing
   * at a still-registered doc) rather than plain text. */
  oldId?: string;
  /** Preserved verbatim, INCLUDING the literal "—" em-dash some rows use for
   * "no replacement" (e.g. a feat whose "Altered mechanics" status leaves no
   * successor) — not normalized to `undefined`, so S4 can tell "no
   * replacement" apart from "cell didn't parse". */
  newName: string;
  newId?: string;
  /** The table's own status/classification column when present ("Renamed",
   * "Merged", "Replaced", "Altered mechanics", ...) — absent for the 2-column
   * Equipment/Bestiaries tables, which carry no such column. */
  status?: string;
}

type ColumnRole = "old" | "new" | "status" | "ignore";

function roleForHeader(headerText: string): ColumnRole {
  const t = headerText.trim().toLowerCase();
  if (t === "item name" || t === "spell name" || t === "old name") return "old";
  if (t === "new name") return "new";
  if (t === "status") return "status";
  return "ignore";
}

/** Flattens a table cell's `CodexNode[]` to plain display text, plus the
 * FIRST crossref target id found inside it (a cell is either plain text, a
 * single `@UUID` reference, or occasionally both — e.g. "See @UUID[...]
 * {Wizard}" — verified in the real `remaster-changes` tables). */
function flattenCellText(nodes: readonly CodexNode[]): { text: string; crossrefId?: string } {
  let text = "";
  let crossrefId: string | undefined;
  for (const n of nodes) {
    switch (n.kind) {
      case "text":
        text += n.content;
        break;
      case "crossref":
        text += n.display;
        crossrefId ??= n.targetId;
        break;
      case "brokenRef":
        text += n.display;
        break;
      case "paragraph":
      case "heading":
      case "blockquote":
      case "aside":
      case "localizedBoilerplate": {
        const r = flattenCellText(n.children);
        text += r.text;
        crossrefId ??= r.crossrefId;
        break;
      }
      case "list":
        for (const item of n.items) {
          const r = flattenCellText(item);
          text += r.text;
          crossrefId ??= r.crossrefId;
        }
        break;
      default:
        // table/divider/check/damage/inlineRoll/inlineAction/template/embed/
        // actionGlyph never occur inside a remaster-changes cell (verified) —
        // contribute nothing rather than guessing at a text representation.
        break;
    }
  }
  return { text: text.trim(), crossrefId };
}

/**
 * Parses the `remaster-changes` journal's 5 tabular pages (of its 7 total —
 * the intro and "Rules and Languages" pages are prose-only, contribute
 * nothing) into old-name→new-name redirect pairs, for S4's legacy/remaster
 * pairing cross-check (D29-7: "Foundry's `remaster-changes` journal cross-
 * check" against AoN's `remaster_id`/`legacy_id` arrays). NOT an entity —
 * this journal never appears in `JOURNAL_TARGET_CATEGORY`.
 */
export function parseRemasterChanges(
  doc: JournalDoc,
  ctx: EnricherContext,
): RemasterRedirectEntry[] {
  const entries: RemasterRedirectEntry[] = [];

  for (const page of doc.pages) {
    const html = page.text?.content ?? "";
    if (html.length === 0) continue;
    const body = parseFoundryHtml(html, ctx);
    const table = body.find((n): n is Extract<BlockNode, { kind: "table" }> => n.kind === "table");
    if (!table) continue; // the intro + "Rules and Languages" pages, by design

    const headerRow = table.rows.find((r) => r.header);
    if (!headerRow) continue;
    const roles = headerRow.cells.map((cell) => roleForHeader(flattenCellText(cell).text));

    for (const row of table.rows) {
      if (row.header) continue;
      let oldName: string | undefined;
      let oldId: string | undefined;
      let newName: string | undefined;
      let newId: string | undefined;
      let status: string | undefined;
      row.cells.forEach((cell, i) => {
        const role = roles[i];
        const { text, crossrefId } = flattenCellText(cell);
        if (role === "old") {
          oldName = text;
          oldId = crossrefId;
        } else if (role === "new") {
          newName = text;
          newId = crossrefId;
        } else if (role === "status") {
          status = text;
        }
      });
      if (oldName === undefined || newName === undefined) continue;
      entries.push({
        page: page.name,
        oldName,
        ...(oldId !== undefined ? { oldId } : {}),
        newName,
        ...(newId !== undefined ? { newId } : {}),
        ...(status !== undefined && status.length > 0 ? { status } : {}),
      });
    }
  }

  return entries;
}

// Re-exported so consumers of `journals.ts` don't also need a direct import of
// `enrichers.ts` for the report-class type when wiring `report()` through.
export type { EnricherReportClass };
