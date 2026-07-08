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
  type BridgeErrorCode,
  type CompendiumIndexRow,
  type CompendiumPackRow,
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
  SearchCompendiumParams,
  type SearchCompendiumResult,
  SearchWorldParams,
  type SearchWorldResult,
  type WorldSearchRow,
  type WorldSearchType,
} from "@astra/portal-shared";

import { MODULE_ID, SETTING_ALLOW_WRITES } from "./constants";

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
}

/**
 * Looks up + invokes the handler for a fully-qualified method (e.g. `"portal.ping"`,
 * already carrying the `portal.` prefix as it arrives over the wire — see
 * `McpQuery.method` in `@astra/portal-shared`). Re-checks `game.user?.isGM` as defense
 * in depth: the `ready` hook already refuses to DIAL the bridge at all for a non-GM
 * session, but this is the last line of defense against a session that started as GM
 * and was demoted while its socket stayed open.
 *
 * Throws {@link BridgeHandlerError} (typed `.code`) for both denial paths; any error a
 * handler itself throws propagates as-is — `bridgeClient.ts` falls back to
 * `foundry-error` for anything that isn't already a `BridgeHandlerError`.
 */
export async function dispatchQuery(method: string, params: unknown): Promise<unknown> {
  if (!game.user?.isGM) {
    throw new BridgeHandlerError("not-gm", "the connected Foundry session isn't a GM");
  }
  const handler = CONFIG.queries[method];
  if (!handler) {
    throw new BridgeHandlerError("foundry-error", `no handler registered for query "${method}"`);
  }
  return await handler(params);
}
