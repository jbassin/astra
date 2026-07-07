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
