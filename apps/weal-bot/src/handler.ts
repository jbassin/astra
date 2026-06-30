/**
 * Message orchestration — TS port of `handler.rs`'s handle_message → roll/save/reseed
 * flow, with the discord.js + Postgres + overlay I/O behind an injectable
 * {@link HandlerDeps} so the whole pipeline unit-tests dry (spec W12 / acceptance D).
 *
 * Faithful to faerrin: a parse/eval failure is a **silent no-op**; `to_plot` and
 * `to_roll_lazy` are computed by the roller but ignored here (as `handler.rs` does).
 */

import { getLogger, getMeter, getTracer } from "@astra/observe";
import type { WealHost } from "@astra/ontology";
import { SpanStatusCode } from "@opentelemetry/api";
import { saveDie, type WealStore } from "./db";
import { hostSays, rollGoodness } from "./hosts";
import {
  classify,
  dieFooter,
  dieTitle,
  NUMBER_LINES,
  newSeedInfo,
  type OverlayPayload,
  overlayPayload,
  RESEED_LINES,
  resultsField,
  type SeedInfo,
  thumbnailFor,
} from "./message";
import {
  type RollDie,
  type RollNumber,
  type RollRng,
  roll as rollExpr,
  rollValue,
  type Save,
} from "./roller";
import type { Profile } from "./roster";

/** A host-identity embed to post via webhook (username/avatar/color = the host). */
export interface OutgoingMessage {
  host: WealHost;
  title?: string;
  contents?: string;
  fields: [string, string][];
  thumbnail?: string;
  footer?: string;
}

export interface HandlerDeps {
  rng: RollRng;
  store: WealStore;
  /** Resolve an ontology weal-host by slug (gsr / knife / …). */
  host: (slug: string) => WealHost;
  /** Saved-macro env for the roller (the loaded `funcs`). */
  initFuncs: () => [string, string][];
  addFunc: (name: string, payload: string) => void;
  getSeed: () => SeedInfo;
  setSeed: (seed: SeedInfo) => void;
  /** Post an embed as a host (webhook). */
  send: (msg: OutgoingMessage) => Promise<void>;
  /** Best-effort dice-feed + v1 overlay broadcast (non-fatal on failure). */
  broadcast: (payload: OverlayPayload, playerName: string) => Promise<void>;
}

function choose<T>(rng: RollRng, xs: readonly T[]): T {
  return rng.choose([...xs]);
}

// Module-scope instruments (no-ops until initTelemetry runs in index.ts; safe in the dry
// unit tests). One span per non-empty message wraps the whole roll/save/reseed pipeline.
const tracer = getTracer("astra.weal-bot");
const log = getLogger("astra.weal-bot");
const rollsCounter = getMeter("astra.weal-bot").createCounter("astra.weal.rolls", {
  description: "Dice rolls evaluated, by goodness",
});

/** Entry: classify a raw Discord message and run the matching flow. */
export async function handleMessage(
  raw: string,
  profile: Profile,
  deps: HandlerDeps,
): Promise<void> {
  const action = classify(raw);
  if (action.kind === "empty") return;
  await tracer.startActiveSpan(
    "weal.handleMessage",
    { attributes: { "weal.action": action.kind, "weal.player": profile.playerName } },
    async (span) => {
      try {
        if (action.kind === "reseed") await reseed(profile, deps);
        else await doRoll(action.text, profile, deps);
      } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
        throw err;
      } finally {
        span.end();
      }
    },
  );
}

async function reseed(profile: Profile, deps: HandlerDeps): Promise<void> {
  const seed = newSeedInfo(profile);
  deps.setSeed(seed);
  await deps.send({
    host: deps.host("knife"),
    title: `${seed.blame} reseeded!`,
    contents: choose(deps.rng, RESEED_LINES),
    fields: [["New Seed", String(seed.seed)]],
  });
}

async function doRoll(text: string, profile: Profile, deps: HandlerDeps): Promise<void> {
  const result = rollExpr(text, deps.initFuncs(), deps.rng);
  if (!result.ok) return; // silent no-op on a parse/eval failure
  for (const roll of result.value.toRoll) {
    if (roll.k === "Number") await sendNumber(text, roll, profile, deps);
    else await handleDie(roll, profile, deps);
  }
  for (const save of result.value.toSave) await handleSave(save, profile, deps);
}

async function handleDie(roll: RollDie, profile: Profile, deps: HandlerDeps): Promise<void> {
  await saveDie(deps.store, roll, profile.playerId, deps.getSeed().blameId);
  const goodness = rollGoodness(roll);
  rollsCounter.add(1, { goodness: String(goodness) });
  log.emit({
    severityText: "INFO",
    body: `roll: ${profile.playerName} → ${rollValue(roll)} (${String(goodness)})`,
  });
  const { host, line } = hostSays(deps.host("gsr"), roll, deps.rng);
  await deps.send({
    host,
    title: dieTitle(profile.characterName, rollValue(roll), goodness),
    contents: line,
    fields: [resultsField(roll)],
    thumbnail: thumbnailFor(profile.edition, profile.characterClass, host.avatar),
    footer: dieFooter(goodness, deps.getSeed().seed, deps.getSeed().blame),
  });
  await deps.broadcast(overlayPayload(profile.playerName, roll, goodness), profile.playerName);
}

async function sendNumber(
  text: string,
  roll: RollNumber,
  profile: Profile,
  deps: HandlerDeps,
): Promise<void> {
  await deps.send({
    host: deps.host("knife"),
    title: `i invented the number ${roll.value}`,
    contents: choose(deps.rng, NUMBER_LINES),
    fields: [["Result", `${text} = \`${roll.value}\``]],
    footer: `:P for ${profile.playerName.toLowerCase()}`,
  });
}

async function handleSave(save: Save, profile: Profile, deps: HandlerDeps): Promise<void> {
  deps.addFunc(save.name, save.payload);
  await deps.store.insertFunc(save.name, save.payload);
  await deps.send({
    host: deps.host("knife"),
    title: `${save.name} saved!`,
    contents: `hmm.... okay ${profile.playerName.toLowerCase()}, ill remember that\n\`\`\`json\n${save.payload}\n\`\`\``,
    fields: [],
  });
}
