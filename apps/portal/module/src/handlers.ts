/**
 * The `CONFIG.queries` handler registry (Foundry 13's query-dispatch surface) — the
 * bridge WS's `query` messages are routed to a `portal.<method>` key here, per spec
 * 0023's module section. `registerHandlers()` populates the registry once, on the
 * `init` hook (before `ready` dials the bridge); `dispatchQuery` is the ONE place that
 * looks a method up and invokes it — `bridgeClient.ts` takes it as its injected
 * `dispatch` function, so every handler (this S3 slice's `portal.ping`, and S4/S5's
 * read/write tools) gets the same GM re-check + error wrapping for free.
 */
import {
  ApplyConditionParams,
  type ApplyConditionResult,
  type BridgeErrorCode,
  type CompendiumIndexRow,
  type CompendiumPackRow,
  type ConditionAction,
  type CreatedTokenRow,
  CreateActorParams,
  type CreateActorResult,
  CreateItemParams,
  type CreateItemResult,
  CreateJournalParams,
  type CreateJournalResult,
  CreateLightParams,
  type CreateLightResult,
  CreateMacroParams,
  type CreateMacroResult,
  CreateTokenParams,
  type CreateTokenResult,
  type CurrentSceneInfo,
  DeleteDocumentParams,
  type DeleteDocumentResult,
  ExecuteMacroParams,
  type ExecuteMacroResult,
  GetCurrentSceneParams,
  type GetCurrentSceneResult,
  GetDocumentParams,
  type GetDocumentResult,
  type ImportedDocumentRow,
  ImportFromCompendiumParams,
  type ImportFromCompendiumResult,
  ListCompendiumPacksParams,
  type ListCompendiumPacksResult,
  ListScenesParams,
  type ListScenesResult,
  type PartyCompanionRow,
  type PartyPcRow,
  type PersistentDamageParams,
  type PlayerFeatRow,
  type PlayerFeatsSection,
  type PlayerInventoryRow,
  type PlayerInventorySection,
  type PlayerNotesSection,
  type PlayerSaveRow,
  type PlayerSkillRow,
  type PlayerSkillsSection,
  type PlayerSpellcastingEntryGroup,
  type PlayerSpellRankGroup,
  type PlayerSpellRow,
  type PlayerSpellsSection,
  type PlayerStatsSection,
  type PlayerSummarySection,
  QueryPartyParams,
  type QueryPartyResult,
  QueryPlayerParams,
  type QueryPlayerResult,
  SearchCompendiumParams,
  type SearchCompendiumResult,
  SearchWorldParams,
  type SearchWorldResult,
  UpdateDocumentParams,
  type UpdateDocumentResult,
  type WorldSearchRow,
  type WorldSearchType,
} from "@astra/portal-shared";

import {
  MODULE_ID,
  SETTING_ALLOW_MACRO_EXECUTION,
  SETTING_ALLOW_WRITES,
  SETTING_BRIDGE_USER_ID,
} from "./constants";

/** Default `search-compendium`/`search-world` result cap when the caller doesn't
 * specify one — generous enough for an LLM to scan, small enough not to flood context. */
const DEFAULT_SEARCH_LIMIT = 25;

/** Ranks a substring match: an exact-prefix hit (`pos === 0`) always outranks any
 * later-position substring hit; ties break stably by name (spec 0023 S4 D12). */
function matchRank(name: string, needle: string): number | undefined {
  const pos = name.toLowerCase().indexOf(needle);
  if (pos === -1) return undefined;
  return pos === 0 ? 0 : pos + 1;
}

function byRankThenName<T extends { name: string }>(
  a: T & { _rank: number },
  b: T & { _rank: number },
): number {
  return a._rank - b._rank || a.name.localeCompare(b.name);
}

/** Thrown by {@link dispatchQuery}; `bridgeClient.ts` maps `.code` onto the wire
 * `McpResponse.error.code` verbatim (falling back to `foundry-error` for anything that
 * ISN'T a `BridgeHandlerError` — a handler that throws a bare `Error`, say). */
export class BridgeHandlerError extends Error {
  readonly code: BridgeErrorCode;

  constructor(code: BridgeErrorCode, message: string) {
    super(message);
    this.name = "BridgeHandlerError";
    this.code = code;
  }
}

/** `CONFIG.queries["portal.<method>"]`'s key, matching how the server addresses a
 * query (`bridge.sendQuery("portal.ping")` on the server side — see `mcp.ts`/`bridge.ts`). */
function queryKey(method: string): string {
  return `${MODULE_ID}.${method}`;
}

/** S3's one handler — proves the bridge end-to-end (spec 0023 S3 acceptance). Every
 * GM re-check happens in {@link dispatchQuery}, not per-handler, so this stays a plain
 * data-returning function. */
function handlePing(): { pong: true; worldId: string; system: string } {
  return { pong: true, worldId: game.world.id, system: game.system.id };
}

/** `list-compendium-packs` (spec 0023 S4) — every `game.packs` entry, so an LLM client
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

/** `search-compendium` (spec 0023 S4/D12) — live-iterate every candidate pack's index
 * (no precomputed cross-pack cache in v1, the D12 fast-follow), filter by a
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

/** `list-scenes` (spec 0023 S4) — every scene in the world, GM's own `active` flag. */
function handleListScenes(rawParams: unknown): ListScenesResult {
  ListScenesParams.parse(rawParams);
  const scenes = Array.from(game.scenes.values()).map((scene) => ({
    id: scene.id,
    name: scene.name,
    active: scene.active,
  }));
  return { scenes };
}

/** `get-current-scene` (spec 0023 S4) — `scene: null` when the world is idle (no active
 * scene) is a normal, non-error result: an idle world isn't a failure to report. */
function handleGetCurrentScene(rawParams: unknown): GetCurrentSceneResult {
  GetCurrentSceneParams.parse(rawParams);
  const scene = game.scenes.active;
  if (!scene) return { scene: null };
  const info: CurrentSceneInfo = {
    id: scene.id,
    name: scene.name,
    grid: { size: scene.grid.size, type: scene.grid.type },
    width: scene.width,
    height: scene.height,
    tokenCount: scene.tokens.size,
  };
  return { scene: info };
}

// ---------------------------------------------------------------------------
// S5 write tools (D5 clone-from-compendium ONLY / D8 write gate / D13
// import-then-tokenize) — spec 0023 Risks "Default-ON writes on a live campaign".
// ---------------------------------------------------------------------------

/** Hard, non-configurable defense-in-depth ceiling on any single write handler's
 * create count. The REAL, operator-tunable cap is `cfg.portal.maxCreatesPerRequest`
 * (default 10) — portal-server's `mcp.ts` enforces that one BEFORE a write query is
 * even forwarded over the bridge, so in the common case this module-side constant
 * never fires. It exists as a second, independent backstop in case a
 * differently-configured or buggy server ever forwards an oversized request anyway —
 * deliberately generous (well above any sane single-request batch) so it never gates
 * ahead of the real cap in practice. */
const MODULE_MAX_CREATES_CEILING = 50;

/** A structured, greppable console line for every write attempt (denied or not) — the
 * module-side half of the D8 audit trail (the server-side half lives in `mcp.ts`'s
 * `registerBridgeTool` `audit` flag). Deliberately plain `console.*`, not the
 * `BridgeClient`'s injected `log` callback: `dispatchQuery`/handlers have no reference
 * to that callback (it's `main.ts`-local), and D14's bridge-forwarded log-event wire
 * shape is a separate, not-yet-built feature — this is a local, always-on record. */
function auditLog(tool: string, params: unknown, outcome: string): void {
  console.log(
    `[${MODULE_ID} audit] tool=${tool} outcome=${outcome} params=${JSON.stringify(params)}`,
  );
}

/** The D8 write gate — every write handler calls this first, before touching any
 * Foundry document API. Three independent, typed-reason checks:
 *  (a) `game.user?.isGM` — re-checked here even though `dispatchQuery` already checks
 *      it for every query: this is the write-specific line of defense, so a future
 *      change to `dispatchQuery`'s own gate (e.g. relaxing it for some read-only
 *      method) can never accidentally loosen write auth too;
 *  (b) the `allow-write-operations` module setting (D8, default true);
 *  (c) `count` against the module's hard ceiling — see {@link MODULE_MAX_CREATES_CEILING}
 *      for why the REAL configured cap lives server-side instead.
 * Throws {@link BridgeHandlerError} on the first failing check.
 */
function writeGate(count: number): void {
  if (!game.user?.isGM) {
    throw new BridgeHandlerError("not-gm", "the connected Foundry session isn't a GM");
  }
  if (game.settings.get(MODULE_ID, SETTING_ALLOW_WRITES) === false) {
    throw new BridgeHandlerError(
      "writes-disabled",
      'write operations are disabled — enable the "Allow write operations" module setting',
    );
  }
  if (count > MODULE_MAX_CREATES_CEILING) {
    throw new BridgeHandlerError(
      "cap-exceeded",
      `requested ${count} creates, exceeding this module's hard ceiling of ${MODULE_MAX_CREATES_CEILING}`,
    );
  }
}

/** Resolves an existing world folder by name + document type (`import-from-
 * compendium`/`create-journal`'s `folder` param) — looked up, never created; an
 * explicit "not-found" beats a silent no-op. `undefined` in, `undefined` out. */
function resolveFolderId(folderName: string | undefined, documentType: string): string | undefined {
  if (folderName === undefined) return undefined;
  const match = Array.from(game.folders.values()).find(
    (f) => f.name === folderName && f.type === documentType,
  );
  if (!match) {
    throw new BridgeHandlerError(
      "not-found",
      `folder not found: "${folderName}" (type ${documentType})`,
    );
  }
  return match.id;
}

// ---------------------------------------------------------------------------
// S2 authoring tools (spec 0026 D-1 hybrid clone-or-hand-author, D-6 stamp, D-7
// read-back) — create-actor, create-item, create-light, create-macro.
// ---------------------------------------------------------------------------

/** D-6 — every document any portal tool creates gets this stamped into its `flags`,
 * additively merged alongside whatever flags the payload already carries. `delete-
 * document` (0026 S3) reads `flags["astra-portal"].created` back to refuse deleting
 * anything portal didn't make itself — so this must land on every create path (this
 * S2 slice's four new handlers AND the three 0023 write handlers below, retrofitted).
 * Never applied to an update — only to a document at the moment it's created. */
function portalStamp(tool: string): {
  "astra-portal": { created: true; tool: string; ts: string };
} {
  return { "astra-portal": { created: true, tool, ts: new Date().toISOString() } };
}

/** Merges a portal stamp (optionally plus more flag data) onto an existing `flags`
 * object without disturbing whatever the caller/base document already put there —
 * the additive-only half of D-6 (a hand-authored document's OWN flags, e.g. a cloned
 * compendium item's existing `flags.pf2e`, must survive untouched). */
function withStamp(
  existingFlags: unknown,
  tool: string,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  const base = (existingFlags && typeof existingFlags === "object" ? existingFlags : {}) as Record<
    string,
    unknown
  >;
  return foundry.utils.mergeObject(base, { ...portalStamp(tool), ...extra }, { inplace: false });
}

/** Detects Foundry's `DataModelValidationError` (D-7) without importing the class —
 * it isn't part of this module's deliberately-minimal ambient surface (see
 * `types/foundry.d.ts`'s header policy), so this checks the runtime error's own
 * name/constructor-name string instead of `instanceof`. Real Foundry throws this
 * exact class for a strictly-validated DataModel document (hazard/effect/condition/
 * melee/feat/action) rejecting a bad payload on create. */
function isDataModelValidationError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.name === "DataModelValidationError" || err.constructor.name === "DataModelValidationError"
  );
}

/** Wraps a `FoundryDocumentClass#create()` call, mapping a `DataModelValidationError`
 * to a typed `validation-failed` (D-7, message preserved verbatim — the caller is an
 * LLM, the error text is its repair loop) and a `create()` that resolved to nothing
 * to a typed `foundry-error`. */
async function createChecked(
  docClass: FoundryDocumentClass,
  data: Record<string, unknown>,
): Promise<FoundryDocumentLike> {
  let created: FoundryDocumentLike | undefined;
  try {
    created = await docClass.create(data);
  } catch (err) {
    if (isDataModelValidationError(err)) {
      throw new BridgeHandlerError(
        "validation-failed",
        err instanceof Error ? err.message : String(err),
      );
    }
    throw err;
  }
  if (!created) {
    throw new BridgeHandlerError("foundry-error", "document creation returned no document");
  }
  return created;
}

/** The minimal embedded-document-creating surface both `FoundryActor` and
 * `FoundryScene` share — narrow enough that either satisfies it structurally. */
interface EmbeddedDocumentHost {
  createEmbeddedDocuments(
    embeddedName: string,
    data: Record<string, unknown>[],
  ): Promise<FoundryDocumentLike[]>;
}

/** Same `DataModelValidationError` mapping as {@link createChecked}, for the embedded-
 * document creation path (`actor.createEmbeddedDocuments("Item", ...)`,
 * `scene.createEmbeddedDocuments("AmbientLight", ...)`). */
async function createEmbeddedChecked(
  host: EmbeddedDocumentHost,
  embeddedName: string,
  data: Record<string, unknown>[],
): Promise<FoundryDocumentLike[]> {
  try {
    return await host.createEmbeddedDocuments(embeddedName, data);
  } catch (err) {
    if (isDataModelValidationError(err)) {
      throw new BridgeHandlerError(
        "validation-failed",
        err instanceof Error ? err.message : String(err),
      );
    }
    throw err;
  }
}

/** Mirrors {@link createChecked} for the mutation path (0026 S3 D-10) — maps a
 * `DataModelValidationError` from `doc.update()` to the same typed `validation-failed`
 * (Foundry's message preserved verbatim; the caller is an LLM, the message IS its
 * repair loop). `update-document` is the only caller. */
async function updateChecked(
  doc: FoundryMutableDocument,
  updates: Record<string, unknown>,
): Promise<void> {
  try {
    await doc.update(updates);
  } catch (err) {
    if (isDataModelValidationError(err)) {
      throw new BridgeHandlerError(
        "validation-failed",
        err instanceof Error ? err.message : String(err),
      );
    }
    throw err;
  }
}

/** D-7 RE read-back: after an item is created OWNED (embedded on an actor — only then
 * does pf2e instantiate rule elements at data-prep), inspect what actually came back.
 * Two findings, both surfaced as plain strings naming the item:
 *  - an instantiated rule element with `ignored === true` (a bad/unknown RE — pf2e
 *    `console.warn`s and inerts it rather than failing the create);
 *  - a `system.rules` source entry that produced no instantiated rule at all.
 * Defensive by design: if the created document doesn't even expose a `rules` array
 * (a stub, or some future Foundry surface change), this reports NO warnings rather
 * than guessing — an absent `rules` property is "unknown", not "everything failed". */
function collectRuleWarnings(
  itemName: string,
  sentSystem: Record<string, unknown> | undefined,
  created: FoundryItemLike,
): string[] {
  if (created.rules === undefined) return [];
  const warnings: string[] = [];
  created.rules.forEach((re, i) => {
    if (re && re.ignored === true) {
      const key = re.key !== undefined ? ` (key: ${re.key})` : "";
      warnings.push(`item "${itemName}": rule element ${i}${key} was ignored at data-prep`);
    }
  });
  const sourceRules = sentSystem?.rules;
  const sourceCount = Array.isArray(sourceRules) ? sourceRules.length : 0;
  if (sourceCount > created.rules.length) {
    warnings.push(
      `item "${itemName}": ${sourceCount - created.rules.length} of ${sourceCount} rule ` +
        "element(s) in system.rules produced no instantiated rule",
    );
  }
  return warnings;
}

/** D-1 hybrid clone+patch core, shared by `create-actor`/`create-item`: resolve a
 * compendium `baseUuid` (never a world uuid — mirrors `cloneFromCompendium`'s own
 * guard), take its `toObject()` verbatim, strip the id, then deep-merge the caller's
 * `name`/`system`/`img` on top via `foundry.utils.mergeObject` (never mutates the
 * source compendium document — `toObject()` already handed back a fresh plain
 * object). Returns `undefined` when no `baseUuid` was given, so callers build a
 * from-scratch payload instead (D-1's other branch). */
async function resolveBasePayload(
  baseUuid: string | undefined,
  patch: { name: string; system?: Record<string, unknown>; img?: string },
): Promise<Record<string, unknown> | undefined> {
  if (baseUuid === undefined) return undefined;
  if (!baseUuid.startsWith("Compendium.")) {
    throw new BridgeHandlerError(
      "foundry-error",
      `baseUuid must be a compendium uuid (starting "Compendium."), got: ${baseUuid}`,
    );
  }
  const doc = await fromUuid(baseUuid);
  if (!doc) {
    throw new BridgeHandlerError("not-found", `not found: ${baseUuid}`);
  }
  const base = doc.toObject();
  delete base._id;
  const patchData: Record<string, unknown> = { name: patch.name };
  if (patch.system !== undefined) patchData.system = patch.system;
  if (patch.img !== undefined) patchData.img = patch.img;
  return foundry.utils.mergeObject(base, patchData, { inplace: false });
}

/** `create-actor` (spec 0026 S2/D-1/D-6/D-7) — hand-authors a new NPC/hazard actor
 * from scratch, or clones+patches a compendium base (`baseUuid`), then creates any
 * embedded `items[]` alongside it in the same call. `writeGate` counts the actor
 * itself plus every requested item (D-8); the actor's own creation never gets a RE
 * read-back (actors don't carry rule elements directly), but each embedded item does
 * once it's OWNED by the actor (D-7). */
async function handleCreateActor(rawParams: unknown): Promise<CreateActorResult> {
  const params = CreateActorParams.parse(rawParams);
  const itemCount = params.items?.length ?? 0;
  try {
    writeGate(1 + itemCount);
    const folderId = resolveFolderId(params.folder, "Actor");

    const base = await resolveBasePayload(params.baseUuid, {
      name: params.name,
      system: params.system,
      img: params.img,
    });
    const payload: Record<string, unknown> = base ?? {
      name: params.name,
      type: params.type,
      ...(params.system !== undefined ? { system: params.system } : {}),
      ...(params.img !== undefined ? { img: params.img } : {}),
    };
    if (folderId !== undefined) payload.folder = folderId;
    payload.flags = withStamp(payload.flags, "create-actor");

    const docClass = getDocumentClass("Actor");
    // Narrowing cast, not a lossy one: `getDocumentClass("Actor").create()` always
    // mints a real Actor document (which always carries `createEmbeddedDocuments`);
    // `createChecked`'s own return type stays the general `FoundryDocumentLike`
    // because it's shared by every document type this module creates.
    const actor = (await createChecked(docClass, payload)) as FoundryActor;

    let itemUuids: string[] | undefined;
    const warnings: string[] = [];
    if (params.items !== undefined && params.items.length > 0) {
      const itemsWithStamps = params.items.map((item) => ({
        ...item,
        flags: withStamp(item.flags, "create-actor"),
      }));
      const createdItems = await createEmbeddedChecked(actor, "Item", itemsWithStamps);
      itemUuids = createdItems.map((it) => it.uuid);
      createdItems.forEach((it, i) => {
        const source = params.items?.[i];
        warnings.push(
          ...collectRuleWarnings(
            it.name,
            source?.system as Record<string, unknown> | undefined,
            it as FoundryItemLike,
          ),
        );
      });
    }

    const result: CreateActorResult = {
      uuid: actor.uuid,
      id: actor.id,
      name: actor.name,
      itemUuids,
      warnings,
    };
    auditLog(
      "create-actor",
      params,
      `ok (actor ${actor.id}${itemUuids ? `, ${itemUuids.length} item(s)` : ""})`,
    );
    return result;
  } catch (err) {
    auditLog("create-actor", params, `denied/failed: ${String(err)}`);
    throw err;
  }
}

/** `create-item` (spec 0026 S2/D-1/D-6/D-7) — hand-authors a new item from scratch or
 * clones+patches a compendium base, either as a standalone world item or embedded
 * directly on an actor (`actorId`). `rulesSelections` pre-seeds
 * `flags.pf2e.rulesSelections` (the ChoiceSet-modal-avoidance pass-through, spec
 * Verified footprint). Only the actor-embedded path gets a RE read-back — a world
 * item has no owner, so pf2e never instantiates its rule elements at all. */
async function handleCreateItem(rawParams: unknown): Promise<CreateItemResult> {
  const params = CreateItemParams.parse(rawParams);
  try {
    writeGate(1);

    const base = await resolveBasePayload(params.baseUuid, {
      name: params.name,
      system: params.system,
      img: params.img,
    });
    const payload: Record<string, unknown> = base ?? {
      name: params.name,
      type: params.type,
      ...(params.system !== undefined ? { system: params.system } : {}),
      ...(params.img !== undefined ? { img: params.img } : {}),
    };
    payload.flags = withStamp(
      payload.flags,
      "create-item",
      params.rulesSelections !== undefined
        ? { pf2e: { rulesSelections: params.rulesSelections } }
        : undefined,
    );
    const sentSystem = payload.system as Record<string, unknown> | undefined;

    let created: FoundryDocumentLike;
    let warnings: string[] = [];
    if (params.actorId !== undefined) {
      const actor = game.actors.get(params.actorId);
      if (!actor) {
        throw new BridgeHandlerError("not-found", `actor not found: ${params.actorId}`);
      }
      const [item] = await createEmbeddedChecked(actor, "Item", [payload]);
      if (!item) {
        throw new BridgeHandlerError("foundry-error", "item creation returned no document");
      }
      created = item;
      warnings = collectRuleWarnings(item.name, sentSystem, item as FoundryItemLike);
    } else {
      // World items have no owning actor, so pf2e's data-prep (which instantiates
      // rule elements) never runs on them — there is nothing to read back (D-7).
      const docClass = getDocumentClass("Item");
      created = await createChecked(docClass, payload);
    }

    const result: CreateItemResult = {
      uuid: created.uuid,
      id: created.id,
      name: created.name,
      warnings,
    };
    auditLog("create-item", params, `ok (${created.id})`);
    return result;
  } catch (err) {
    auditLog("create-item", params, `denied/failed: ${String(err)}`);
    throw err;
  }
}

/** `create-light` (spec 0026 S2/D-13/D-6) — places a new `AmbientLight` embedded
 * document on a scene (an explicit `sceneId`, or the active scene when omitted),
 * mapping the wire's `config` subset onto Foundry's `LightData` shape 1:1. Returns
 * only the created light's embedded uuid, hand-built as `Scene.<id>.AmbientLight.
 * <id>` (D-13 — there is no scene-read tool to fetch it back through). */
async function handleCreateLight(rawParams: unknown): Promise<CreateLightResult> {
  const params = CreateLightParams.parse(rawParams);
  try {
    writeGate(1);
    const scene =
      params.sceneId !== undefined ? game.scenes.get(params.sceneId) : game.scenes.active;
    if (!scene) {
      throw new BridgeHandlerError(
        "not-found",
        params.sceneId !== undefined
          ? `scene not found: ${params.sceneId}`
          : "no active scene — open a scene in Foundry, or pass sceneId",
      );
    }

    const config: Record<string, unknown> = {};
    const c = params.config;
    if (c?.bright !== undefined) config.bright = c.bright;
    if (c?.dim !== undefined) config.dim = c.dim;
    if (c?.color !== undefined) config.color = c.color;
    if (c?.alpha !== undefined) config.alpha = c.alpha;
    if (c?.angle !== undefined) config.angle = c.angle;
    if (c?.negative !== undefined) config.negative = c.negative;
    if (c?.animation !== undefined) {
      const animation: Record<string, unknown> = {};
      if (c.animation.type !== undefined) animation.type = c.animation.type;
      if (c.animation.speed !== undefined) animation.speed = c.animation.speed;
      if (c.animation.intensity !== undefined) animation.intensity = c.animation.intensity;
      config.animation = animation;
    }
    if (c?.darkness !== undefined) {
      const darkness: Record<string, unknown> = {};
      if (c.darkness.min !== undefined) darkness.min = c.darkness.min;
      if (c.darkness.max !== undefined) darkness.max = c.darkness.max;
      config.darkness = darkness;
    }

    const lightData: Record<string, unknown> = {
      x: params.x,
      y: params.y,
      hidden: params.hidden ?? false,
      config,
      flags: portalStamp("create-light"),
    };
    const [created] = await createEmbeddedChecked(scene, "AmbientLight", [lightData]);
    if (!created) {
      throw new BridgeHandlerError("foundry-error", "AmbientLight creation returned no document");
    }
    const lightUuid = `Scene.${scene.id}.AmbientLight.${created.id}`;
    const result: CreateLightResult = { sceneId: scene.id, lightUuid, warnings: [] };
    auditLog("create-light", params, `ok (${lightUuid})`);
    return result;
  } catch (err) {
    auditLog("create-light", params, `denied/failed: ${String(err)}`);
    throw err;
  }
}

/** `create-macro` (spec 0026 S2/D-6/D-9) — creates a script or chat macro; verified
 * (spec Verified footprint) that Foundry NEVER executes a macro on create, only via
 * the separate `execute-macro` tool (0026 S3). D-9's audit-the-full-command-text
 * requirement is satisfied for free: {@link auditLog} already serializes the whole
 * `params` object, which carries `command` verbatim. */
async function handleCreateMacro(rawParams: unknown): Promise<CreateMacroResult> {
  const params = CreateMacroParams.parse(rawParams);
  try {
    writeGate(1);
    const docClass = getDocumentClass("Macro");
    const created = await createChecked(docClass, {
      name: params.name,
      type: params.macroType,
      command: params.command,
      img: params.img,
      flags: portalStamp("create-macro"),
    });
    const result: CreateMacroResult = {
      uuid: created.uuid,
      id: created.id,
      name: created.name,
      warnings: [],
    };
    auditLog("create-macro", params, `ok (${created.id})`);
    return result;
  } catch (err) {
    auditLog("create-macro", params, `denied/failed: ${String(err)}`);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// S3 authoring tools (spec 0026 D-4/D-9/D-10/D-14) — apply-condition,
// update-document, delete-document, execute-macro.
// ---------------------------------------------------------------------------

/** Looks up one of {@link FoundryActor}'s three ConditionManager-backed mutators and
 * throws a typed `foundry-error` (naming the method) if it's missing at runtime,
 * rather than a raw `TypeError` — defense in depth even though the ambient type
 * declares all three as required (this module targets pf2e exclusively, `types/
 * foundry.d.ts`'s `FoundryActor` doc comment). */
function requireActorMethod<
  K extends "increaseCondition" | "decreaseCondition" | "toggleCondition",
>(actor: FoundryActor, method: K): FoundryActor[K] {
  const fn = actor[method];
  if (typeof fn !== "function") {
    throw new BridgeHandlerError(
      "foundry-error",
      `actor does not support ${method} — is this world running the pf2e system?`,
    );
  }
  return fn;
}

/** D-14 read-back: after ANY apply-condition action, report the resulting state by
 * inspecting the actor's own `itemTypes.condition` array directly — the same surface
 * `ActorPF2e#increaseCondition` itself reads internally (verified `pf2e-7.12.2`
 * `src/module/actor/base.ts:1777`) — rather than trusting any one action method's own
 * return value (increase/decrease/toggle each return a different, inconsistent
 * shape: the condition itself, `void`, or a `boolean`). */
function readConditionState(
  actor: FoundryActor,
  slug: string,
): { active: boolean; value?: number } {
  const match = actor.itemTypes.condition.find((c) => c.slug === slug && c.active);
  return { active: match !== undefined, value: match?.value ?? undefined };
}

/** D-14's persistent-damage special case, verified against pf2e-7.12.2's own
 * `PersistentDamageEditor#onClickAdd` (`src/module/item/condition/persistent-damage-
 * editor.ts:114-130`): a persistent-damage instance is created by taking
 * `game.pf2e.ConditionManager.getCondition("persistent-damage").toObject()` and
 * deep-merging `{system: {persistent: {formula, damageType, dc}}}` on top, then
 * `actor.createEmbeddedDocuments("Item", [...])` — NEVER `actor.increaseCondition`,
 * which for this one slug opens `PersistentDamageEditor` as a GM-browser dialog
 * instead of creating anything at all (`src/module/actor/base.ts:1766-1770`), a UI
 * trigger this bridge must never cause. The created item is portal-stamped (D-6) like
 * every other document this module creates. */
async function createPersistentDamage(
  actor: FoundryActor,
  persistentDamage: PersistentDamageParams | undefined,
): Promise<void> {
  if (!persistentDamage) {
    throw new BridgeHandlerError(
      "validation-failed",
      "persistent-damage requires persistentDamage: {formula, damageType, dc?} — increasing " +
        "this condition without them would otherwise open an editor dialog in the GM's own " +
        "browser, which this bridge never triggers",
    );
  }
  if (typeof game.pf2e?.ConditionManager?.getCondition !== "function") {
    throw new BridgeHandlerError(
      "foundry-error",
      "game.pf2e.ConditionManager is not available — is this world running the pf2e system?",
    );
  }
  const base = game.pf2e.ConditionManager.getCondition("persistent-damage").toObject();
  const persistentSource = foundry.utils.mergeObject(
    base,
    {
      system: {
        persistent: {
          formula: persistentDamage.formula,
          damageType: persistentDamage.damageType,
          dc: persistentDamage.dc,
        },
      },
    },
    { inplace: false },
  );
  persistentSource.flags = withStamp(persistentSource.flags, "apply-condition");
  await createEmbeddedChecked(actor, "Item", [persistentSource]);
}

/** Routes a `persistent-damage` `apply-condition` call to the non-dialog path
 * ({@link createPersistentDamage}) or, when the call is actually a removal, to pf2e's
 * OWN `decreaseCondition` — which already special-cases persistent-damage as a plain
 * delete-by-key with no dialog risk at all (`src/module/actor/base.ts:1745-1750`), so
 * that half needs no bespoke handling here. A `toggle` decides which branch it is by
 * reading the CURRENT state first (D-14 read-back, reused for the decision as well as
 * the result). */
async function applyPersistentDamage(
  actor: FoundryActor,
  action: ConditionAction,
  persistentDamage: PersistentDamageParams | undefined,
): Promise<void> {
  const currentlyActive = readConditionState(actor, "persistent-damage").active;
  const removing = action === "decrease" || (action === "toggle" && currentlyActive);
  if (removing) {
    await requireActorMethod(actor, "decreaseCondition").call(actor, "persistent-damage");
    return;
  }
  // "increase", or a toggle turning it ON — both need the non-dialog create.
  await createPersistentDamage(actor, persistentDamage);
}

/** Every non-`persistent-damage` slug: pf2e's own `ConditionManager`-backed actor
 * methods handle add/remove/toggle correctly with no dialog risk (D-14) — this
 * module never hand-builds a condition item for these. `decreaseCondition` takes no
 * amount parameter of its own (`pf2e-7.12.2` `src/module/actor/base.ts:1737-1759`
 * steps by exactly 1 per call), so a `decrease` with `value > 1` is applied as that
 * many sequential calls; `increaseCondition`'s own `value` option IS an addend, so
 * `increase` needs only one call. */
async function applyStandardCondition(
  actor: FoundryActor,
  slug: string,
  action: ConditionAction,
  value: number | undefined,
): Promise<void> {
  if (action === "increase") {
    const fn = requireActorMethod(actor, "increaseCondition");
    await fn.call(actor, slug, value !== undefined ? { value } : undefined);
  } else if (action === "decrease") {
    const fn = requireActorMethod(actor, "decreaseCondition");
    for (let i = 0; i < (value ?? 1); i++) {
      await fn.call(actor, slug);
    }
  } else {
    await requireActorMethod(actor, "toggleCondition").call(actor, slug);
  }
}

/** `apply-condition` (spec 0026 S3/D-14) — wraps `game.pf2e.ConditionManager`'s own
 * actor-side surface for increase/decrease/toggle; never hand-builds a condition
 * item except in the persistent-damage non-dialog path (see
 * {@link applyPersistentDamage}). `writeGate(1)` because this IS a write (it creates
 * or mutates a condition item embedded on the actor) even though it never counts
 * against the D-8 create cap (server `mcp.ts` registers no `creates` for this tool). */
async function handleApplyCondition(rawParams: unknown): Promise<ApplyConditionResult> {
  const params = ApplyConditionParams.parse(rawParams);
  try {
    writeGate(1);
    const actor = game.actors.get(params.actorId);
    if (!actor) {
      throw new BridgeHandlerError("not-found", `actor not found: ${params.actorId}`);
    }

    if (params.slug === "persistent-damage") {
      await applyPersistentDamage(actor, params.action, params.persistentDamage);
    } else {
      await applyStandardCondition(actor, params.slug, params.action, params.value);
    }

    const state = readConditionState(actor, params.slug);
    const result: ApplyConditionResult = {
      actorUuid: actor.uuid,
      slug: params.slug,
      active: state.active,
      value: state.value,
    };
    auditLog(
      "apply-condition",
      params,
      `ok (${params.slug} ${params.action} on ${actor.id} -> active=${state.active})`,
    );
    return result;
  } catch (err) {
    auditLog("apply-condition", params, `denied/failed: ${String(err)}`);
    throw err;
  }
}

/** The known-derived PC source paths (0026 D-10) — `CharacterSystemSource` types
 * `perception`/`saves`/`traits` as `never` and AC/class DC are computed every prep
 * cycle, so hand-setting any of these on a `type: "character"` actor would either be
 * silently discarded or corrupt data-prep. Segment-boundary matched (`key === prefix
 * || key.startsWith(prefix + ".")`) so e.g. "system.perceptionFoo" — NOT an actual
 * derived path — is never falsely caught. */
const PC_DERIVED_PATH_PREFIXES = [
  "system.saves",
  "system.perception",
  "system.traits",
  "system.attributes.ac",
  "system.attributes.classDC",
];

function isDerivedPcPath(path: string): boolean {
  return PC_DERIVED_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}.`),
  );
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
    // Same narrowing-cast reasoning as `update-document` above.
    await (doc as FoundryMutableDocument).delete();
    auditLog("delete-document", params, "ok");
    return { uuid: params.uuid, deleted: true };
  } catch (err) {
    auditLog("delete-document", params, `denied/failed: ${String(err)}`);
    throw err;
  }
}

/** Foundry's `Macro#execute()` return value is arbitrary script-macro JS output (or
 * `undefined` for a chat macro / a script that returns nothing) — best-effort
 * JSON-stringified and capped so one wildly chatty macro can't blow up the tool
 * result size; `String(value)` is the fallback for anything `JSON.stringify` itself
 * can't handle (e.g. a value containing a BigInt). */
const EXECUTE_MACRO_RETURN_CAP = 8 * 1024; // 8 KiB

function stringifyReturned(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  let text: string;
  try {
    const json = JSON.stringify(value);
    text = json === undefined ? String(value) : json;
  } catch {
    text = String(value);
  }
  return text.length > EXECUTE_MACRO_RETURN_CAP
    ? `${text.slice(0, EXECUTE_MACRO_RETURN_CAP)}… (truncated)`
    : text;
}

/** `execute-macro` (spec 0026 S3/D-9) — runs an existing world macro immediately, as
 * the GM. Gated by BOTH the normal write gate and the module's own `allow-macro-
 * execution` setting, independently switchable off without touching `allow-write-
 * operations` — reuses the `writes-disabled` code (D-11's final error-code list has
 * no separate "execution-disabled" entry) with a message naming THIS specific
 * setting, so an LLM client can still tell the two refusals apart by text even though
 * `.code` is shared. A macro's own command text was already audited in full at
 * create (create-macro, D-9); this audit line only ever needs id+name+outcome. */
async function handleExecuteMacro(rawParams: unknown): Promise<ExecuteMacroResult> {
  const params = ExecuteMacroParams.parse(rawParams);
  try {
    writeGate(1);
    if (game.settings.get(MODULE_ID, SETTING_ALLOW_MACRO_EXECUTION) === false) {
      throw new BridgeHandlerError(
        "writes-disabled",
        'macro execution is disabled — enable the "Allow macro execution" module setting ' +
          "(other writes are unaffected by this setting)",
      );
    }
    const macro = game.macros.get(params.macroId);
    if (!macro) {
      throw new BridgeHandlerError("not-found", `macro not found: ${params.macroId}`);
    }
    let returned: unknown;
    try {
      returned = await macro.execute();
    } catch (err) {
      throw new BridgeHandlerError(
        "execution-failed",
        err instanceof Error ? err.message : String(err),
      );
    }
    const result: ExecuteMacroResult = {
      macroId: params.macroId,
      returned: stringifyReturned(returned),
    };
    auditLog("execute-macro", params, `ok (macro ${macro.id} "${macro.name}")`);
    return result;
  } catch (err) {
    auditLog("execute-macro", params, `denied/failed: ${String(err)}`);
    throw err;
  }
}

/** Clone-from-compendium core (D5): resolve `uuid` (must be a compendium document —
 * never a world uuid, so this tool can never be used to duplicate an already-imported
 * actor), take its OWN `toObject()` verbatim (never a hand-authored pf2e `system.*`
 * payload), strip the id (Foundry regenerates one per copy) and set the resolved
 * folder, then create `quantity` copies via the forward-safe `getDocumentClass` (D5 /
 * v13->v15 deprecation note). Returns the actual created documents (not just a
 * compact row) — `create-token`'s `uuid` path (D13 "import-then-tokenize") needs the
 * real created Actor to call `getTokenDocument` on directly, not a re-fetch through
 * `game.actors` (Foundry's own world collection updates reactively on
 * `createDocuments`, but there's no cheaper way to get the SAME object back than just
 * keeping the one `createDocuments` already handed us). `tool` (0026 D-6 retrofit)
 * names the actual calling tool ("import-from-compendium" or "create-token") for the
 * stamp each clone gets — additive onto `flags`, never disturbing whatever the source
 * compendium document's own flags already carried. */
async function cloneFromCompendium(
  uuid: string,
  quantity: number,
  folder: string | undefined,
  tool: string,
): Promise<FoundryDocumentLike[]> {
  if (!uuid.startsWith("Compendium.")) {
    throw new BridgeHandlerError(
      "foundry-error",
      `import-from-compendium requires a compendium uuid (starting "Compendium."), got: ${uuid}`,
    );
  }
  const doc = await fromUuid(uuid);
  if (!doc) {
    throw new BridgeHandlerError("not-found", `not found: ${uuid}`);
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

/** `import-from-compendium` (spec 0023 S5/D5) — {@link cloneFromCompendium} plus the
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

/** `import-from-compendium` (spec 0023 S5/D5). */
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

/** `create-token` (spec 0023 S5/D13 "import-then-tokenize") — resolves the actor
 * either from an existing world `actorId` or by importing `uuid` first (reusing
 * {@link importFromCompendium}, so the same clone-only/folder/write-gate rules apply
 * either way), then drops `quantity` tokens onto the active scene, each offset by one
 * grid square so they don't stack exactly on top of each other. */
async function handleCreateToken(rawParams: unknown): Promise<CreateTokenResult> {
  const params = CreateTokenParams.parse(rawParams);
  try {
    writeGate(params.quantity);
    const scene = game.scenes.active;
    if (!scene) {
      throw new BridgeHandlerError("not-found", "no active scene — open a scene in Foundry first");
    }

    let actor: FoundryActor;
    if (params.actorId !== undefined) {
      const found = game.actors.get(params.actorId);
      if (!found) {
        throw new BridgeHandlerError("not-found", `actor not found: ${params.actorId}`);
      }
      actor = found;
    } else {
      // The params refine guarantees exactly one of uuid/actorId is set. Use the
      // FRESHLY created document directly (cloneFromCompendium, not the compact-row
      // importFromCompendium) — no need to round-trip through game.actors.get, and it
      // sidesteps relying on exactly when/how the world collection updates.
      const [imported] = await cloneFromCompendium(
        params.uuid as string,
        1,
        undefined,
        "create-token",
      );
      if (!imported) {
        throw new BridgeHandlerError("foundry-error", "import produced no document to tokenize");
      }
      // A pf2e Actor compendium clone always creates a real Actor document, which
      // Foundry always instantiates with getTokenDocument — this narrows the general
      // FoundryDocumentLike createDocuments returns back to the actor-specific surface.
      actor = imported as FoundryActor;
    }

    const gridSize = scene.grid.size || 100;
    const tokenData: Record<string, unknown>[] = [];
    for (let i = 0; i < params.quantity; i++) {
      const tokenDoc = await actor.getTokenDocument({
        x: params.x + i * gridSize,
        y: params.y + i * gridSize,
      });
      const obj = tokenDoc.toObject();
      // 0026 D-6 retrofit: the token document itself is a portal creation too.
      obj.flags = withStamp(obj.flags, "create-token");
      tokenData.push(obj);
    }
    const createdTokens = await scene.createEmbeddedDocuments("Token", tokenData);
    const tokens: CreatedTokenRow[] = createdTokens.map((t, i) => {
      const obj = t.toObject();
      return {
        id: t.id,
        x: typeof obj.x === "number" ? obj.x : params.x + i * gridSize,
        y: typeof obj.y === "number" ? obj.y : params.y + i * gridSize,
      };
    });

    const result: CreateTokenResult = {
      actor: { uuid: actor.uuid, id: actor.id, name: actor.name },
      tokens,
      sceneId: scene.id,
    };
    auditLog("create-token", params, `ok (${tokens.length} token(s) on scene ${scene.id})`);
    return result;
  } catch (err) {
    auditLog("create-token", params, `denied/failed: ${String(err)}`);
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

// ---------------------------------------------------------------------------
// 0028 S2 — query-party / query-player (the player-key read-only tool subset).
// Module -> server wire stays typed compact JSON (D5); the SERVER renders markdown
// (D28-6, portal-server's markdown.ts) — every builder below returns plain data,
// never a string of prose.
// ---------------------------------------------------------------------------

/** Case-insensitive exact-then-unambiguous-prefix name resolution (D28-13), shared by
 * `query-player`'s `name` param. Throws typed `ambiguous-name` (additive `BridgeErrorCode`
 * member) naming every candidate when neither pass narrows to exactly one, or `not-found`
 * when nothing matches at all. */
function resolveByName<T extends { name: string }>(candidates: T[], name: string): T {
  const needle = name.toLowerCase();
  const exact = candidates.filter((c) => c.name.toLowerCase() === needle);
  if (exact.length === 1) return exact[0] as T;
  if (exact.length > 1) throw ambiguousNameError(name, exact);
  const prefixed = candidates.filter((c) => c.name.toLowerCase().startsWith(needle));
  if (prefixed.length === 1) return prefixed[0] as T;
  if (prefixed.length > 1) throw ambiguousNameError(name, prefixed);
  throw new BridgeHandlerError("not-found", `no actor found matching name: "${name}"`);
}

function ambiguousNameError(name: string, candidates: { name: string }[]): BridgeHandlerError {
  const list = candidates.map((c) => c.name).join(", ");
  return new BridgeHandlerError(
    "ambiguous-name",
    `"${name}" matches ${candidates.length} actors: ${list} — retry with a uuid instead`,
  );
}

/** `query-party` (0028 S2/D28-4) — resolves the party actor(s) by `type === "party"`
 * AT QUERY TIME (never hardcoded, spec Verified footprint), unions every resolved
 * party's `system.details.members` uuid refs (pf2e allows multiple parties; this
 * world has one), then splits each resolved member into a full PC row (`type ===
 * "character"`) or a labeled minimal companion row (anything else — the live world's
 * familiar Othello is the verified case). A member uuid that no longer resolves
 * (stale reference) is skipped, not a failure — one dangling ref shouldn't sink the
 * whole roster. Zero party actors in the world is the one hard failure (typed
 * `not-found`, per the spec's adversarial-pass answer on a missing/renamed party). */
async function handleQueryParty(rawParams: unknown): Promise<QueryPartyResult> {
  QueryPartyParams.parse(rawParams);
  const parties = Array.from(game.actors.values()).filter((a) => a.type === "party");
  if (parties.length === 0) {
    throw new BridgeHandlerError("not-found", "no party actor found in this world");
  }

  const memberUuids = new Set<string>();
  let partyName: string | undefined;
  for (const party of parties) {
    partyName ??= party.name;
    const raw = party.toObject();
    const system = (raw.system ?? {}) as Record<string, unknown>;
    const details = (system.details ?? {}) as Record<string, unknown>;
    const members = Array.isArray(details.members) ? (details.members as unknown[]) : [];
    for (const member of members) {
      const uuid = (member as { uuid?: unknown } | null)?.uuid;
      if (typeof uuid === "string") memberUuids.add(uuid);
    }
  }

  const pcs: PartyPcRow[] = [];
  const companions: PartyCompanionRow[] = [];
  for (const uuid of memberUuids) {
    const doc = await fromUuid(uuid);
    if (!doc) continue; // a stale member reference — skip, never fail the whole roster
    if (doc.type === "character") {
      pcs.push(buildPartyPcRow(doc));
    } else {
      companions.push(buildPartyCompanionRow(doc));
    }
  }
  return { partyName, pcs, companions };
}

/** Best-effort owner-player-name resolution (D28-4's roster row) — an OWNER-level
 * (3) `ownership` entry (excluding the special `"default"` key) resolved against
 * `game.users`, skipping the GM's own OWNER grant (every document carries one). Omits
 * the field entirely rather than guessing when nothing resolves. */
function resolveOwnerPlayer(ownership: unknown): string | undefined {
  const OWNER_LEVEL = 3;
  if (!ownership || typeof ownership !== "object") return undefined;
  for (const [userId, level] of Object.entries(ownership as Record<string, unknown>)) {
    if (userId === "default" || level !== OWNER_LEVEL) continue;
    const user = game.users.get(userId);
    if (user && !user.isGM) return user.name;
  }
  return undefined;
}

function buildPartyPcRow(doc: FoundryDocumentLike): PartyPcRow {
  const raw = doc.toObject();
  const system = (raw.system ?? {}) as Record<string, unknown>;
  const details = (system.details ?? {}) as Record<string, unknown>;
  const attributes = (system.attributes ?? {}) as Record<string, unknown>;
  const resources = (system.resources ?? {}) as Record<string, unknown>;
  const items = Array.isArray(raw.items) ? (raw.items as Record<string, unknown>[]) : [];
  const ancestry = items.find((i) => i.type === "ancestry")?.name;
  const className = items.find((i) => i.type === "class")?.name;
  // The live doc's own `system` (not toObject()'s stored source) carries hp.max —
  // pf2e derives it at prepareDerivedData; source only ever stores {value, temp}.
  const liveHp = (doc.system?.attributes as Record<string, unknown> | undefined)?.hp as
    | Record<string, unknown>
    | undefined;
  const hp = liveHp ?? (attributes.hp as Record<string, unknown> | undefined);
  const heroPoints = resources.heroPoints as Record<string, unknown> | undefined;
  const level = (details.level as Record<string, unknown> | undefined)?.value;

  return {
    uuid: doc.uuid,
    id: doc.id,
    name: doc.name,
    level: typeof level === "number" ? level : undefined,
    hp:
      hp && typeof hp.value === "number" && typeof hp.max === "number"
        ? { value: hp.value, max: hp.max }
        : undefined,
    heroPoints:
      heroPoints && typeof heroPoints.value === "number" && typeof heroPoints.max === "number"
        ? { value: heroPoints.value, max: heroPoints.max }
        : undefined,
    ancestry: typeof ancestry === "string" ? ancestry : undefined,
    className: typeof className === "string" ? className : undefined,
    ownerPlayer: resolveOwnerPlayer(raw.ownership),
  };
}

function buildPartyCompanionRow(doc: FoundryDocumentLike): PartyCompanionRow {
  const raw = doc.toObject();
  const system = (raw.system ?? {}) as Record<string, unknown>;
  const master = (system.master as Record<string, unknown> | undefined)?.id;
  const masterActor = typeof master === "string" ? game.actors.get(master) : undefined;
  return {
    uuid: doc.uuid,
    id: doc.id,
    name: doc.name,
    type: doc.type ?? "unknown",
    master: masterActor?.name,
  };
}

/** `query-player`'s D28-13 resolution: `uuid` (a full `Actor.<id>` uuid, or a bare
 * world actor id — either form accepted) resolves via `fromUuid`; `name` resolves via
 * {@link resolveByName} across every world actor (the D28-4 type predicate is checked
 * AFTER resolution, uniformly for both paths, so an unambiguous name match against an
 * NPC still resolves — and then gets the correct typed `not-a-player-character`
 * refusal, not a confusing `not-found`). The params schema's own `.refine()` already
 * guarantees exactly one of `name`/`uuid` is present. */
async function resolvePlayerActor(params: QueryPlayerParams): Promise<FoundryDocumentLike> {
  if (params.uuid !== undefined) {
    const uuid = params.uuid.includes(".") ? params.uuid : `Actor.${params.uuid}`;
    const doc = await fromUuid(uuid);
    if (!doc) throw new BridgeHandlerError("not-found", `not found: ${uuid}`);
    return doc;
  }
  // The schema refine guarantees `name` is set whenever `uuid` isn't.
  return resolveByName(Array.from(game.actors.values()), params.name as string);
}

/** Reads a dot-path off the LIVE prepared actor's `system` tree (D28-2) — fail-soft:
 * a missing/wrong-shaped path logs a module `console.warn` naming the path and
 * returns `undefined`, NEVER throws (the spec's Risks: pf2e-internal derived paths
 * can drift across system majors, and a familiar/edge-case actor may legitimately
 * lack a path like `attributes.classDC`). `warnings` collects the same message the
 * console gets, so `query-player`'s `stats` result carries a machine-readable record
 * of what came back missing alongside the human-readable console line. */
function readDerivedNumber(
  system: Record<string, unknown>,
  path: string,
  warnings: string[],
): number | undefined {
  let cur: unknown = system;
  for (const segment of path.split(".")) {
    if (cur === null || typeof cur !== "object") {
      cur = undefined;
      break;
    }
    cur = (cur as Record<string, unknown>)[segment];
  }
  if (typeof cur === "number") return cur;
  const message = `query-player stats: missing/invalid derived path "system.${path}"`;
  warnings.push(message);
  console.warn(`[${MODULE_ID}] ${message}`);
  return undefined;
}

const SAVE_SLUGS = ["fortitude", "reflex", "will"];
const ABILITY_SLUGS = ["str", "dex", "con", "int", "wis", "cha"];

/** `query-player`'s `stats` section (0028 S2/D28-2) — the curated derived-stats
 * projection, read off the LIVE prepared actor (`doc.system`, never `toObject()`):
 * AC, saves, perception, ability modifiers, class DC, spell DC. Every individual
 * field is read via {@link readDerivedNumber} — fail-soft per field, never throws. */
function buildStats(doc: FoundryDocumentLike): PlayerStatsSection {
  const system = doc.system ?? {};
  const warnings: string[] = [];
  const read = (path: string): number | undefined => readDerivedNumber(system, path, warnings);

  const saves: PlayerSaveRow[] = SAVE_SLUGS.map((type) => ({
    type,
    value: read(`saves.${type}.value`),
    dc: read(`saves.${type}.dc`),
  }));
  const abilityMods: Record<string, number> = {};
  for (const slug of ABILITY_SLUGS) {
    const mod = read(`abilities.${slug}.mod`);
    if (mod !== undefined) abilityMods[slug] = mod;
  }

  return {
    section: "stats",
    ac: read("attributes.ac.value"),
    perception: { value: read("perception.value"), dc: read("perception.dc") },
    saves,
    abilityMods,
    classDC: { value: read("attributes.classDC.value"), rank: read("attributes.classDC.rank") },
    spellDC: { value: read("attributes.spellDC.value") },
    warnings,
  };
}

/** `query-player`'s `skills` section (0028 S2) — the LIVE `system.skills` map, which
 * (unlike stored source) carries a total `value`/`dc` per skill AND every lore skill
 * (added by `prepareSkills()`'s loreItems merge, verified in pf2e.mjs). */
function buildSkills(doc: FoundryDocumentLike): PlayerSkillsSection {
  const skillsObj = (doc.system?.skills ?? {}) as Record<string, unknown>;
  const skills: PlayerSkillRow[] = [];
  for (const [slug, raw] of Object.entries(skillsObj)) {
    if (!raw || typeof raw !== "object") continue;
    const s = raw as Record<string, unknown>;
    skills.push({
      slug,
      label: typeof s.label === "string" ? s.label : undefined,
      rank: typeof s.rank === "number" ? s.rank : undefined,
      value: typeof s.value === "number" ? s.value : undefined,
      dc: typeof s.dc === "number" ? s.dc : undefined,
      lore: s.lore === true,
    });
  }
  skills.sort((a, b) => a.slug.localeCompare(b.slug));
  return { section: "skills", skills };
}

function buildSummary(
  doc: FoundryDocumentLike,
  raw: Record<string, unknown>,
): PlayerSummarySection {
  // Prefer the live `system` (has derived hp.max) but fall back to the stored source
  // (familiars/edge cases where the live surface isn't stubbed, e.g. in tests).
  const system = (doc.system ?? raw.system ?? {}) as Record<string, unknown>;
  const details = (system.details ?? {}) as Record<string, unknown>;
  const attributes = (system.attributes ?? {}) as Record<string, unknown>;
  const resources = (system.resources ?? {}) as Record<string, unknown>;
  const items = Array.isArray(raw.items) ? (raw.items as Record<string, unknown>[]) : [];
  const findName = (type: string): string | undefined => {
    const name = items.find((i) => i.type === type)?.name;
    return typeof name === "string" ? name : undefined;
  };

  const level = (details.level as Record<string, unknown> | undefined)?.value;
  const xp = details.xp as Record<string, unknown> | undefined;
  const hp = attributes.hp as Record<string, unknown> | undefined;
  const heroPoints = resources.heroPoints as Record<string, unknown> | undefined;
  const languages = (details.languages as Record<string, unknown> | undefined)?.value;
  const master = (system.master as Record<string, unknown> | undefined)?.id;

  return {
    section: "summary",
    uuid: doc.uuid,
    id: doc.id,
    name: doc.name,
    actorType: doc.type ?? "unknown",
    level: typeof level === "number" ? level : undefined,
    xp:
      typeof xp?.value === "number" && typeof xp.max === "number"
        ? { value: xp.value, max: xp.max }
        : undefined,
    hp:
      hp && typeof hp.value === "number"
        ? {
            value: hp.value,
            max: typeof hp.max === "number" ? hp.max : undefined,
            temp: typeof hp.temp === "number" ? hp.temp : undefined,
          }
        : undefined,
    heroPoints:
      heroPoints && typeof heroPoints.value === "number" && typeof heroPoints.max === "number"
        ? { value: heroPoints.value, max: heroPoints.max }
        : undefined,
    ancestry: findName("ancestry"),
    heritage: findName("heritage"),
    background: findName("background"),
    className: findName("class"),
    deity: findName("deity"),
    languages: Array.isArray(languages)
      ? languages.filter((l): l is string => typeof l === "string")
      : undefined,
    alliance: typeof details.alliance === "string" ? details.alliance : undefined,
    master: typeof master === "string" ? master : undefined,
  };
}

interface SpellSlotState {
  rank: number;
  prepared: boolean;
  expended?: boolean;
}

/** Locates a spell's slot state in a spellcastingEntry's `system.slots.slot0..11`
 * (spec Verified footprint) by scanning every slot's `prepared[]` list for a matching
 * item id — this is how a PREPARED caster's spell gets its cast-at rank (which can
 * differ from the spell's own innate rank via heightening into a higher slot); a
 * spontaneous/innate/focus spell simply never appears in any slot's `prepared[]`. */
function findSlotState(
  slotsObj: Record<string, unknown>,
  spellId: string,
): SpellSlotState | undefined {
  for (const [slotKey, slotVal] of Object.entries(slotsObj)) {
    const match = /^slot(\d+)$/.exec(slotKey);
    if (!match?.[1]) continue;
    const slot = slotVal as Record<string, unknown>;
    const preparedList = Array.isArray(slot.prepared)
      ? (slot.prepared as Record<string, unknown>[])
      : [];
    const hit = preparedList.find((p) => p.id === spellId);
    if (hit) return { rank: Number(match[1]), prepared: true, expended: hit.expended === true };
  }
  return undefined;
}

/** `query-player`'s `spells` section (0028 S2/D28-11) — groups by spellcasting entry
 * then rank (slot rank when the spell is in a prepared slot, else its own innate
 * `system.level.value`), names + traits only (full descriptions are `query-item`'s
 * job, S3). Both `entryFilter`/`rankFilter` narrow the module-side result — cheap,
 * since these are already the full parsed source items; the D28-11 12,000-char
 * markdown cap and its group-summary fallback are entirely server-side (D28-6: the
 * module stays dumb, it never measures or truncates markdown). */
function buildSpells(
  raw: Record<string, unknown>,
  entryFilter: string | undefined,
  rankFilter: number | undefined,
): PlayerSpellsSection {
  const items = Array.isArray(raw.items) ? (raw.items as Record<string, unknown>[]) : [];
  const entryItems = items.filter((i) => i.type === "spellcastingEntry");
  const spellItems = items.filter((i) => i.type === "spell");
  const needle = entryFilter?.toLowerCase();

  const entries: PlayerSpellcastingEntryGroup[] = [];
  for (const entry of entryItems) {
    const entryId = String(entry._id ?? "");
    const entryName = typeof entry.name === "string" ? entry.name : "Spells";
    if (
      needle !== undefined &&
      entryId !== entryFilter &&
      !entryName.toLowerCase().includes(needle)
    ) {
      continue;
    }
    const esys = (entry.system ?? {}) as Record<string, unknown>;
    const tradition = (esys.tradition as Record<string, unknown> | undefined)?.value;
    const preparedType = (esys.prepared as Record<string, unknown> | undefined)?.value;
    const dc = (esys.spelldc as Record<string, unknown> | undefined)?.dc;
    const slotsObj = (esys.slots ?? {}) as Record<string, unknown>;

    const rankGroups = new Map<number, PlayerSpellRow[]>();
    for (const spell of spellItems) {
      const ssys = (spell.system ?? {}) as Record<string, unknown>;
      const location = (ssys.location as Record<string, unknown> | undefined)?.value;
      if (location !== entryId) continue;
      const spellId = String(spell._id ?? "");
      const slotState = findSlotState(slotsObj, spellId);
      const ownRank = Number((ssys.level as Record<string, unknown> | undefined)?.value ?? 0);
      const rank = slotState?.rank ?? ownRank;
      if (rankFilter !== undefined && rank !== rankFilter) continue;
      const traitsValue = (ssys.traits as Record<string, unknown> | undefined)?.value;
      const traits = Array.isArray(traitsValue)
        ? traitsValue.filter((t): t is string => typeof t === "string")
        : [];
      const row: PlayerSpellRow = {
        id: spellId,
        name: typeof spell.name === "string" ? spell.name : "Unnamed",
        rank,
        traits,
        prepared: slotState?.prepared,
        expended: slotState?.expended,
      };
      const bucket = rankGroups.get(rank) ?? [];
      bucket.push(row);
      rankGroups.set(rank, bucket);
    }

    const ranks: PlayerSpellRankGroup[] = Array.from(rankGroups.entries())
      .sort(([a], [b]) => a - b)
      .map(([rank, spellsAtRank]) => {
        const slot = slotsObj[`slot${rank}`] as Record<string, unknown> | undefined;
        const slots =
          slot && typeof slot.max === "number"
            ? { value: typeof slot.value === "number" ? slot.value : 0, max: slot.max }
            : undefined;
        spellsAtRank.sort((a, b) => a.name.localeCompare(b.name));
        return { rank, slots, spells: spellsAtRank };
      });

    entries.push({
      entryId,
      entryName,
      tradition: typeof tradition === "string" ? tradition : undefined,
      preparedType: typeof preparedType === "string" ? preparedType : undefined,
      dc: typeof dc === "number" ? dc : undefined,
      ranks,
    });
  }

  return { section: "spells", entries };
}

const FEAT_CATEGORY_FALLBACK = "other";

/** `query-player`'s `feats` section (0028 S2) — grouped by category (`system.category`,
 * e.g. "ancestry"/"class"/"skill"/"general"/"classfeature") with the feat's own level. */
function buildFeats(raw: Record<string, unknown>): PlayerFeatsSection {
  const items = Array.isArray(raw.items) ? (raw.items as Record<string, unknown>[]) : [];
  const feats: PlayerFeatRow[] = items
    .filter((i) => i.type === "feat")
    .map((f) => {
      const fsys = (f.system ?? {}) as Record<string, unknown>;
      const level = (fsys.level as Record<string, unknown> | undefined)?.value;
      return {
        id: String(f._id ?? ""),
        name: typeof f.name === "string" ? f.name : "Unnamed",
        category: typeof fsys.category === "string" ? fsys.category : FEAT_CATEGORY_FALLBACK,
        level: typeof level === "number" ? level : undefined,
      };
    });
  feats.sort(
    (a, b) =>
      a.category.localeCompare(b.category) ||
      (a.level ?? 0) - (b.level ?? 0) ||
      a.name.localeCompare(b.name),
  );
  return { section: "feats", feats };
}

const INVENTORY_ITEM_TYPES = new Set([
  "weapon",
  "armor",
  "equipment",
  "consumable",
  "backpack",
  "treasure",
  "kit",
  "shield",
  "ammo",
]);

/** `query-player`'s `inventory` section (0028 S2) — every embedded item whose type is
 * physical gear, with quantity/bulk/carry-state/runes. Fusion/property runes are
 * summarized as short labels (e.g. "+1 potency", "striking 2") rather than the raw
 * rune source objects. */
function buildInventory(raw: Record<string, unknown>): PlayerInventorySection {
  const items = Array.isArray(raw.items) ? (raw.items as Record<string, unknown>[]) : [];
  const rows: PlayerInventoryRow[] = items
    .filter((i) => typeof i.type === "string" && INVENTORY_ITEM_TYPES.has(i.type))
    .map((it) => {
      const isys = (it.system ?? {}) as Record<string, unknown>;
      const bulk = (isys.bulk as Record<string, unknown> | undefined)?.value;
      const equipped = isys.equipped as Record<string, unknown> | undefined;
      const runesObj = isys.runes as Record<string, unknown> | undefined;
      const runes: string[] = [];
      if (runesObj) {
        if (typeof runesObj.potency === "number" && runesObj.potency > 0) {
          runes.push(`+${runesObj.potency} potency`);
        }
        if (typeof runesObj.striking === "number" && runesObj.striking > 0) {
          runes.push(`striking ${runesObj.striking}`);
        }
        if (typeof runesObj.resilient === "number" && runesObj.resilient > 0) {
          runes.push(`resilient ${runesObj.resilient}`);
        }
        if (Array.isArray(runesObj.property)) {
          for (const p of runesObj.property) if (typeof p === "string") runes.push(p);
        }
      }
      return {
        id: String(it._id ?? ""),
        name: typeof it.name === "string" ? it.name : "Unnamed",
        type: String(it.type),
        quantity: typeof isys.quantity === "number" ? isys.quantity : undefined,
        bulk: typeof bulk === "number" ? bulk : undefined,
        carryType: typeof equipped?.carryType === "string" ? equipped.carryType : undefined,
        invested: typeof equipped?.invested === "boolean" ? equipped.invested : undefined,
        runes: runes.length > 0 ? runes : undefined,
      };
    });
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return { section: "inventory", items: rows };
}

/** `query-player`'s `notes` section (0028 S2) — deity (an embedded `deity`-type item's
 * name) plus non-empty biography prose fields. The shared player key has no
 * per-player identity (D28-1), so — per the spec's own accepted Risks posture ("any
 * player sees the whole party's sheets... read-only, campaign-internal data") — this
 * doesn't gate on pf2e's own GM-visibility biography flags; it surfaces whatever
 * prose the sheet carries. */
function buildNotes(raw: Record<string, unknown>): PlayerNotesSection {
  const system = (raw.system ?? {}) as Record<string, unknown>;
  const details = (system.details ?? {}) as Record<string, unknown>;
  const bio = (details.biography ?? {}) as Record<string, unknown>;
  const items = Array.isArray(raw.items) ? (raw.items as Record<string, unknown>[]) : [];
  const deity = items.find((i) => i.type === "deity")?.name;
  const nonEmpty = (v: unknown): string | undefined =>
    typeof v === "string" && v.length > 0 ? v : undefined;
  return {
    section: "notes",
    deity: typeof deity === "string" ? deity : undefined,
    appearance: nonEmpty(bio.appearance),
    backstory: nonEmpty(bio.backstory),
    likes: nonEmpty(bio.likes),
    dislikes: nonEmpty(bio.dislikes),
    campaignNotes: nonEmpty(bio.campaignNotes),
  };
}

/** `query-player` (0028 S2/D28-4/D28-11) — resolves the target actor (D28-13), refuses
 * anything that isn't `type ∈ {character, familiar}` with the typed
 * `not-a-player-character` error, then builds exactly the requested `section`. */
async function handleQueryPlayer(rawParams: unknown): Promise<QueryPlayerResult> {
  const params = QueryPlayerParams.parse(rawParams);
  const doc = await resolvePlayerActor(params);
  if (doc.type !== "character" && doc.type !== "familiar") {
    throw new BridgeHandlerError(
      "not-a-player-character",
      `"${doc.name}" is a ${doc.type ?? "unknown-type"} actor — query-player only serves ` +
        "player characters and familiars",
    );
  }
  const raw = doc.toObject();
  switch (params.section) {
    case "summary":
      return buildSummary(doc, raw);
    case "stats":
      return buildStats(doc);
    case "skills":
      return buildSkills(doc);
    case "spells":
      return buildSpells(raw, params.entry, params.rank);
    case "feats":
      return buildFeats(raw);
    case "inventory":
      return buildInventory(raw);
    case "notes":
      return buildNotes(raw);
  }
}

/** Registers every handler this module build knows about into `CONFIG.queries`. Call
 * once, on the `init` hook (Foundry's `CONFIG` global exists by then, before `ready`
 * dials the bridge). S5 adds more `CONFIG.queries[queryKey(...)] = ...` lines here —
 * same registry, same dispatch path, no change to `bridgeClient.ts`. */
export function registerHandlers(): void {
  CONFIG.queries[queryKey("ping")] = handlePing;
  CONFIG.queries[queryKey("list-compendium-packs")] = handleListCompendiumPacks;
  CONFIG.queries[queryKey("search-compendium")] = handleSearchCompendium;
  CONFIG.queries[queryKey("get-document")] = handleGetDocument;
  CONFIG.queries[queryKey("search-world")] = handleSearchWorld;
  CONFIG.queries[queryKey("list-scenes")] = handleListScenes;
  CONFIG.queries[queryKey("get-current-scene")] = handleGetCurrentScene;
  CONFIG.queries[queryKey("import-from-compendium")] = handleImportFromCompendium;
  CONFIG.queries[queryKey("create-token")] = handleCreateToken;
  CONFIG.queries[queryKey("create-journal")] = handleCreateJournal;
  CONFIG.queries[queryKey("create-actor")] = handleCreateActor;
  CONFIG.queries[queryKey("create-item")] = handleCreateItem;
  CONFIG.queries[queryKey("create-light")] = handleCreateLight;
  CONFIG.queries[queryKey("create-macro")] = handleCreateMacro;
  CONFIG.queries[queryKey("apply-condition")] = handleApplyCondition;
  CONFIG.queries[queryKey("update-document")] = handleUpdateDocument;
  CONFIG.queries[queryKey("delete-document")] = handleDeleteDocument;
  CONFIG.queries[queryKey("execute-macro")] = handleExecuteMacro;
  CONFIG.queries[queryKey("query-party")] = handleQueryParty;
  CONFIG.queries[queryKey("query-player")] = handleQueryPlayer;
}

/**
 * Looks up + invokes the handler for a fully-qualified method (e.g. `"portal.ping"`,
 * already carrying the `portal.` prefix as it arrives over the wire — see
 * `McpQuery.method` in `@astra/portal-shared`). Re-checks `game.user?.isGM` as defense
 * in depth: the `ready` hook already refuses to DIAL the bridge at all for a non-GM
 * session, but this is the last line of defense against a session that started as GM
 * and was demoted while its socket stayed open. Also re-checks the 0027 D27-2/D27-9
 * designated-dialer setting for the same reason — the GM may repoint `bridge-user-id`
 * on an already-adopted socket without an F5.
 *
 * Throws {@link BridgeHandlerError} (typed `.code`) for both denial paths; any error a
 * handler itself throws propagates as-is — `bridgeClient.ts` falls back to
 * `foundry-error` for anything that isn't already a `BridgeHandlerError`.
 */
export async function dispatchQuery(method: string, params: unknown): Promise<unknown> {
  if (!game.user?.isGM) {
    throw new BridgeHandlerError("not-gm", "the connected Foundry session isn't a GM");
  }
  const bridgeUserId = String(game.settings.get(MODULE_ID, SETTING_BRIDGE_USER_ID) ?? "");
  if (bridgeUserId && game.user.id !== bridgeUserId) {
    throw new BridgeHandlerError(
      "not-designated",
      "this Foundry session is not the designated bridge dialer (bridge-user-id)",
    );
  }
  const handler = CONFIG.queries[method];
  if (!handler) {
    throw new BridgeHandlerError("foundry-error", `no handler registered for query "${method}"`);
  }
  return await handler(params);
}
