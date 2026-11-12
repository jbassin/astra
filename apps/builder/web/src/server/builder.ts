// The logic behind the builder's server functions (`builderFns.ts`), kept apart from the
// `createServerFn` wrappers so tests call it directly with a temp store.

import { getLogger, getTracer, lazyCounter } from "@astra/observe";
import { SpanStatusCode } from "@opentelemetry/api";

import type { Answers, CharacterDoc, PlayState, StepKey } from "@/domain/character";
import { answeredSteps, applicableStepCount, pruneAnswers } from "@/domain/steps";

import { dmTokenMatches } from "./dmToken";
import type { BuilderStore } from "./store";

const SCOPE = "astra.builder";
const tracer = getTracer(SCOPE);
const logger = getLogger(SCOPE);
const saveCounter = lazyCounter(SCOPE, "astra.builder.saves", {
  description: "Character saves by outcome (ok, error)",
});

/** Class id to the name of the roster player who holds it. */
export type TakenClasses = Record<string, string>;

export interface PlayerPage {
  name: string;
  character: CharacterDoc | null;
  taken: TakenClasses;
}

/**
 * The classes other players hold, by class id, with the holder's name. The asking player's own
 * class never appears. When two others hold the same class, the first on the roster wins.
 */
export function takenClasses(store: BuilderStore, exceptId: string): TakenClasses {
  const taken: TakenClasses = {};
  for (const player of store.readRoster()) {
    if (player.id === exceptId) continue;
    const classId = store.readCharacter(player.id)?.answers.classId;
    if (classId && !(classId in taken)) taken[classId] = player.name;
  }
  return taken;
}

/** The player page's data, or `null` for an id not on the roster. */
export function loadPlayerPage(store: BuilderStore, id: string): PlayerPage | null {
  const player = store.findPlayer(id);
  if (!player) return null;
  return {
    name: player.name,
    character: store.readCharacter(id) ?? null,
    taken: takenClasses(store, id),
  };
}

/**
 * Saves a player's answers and returns the new `updatedAt` and the classes others hold. A class
 * another player already holds is saved without (the first save wins), and so are the picks
 * that depend on it, and the play state too (it counted that class). Throws for an unknown id.
 */
export function savePlayerAnswers(
  store: BuilderStore,
  id: string,
  answers: Answers,
  play?: PlayState,
): { updatedAt: string; taken: TakenClasses } {
  return tracer.startActiveSpan("builder.save", (span) => {
    try {
      const taken = takenClasses(store, id);
      let kept = answers;
      let keptPlay = play;
      if (answers.classId && answers.classId in taken) {
        const { classId: _lost, ...rest } = answers;
        kept = pruneAnswers(rest);
        keptPlay = undefined;
      }
      const doc = store.saveCharacter(id, kept, keptPlay);
      saveCounter.add(1, { outcome: "ok" });
      return { updatedAt: doc.updatedAt, taken };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message });
      saveCounter.add(1, { outcome: "error" });
      // WARN, not ERROR: a bad link or a stale tab is a user problem, and ERROR pages Discord.
      logger.emit({ severityText: "WARN", body: `builder save failed: ${message}` });
      throw err;
    } finally {
      span.end();
    }
  });
}

export interface DmPlayerRow {
  name: string;
  link: string;
  createdAt: string;
  updatedAt: string | null;
  answered: StepKey[];
  /** How many steps apply to this player's character so far (a Barbarian skips spells). */
  total: number;
  answers: Answers;
  play?: PlayState;
}

/** Every roster player with their answers, or `null` when the token does not match. */
export function loadDmView(
  store: BuilderStore,
  opts: { token: string; expected: string | undefined; publicOrigin: string },
): DmPlayerRow[] | null {
  if (!dmTokenMatches(opts.token, opts.expected)) return null;
  return store.readRoster().map((player) => {
    const doc = store.readCharacter(player.id);
    const answers = doc?.answers ?? {};
    const row: DmPlayerRow = {
      name: player.name,
      link: playerLink(opts.publicOrigin, player.id),
      createdAt: player.createdAt,
      updatedAt: doc?.updatedAt ?? null,
      answered: answeredSteps(answers),
      total: applicableStepCount(answers),
      answers,
    };
    if (doc?.play) row.play = doc.play;
    return row;
  });
}

/** The link a player opens: `<public-origin>/c/<id>`. */
export function playerLink(publicOrigin: string, id: string): string {
  return `${publicOrigin.replace(/\/+$/, "")}/c/${id}`;
}
