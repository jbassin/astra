/**
 * Message orchestration — classify → engine → embeds/persistence/overlay, with
 * the discord.js + Postgres + overlay I/O behind an injectable
 * {@link HandlerDeps} so the whole pipeline unit-tests dry (spec 0032 S6).
 *
 * Rolls are evaluated by `@astra/weal-engine` (D32-14): parse failures stay
 * silent (chat noise); other engine errors reply visibly only past the noise
 * gate; a contained panic replies with an engine-fault notice. Persistence
 * writes only for roll-resolving results; plot-only results skip persistence
 * AND the overlay broadcast (D32-16/17).
 */

import { getLogger, getTracer, lazyCounter } from "@astra/observe";
import type { WealHost } from "@astra/ontology";
import type {
  WealDieDisplay,
  WealErr,
  WealPlot,
  WealSave,
  WealValueDisplay,
} from "@astra/weal-engine";
import { type Span, SpanStatusCode } from "@opentelemetry/api";

import { saveDice, type WealStore } from "./db";
import { type EngineHooks, isBareAtom, passesNoiseGate, runEngine } from "./engine";
import { hostSays } from "./hosts";
import {
  classify,
  dieFooter,
  dieTitle,
  errorDescription,
  FIELD_LIMIT,
  NUMBER_LINES,
  newSeedInfo,
  type OverlayPayload,
  overlayPayload,
  RESEED_LINES,
  resultsField,
  type SeedInfo,
  thumbnailFor,
  truncate,
} from "./message";
import type { FlavorRng } from "./rng";
import type { Profile } from "./roster";

/** A host-identity embed to post via webhook (username/avatar/color = the host). */
export interface OutgoingMessage {
  host: WealHost;
  title?: string;
  contents?: string;
  fields: [string, string][];
  thumbnail?: string;
  footer?: string;
  /** Embed image URL — `attachment://plot.png` for the D32-16 plot embed. */
  image?: string;
  /** File attachments forwarded to the webhook send (D32-16). */
  files?: { name: string; data: Uint8Array }[];
}

export interface HandlerDeps {
  rng: FlavorRng;
  store: WealStore;
  /** Resolve an ontology weal-host by slug (gsr / knife / …). */
  host: (slug: string) => WealHost;
  /** The runtime save list for the engine (`[name, source]` in id order). */
  initFuncs: () => [string, string][];
  addFunc: (name: string, source: string) => void;
  /** Saved names for the D32-14 noise gate. */
  savedNames: () => string[];
  /** 32 bytes of engine entropy per roll (crypto in the gateway, fixed in tests). */
  seed: () => Uint8Array;
  getSeed: () => SeedInfo;
  setSeed: (seed: SeedInfo) => void;
  /** Post an embed as a host (webhook). */
  send: (msg: OutgoingMessage) => Promise<void>;
  /** Best-effort dice-feed + v1 overlay broadcast (non-fatal on failure). */
  broadcast: (payload: OverlayPayload, playerName: string) => Promise<void>;
  /** Test seam only: swap the engine call / re-instantiation (panic fixture). */
  engineHooks?: EngineHooks;
}

// Module-scope instruments (no-ops until initTelemetry runs in index.ts; safe in the dry
// unit tests). One span per non-empty message wraps the whole roll/save/reseed pipeline.
const tracer = getTracer("astra.weal-bot");
const log = getLogger("astra.weal-bot");
const rollsCounter = lazyCounter("astra.weal-bot", "astra.weal.rolls", {
  description: "Dice rolls evaluated, by goodness",
});
const errorsCounter = lazyCounter("astra.weal-bot", "weal.v2.errors", {
  description: "weal v2 engine errors, by stage (incl. panic)",
});
const fuelAbortsCounter = lazyCounter("astra.weal-bot", "weal.v2.fuel_aborts", {
  description: "weal v2 fuel-budget aborts",
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
        else await doRoll(action.text, profile, deps, span);
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
    contents: deps.rng.choose(RESEED_LINES),
    fields: [["New Seed", String(seed.seed)]],
  });
}

async function doRoll(
  text: string,
  profile: Profile,
  deps: HandlerDeps,
  span: Span,
): Promise<void> {
  const saves = deps.initFuncs();
  const started = performance.now();
  const outcome = runEngine(text, saves, deps.seed(), deps.engineHooks);
  span.setAttribute("weal.engine_ms", performance.now() - started);

  if (outcome.kind === "fault") {
    await sendEngineFault(deps);
    return;
  }
  if (outcome.kind === "error") {
    await handleError(text, outcome.error, saves, deps);
    return;
  }

  const { displays, plots, saves: newSaves } = outcome.value;
  // A lone atom literal (`:p`) evaluates fine but is chat noise — silent (D32-14).
  if (isBareAtom(text) && plots.length === 0 && newSaves.length === 0) return;

  for (const display of displays) {
    if (display.kind === "die") await handleDie(text, display, profile, deps, span);
    else await sendValue(text, display, profile, deps);
  }
  for (const plot of plots) await sendPlot(plot, deps);
  for (const save of newSaves) await handleSave(save, profile, deps);
}

async function handleDie(
  text: string,
  display: WealDieDisplay,
  profile: Profile,
  deps: HandlerDeps,
  span: Span,
): Promise<void> {
  await saveDice(deps.store, display.standardDice, profile.playerId, deps.getSeed().blameId);
  const goodness = display.goodness;
  span.setAttribute("weal.goodness", String(goodness));
  rollsCounter.add(1, { goodness: String(goodness) });
  log.emit({
    severityText: "INFO",
    body: `roll: ${profile.playerName} → ${display.headline} (${String(goodness)})`,
  });
  const { host, line } = hostSays(deps.host("gsr"), goodness, deps.rng);
  await deps.send({
    host,
    title: dieTitle(profile.characterName, display.headline, goodness),
    contents: line,
    fields: [resultsField(display)],
    thumbnail: thumbnailFor(profile.edition, profile.characterClass, host.avatar),
    footer: dieFooter(goodness, deps.getSeed().seed, deps.getSeed().blame),
  });
  await deps.broadcast(overlayPayload(profile.playerName, text, display), profile.playerName);
}

async function sendValue(
  text: string,
  display: WealValueDisplay,
  profile: Profile,
  deps: HandlerDeps,
): Promise<void> {
  await deps.send({
    host: deps.host("knife"),
    title: truncate(`i invented the number ${display.headline}`, 256),
    contents: deps.rng.choose(NUMBER_LINES),
    fields: [["Result", truncate(`${text} = \`${display.headline}\``, FIELD_LIMIT)]],
    footer: `:P for ${profile.playerName.toLowerCase()}`,
  });
}

async function sendPlot(plot: WealPlot, deps: HandlerDeps): Promise<void> {
  await deps.send({
    host: deps.host("gsr"),
    title: truncate(plot.title, 256),
    fields: [
      ["Mean", plot.mean ?? "—"],
      ["Std", plot.std ?? "—"],
    ],
    image: "attachment://plot.png",
    files: [{ name: "plot.png", data: Uint8Array.from(Buffer.from(plot.pngBase64, "base64")) }],
  });
}

async function handleSave(save: WealSave, profile: Profile, deps: HandlerDeps): Promise<void> {
  deps.addFunc(save.name, save.source);
  await deps.store.insertFuncV2(save.name, save.source);
  await deps.send({
    host: deps.host("knife"),
    title: `${save.name} saved!`,
    contents: `hmm.... okay ${profile.playerName.toLowerCase()}, ill remember that\n\`\`\`weal\n${save.source}\n\`\`\``,
    fields: [],
  });
}

async function handleError(
  text: string,
  err: WealErr,
  saves: [string, string][],
  deps: HandlerDeps,
): Promise<void> {
  if (err.stage === "parse") return; // chat noise — silent, uncounted (D32-14)
  errorsCounter.add(1, { stage: err.stage });
  if (err.stage === "fuel") fuelAbortsCounter.add(1);
  if (!passesNoiseGate(text, deps.savedNames())) return;
  await deps.send({
    host: deps.host("knife"),
    title: "that didn't check out",
    contents: errorDescription(text, err, saves),
    fields: [],
  });
}

async function sendEngineFault(deps: HandlerDeps): Promise<void> {
  await deps.send({
    host: deps.host("knife"),
    title: "engine fault",
    contents: "something broke deep in the dice machinery — i reset it, try that again",
    fields: [],
  });
}
