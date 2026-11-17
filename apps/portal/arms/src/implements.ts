// The boss's active and inactive Implements: Foundry glue (the rules are in implements-state.ts).
// Every Implement starts active; each threshold the health bars cross moves one, at random, to the
// inactive set. At the top of each round the sets are reshuffled (same sizes), the active
// Implements roll initiative, the inactive ones have theirs cleared, and any inactive Implement's
// turn is skipped. Inactive Implements stay in the combat, and their tokens draw in greyscale.
//
// Only the active GM client writes. The token flag `flags.world.ikInactive` is the truth for the
// sets; the scene flag `flags.world.ikImplements` names the bars and the Implements.

import { FLAG_KEY as ARM_KEY } from "./config";
import {
  adjust,
  FLAG_SCOPE,
  type Hp,
  IMPLEMENTS_KEY,
  type ImplementsConfig,
  INACTIVE_KEY,
  inactiveTarget,
  parseImplementsFlag,
  reshuffle,
} from "./implements-state";

export interface ImplementsStartOptions {
  /** The health bar tokens (tokens, token documents or ids). Required. */
  bars: (FoundryToken | FoundryTokenDocument | string)[];
  /** Defaults to every token on the viewed scene with an `ikArm` flag. */
  implements?: (FoundryToken | FoundryTokenDocument | string)[];
}

export interface ImplementsStatus {
  active: boolean;
  scene?: string;
  thresholds?: number;
  implements?: { id: string; name: string; inactive: boolean; initiative: number | null }[];
}

export interface ImplementsApi {
  start(options: ImplementsStartOptions): Promise<void>;
  stop(): Promise<void>;
  /** Draw a new random active set of the same size now (no initiative change). */
  reshuffle(): Promise<void>;
  /** Make exactly these Implements inactive, until the next threshold or round. */
  setInactive(tokens: (FoundryToken | FoundryTokenDocument | string)[]): Promise<void>;
  status(): ImplementsStatus;
}

interface Fight {
  readonly scene: FoundryScene;
  readonly config: ImplementsConfig;
}

function isWriter(): boolean {
  return game.users.activeGM?.isSelf === true;
}

function idOf(token: FoundryToken | FoundryTokenDocument | string): string {
  return typeof token === "string" ? token : token.id;
}

function findFight(): Fight | null {
  for (const scene of game.scenes.contents) {
    const config = parseImplementsFlag(scene.getFlag(FLAG_SCOPE, IMPLEMENTS_KEY));
    if (config?.active) return { scene, config };
  }
  return null;
}

function implementDocs(fight: Fight): FoundryTokenDocument[] {
  return fight.config.implements.flatMap((id) => fight.scene.tokens.get(id) ?? []);
}

function isInactive(doc: FoundryTokenDocument): boolean {
  return doc.getFlag(FLAG_SCOPE, INACTIVE_KEY) === true;
}

function inactiveIds(fight: Fight): string[] {
  return implementDocs(fight)
    .filter(isInactive)
    .map((doc) => doc.id);
}

function barHp(fight: Fight): Hp[] {
  return fight.config.bars.flatMap((id) => {
    const hp = fight.scene.tokens.get(id)?.actor?.system.attributes?.hp;
    return hp?.value !== undefined && hp.max !== undefined
      ? [{ value: hp.value, max: hp.max }]
      : [];
  });
}

function shortName(doc: FoundryTokenDocument): string {
  return doc.name.replace(/^Implement of /, "");
}

/** The active GM is often the headless client, so its notifications reach no one: whisper. */
function whisperGm(content: string): void {
  void ChatMessage.create({ content, whisper: ChatMessage.getWhisperRecipients("GM") });
}

/** Write the inactive set onto the tokens; Implements already in the right state are left alone. */
async function writeInactive(fight: Fight, inactive: readonly string[]): Promise<void> {
  await Promise.all(
    implementDocs(fight).map(async (doc) => {
      const want = inactive.includes(doc.id);
      if (want === isInactive(doc)) return;
      if (want) await doc.setFlag(FLAG_SCOPE, INACTIVE_KEY, true);
      else await doc.unsetFlag(FLAG_SCOPE, INACTIVE_KEY);
    }),
  );
}

/** Bring the inactive count in line with the thresholds crossed. */
async function sync(): Promise<void> {
  const fight = findFight();
  if (!fight) return;
  const before = inactiveIds(fight);
  const target = inactiveTarget(barHp(fight), fight.config.implements.length);
  if (before.length === target) return;
  const after = adjust(fight.config.implements, before, target, Math.random);
  await writeInactive(fight, after);
  const names = (ids: string[]): string =>
    implementDocs(fight)
      .filter((doc) => ids.includes(doc.id))
      .map(shortName)
      .join(", ");
  const went = after.filter((id) => !before.includes(id));
  const back = before.filter((id) => !after.includes(id));
  const parts = [
    went.length > 0 ? `${names(went)} goes inactive` : "",
    back.length > 0 ? `${names(back)} is active again` : "",
  ].filter(Boolean);
  whisperGm(
    `<strong>ESOTERICA</strong>: ${parts.join("; ")}. ${fight.config.implements.length - target} of ${fight.config.implements.length} Implements active.`,
  );
}

/** The fight's Implements in this combat. */
function implementCombatants(fight: Fight, combat: FoundryCombat): FoundryCombatant[] {
  return combat.combatants.filter(
    (c) => c.sceneId === fight.scene.id && fight.config.implements.includes(c.tokenId ?? ""),
  );
}

/** Top of a round: reshuffle the sets, clear the inactive initiatives, roll the active ones. */
async function newRound(combat: FoundryCombat): Promise<void> {
  const fight = findFight();
  if (!fight) return;
  const target = inactiveTarget(barHp(fight), fight.config.implements.length);
  const inactive = reshuffle(fight.config.implements, target, Math.random);
  await writeInactive(fight, inactive);
  const combatants = implementCombatants(fight, combat);
  const off = combatants.filter((c) => inactive.includes(c.tokenId ?? ""));
  const on = combatants.filter((c) => !inactive.includes(c.tokenId ?? ""));
  if (off.length > 0) {
    await combat.updateEmbeddedDocuments(
      "Combatant",
      off.map((c) => ({ _id: c.id, initiative: null })),
    );
  }
  if (on.length > 0) {
    await combat.rollInitiative(
      on.map((c) => c.id),
      { skipDialog: true, messageMode: "gm", updateTurn: false },
    );
  }
  const names = on.map((c) => c.name.replace(/^Implement of /, "")).join(", ");
  whisperGm(`<strong>ESOTERICA</strong>, round ${combat.round}: active Implements are ${names}.`);
}

/** If the current turn is an inactive Implement's, move on (or back, when the GM went back). */
async function skipInactive(combat: FoundryCombat, direction: number | undefined): Promise<void> {
  const fight = findFight();
  if (!fight || !combat.started) return;
  const current = combat.combatant;
  if (!current || current.sceneId !== fight.scene.id) return;
  const doc = fight.scene.tokens.get(current.tokenId ?? "");
  if (!doc || !fight.config.implements.includes(doc.id) || !isInactive(doc)) return;
  if (direction === -1) await combat.previousTurn();
  else await combat.nextTurn();
}

let queue: Promise<void> = Promise.resolve();
function enqueue(task: () => Promise<void>): Promise<void> {
  queue = queue.then(task).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    whisperGm(`<strong>ESOTERICA</strong>: the active Implements update failed: ${message}`);
  });
  return queue;
}

async function start(options: ImplementsStartOptions): Promise<void> {
  if (!game.user.isGM) {
    ui.notifications.warn("Only a GM can start the active Implements.");
    return;
  }
  const scene = canvas.scene;
  if (!scene) {
    ui.notifications.error("Implements: no scene is being viewed.");
    return;
  }
  const bars = [...new Set(options.bars.map(idOf))].filter((id) => scene.tokens.get(id));
  const implementIds = [
    ...new Set(
      options.implements
        ? options.implements.map(idOf)
        : canvas.tokens.placeables
            .filter((t) => t.document.getFlag(FLAG_SCOPE, ARM_KEY) !== undefined)
            .map((t) => t.id),
    ),
  ].filter((id) => scene.tokens.get(id));
  if (bars.length === 0 || implementIds.length === 0) {
    ui.notifications.error("Implements: needs at least one bar token and one Implement token.");
    return;
  }
  await stop();
  await scene.setFlag(FLAG_SCOPE, IMPLEMENTS_KEY, {
    bars,
    implements: implementIds,
    active: true,
  });
  await enqueue(sync);
}

async function stop(): Promise<void> {
  await enqueue(async () => {
    const fight = findFight();
    if (!fight) return;
    await fight.scene.setFlag(FLAG_SCOPE, IMPLEMENTS_KEY, { ...fight.config, active: false });
    await writeInactive(fight, []);
  });
}

async function reshuffleNow(): Promise<void> {
  await enqueue(async () => {
    const fight = findFight();
    if (!fight) return;
    const target = inactiveIds(fight).length;
    await writeInactive(fight, reshuffle(fight.config.implements, target, Math.random));
  });
}

async function setInactive(
  tokens: (FoundryToken | FoundryTokenDocument | string)[],
): Promise<void> {
  await enqueue(async () => {
    const fight = findFight();
    if (fight) await writeInactive(fight, tokens.map(idOf));
  });
}

function status(): ImplementsStatus {
  const fight = findFight();
  if (!fight) return { active: false };
  const combat = game.combat;
  return {
    active: true,
    scene: fight.scene.id,
    thresholds: inactiveTarget(barHp(fight), fight.config.implements.length),
    implements: implementDocs(fight).map((doc) => ({
      id: doc.id,
      name: doc.name,
      inactive: isInactive(doc),
      initiative:
        combat?.combatants.find((c) => c.tokenId === doc.id && c.sceneId === fight.scene.id)
          ?.initiative ?? null,
    })),
  };
}

// --- Greyscale, on every client --------------------------------------------------------------

let greyFilter: PIXI.ColorMatrixFilter | null = null;
function grey(): PIXI.ColorMatrixFilter {
  if (!greyFilter) {
    greyFilter = new PIXI.ColorMatrixFilter();
    greyFilter.desaturate();
  }
  return greyFilter;
}

/** Grey an inactive Implement's token symbol; restore it when it is active again. */
function paintToken(token: FoundryToken): void {
  const mesh = token.mesh;
  if (!mesh || mesh.destroyed) return;
  const filter = grey();
  const want = isInactive(token.document);
  const has = mesh.filters?.includes(filter) ?? false;
  if (want === has) return;
  const others = (mesh.filters ?? []).filter((f) => f !== filter);
  mesh.filters = want ? [...others, filter] : others.length > 0 ? others : null;
}

/** Grey the inactive Implements' rows in the combat tracker. */
function paintTracker(_app: unknown, element: HTMLElement | { 0?: HTMLElement }): void {
  const root = element instanceof HTMLElement ? element : element[0];
  const combat = game.combat;
  if (!root || !combat) return;
  for (const li of root.querySelectorAll<HTMLElement>("[data-combatant-id]")) {
    const doc = combat.combatants.get(li.dataset.combatantId ?? "")?.token;
    const off = doc ? isInactive(doc) : false;
    li.style.filter = off ? "grayscale(1)" : "";
    li.style.opacity = off ? "0.55" : "";
  }
}

/** Register the hooks and resume an active fight. `teardown` removes the hooks and the greying. */
export function createImplements(): { api: ImplementsApi; teardown(): void } {
  const hooks: [name: string, id: number][] = [];
  const on = (name: string, fn: (...args: never[]) => void): void => {
    hooks.push([name, Hooks.on(name, fn)]);
  };

  // A bar's hit points changed (the damage redirect macro writes them).
  on("updateActor", (actor: FoundryActor) => {
    if (!isWriter()) return;
    const id = actor.token?.id;
    if (id && findFight()?.config.bars.includes(id)) void enqueue(sync);
  });
  on(
    "updateCombat",
    (
      combat: FoundryCombat,
      change: { round?: number; turn?: number },
      options: { direction?: number },
    ) => {
      if (!isWriter() || !combat.started) return;
      if (!("round" in change) && !("turn" in change)) return;
      const forward = options?.direction !== -1;
      // Round 1's initiative is the one rolled to start the fight.
      if (forward && typeof change.round === "number" && change.round >= 2) {
        void enqueue(() => newRound(combat));
      }
      void enqueue(() => skipInactive(combat, options?.direction));
    },
  );
  // Every client: grey the token and the tracker row when the flag changes.
  on("updateToken", (doc: FoundryTokenDocument, change: { flags?: Record<string, unknown> }) => {
    const world = change.flags?.[FLAG_SCOPE];
    if (typeof world !== "object" || world === null) return;
    if (!(INACTIVE_KEY in world) && !(`-=${INACTIVE_KEY}` in world)) return;
    if (doc.object) paintToken(doc.object);
    ui.combat?.render();
  });
  on("refreshToken", (token: FoundryToken) => paintToken(token));
  on("renderEncounterTracker", paintTracker);
  on("renderCombatTracker", paintTracker);

  const resumeNow = (): void => {
    if (isWriter()) void enqueue(sync);
  };
  if (typeof game !== "undefined" && game.ready) resumeNow();
  else hooks.push(["ready", Hooks.once("ready", resumeNow)]);
  if (typeof canvas !== "undefined" && canvas.ready) {
    for (const token of canvas.tokens.placeables) paintToken(token);
  }

  return {
    api: { start, stop, reshuffle: reshuffleNow, setInactive, status },
    teardown: () => {
      for (const [name, id] of hooks) Hooks.off(name, id);
      if (typeof canvas !== "undefined" && canvas.ready && greyFilter) {
        const filter = greyFilter;
        for (const token of canvas.tokens.placeables) {
          const mesh = token.mesh;
          if (mesh?.filters?.includes(filter)) {
            const others = mesh.filters.filter((f) => f !== filter);
            mesh.filters = others.length > 0 ? others : null;
          }
        }
      }
    },
  };
}
