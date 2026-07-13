import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  EXCLUDED_PACKS,
  type CategoryDecision,
  isKnownPack,
  mapCategory,
} from "../../scripts/categoryMap";
import type { UuidResolution } from "./enrichers";
import { walkFiles } from "./fsWalk";

/**
 * D29-6's `resolveUuid` — the concrete implementation `enrichers.ts` only
 * declares the shape of. Two-pass design:
 *
 *   1. `buildPackRegistry` reads `system.pf2e.json`'s `packs[].name → path` map
 *      and rewrites it to the real on-disk layout (`packs/X` release-layout →
 *      `packs/pf2e/X` snapshot nesting, D29-5/D29-6) — 10 real name/dir
 *      mismatches (`actionspf2e→packs/actions`, etc., verified).
 *   2. `buildDocIndex` walks every registered pack's directory (pack dirs nest
 *      arbitrarily, e.g. `spells/spells/rank-1/…` — `walkFiles` handles that)
 *      and records each doc under every real reference SHAPE found in the
 *      actual corpus (verified exhaustively over all 92,780 real `@UUID[...]`
 *      uses + 2,714 `@Embed[...]` uses):
 *        - `Compendium.pf2e.<packName>.<Type>.<id>` (29 real uses — `<id>` is a
 *          16-char Foundry document id)
 *        - `Compendium.pf2e.<packName>.<Type>.<name>` (91,285 real uses — the
 *          OVERWHELMING majority; `<Type>` is always the Foundry document class
 *          — "Item"/"Actor"/"Macro"/"RollTable" — never the doc's own `type`
 *          field, so it carries no extra information beyond "this pack's docs
 *          are documents of this class", already known from the pack registry)
 *        - `Compendium.pf2e.<packName>.<name>` (14 real uses — no `<Type>`
 *          segment at all, name-only)
 *        - `Compendium.pf2e.<packName>.JournalEntry.<entryId>.JournalEntryPage.<pageId>`
 *          (1,195 real uses — a specific journal PAGE; verified 900 of these
 *          are referenced FROM ordinary Item/Actor docs, e.g. every ancestry
 *          Item links to its own lore journal page, so this index must be
 *          complete before Item/Actor descriptions are parsed — see
 *          `registerJournalPage` below, called by `journals.ts`'s assembly
 *          BEFORE `foundryEntities.ts` parses any HTML)
 *      Names are unique within a pack in every real pack checked (spells,
 *      feats, actions, conditions — 0 collisions), so name-based lookup is
 *      unambiguous.
 *   3. Relative `@UUID[.<id>]` (66 real uses, ALL inside journal pages —
 *      `archetypes.json` ×6 referencing sibling pages, `gm-screen.json` ×60
 *      which never becomes an entity per D29-8 so its relative refs are moot)
 *      resolve against the CONTAINING document's own sibling collection, not
 *      the global index — `createResolveUuid`'s `containing` param.
 */

// ---------------------------------------------------------------------------
// pack registry (name → real on-disk dir + Foundry document class)
// ---------------------------------------------------------------------------

export type FoundryDocClass = "Actor" | "Item" | "JournalEntry" | "Macro" | "RollTable";

export interface PackRegistryEntry {
  /** The registered manifest name (what `@UUID`/`@Embed` strings use) — e.g.
   * `actionspf2e`, `spells-srd`. */
  name: string;
  /** The real on-disk directory name under `packs/pf2e/` — e.g. `actions`,
   * `spells`. Equal to `name` for 86 of the 96 packs; differs for 10. */
  dir: string;
  docClass: FoundryDocClass;
}

interface RawSystemManifest {
  packs: ReadonlyArray<{ name: string; path: string; type: string }>;
}

/**
 * Parses `system.pf2e.json`'s `packs[]` array into `{name, dir, docClass}`
 * entries — the `path` field is release-layout (`packs/X`), rewritten to the
 * dir name alone (`X`) since the caller already knows the snapshot nests every
 * pack under `packs/pf2e/` (D29-5's path-prefix rewrite).
 */
export function buildPackRegistry(systemManifest: unknown): readonly PackRegistryEntry[] {
  const manifest = systemManifest as RawSystemManifest;
  return manifest.packs.map((p) => ({
    name: p.name,
    dir: p.path.replace(/^packs\//, ""),
    docClass: p.type as FoundryDocClass,
  }));
}

// ---------------------------------------------------------------------------
// doc index
// ---------------------------------------------------------------------------

interface IndexEntry {
  resolution: UuidResolution;
}

/**
 * The full cross-reference index: every real doc (Item/Actor pack docs, plus
 * whatever `journals.ts` registers for journal pages) reachable by `@UUID`/
 * `@Embed`, keyed by pack name AND doc id/name, so any real reference shape
 * resolves. Mutable by design — `registerJournalPage` is called AFTER the
 * initial `buildDocIndex` pass but BEFORE any HTML is parsed (see the file
 * header's ordering note).
 */
export class UuidIndex {
  private readonly byId = new Map<string, IndexEntry>();
  private readonly byName = new Map<string, IndexEntry>();
  /** Journal-page-only: `${entryId}::${pageId}` → resolution, for the
   * `JournalEntry.<entryId>.JournalEntryPage.<pageId>` reference shape. */
  private readonly byJournalPage = new Map<string, IndexEntry>();
  /** Every distinct crossref target id registered so far — lets the
   * orchestrator get "every codex entity id assigned so far" (needed as
   * `journals.decideJournalPages`'s `knownEntityIds`, D29-8's merge-vs-
   * standalone decision) WITHOUT a second metadata-only walk: `buildDocIndex`
   * already computes the exact same id every non-excluded Item/Actor doc
   * will get. */
  private readonly crossrefIds = new Set<string>();

  private key(pack: string, idOrName: string): string {
    return `${pack}::${idOrName}`;
  }

  registerDoc(pack: string, id: string, name: string, resolution: UuidResolution): void {
    this.byId.set(this.key(pack, id), { resolution });
    this.byName.set(this.key(pack, name), { resolution });
    if (resolution.kind === "crossref") this.crossrefIds.add(resolution.id);
  }

  registerJournalPage(entryId: string, pageId: string, resolution: UuidResolution): void {
    this.byJournalPage.set(`${entryId}::${pageId}`, { resolution });
  }

  lookupByIdOrName(pack: string, idOrName: string): UuidResolution | undefined {
    return (
      this.byId.get(this.key(pack, idOrName))?.resolution ??
      this.byName.get(this.key(pack, idOrName))?.resolution
    );
  }

  lookupJournalPage(entryId: string, pageId: string): UuidResolution | undefined {
    return this.byJournalPage.get(`${entryId}::${pageId}`)?.resolution;
  }

  /** Every distinct codex entity id registered as a crossref target so far. */
  allCrossrefIds(): ReadonlySet<string> {
    return this.crossrefIds;
  }
}

/** What `buildDocIndex` needs from each walked pack doc — a structural subset
 * of the real Foundry JSON shape (Actor/Item docs, plus the excluded
 * JournalEntry packs' `pages` for symmetry with `journals.ts`'s per-page
 * registration). */
export interface IndexableDoc {
  _id: string;
  name: string;
  type?: string;
  pages?: ReadonlyArray<{ _id: string; name: string }>;
}

/**
 * Pass 1: walks every registered Item/Actor pack directory under
 * `packsRoot` (the real `<snapshot>/packs/pf2e` dir) and registers each doc's
 * resolution — `crossref` (codex id, via `categoryMap`) for an included doc,
 * `excluded` for a doc in an excluded pack (D29-8). Macro/RollTable packs are
 * always `excluded` (D29-6's "refs to excluded doc types" — Macro 123,
 * RollTable 22 real uses), as is the `criticaldeck` JournalEntry pack (S2
 * extension, `categoryMap.ts`) — its docs+pages ARE registered here (a real
 * `@UUID`/`@Embed` reference into an excluded doc must resolve `excluded`,
 * not `broken`; a first pass at this treated every non-registered journal
 * target as `broken`, which wrongly caught real GM-reference links into
 * `gm-screen`/`hero-point-deck` too — fixed by having the orchestrator ALSO
 * call `journals.registerExcludedJournal` for those two + `remaster-changes`,
 * since they live inside the mixed "journals" pack this function doesn't
 * walk). The "journals" pack itself is NOT walked here at all — its 4 real
 * reference-content journals get their per-page entries from
 * `registerJournalPage`, called by the orchestrator via `journals.ts`.
 */
export function buildDocIndex(
  packsRoot: string,
  registry: readonly PackRegistryEntry[],
): UuidIndex {
  const index = new UuidIndex();

  for (const entry of registry) {
    // Macro/RollTable packs are always excluded (D29-6: Macro 123 / RollTable
    // 22 real ref uses); an EXCLUDED JournalEntry pack (`criticaldeck` — S2
    // extension, categoryMap.ts) is excluded the same way, including its
    // pages (registered too, for symmetry with journals.ts's per-page
    // registration, even though nothing in the real corpus references a
    // criticaldeck page — verified). The "journals" pack itself is NOT fully
    // excluded (4 of its 7 docs are real reference content) — its excluded
    // sub-docs (gm-screen/hero-point-deck/remaster-changes) are registered
    // by `journals.registerExcludedJournal`, called from the orchestrator,
    // not here.
    if (
      entry.docClass === "Macro" ||
      entry.docClass === "RollTable" ||
      (entry.docClass === "JournalEntry" && EXCLUDED_PACKS.has(entry.dir))
    ) {
      for (const file of walkFiles(join(packsRoot, entry.dir))) {
        const doc = JSON.parse(readFileSync(file.absPath, "utf8")) as IndexableDoc;
        index.registerDoc(entry.name, doc._id, doc.name, {
          kind: "excluded",
          display: doc.name,
        });
        for (const page of doc.pages ?? []) {
          index.registerJournalPage(doc._id, page._id, { kind: "excluded", display: page.name });
        }
      }
      continue;
    }
    if (entry.docClass === "JournalEntry") continue; // journals.ts's job (the "journals" pack)

    // Actor / Item
    for (const file of walkFiles(join(packsRoot, entry.dir))) {
      if (file.relPath.endsWith("_folders.json")) continue;
      const doc = JSON.parse(readFileSync(file.absPath, "utf8")) as IndexableDoc;
      const decision: CategoryDecision = mapCategory(entry.dir, doc.type ?? "__NO_TYPE__");
      // The file BASENAME is identity's ground truth (D29-1) — the same value
      // `foundryEntities.ts`'s `assembleFoundryEntity` uses for the doc's real
      // entity id (verified byte-identical to `sluggify(doc.name)` for
      // 28,636/28,636 real docs, but using the basename here keeps this
      // index's ids consistent with the real assembled entities even in the
      // zero real disagreements found so far).
      const basename =
        file.relPath
          .replace(/\.json$/, "")
          .split("/")
          .pop() ?? "";
      const resolution: UuidResolution =
        decision.kind === "excluded"
          ? { kind: "excluded", display: doc.name }
          : { kind: "crossref", id: `${decision.category}/${basename}`, display: doc.name };
      index.registerDoc(entry.name, doc._id, doc.name, resolution);
    }
  }

  return index;
}

/** Total-map drift check (mirrors `categoryMap`'s own tripwire, one level up):
 * a pack DIRECTORY found on disk that the registry never mentions (a
 * `system.pf2e.json` drift), or a registered Actor/Item pack `categoryMap.ts`
 * doesn't recognize at all (a `categoryMap.ts` drift), means the snapshot
 * changed shape since this file was written — hard fail rather than silently
 * skip the new pack. */
export function assertRegistryIsTotal(
  packsRoot: string,
  registry: readonly PackRegistryEntry[],
): void {
  const knownDirs = new Set(registry.map((r) => r.dir));
  for (const name of readdirSync(packsRoot)) {
    if (!statSync(join(packsRoot, name)).isDirectory()) continue;
    if (!knownDirs.has(name)) {
      throw new Error(
        `uuidResolve: pack directory "${name}" under packs/pf2e/ has no entry in ` +
          `system.pf2e.json's packs[] — the snapshot's pack layout changed since this ` +
          `pipeline was written`,
      );
    }
  }
  for (const entry of registry) {
    if (entry.docClass !== "Actor" && entry.docClass !== "Item") continue;
    if (!isKnownPack(entry.dir)) {
      throw new Error(
        `uuidResolve: pack "${entry.dir}" (registered as "${entry.name}") is not ` +
          `recognized by categoryMap.ts — a new pack appeared in the snapshot; extend categoryMap.ts`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// @UUID string parsing
// ---------------------------------------------------------------------------

const TYPE_TOKENS: ReadonlySet<string> = new Set([
  "Item",
  "Actor",
  "Macro",
  "RollTable",
  "JournalEntry",
]);

export type ParsedUuid =
  | { shape: "relative"; docId: string }
  | { shape: "journalPage"; pack: string; entryId: string; pageId: string }
  | { shape: "doc"; pack: string; idOrName: string };

/**
 * Parses a raw `@UUID[...]`/`@Embed[...]` target string into one of the three
 * real shapes (D29-6). Never throws — an unparseable string (none seen in the
 * real corpus) resolves as `{shape:"doc", pack:"", idOrName:<whole string>}`,
 * which will simply miss every index lookup and report `brokenRef` (the same
 * outcome a genuinely malformed reference deserves).
 */
export function parseUuid(uuid: string): ParsedUuid {
  if (uuid.startsWith(".")) return { shape: "relative", docId: uuid.slice(1) };

  const prefix = "Compendium.pf2e.";
  if (!uuid.startsWith(prefix)) return { shape: "doc", pack: "", idOrName: uuid };
  const rest = uuid.slice(prefix.length);
  const dotIdx = rest.indexOf(".");
  if (dotIdx === -1) return { shape: "doc", pack: rest, idOrName: "" };
  const pack = rest.slice(0, dotIdx);
  const afterPack = rest.slice(dotIdx + 1);

  // JournalEntry.<entryId>.JournalEntryPage.<pageId> — checked before the
  // generic single-type-segment case since it has two. `pageId` may carry a
  // trailing `#<anchor>` in-page-heading-link fragment (87 real uses, e.g.
  // spellcasting-archetype feats linking to a specific heading inside a
  // shared "Spellcasting Archetypes" journal page) — stripped here, safe
  // because every real JournalEntryPage id is a bare 16-char alnum Foundry id
  // (verified: 0 counter-examples), never itself containing `#`. In-page
  // anchors aren't a separate addressable target in this pipeline (P2
  // concern, not P1) — the anchor is simply dropped, resolving to the whole
  // page's target same as a plain reference would.
  const journalMatch = /^JournalEntry\.([^.]+)\.JournalEntryPage\.([^#]+)/.exec(afterPack);
  if (journalMatch) {
    return {
      shape: "journalPage",
      pack,
      entryId: journalMatch[1] ?? "",
      pageId: journalMatch[2] ?? "",
    };
  }

  // <Type>.<idOrName> — Type is a Foundry document class, not the doc's own
  // `type` field (verified — see file header). The idOrName segment may itself
  // contain literal dots (e.g. an ellipsis in a name, "A Little Bird Told
  // Me..." — 2 real occurrences), so this only ever splits on the FIRST dot
  // after the type token, never re-splits the remainder.
  const firstDot = afterPack.indexOf(".");
  const maybeType = firstDot === -1 ? afterPack : afterPack.slice(0, firstDot);
  if (TYPE_TOKENS.has(maybeType) && firstDot !== -1) {
    return { shape: "doc", pack, idOrName: afterPack.slice(firstDot + 1) };
  }

  // No type segment at all — name-based, resolved directly against the pack.
  return { shape: "doc", pack, idOrName: afterPack };
}

// ---------------------------------------------------------------------------
// resolveUuid factory (D29-6: "ctx factory takes the containing document")
// ---------------------------------------------------------------------------

/** The minimal shape `createResolveUuid` needs from whatever document is
 * currently being parsed, to resolve a relative `@UUID[.<id>]` against its
 * siblings. Every real relative ref in the corpus (66 of 66) sits inside a
 * JournalEntry page and targets a SIBLING PAGE of the same entry — resolved
 * via the SAME `byJournalPage` index entries `journals.ts` registers for
 * absolute `JournalEntry.<id>.JournalEntryPage.<id>` refs from other docs
 * (D29-8's two-phase journal assembly: every page's merge/standalone target is
 * decided and registered BEFORE any page's HTML is parsed, so a sibling's
 * resolution is always already present by the time a relative ref needs it).
 * An Actor doc's embedded `items` are supported structurally for the same
 * `.docId` grammar, but resolve `broken` today — zero real occurrences target
 * an embedded item (verified), and embedded items never become their own
 * addressable corpus entity (D29-3's assembly decision, `foundryEntities.ts`)
 * for a relative ref to legitimately land on. */
export interface ContainingDoc {
  _id: string;
  pages?: ReadonlyArray<{ _id: string; name: string }>;
  items?: ReadonlyArray<{ _id: string; name: string }>;
}

/**
 * Builds the real `resolveUuid` callback `enrichers.ts` calls while parsing a
 * specific document's HTML. `containing` is that document (for relative-ref
 * resolution, D29-6) — pass the same doc whose own description/pages are being
 * parsed.
 */
export function createResolveUuid(
  index: UuidIndex,
  containing?: ContainingDoc,
): (uuid: string) => UuidResolution {
  return (uuid: string): UuidResolution => {
    const parsed = parseUuid(uuid);

    if (parsed.shape === "relative") {
      if (containing?.pages?.some((p) => p._id === parsed.docId)) {
        const resolved = index.lookupJournalPage(containing._id, parsed.docId);
        if (resolved) return resolved;
      }
      return { kind: "broken" };
    }

    if (parsed.shape === "journalPage") {
      const resolved = index.lookupJournalPage(parsed.entryId, parsed.pageId);
      return resolved ?? { kind: "broken" };
    }

    if (parsed.pack === "") return { kind: "broken" };
    const resolved = index.lookupByIdOrName(parsed.pack, parsed.idOrName);
    return resolved ?? { kind: "broken" };
  };
}
