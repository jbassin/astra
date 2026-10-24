/**
 * Generic world-document tools: fetch any document by uuid, search the world
 * collections by name, create a journal, and update or delete a document by uuid.
 */
import {
  CreateJournalParams,
  type CreateJournalResult,
  DeleteDocumentParams,
  type DeleteDocumentResult,
  GetDocumentParams,
  type GetDocumentResult,
  SearchWorldParams,
  type SearchWorldResult,
  UpdateDocumentParams,
  type UpdateDocumentResult,
  type WorldSearchRow,
  type WorldSearchType,
  type BridgeToolHandlers,
} from "@astra/portal-shared";

import { isDerivedPcPath } from "../pf2e";
import { BridgeHandlerError, byRankThenName, DEFAULT_SEARCH_LIMIT, matchRank } from "./shared";
import { auditLog, portalStamp, resolveFolderId, updateChecked, writeGate } from "./writes";

/** `get-document` (spec 0023 S4) — `fromUuid` is the one forward-safe resolver that
 * works uniformly across compendium (`Compendium.<pack>.<type>.<id>`) and world
 * (`Actor.<id>` etc.) uuids alike; the full `toObject()` payload crosses opaque (D5). */
async function handleGetDocument(rawParams: unknown): Promise<GetDocumentResult> {
  const { uuid } = GetDocumentParams.parse(rawParams);
  const doc = await fromUuid(uuid);
  if (!doc) {
    throw new BridgeHandlerError("not-found", `not found: ${uuid}`);
  }
  return { uuid, document: doc.toObject() };
}

/** The four world collections `search-world` can filter across — keyed by the wire's
 * `WorldSearchType` so `types` maps straight onto `game.<key>` with no branching. */
const WORLD_COLLECTIONS: Record<WorldSearchType, () => FoundryWorldCollection> = {
  actors: () => game.actors,
  items: () => game.items,
  journal: () => game.journal,
  scenes: () => game.scenes,
};

/** `search-world` (spec 0023 S4) — filters the requested world collections (all four
 * by default) by a case-insensitive substring match on name; same rank/merge/truncate
 * shape as `search-compendium` (one search idiom for both surfaces). */
function handleSearchWorld(rawParams: unknown): SearchWorldResult {
  const { query, types, limit } = SearchWorldParams.parse(rawParams);
  const needle = query.toLowerCase();
  const selected =
    types && types.length > 0 ? types : (Object.keys(WORLD_COLLECTIONS) as WorldSearchType[]);

  const rows: Array<WorldSearchRow & { _rank: number }> = [];
  for (const type of selected) {
    for (const doc of WORLD_COLLECTIONS[type]().values()) {
      const rank = matchRank(doc.name, needle);
      if (rank === undefined) continue;
      rows.push({
        uuid: doc.uuid,
        id: doc.id,
        name: doc.name,
        documentType: doc.documentName,
        folder: doc.folder?.name,
        _rank: rank,
      });
    }
  }

  rows.sort(byRankThenName);
  return { results: rows.slice(0, limit ?? DEFAULT_SEARCH_LIMIT).map(({ _rank, ...row }) => row) };
}

/** `update-document` (spec 0026 S3/D-10) — generic dot-path diff-merge update by
 * uuid, resolved the same forward-safe way `get-document` already does. The D-10
 * deny-list ONLY applies to `type: "character"` actors (NPCs/hazards/items/scenes/
 * macros have no such restriction); it's a pre-flight check on the REQUESTED keys,
 * not a read-back, so a denied path never reaches `doc.update()` at all. The audit
 * line carries the touched PATHS, never the values (0026 S3 scope — values may be
 * long HTML; the server-side audit already logs the full params). */
async function handleUpdateDocument(rawParams: unknown): Promise<UpdateDocumentResult> {
  const params = UpdateDocumentParams.parse(rawParams);
  const paths = Object.keys(params.updates);
  try {
    writeGate(1);
    const doc = await fromUuid(params.uuid);
    if (!doc) {
      throw new BridgeHandlerError("not-found", `not found: ${params.uuid}`);
    }
    if (doc.documentName === "Actor" && doc.type === "character") {
      const deniedPath = paths.find(isDerivedPcPath);
      if (deniedPath !== undefined) {
        throw new BridgeHandlerError(
          "validation-failed",
          `"${deniedPath}" is a derived path on a player character — pf2e recomputes it every ` +
            "data-prep cycle, so it can't be hand-set (update-document's description lists the " +
            "writable PC source paths instead)",
        );
      }
    }
    // Narrowing cast, not a lossy one (mirrors `createChecked`'s `as FoundryActor`):
    // every document `fromUuid` can resolve — Actor/Item/Scene/AmbientLight/Macro
    // alike — supports `update()` in real Foundry; `types/foundry.d.ts` keeps it off
    // the base `FoundryDocumentLike` only to confine the ripple to this one handler.
    await updateChecked(doc as FoundryMutableDocument, params.updates);
    const result: UpdateDocumentResult = { uuid: params.uuid, updatedPaths: paths };
    auditLog("update-document", { uuid: params.uuid, paths }, "ok");
    return result;
  } catch (err) {
    auditLog("update-document", { uuid: params.uuid, paths }, `denied/failed: ${String(err)}`);
    throw err;
  }
}

/** `delete-document` (spec 0026 S3/D-4) — refuses anything not stamped
 * `flags["astra-portal"].created === true` (D-6): portal can only clean up after
 * itself, never destroy hand-authored content. Works uniformly for world AND
 * embedded uuids (`Scene.<id>.AmbientLight.<id>`, `Actor.<id>.Item.<id>`) — `fromUuid`
 * resolves both, and Foundry's `document.delete()` on an embedded doc delegates to
 * its parent's `deleteEmbeddedDocuments` correctly on its own. */
async function handleDeleteDocument(rawParams: unknown): Promise<DeleteDocumentResult> {
  const params = DeleteDocumentParams.parse(rawParams);
  try {
    writeGate(1);
    const doc = await fromUuid(params.uuid);
    if (!doc) {
      throw new BridgeHandlerError("not-found", `not found: ${params.uuid}`);
    }
    const stamp = doc.flags?.["astra-portal"] as { created?: boolean } | undefined;
    if (stamp?.created !== true) {
      throw new BridgeHandlerError(
        "not-portal-created",
        `refusing to delete ${params.uuid} — it carries no astra-portal creation stamp; this ` +
          "tool can only delete documents portal itself created (D-4)",
      );
    }
    // Same narrowing-cast reasoning as `update-document`.
    await (doc as FoundryMutableDocument).delete();
    auditLog("delete-document", params, "ok");
    return { uuid: params.uuid, deleted: true };
  } catch (err) {
    auditLog("delete-document", params, `denied/failed: ${String(err)}`);
    throw err;
  }
}

/** `create-journal` (spec 0023 S5) — a v13 pf2e-independent write (no `system.*`
 * involved at all): a `JournalEntry` with one `JournalEntryPage` of type `"text"`
 * carrying the given HTML `content`. */
async function handleCreateJournal(rawParams: unknown): Promise<CreateJournalResult> {
  const params = CreateJournalParams.parse(rawParams);
  try {
    writeGate(1);
    const folderId = resolveFolderId(params.folder, "JournalEntry");
    const docClass = getDocumentClass("JournalEntry");
    const created = await docClass.create({
      name: params.name,
      folder: folderId,
      pages: [{ name: params.name, type: "text", text: { content: params.content } }],
      // 0026 D-6 retrofit: journals are a portal creation too.
      flags: portalStamp("create-journal"),
    });
    if (!created) {
      throw new BridgeHandlerError("foundry-error", "JournalEntry creation returned no document");
    }
    const result: CreateJournalResult = { uuid: created.uuid, id: created.id, name: created.name };
    auditLog("create-journal", params, "ok");
    return result;
  } catch (err) {
    auditLog("create-journal", params, `denied/failed: ${String(err)}`);
    throw err;
  }
}

/** This module's handlers, keyed by tool name; `./index.ts` assembles them into
 * `TOOL_HANDLERS`. */
export const documentHandlers = {
  "get-document": handleGetDocument,
  "search-world": handleSearchWorld,
  "create-journal": handleCreateJournal,
  "update-document": handleUpdateDocument,
  "delete-document": handleDeleteDocument,
} satisfies Partial<BridgeToolHandlers>;
