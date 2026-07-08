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

/** A world-scoped `WorldCollection` (`game.actors`/`game.items`/`game.journal`). `get`
 * is S5's addition (`create-token`'s `actorId` path resolves an existing world actor by
 * id) — every S4 stub already indexes by `id`, so it costs S4 nothing. */
interface FoundryWorldCollection<T extends FoundryDocumentLike = FoundryDocumentLike> {
  values(): IterableIterator<T>;
  get(id: string): T | undefined;
}

/** The subset of a Foundry `TokenDocument` this module touches — an unsaved token doc
 * fresh off `Actor#getTokenDocument`, not yet embedded in a scene (S5 D13). */
interface FoundryTokenDocumentLike {
  toObject(): Record<string, unknown>;
}

/** One instantiated pf2e rule element on an OWNED item, as read back from `.rules`
 * after `createEmbeddedDocuments` (0026 S2 D-7) — `ignored: true` is pf2e's own
 * fail-soft marker for a bad/unknown RE (it `console.warn`s at data-prep rather than
 * rejecting the create; `system.rules` itself is never DB-validated). A WORLD item
 * (no owning actor) never gets this array populated at all — data-prep only runs on
 * owned documents — which is why `create-item`'s standalone-item path skips read-back
 * entirely rather than reporting a false "everything ignored". */
interface FoundryRuleElement {
  readonly key?: string;
  readonly ignored?: boolean;
}

/** The subset of an embedded Item document the D-7 RE read-back inspects — a superset
 * of {@link FoundryDocumentLike} that MAY carry instantiated `rules`. `rules` is
 * optional/absent both for a fresh non-Foundry stub and, in the real client, for any
 * item that hasn't gone through actor data-prep — both are treated identically
 * (no warnings), never as "every rule failed". */
interface FoundryItemLike extends FoundryDocumentLike {
  readonly rules?: FoundryRuleElement[];
}

/** A world Actor (S5) — extends the general document surface with the one
 * actor-specific call `create-token` needs: cloning the actor's prototype token at a
 * given position (D13 "import-then-tokenize"), plus (0026 S2) embedding items
 * directly on the actor (`create-actor`'s `items[]`, `create-item`'s `actorId` path)
 * — the return type carries {@link FoundryItemLike} so callers can read `.rules`
 * straight off the result without an extra cast. */
interface FoundryActor extends FoundryDocumentLike {
  getTokenDocument(pos: { x: number; y: number }): Promise<FoundryTokenDocumentLike>;
  createEmbeddedDocuments(
    embeddedName: string,
    data: Record<string, unknown>[],
  ): Promise<FoundryItemLike[]>;
}

/** A world Folder (S5) — `import-from-compendium`/`create-journal`'s `folder` param
 * resolves against this by name + `type` (the target document's `documentName`); never
 * created on the fly (a missing folder is a typed "not-found", not a silent skip). */
interface FoundryFolder {
  readonly id: string;
  readonly name: string;
  readonly type: string;
}

interface FoundryFoldersCollection {
  values(): IterableIterator<FoundryFolder>;
}

/** A Foundry Document class's static creation surface (S5 D5) — `getDocumentClass`
 * below is the forward-safe way to reach it (avoiding a hardcoded `Actor`/`Item`/
 * `JournalEntry` global reference, which the v13->v15 deprecation notes flag). */
interface FoundryDocumentClass {
  createDocuments(
    data: Record<string, unknown>[],
    options?: Record<string, unknown>,
  ): Promise<FoundryDocumentLike[]>;
  create(
    data: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<FoundryDocumentLike | undefined>;
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
  /** `create-token`'s (S5 D13) landing call — embeds the token doc(s) produced by
   * `Actor#getTokenDocument` into this scene. */
  createEmbeddedDocuments(
    embeddedName: string,
    data: Record<string, unknown>[],
  ): Promise<FoundryDocumentLike[]>;
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
  readonly actors: FoundryWorldCollection<FoundryActor>;
  readonly items: FoundryWorldCollection;
  readonly journal: FoundryWorldCollection;
  readonly scenes: FoundryScenesCollection;
  /** S5's folder-by-name lookup surface (`import-from-compendium`/`create-journal`). */
  readonly folders: FoundryFoldersCollection;
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
/** Foundry's forward-safe document-class resolver (avoids a hardcoded `Actor`/`Item`/
 * `JournalEntry` global reference — the v13->v15 deprecation cliff, spec Risks). S5's
 * write handlers are its only callers. Same `var` reasoning as `fromUuid`. */
declare var getDocumentClass: (documentName: string) => FoundryDocumentClass;

/** The one `foundry.utils` helper this module calls (0026 S2 D-1 hybrid `baseUuid`
 * clone+patch path, and the D-6 stamp merge): a plain, non-mutating deep merge. Real
 * Foundry's `mergeObject` takes many more options (array-insertion keys, strict mode,
 * ...); this module only ever needs `{inplace: false}`. */
interface FoundryUtils {
  mergeObject<T extends Record<string, unknown> = Record<string, unknown>>(
    original: Record<string, unknown>,
    other?: Record<string, unknown>,
    options?: { inplace?: boolean },
  ): T;
}

interface FoundryNamespace {
  readonly utils: FoundryUtils;
}

/** Same `var` reasoning as `fromUuid`/`getDocumentClass`: `handlers.test.ts` stubs
 * this per-test, never the real Foundry-injected global. */
declare var foundry: FoundryNamespace;

// Note (0026 S2, D-7): Foundry's `DataModelValidationError` class is deliberately NOT
// part of this ambient surface — importing/declaring the real class would pull in far
// more of Foundry's DataModel machinery than this module otherwise touches. handlers.ts
// detects it defensively at the call site instead, by checking the thrown error's own
// `.name`/`.constructor.name` string against `"DataModelValidationError"` rather than
// an `instanceof` check (see `isDataModelValidationError` in `handlers.ts`) — this is
// also what lets a plain `Error({name: "DataModelValidationError"})` fake stand in for
// the real thing in tests without any Foundry runtime present.
