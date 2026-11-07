// The logic behind the builder's server functions (`builderFns.ts`), kept apart from the
// `createServerFn` wrappers so tests call it directly with a temp store.

import { getLogger, getTracer, lazyCounter } from "@astra/observe";
import { SpanStatusCode } from "@opentelemetry/api";

import type { Answers, CharacterDoc, StepKey } from "@/domain/character";
import { answeredSteps, applicableStepCount } from "@/domain/steps";

import { dmTokenMatches } from "./dmToken";
import type { BuilderStore } from "./store";

const SCOPE = "astra.builder";
const tracer = getTracer(SCOPE);
const logger = getLogger(SCOPE);
const saveCounter = lazyCounter(SCOPE, "astra.builder.saves", {
  description: "Character saves by outcome (ok, error)",
});

export interface PlayerPage {
  name: string;
  character: CharacterDoc | null;
}

/** The player page's data, or `null` for an id not on the roster. */
export function loadPlayerPage(store: BuilderStore, id: string): PlayerPage | null {
  const player = store.findPlayer(id);
  if (!player) return null;
  return { name: player.name, character: store.readCharacter(id) ?? null };
}

/** Saves a player's answers and returns the new `updatedAt`. Throws for an unknown id. */
export function savePlayerAnswers(
  store: BuilderStore,
  id: string,
  answers: Answers,
): { updatedAt: string } {
  return tracer.startActiveSpan("builder.save", (span) => {
    try {
      const doc = store.saveCharacter(id, answers);
      saveCounter.add(1, { outcome: "ok" });
      return { updatedAt: doc.updatedAt };
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
    return {
      name: player.name,
      link: playerLink(opts.publicOrigin, player.id),
      createdAt: player.createdAt,
      updatedAt: doc?.updatedAt ?? null,
      answered: answeredSteps(answers),
      total: applicableStepCount(answers),
      answers,
    };
  });
}

/** The link a player opens: `<public-origin>/c/<id>`. */
export function playerLink(publicOrigin: string, id: string): string {
  return `${publicOrigin.replace(/\/+$/, "")}/c/${id}`;
}
