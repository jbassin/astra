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

/** The subset of `foundry.documents.User` this module reads. `id`/`name` (0027
 * D27-8/D27-9) back the designated-dialer gate + the identity `bridge-status` surfaces
 * — every real Foundry `User` document already carries both. */
interface FoundryUser {
  readonly id: string;
  readonly name: string;
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
 * pf2e `system.*`), the rest is plain document identity. `type`/`flags` (0026 S3) are
 * optional: most S3/S4 read-tool stand-ins never carry either, and both are genuinely
 * absent on some real document kinds — `type` is D-10's "is this a PC" discriminator
 * (`documentName === "Actor" && type === "character"`), `flags` is D-4's stamp-read
 * surface (`flags["astra-portal"]?.created`). */
interface FoundryDocumentLike {
  readonly id: string;
  readonly uuid: string;
  readonly name: string;
  readonly documentName: string;
  readonly type?: string;
  readonly folder?: { readonly name: string } | null;
  readonly flags?: Record<string, unknown>;
  /** The compendium collection key this document came from (real Foundry's own
   * `Document#pack`, verified `client/documents/abstract/client-document.mjs:77/85`
   * — `null`/`undefined` for a world/embedded document). 0028 S3's `query-item`
   * uses this to find the owning `FoundryCompendiumCollection` (for the D28-5
   * pack-visibility gate) without re-parsing it out of the uuid string. */
  readonly pack?: string | null;
  /** The LIVE (prepared) `system` data tree — 0028 S2's `query-player` `stats`/`skills`
   * sections read AC/saves/perception/ability-mods/class-DC/spell-DC/skill-totals off
   * this directly (D28-2: these are runtime-derived by pf2e's `prepareData()` and are
   * simply absent from `toObject()`'s stored source — verified live, e.g. `system.
   * abilities` is `null` in source). Every world/embedded document `fromUuid`/`game.
   * actors` resolves is already the live, prepared instance in real Foundry, so no
   * separate "get the live one" call is ever needed — this field is just that same
   * instance's own `system` property, read directly instead of through `toObject()`.
   * Deliberately opaque (`Record<string, unknown>`, D5) and optional (not every
   * document kind this module touches carries one, e.g. a Macro/Scene/AmbientLight) —
   * `query-player`'s own path-reader treats an absent/wrong-shaped path as "unknown"
   * fail-soft, never a throw (D28-2 Risks: pf2e-internal paths can drift). */
  readonly system?: Record<string, unknown>;
  /** An Actor's LIVE embedded-items collection (real Foundry: an `EmbeddedCollection`;
   * only `.get()` is typed — only-what-we-touch policy). 0028 S4 fix: `buildSpells`
   * reads a spellcasting entry's DERIVED `spelldc.dc` off the live embedded item
   * (the stored source's is 0 for a prepared caster). Absent on non-Actor documents. */
  readonly items?: { get(id: string): FoundryDocumentLike | undefined };
  toObject(): Record<string, unknown>;
}

/** The instance-mutation surface `update-document` (0026 S3 D-10) and
 * `delete-document` (D-4) need — every world/embedded document `fromUuid` can
 * resolve supports both `update()`/`delete()` in real Foundry (Actor/Item/Scene/
 * AmbientLight/Macro alike). Deliberately narrower than baking these onto the base
 * `FoundryDocumentLike`: every OTHER handler in this module only ever reads/creates,
 * so this keeps the ripple confined to the two handlers that actually mutate an
 * existing document, via a narrowing cast at the call site (same idiom as
 * `createChecked`'s `as FoundryActor`, `types/foundry.d.ts` policy). */
interface FoundryMutableDocument extends FoundryDocumentLike {
  update(changes: Record<string, unknown>): Promise<unknown>;
  delete(): Promise<unknown>;
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

/** A pack's per-role visibility config (real Foundry's own `CompendiumCollection#
 * ownership` getter, verified `client/documents/collections/compendium-collection.
 * mjs:231-236` — `config.ownership ?? metadata.ownership ?? the schema default`),
 * each value one of `CONST.DOCUMENT_OWNERSHIP_LEVELS`' string keys ("INHERIT"/
 * "NONE"/"LIMITED"/"OBSERVER"/"OWNER"; verified `common/constants.mjs:372-397`).
 * 0028 S3's `query-item` (D28-5) reads `PLAYER` directly rather than calling the
 * real `getUserLevel(user)` with the bridge's own GM user — that call ALWAYS
 * resolves OWNER for a GM (verified `compendium-collection.mjs:451-452`:
 * `testUserPermission` short-circuits `user.isGM ? OWNER : getUserLevel(user)`,
 * and `getUserLevel`'s own per-role loop separately gives a GM's role every
 * `hasRole(role)` check since GM outranks every role, `common/documents/user.mjs:
 * 177-181` — either path makes every pack look OWNER-visible to the GM regardless
 * of its real player-facing config, the exact leak the adversarial B2 finding
 * flagged). Live pf2e system.json (2026-07-11): 67/94 packs (bestiaries) ship
 * `PLAYER: "LIMITED"`, 27/94 (rules content) ship `"OBSERVER"` — LIMITED(1) is
 * BELOW the D28-5 `OBSERVER`(2) gate, so most bestiary packs are correctly
 * excluded from a player-key search. */
interface FoundryCompendiumOwnership {
  readonly GAMEMASTER?: string;
  readonly ASSISTANT?: string;
  readonly TRUSTED?: string;
  readonly PLAYER?: string;
}

interface FoundryCompendiumCollection {
  readonly collection: string; // e.g. "pf2e.pathfinder-monster-core"
  readonly metadata: FoundryCompendiumMetadata;
  /** 0028 S3 (D28-5) — see {@link FoundryCompendiumOwnership}. */
  readonly ownership?: FoundryCompendiumOwnership;
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

/** One pf2e condition item as read off an actor's own `itemTypes.condition` array
 * (0026 S3 D-14) — the same surface `ActorPF2e#increaseCondition` itself reads
 * internally (verified `pf2e-7.12.2` `src/module/actor/base.ts:1777`), so this is the
 * cheapest post-action read-back: no separate `ActorConditions` collection API
 * needed. `value: null` covers both a valueless condition (e.g. "prone") and a
 * persistent-damage instance (which tracks its formula, not a numeric value). */
interface FoundryConditionLike {
  readonly slug: string;
  readonly active: boolean;
  readonly value: number | null;
}

/** A world Actor (S5) — extends the general document surface with the one
 * actor-specific call `create-token` needs: cloning the actor's prototype token at a
 * given position (D13 "import-then-tokenize"), plus (0026 S2) embedding items
 * directly on the actor (`create-actor`'s `items[]`, `create-item`'s `actorId` path)
 * — the return type carries {@link FoundryItemLike} so callers can read `.rules`
 * straight off the result without an extra cast. (0026 S3 D-14) adds pf2e's own
 * `ConditionManager`-backed condition mutators + the `itemTypes.condition` read-back
 * surface — required, not optional: every actor in a pf2e world carries them (this
 * module targets pf2e exclusively), so a handler that can't find them at runtime
 * (`apply-condition`'s `requireActorMethod` in `handlers.ts`) treats it as a genuine
 * `foundry-error`, not a type-level maybe. */
interface FoundryActor extends FoundryDocumentLike {
  getTokenDocument(pos: { x: number; y: number }): Promise<FoundryTokenDocumentLike>;
  createEmbeddedDocuments(
    embeddedName: string,
    data: Record<string, unknown>[],
  ): Promise<FoundryItemLike[]>;
  increaseCondition(slug: string, options?: { value?: number }): Promise<unknown>;
  decreaseCondition(slug: string): Promise<unknown>;
  toggleCondition(slug: string): Promise<unknown>;
  readonly itemTypes: { readonly condition: readonly FoundryConditionLike[] };
}

/** A world Macro (0026 S3 D-9) — `execute()` is Foundry's own run-immediately call;
 * `create-macro` (S2) never invokes it, only `execute-macro` (S3) does. */
interface FoundryMacro extends FoundryDocumentLike {
  execute(): Promise<unknown>;
}

/** `game.pf2e.ConditionManager` (0026 S3 D-14) — the ONE static call `apply-
 * condition`'s persistent-damage non-dialog path needs: a fresh, un-owned
 * `persistent-damage` condition source to merge `{formula, damageType, dc}` onto
 * (verified `pf2e-7.12.2` `src/module/item/condition/persistent-damage-editor.ts`
 * `#onClickAdd`). Not part of the general `foundry.utils`-style ambient surface —
 * scoped to its own `game.pf2e` namespace, mirroring the real API shape. */
interface FoundryPf2eConditionManager {
  getCondition(slug: string): { toObject(): Record<string, unknown> };
}

interface FoundryPf2eNamespace {
  readonly ConditionManager: FoundryPf2eConditionManager;
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

/** One `ChatMessage` document as `0028 S3`'s `query-rolls` reads it — Foundry v13
 * schema (verified `common/documents/chat-message.mjs`; v13 RENAMED `user`->
 * `author`, a deprecated getter for `user` remains but this module never uses it).
 * `rolls` is an array of serialized-Roll JSON STRINGS (`client/dice/roll.mjs#
 * toJSON` — `{class, formula, total, evaluated, terms[]}`, parsed module-side,
 * never re-evaluated); `whisper`/`blind`/`flags.pf2e.context.secret` are D28-3's
 * three-prong public-only privacy filter. `content` (the rendered HTML) is
 * DELIBERATELY not part of this ambient surface — D28-12 never ships it. */
interface FoundryChatMessage {
  readonly id: string;
  readonly timestamp: number;
  readonly speaker?: {
    readonly scene?: string;
    readonly actor?: string;
    readonly token?: string;
    readonly alias?: string;
  };
  /** Empty = public (`ChatMessage.applyRollMode`, `chat-message.mjs:152-168`). */
  readonly whisper: string[];
  readonly blind: boolean;
  /** STORED source data carries serialized-Roll JSON strings; a LIVE `game.messages`
   * document hydrates them into Roll INSTANCES (objects whose `toJSON()` restores the
   * stored shape) — 0028 S4 live-gate find. `parseRollJson` accepts both. */
  readonly rolls: ReadonlyArray<string | object>;
  readonly flavor?: string;
  readonly flags?: Record<string, unknown>;
}

/** `game.messages` — verified UNCAPPED client-side (`dist/database/backend/
 * sublevel-database.mjs#find` has no limit; `ChatLog.MAX_MESSAGE_HISTORY`/
 * `CONFIG.ChatMessage.batchSize` are UI-only caps, not collection caps). A
 * `Collection` (`Map` subclass) — `.contents` is `Array.from(this.values())`
 * (`common/utils/collection.mjs:24-26`), insertion order tracking ascending
 * `timestamp`; `.size` is the raw collection count (D28-10's `totalMessages`). */
interface FoundryMessagesCollection {
  readonly size: number;
  readonly contents: readonly FoundryChatMessage[];
}

/** `game.users` (0027 D27-2/D27-9) — the world's user list; `get` backs the
 * designated-dialer resolvability check (`bridge-user-id` -> a real user, or not).
 * Deliberately its own interface rather than `FoundryWorldCollection<FoundryUser>`:
 * that generic is constrained to {@link FoundryDocumentLike} (uuid/toObject/...), which
 * a `User` document doesn't carry. */
interface FoundryUsersCollection {
  get(id: string): FoundryUser | undefined;
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
  /** `execute-macro`'s (0026 S3) macro-by-id lookup. */
  readonly macros: FoundryWorldCollection<FoundryMacro>;
  /** `query-rolls`'s (0028 S3, D28-3/D28-10) chat-message history. */
  readonly messages: FoundryMessagesCollection;
  /** `apply-condition`'s (0026 S3 D-14) persistent-damage non-dialog path. Required,
   * not optional — same "this module targets pf2e exclusively" reasoning as
   * `FoundryActor`'s condition methods. */
  readonly pf2e: FoundryPf2eNamespace;
  /** The designated-dialer gate's (0027 D27-2/D27-9) user-by-id lookup — resolves
   * `bridge-user-id` against the world's actual user list to distinguish "some other
   * GM is designated" from "the setting is misconfigured". */
  readonly users: FoundryUsersCollection;
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
