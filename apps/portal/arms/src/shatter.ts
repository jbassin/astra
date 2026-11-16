// The shatter mechanic's Foundry glue (the rules are in shatter-state.ts). Four of the arms
// shimmer; hitting a shimmering arm shatters it; the third shatter puts a Weakness effect on every
// arm actor for one round; when that window ends everything resets and four new arms shimmer.
//
// Only the active GM client acts, so there is exactly one writer. The per-token flag
// `flags.world.ikShatter = {state, since}` is the truth for arm states and the contract with the
// visuals; the fight's settings and the open window live in a scene flag (shatter-config.ts).

import { FLAG_KEY as ARM_KEY } from "./config";
import {
  EFFECT_FLAG,
  FIGHT_DEFAULTS,
  FIGHT_KEY,
  FLAG_SCOPE,
  type FightConfig,
  parseFightFlag,
  parseShatterFlag,
  SHATTER_KEY,
  type ShatterWindow,
  windowEnded,
} from "./shatter-config";
import {
  type ArmState,
  fromStates,
  hit,
  isTriggered,
  pick,
  type Round,
  statesOf,
} from "./shatter-state";

const EFFECT_ICON = "icons/magic/defensive/shield-barrier-deflect-gold.webp";

export interface ShatterStartOptions {
  /** Defaults to every token on the viewed scene with an `ikArm` flag. */
  arms?: (FoundryToken | FoundryTokenDocument | string)[];
}

export interface ShatterStatus {
  active: boolean;
  scene?: string;
  arms?: { id: string; name: string; state: ArmState | "normal"; eligible: boolean }[];
  needed?: number;
  shattered?: number;
  windowOpen?: boolean;
  window?: ShatterWindow | null;
  effects?: number;
}

export interface ShatterApi {
  start(options?: ShatterStartOptions): Promise<void>;
  stop(): Promise<void>;
  reroll(): Promise<void>;
  status(): ShatterStatus;
}

interface Fight {
  readonly scene: FoundryScene;
  readonly config: FightConfig;
}

/** True on the one client that acts: the active GM. */
function isWriter(): boolean {
  return game.users.activeGM?.isSelf === true;
}

function findFight(): Fight | null {
  for (const scene of game.scenes.contents) {
    const config = parseFightFlag(scene.getFlag(FLAG_SCOPE, FIGHT_KEY));
    if (config?.active) return { scene, config };
  }
  return null;
}

async function patchFight(fight: Fight, patch: Partial<FightConfig>): Promise<Fight> {
  const config: FightConfig = { ...fight.config, ...patch };
  await fight.scene.setFlag(FLAG_SCOPE, FIGHT_KEY, config);
  return { scene: fight.scene, config };
}

function armDocs(fight: Fight): FoundryTokenDocument[] {
  return fight.config.arms.flatMap((id) => fight.scene.tokens.get(id) ?? []);
}

function readRound(fight: Fight): Round {
  const states = new Map<string, ArmState | undefined>();
  for (const doc of armDocs(fight)) {
    states.set(doc.id, parseShatterFlag(doc.getFlag(FLAG_SCOPE, SHATTER_KEY)));
  }
  return fromStates(states, fight.config.needed);
}

/** An arm with hit points left that is not defeated in the encounter. */
function isEligible(doc: FoundryTokenDocument): boolean {
  const hp = doc.actor?.system.attributes?.hp?.value;
  return (hp === undefined || hp > 0) && !doc.combatant?.isDefeated;
}

/** Write the round onto the arm tokens; arms whose state is already right are left alone. */
async function writeRound(fight: Fight, round: Round): Promise<void> {
  const wanted = statesOf(round, fight.config.arms);
  const now = Date.now();
  await Promise.all(
    armDocs(fight).map(async (doc) => {
      const state = wanted.get(doc.id);
      const current = parseShatterFlag(doc.getFlag(FLAG_SCOPE, SHATTER_KEY));
      if (state === current) return;
      if (state === undefined) await doc.unsetFlag(FLAG_SCOPE, SHATTER_KEY);
      else await doc.setFlag(FLAG_SCOPE, SHATTER_KEY, { state, since: now });
    }),
  );
}

/** Every Shattered effect this module put on the arm actors. */
function ourEffects(fight: Fight): { actor: FoundryActor; ids: string[] }[] {
  return armDocs(fight).flatMap((doc) => {
    const actor = doc.actor;
    if (!actor) return [];
    const ids = actor.items
      .filter((i) => i.getFlag(FLAG_SCOPE, EFFECT_FLAG) === true)
      .map((i) => i.id);
    return ids.length > 0 ? [{ actor, ids }] : [];
  });
}

function effectData(weakness: number): object {
  return {
    type: "effect",
    name: "Shattered",
    img: EFFECT_ICON,
    system: {
      slug: "ik-shattered",
      description: {
        value: `<p>This arm has shattered. It has weakness ${weakness} to all damage until the Shattered window ends.</p>`,
      },
      // No expiry of pf2e's own: the arms take their turns at different times, so a turn-start
      // effect would end one arm at a time. shatter.ts ends the window itself.
      duration: { value: -1, unit: "unlimited", expiry: null, sustained: false },
      tokenIcon: { show: true },
      rules: [{ key: "Weakness", type: "all-damage", value: weakness }],
    },
    flags: { [FLAG_SCOPE]: { [EFFECT_FLAG]: true } },
  };
}

function currentWindow(): ShatterWindow | null {
  const combat = game.combat;
  if (!combat?.started) return null;
  return { combat: combat.id, round: combat.round, turn: combat.turn ?? 0 };
}

/** Put the effect on every arm actor and open the window. */
async function applyEffects(fight: Fight): Promise<Fight> {
  const data = effectData(fight.config.weakness);
  const actors = armDocs(fight).flatMap((doc) => doc.actor ?? []);
  const created = await Promise.all(
    actors.map((actor) => actor.createEmbeddedDocuments("Item", [data])),
  );
  const effectUuids = created.flatMap((items) => items.map((i) => i.uuid));
  const next = await patchFight(fight, { effectUuids, window: currentWindow() });
  ui.notifications.info("ESOTERICA shattered: its arms take extra damage until the window ends.");
  return next;
}

/** Remove our effects from every arm. */
async function removeEffects(fight: Fight): Promise<void> {
  await Promise.all(
    ourEffects(fight).map(({ actor, ids }) => actor.deleteEmbeddedDocuments("Item", ids)),
  );
}

/** Close the window and put every arm back to normal, then (optionally) pick new arms. */
async function resetFight(fight: Fight, pickAgain: boolean): Promise<Fight> {
  // The recorded uuids go first, so the item deletions below read as ours, not as a trigger.
  const cleared = await patchFight(fight, { effectUuids: [], window: null });
  await removeEffects(cleared);
  await writeRound(cleared, { shimmering: [], shattered: [], needed: 0 });
  if (pickAgain) await pickRound(cleared);
  return cleared;
}

async function pickRound(fight: Fight): Promise<void> {
  const eligible = armDocs(fight)
    .filter(isEligible)
    .map((doc) => doc.id);
  const round = pick(eligible, Math.random, fight.config.shimmer, fight.config.needed);
  await writeRound(fight, round);
}

/** Actions run one at a time, so a burst of hits or hooks cannot interleave their writes. */
let queue: Promise<void> = Promise.resolve();
function enqueue(task: () => Promise<void>): Promise<void> {
  queue = queue.then(task).catch((error: unknown) => {
    // The module has no logger; the GM sees the failure and the flags still hold the truth.
    ui.notifications.error(
      `Shatter failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  });
  return queue;
}

async function handleHit(armId: string): Promise<void> {
  const fight = findFight();
  if (!fight?.config.arms.includes(armId)) return;
  const result = hit(readRound(fight), armId);
  if (!result.shattered) return;
  await writeRound(fight, result.round);
  if (result.triggered) await applyEffects(fight);
}

/** The window is over when the effects are gone or combat is back at the window's turn. */
function windowOver(fight: Fight): boolean {
  if (fight.config.effectUuids.length === 0) return false;
  const live = ourEffects(fight).reduce((n, e) => n + e.ids.length, 0);
  if (live < fight.config.effectUuids.length) return true; // one was deleted by hand
  const { window } = fight.config;
  const combat = game.combat;
  if (!window) return false;
  if (!combat || combat.id !== window.combat) return true;
  return windowEnded(window, { round: combat.round, turn: combat.turn ?? 0 });
}

/** Idempotent: a second call, queued behind the first, finds the window already closed. */
async function endWindowIfOver(): Promise<void> {
  const fight = findFight();
  if (fight && windowOver(fight)) {
    await resetFight(fight, true);
    ui.notifications.info("ESOTERICA's arms are whole again; new arms shimmer.");
  }
}

/** After a reload: carry on from the flags. */
async function resume(): Promise<void> {
  const fight = findFight();
  if (!fight) return;
  if (fight.config.effectUuids.length > 0) {
    await endWindowIfOver();
    return;
  }
  const round = readRound(fight);
  if (isTriggered(round)) await applyEffects(fight);
  else if (round.shimmering.length === 0 && round.shattered.length === 0) await pickRound(fight);
}

function idOf(token: FoundryToken | FoundryTokenDocument | string): string {
  return typeof token === "string" ? token : token.id;
}

async function start(options: ShatterStartOptions = {}): Promise<void> {
  if (!game.user.isGM) {
    ui.notifications.warn("Only a GM can start the shatter mechanic.");
    return;
  }
  const scene = canvas.scene;
  if (!scene) {
    ui.notifications.error("Shatter: no scene is being viewed.");
    return;
  }
  const arms = options.arms
    ? options.arms.map(idOf)
    : canvas.tokens.placeables
        .filter((t) => t.document.getFlag(FLAG_SCOPE, ARM_KEY) !== undefined)
        .map((t) => t.id);
  const unique = [...new Set(arms)].filter((id) => scene.tokens.get(id));
  if (unique.length === 0) {
    ui.notifications.error("Shatter: no arm tokens found (they carry flags.world.ikArm).");
    return;
  }
  await stop();
  const config: FightConfig = {
    arms: unique,
    ...FIGHT_DEFAULTS,
    effectUuids: [],
    window: null,
    active: true,
  };
  await scene.setFlag(FLAG_SCOPE, FIGHT_KEY, config);
  await enqueue(async () => {
    const fight = findFight();
    if (fight) await pickRound(fight);
  });
}

async function stop(): Promise<void> {
  await enqueue(async () => {
    const fight = findFight();
    if (!fight) return;
    // Inactive first: the effect deletions and flag writes below must not be read as triggers.
    const off = await patchFight(fight, { active: false });
    await resetFight(off, false);
  });
}

async function reroll(): Promise<void> {
  await enqueue(async () => {
    const fight = findFight();
    if (fight) await resetFight(fight, true);
  });
}

function status(): ShatterStatus {
  const fight = findFight();
  if (!fight) return { active: false };
  const round = readRound(fight);
  return {
    active: true,
    scene: fight.scene.id,
    arms: armDocs(fight).map((doc) => ({
      id: doc.id,
      name: doc.name,
      state: parseShatterFlag(doc.getFlag(FLAG_SCOPE, SHATTER_KEY)) ?? "normal",
      eligible: isEligible(doc),
    })),
    needed: round.needed,
    shattered: round.shattered.length,
    windowOpen: fight.config.effectUuids.length > 0,
    window: fight.config.window,
    effects: ourEffects(fight).reduce((n, e) => n + e.ids.length, 0),
  };
}

/** Register the hooks and resume an active fight. `teardown` removes the hooks. */
export function createShatter(): { api: ShatterApi; teardown(): void } {
  const hooks: [name: string, id: number][] = [];
  const on = (name: string, fn: (...args: never[]) => void): void => {
    hooks.push([name, Hooks.on(name, fn)]);
  };

  // pf2e's applyDamage calls actor.update(changes, { damageTaken }) (undo adds damageUndo).
  // For an unlinked token Foundry fires updateActor with the synthetic actor and the options
  // spread over, so damageTaken arrives intact and `actor.token` names the arm token.
  on(
    "updateActor",
    (
      actor: FoundryActor,
      _changes: unknown,
      options: { damageTaken?: number; damageUndo?: boolean },
    ) => {
      if (!isWriter()) return;
      if (!((options?.damageTaken ?? 0) > 0) || options.damageUndo) return;
      const armId = actor.token?.id;
      if (armId) void enqueue(() => handleHit(armId));
    },
  );
  on("deleteItem", (item: FoundryItem) => {
    if (isWriter() && item.getFlag(FLAG_SCOPE, EFFECT_FLAG) === true) {
      void enqueue(endWindowIfOver);
    }
  });
  on("updateCombat", (_combat: unknown, change: Record<string, unknown>) => {
    if (isWriter() && ("round" in change || "turn" in change)) void enqueue(endWindowIfOver);
  });
  on("deleteCombat", () => {
    if (isWriter()) void enqueue(endWindowIfOver);
  });

  const resumeNow = (): void => {
    if (isWriter()) void enqueue(resume);
  };
  if (typeof game !== "undefined" && game.ready) resumeNow();
  else hooks.push(["ready", Hooks.once("ready", resumeNow)]);

  return {
    api: { start, stop, reroll, status },
    teardown: () => {
      for (const [name, id] of hooks) Hooks.off(name, id);
    },
  };
}
