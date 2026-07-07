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
  type CurrentSceneInfo,
  GetCurrentSceneParams,
  type GetCurrentSceneResult,
  GetDocumentParams,
  type GetDocumentResult,
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

import { MODULE_ID } from "./constants";

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
