/**
 * Minimal ambient FoundryVTT global declarations (spec 0023 S3) — ONLY the surface this
 * module actually touches: `game.user.isGM`, `game.world.{id,title}`,
 * `game.system.{id,version}`, `game.version`, `game.settings.{register,get}`,
 * `Hooks.once`, and `CONFIG.queries`.
 *
 * Deliberately hand-rolled instead of installing `fvtt-types` (or similar community
 * typings): that package models the ENTIRE Foundry + every-system API surface, is huge,
 * and churns on every Foundry/system release. A 6-name ambient stub is trivial to keep
 * in sync with the one v13 surface we call, and a typecheck here never breaks on an
 * unrelated upstream Foundry API change. Extend this file only when a new handler
 * (S4/S5) touches a genuinely new part of the Foundry global surface.
 *
 * No `import`/`export` here on purpose: a `.d.ts` file with neither is treated as an
 * ambient SCRIPT (not a module) by TypeScript, so every top-level `declare` below is
 * automatically global — no `declare global { ... }` wrapper (and no throwaway
 * `export {}` just to unlock one) needed.
 */

/** The subset of `foundry.documents.User` this module reads. */
interface FoundryUser {
  readonly isGM: boolean;
}

/** The subset of the active `World` document this module reads. */
interface FoundryWorld {
  readonly id: string;
  readonly title: string;
}

/** The subset of the active game System this module reads. */
interface FoundrySystem {
  readonly id: string;
  readonly version: string;
}

/** The subset of a Foundry Document (actor/item/journal/scene/compendium entry) the S4
 * read tools touch — `toObject()` is the D5 "opaque cargo" escape hatch (never model
 * pf2e `system.*`), the rest is plain document identity. */
interface FoundryDocumentLike {
  readonly id: string;
  readonly uuid: string;
  readonly name: string;
  readonly documentName: string;
  readonly folder?: { readonly name: string } | null;
  toObject(): Record<string, unknown>;
}

/** A `CompendiumCollection#getIndex()` (or `#index`) entry — Foundry 13 index rows
 * carry their own `uuid` (`Compendium.<pack>.<type>.<id>`), so it's never
 * hand-constructed (spec 0023 S4). */
interface FoundryCompendiumIndexEntry {
  readonly _id: string;
  readonly uuid: string;
  readonly name: string;
  readonly type?: string;
  readonly img?: string;
}

/** Map-like — the real Foundry `Collection` (a `Map` subclass) supports far more, but
 * `values()` is all `search-compendium`/`list-compendium-packs` need. */
interface FoundryCompendiumIndex {
  values(): IterableIterator<FoundryCompendiumIndexEntry>;
}

interface FoundryCompendiumMetadata {
  readonly type: string; // "Actor" | "Item" | "JournalEntry" | ...
  readonly label: string;
  readonly system?: string;
}

interface FoundryCompendiumCollection {
  readonly collection: string; // e.g. "pf2e.pathfinder-monster-core"
  readonly metadata: FoundryCompendiumMetadata;
  getIndex(options?: { fields?: string[] }): Promise<FoundryCompendiumIndex>;
}

/** `game.packs` — iterated wholesale by both `list-compendium-packs` and
 * `search-compendium` (D12 live-iterate, no precomputed cache in v1). */
interface FoundryPacksCollection {
  values(): IterableIterator<FoundryCompendiumCollection>;
}

/** A world-scoped `WorldCollection` (`game.actors`/`game.items`/`game.journal`). */
interface FoundryWorldCollection<T extends FoundryDocumentLike = FoundryDocumentLike> {
  values(): IterableIterator<T>;
}

interface FoundryGridInfo {
  readonly size: number;
  readonly type: number;
}

interface FoundryTokensCollection {
  readonly size: number;
}

interface FoundryScene extends FoundryDocumentLike {
  readonly active: boolean;
  readonly grid: FoundryGridInfo;
  readonly width: number;
  readonly height: number;
  readonly tokens: FoundryTokensCollection;
}

interface FoundryScenesCollection extends FoundryWorldCollection<FoundryScene> {
  readonly active: FoundryScene | null;
}

/** `game.settings.register()`'s options bag — narrowed to the fields this module passes
 * (world-scoped, GM-restricted, primitive-typed settings only). */
interface FoundrySettingConfig {
  name?: string;
  hint?: string;
  scope: "world" | "client";
  config: boolean;
  type: unknown;
  default: unknown;
  /** GM-only visibility/edit — Foundry v10+ (kept even though `scope: "world"` alone
   * doesn't hide a setting from non-GM clients in the Settings menu). */
  restricted?: boolean;
}

interface FoundrySettings {
  register(namespace: string, key: string, data: FoundrySettingConfig): void;
  get(namespace: string, key: string): unknown;
}

/** The global `game` object Foundry injects once the world has booted. */
interface FoundryGame {
  readonly user?: FoundryUser;
  readonly world: FoundryWorld;
  readonly system: FoundrySystem;
  readonly version: string;
  readonly settings: FoundrySettings;
  readonly packs: FoundryPacksCollection;
  readonly actors: FoundryWorldCollection;
  readonly items: FoundryWorldCollection;
  readonly journal: FoundryWorldCollection;
  readonly scenes: FoundryScenesCollection;
}

/** One entry of Foundry 13's `CONFIG.queries` registry — the dispatch surface a `query`
 * message on the bridge WS is routed through (spec 0023 module section). Foundry awaits
 * whatever comes back, so a plain (non-`Promise`) return is fine too. */
type FoundryQueryHandler = (params: unknown) => unknown;

/** Narrowed to the one field this module touches; `CONFIG` carries the entire
 * Foundry/system configuration tree in reality. */
interface FoundryConfig {
  queries: Record<string, FoundryQueryHandler>;
}

interface FoundryHooks {
  once(hook: string, fn: (...args: never[]) => void): void;
  on(hook: string, fn: (...args: never[]) => void): void;
}

// `var`, not `const`/`let`: only a `var`-declared global gets merged onto the
// `globalThis` TYPE, which the handlers/bridgeClient test suites need in order to stub
// `game`/`CONFIG` (`globalThis.game = {...}`) — S3 is Foundry-free, so these are plain
// objects assigned per-test, never Foundry's real (runtime-injected, never reassigned)
// globals.
declare var game: FoundryGame;
declare var CONFIG: FoundryConfig;
declare var Hooks: FoundryHooks;
/** Foundry's global UUID resolver (`Compendium.<pack>.<type>.<id>` or a bare world
 * document id) — `get-document` (S4) is its one caller. Same `var` reasoning as above:
 * `handlers.test.ts` stubs it per-test (S4 is Foundry-free too). */
declare var fromUuid: (uuid: string) => Promise<FoundryDocumentLike | null>;
