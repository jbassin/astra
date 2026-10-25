/**
 * Compendium tools: list the packs, search their indexes, and clone compendium documents
 * into the world. `cloneFromCompendium` is also the import half of `create-token`.
 */
import {
  type CompendiumIndexRow,
  type CompendiumPackRow,
  type ImportedDocumentRow,
  ImportFromCompendiumParams,
  type ImportFromCompendiumResult,
  ListCompendiumPacksParams,
  type ListCompendiumPacksResult,
  SearchCompendiumParams,
  type SearchCompendiumResult,
  type BridgeToolHandlers,
  BridgeError,
} from "@astra/portal-shared";

import { withStamp } from "./payloads";
import { byRankThenName, DEFAULT_SEARCH_LIMIT, matchRank } from "./shared";
import { auditLog, resolveFolderId, writeGate } from "./writes";

/** `list-compendium-packs` — every `game.packs` entry, so an LLM client
 * can pick pack ids for `search-compendium`'s `packIds` filter or just browse what's on
 * disk. No search/filter of its own — that's `search-compendium`'s job. */
function handleListCompendiumPacks(rawParams: unknown): ListCompendiumPacksResult {
  ListCompendiumPacksParams.parse(rawParams);
  // `size` is omitted: Foundry doesn't expose a sync per-pack count without an async
  // `getIndex()` call, and this handler stays sync (a plain browse, no per-pack fetch).
  const packs: CompendiumPackRow[] = Array.from(game.packs.values()).map((pack) => ({
    id: pack.collection,
    label: pack.metadata.label,
    type: pack.metadata.type,
    system: pack.metadata.system,
  }));
  return { packs };
}

/** `search-compendium` — live-iterate every candidate pack's index
 * (no precomputed cross-pack cache yet), filter by a
 * case-insensitive substring match on name, merge + rank, truncate to `limit`. */
async function handleSearchCompendium(rawParams: unknown): Promise<SearchCompendiumResult> {
  const { query, type, packIds, limit } = SearchCompendiumParams.parse(rawParams);
  const needle = query.toLowerCase();

  const candidates = Array.from(game.packs.values()).filter((pack) => {
    if (type !== undefined && pack.metadata.type !== type) return false;
    if (packIds !== undefined && !packIds.includes(pack.collection)) return false;
    return true;
  });

  const rows: Array<CompendiumIndexRow & { _rank: number }> = [];
  for (const pack of candidates) {
    const index = await pack.getIndex({ fields: ["img"] });
    for (const entry of index.values()) {
      const rank = matchRank(entry.name, needle);
      if (rank === undefined) continue;
      rows.push({
        uuid: entry.uuid,
        id: entry._id,
        name: entry.name,
        type: entry.type ?? pack.metadata.type,
        pack: pack.collection,
        packLabel: pack.metadata.label,
        img: entry.img,
        _rank: rank,
      });
    }
  }

  rows.sort(byRankThenName);
  const results = rows.slice(0, limit ?? DEFAULT_SEARCH_LIMIT).map(({ _rank, ...row }) => row);
  return { results };
}

/** Clone-from-compendium core: resolve `uuid` (must be a compendium document —
 * never a world uuid, so this tool can never be used to duplicate an already-imported
 * actor), take its OWN `toObject()` verbatim (never a hand-authored pf2e `system.*`
 * payload), strip the id (Foundry regenerates one per copy) and set the resolved
 * folder, then create `quantity` copies via the forward-safe `getDocumentClass` (D5 /
 * v13->v15 deprecation note). Returns the actual created documents (not just a
 * compact row) — `create-token`'s `uuid` path (D13 "import-then-tokenize") needs the
 * real created Actor to call `getTokenDocument` on directly, not a re-fetch through
 * `game.actors` (Foundry's own world collection updates reactively on
 * `createDocuments`, but there's no cheaper way to get the SAME object back than just
 * keeping the one `createDocuments` already handed us). `tool`
 * names the actual calling tool ("import-from-compendium" or "create-token") for the
 * stamp each clone gets — additive onto `flags`, never disturbing whatever the source
 * compendium document's own flags already carried. */
export async function cloneFromCompendium(
  uuid: string,
  quantity: number,
  folder: string | undefined,
  tool: string,
): Promise<FoundryDocumentLike[]> {
  if (!uuid.startsWith("Compendium.")) {
    throw new BridgeError(
      "foundry-error",
      `import-from-compendium requires a compendium uuid (starting "Compendium."), got: ${uuid}`,
    );
  }
  const doc = await fromUuid(uuid);
  if (!doc) {
    throw new BridgeError("not-found", `not found: ${uuid}`);
  }
  const folderId = resolveFolderId(folder, doc.documentName);

  const base = doc.toObject();
  delete base._id;
  if (folderId !== undefined) base.folder = folderId;
  base.flags = withStamp(base.flags, tool);

  const docClass = getDocumentClass(doc.documentName);
  return docClass.createDocuments(
    Array.from({ length: quantity }, () => ({ ...base })),
    {},
  );
}

/** `import-from-compendium` — {@link cloneFromCompendium} plus the
 * compact-row projection this tool's result shape wants. */
async function importFromCompendium(
  uuid: string,
  quantity: number,
  folder: string | undefined,
): Promise<ImportedDocumentRow[]> {
  const created = await cloneFromCompendium(uuid, quantity, folder, "import-from-compendium");
  return created.map((c) => ({
    uuid: c.uuid,
    id: c.id,
    name: c.name,
    documentType: c.documentName,
  }));
}

/** `import-from-compendium`. */
async function handleImportFromCompendium(rawParams: unknown): Promise<ImportFromCompendiumResult> {
  const params = ImportFromCompendiumParams.parse(rawParams);
  try {
    writeGate(params.quantity);
    const rows = await importFromCompendium(params.uuid, params.quantity, params.folder);
    auditLog("import-from-compendium", params, `ok (${rows.length} created)`);
    return { rows };
  } catch (err) {
    auditLog("import-from-compendium", params, `denied/failed: ${String(err)}`);
    throw err;
  }
}

/** This module's handlers, keyed by tool name; `./index.ts` assembles them into
 * `TOOL_HANDLERS`. */
export const compendiumHandlers = {
  "list-compendium-packs": handleListCompendiumPacks,
  "search-compendium": handleSearchCompendium,
  "import-from-compendium": handleImportFromCompendium,
} satisfies Partial<BridgeToolHandlers>;
