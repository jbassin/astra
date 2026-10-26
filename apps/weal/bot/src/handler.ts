/**
 * Message orchestration — classify → engine → embeds/persistence/overlay, with
 * the discord.js + Postgres + overlay I/O behind an injectable
 * {@link HandlerDeps} so the whole pipeline unit-tests dry.
 *
 * Rolls are evaluated by `@astra/weal-engine`: parse failures stay
 * silent (chat noise); player errors (type/eval/fuel/prelude) reply visibly
 * only past the noise gate; an engine fault (`stage:"internal"`, incl. a wasm
 * trap the wrapper contained) always gets a short generic reply and an ERROR
 * log with the detail. Roll history is an archive written after the reply
 * (ADR 0025): a slow or failed write never delays or breaks a reply. Only
 * roll-resolving results write history; plot-only results skip it AND the
 * overlay broadcast. A save persists only after the save
 * guard ({@link checkNewSave}) dry-runs it against the current saves; a
 * refused save gets a reply and is neither stored nor added to the list.
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
import type { RollMessage } from "@astra/weal-wire";
import { type Span, SpanStatusCode } from "@opentelemetry/api";

import { saveDice, type WealStore } from "./db";
import {
  checkNewSave,
  type EngineHooks,
  isBareAtom,
  passesNoiseGate,
  runEngine,
  type SaveRefusal,
} from "./engine";
import { hostSays } from "./hosts";
import {
  classify,
  dieFooter,
  dieTitle,
  ENGINE_FAULT_LINE,
  ENGINE_FAULT_TITLE,
  errorDescription,
  FIELD_LIMIT,
  NUMBER_LINES,
  newSeedInfo,
  nothingToRoll,
  overlayPayload,
  RESEED_LINES,
  resultsField,
  saveRefusal,
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
  /** Embed image URL — `attachment://plot.png` for a plot embed. */
  image?: string;
  /** File attachments forwarded to the webhook send (a plot's PNG). */
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
  /** Saved names, for the noise gate (a saved name makes an error visible). */
  savedNames: () => string[];
  /** 32 bytes of engine entropy per roll (crypto in the gateway, fixed in tests). */
  seed: () => Uint8Array;
  getSeed: () => SeedInfo;
  setSeed: (seed: SeedInfo) => void;
  /** Post an embed as a host (webhook). */
  send: (msg: OutgoingMessage) => Promise<void>;
  /** Best-effort v1 overlay broadcast (non-fatal on failure). */
  broadcast: (payload: RollMessage) => Promise<void>;
  /** Test seam only: swap the engine call (scripted results). */
  engineHooks?: EngineHooks;
}

// Module-scope instruments (live under @astra/observe/register; no-ops in the dry
// unit tests). One span per non-empty message wraps the whole roll/save/reseed pipeline.
const tracer = getTracer("astra.weal-bot");
const log = getLogger("astra.weal-bot");
const rollsCounter = lazyCounter("astra.weal-bot", "astra.weal.rolls", {
  description: "Dice rolls evaluated, by goodness",
});
const errorsCounter = lazyCounter("astra.weal-bot", "weal.v2.errors", {
  description: "weal v2 engine errors, by stage (incl. internal)",
});
const fuelAbortsCounter = lazyCounter("astra.weal-bot", "weal.v2.fuel_aborts", {
  description: "weal v2 fuel-budget aborts",
});
const persistFailuresCounter = lazyCounter("astra.weal-bot", "weal.dice.persist_failures", {
  description: "roll-history writes that failed (the reply already went out)",
});
const savesRefusedCounter = lazyCounter("astra.weal-bot", "weal.v2.saves_refused", {
  description: "weal v2 saves the save guard refused, by kind (rolls / use)",
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

  if (outcome.kind === "error") {
    await handleError(text, outcome.error, saves, profile, deps, span);
    return;
  }

  const { displays, plots, saves: newSaves } = outcome.value;
  // A lone atom literal (`:p`) evaluates fine but is chat noise — silent.
  if (isBareAtom(text) && plots.length === 0 && newSaves.length === 0) return;
  // Nothing to show: the value is a function (or `()`), as when a player pastes a save
  // confirmation's source. Say so, rather than going silent, if it looks like code.
  if (displays.length === 0 && plots.length === 0 && newSaves.length === 0) {
    const pastedSave = saves.some(([, source]) => source === text);
    if (pastedSave || passesNoiseGate(text, deps.savedNames())) {
      const { title, contents } = nothingToRoll(profile.playerName, text, saves);
      await deps.send({ host: deps.host("knife"), title, contents, fields: [] });
    }
    return;
  }

  for (const display of displays) {
    if (display.kind === "die") await handleDie(text, display, profile, deps, span);
    else await sendValue(text, display, profile, deps);
  }
  for (const plot of plots) await sendPlot(plot, deps);
  for (const save of newSaves) await handleSave(save, profile, deps, span);
}

async function handleDie(
  text: string,
  display: WealDieDisplay,
  profile: Profile,
  deps: HandlerDeps,
  span: Span,
): Promise<void> {
  const { blameId } = deps.getSeed();
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
  await deps.broadcast(overlayPayload(profile.playerName, text, display));
  // Not awaited: the archive must never hold up the next reply (ADR 0025).
  void recordHistory(display.standardDice, profile, blameId, deps);
}

/** Write a roll's dice to the history archive. Never rejects: a failure logs and counts. */
async function recordHistory(
  standardDice: readonly [number, number][],
  profile: Profile,
  blameId: number,
  deps: HandlerDeps,
): Promise<void> {
  try {
    await saveDice(deps.store, standardDice, profile.playerId, blameId);
  } catch (err) {
    persistFailuresCounter.add(1);
    log.emit({
      severityText: "WARN",
      body: `roll history write failed for ${profile.playerName} (reply already sent): ${String(err)}`,
    });
  }
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

async function handleSave(
  save: WealSave,
  profile: Profile,
  deps: HandlerDeps,
  span: Span,
): Promise<void> {
  // Read the list now, not at the top of doRoll: the awaits in between can let
  // another message's save land first. No await separates check and add.
  const check = checkNewSave(save.name, save.source, deps.initFuncs(), deps.engineHooks);
  if (!check.ok) {
    await refuseSave(save, check, profile, deps, span);
    return;
  }
  deps.addFunc(save.name, save.source);
  await deps.store.insertFuncV2(save.name, save.source);
  await deps.send({
    host: deps.host("knife"),
    title: `${save.name} saved!`,
    contents: `hmm.... okay ${profile.playerName.toLowerCase()}, ill remember that\n\`\`\`weal\n${save.source}\n\`\`\``,
    fields: [],
  });
}

async function refuseSave(
  save: WealSave,
  refusal: SaveRefusal,
  profile: Profile,
  deps: HandlerDeps,
  span: Span,
): Promise<void> {
  savesRefusedCounter.add(1, { kind: refusal.kind });
  span.setAttribute("weal.save_refused", refusal.kind);
  const reason = `${refusal.error.stage}: ${refusal.error.message}`;
  // A refused save is handled, so WARN; but an engine fault is an engine bug,
  // and ERROR is how an operator hears of one (it pages Discord, Class A).
  log.emit({
    severityText: refusal.error.stage === "internal" ? "ERROR" : "WARN",
    body: `refused save ${save.name} from ${profile.playerName} (${refusal.kind}, \`${refusal.probe}\`): ${reason}`,
  });
  const { title, contents } = saveRefusal(profile.playerName, save.name, save.source, refusal);
  await deps.send({ host: deps.host("knife"), title, contents, fields: [] });
}

async function handleError(
  text: string,
  err: WealErr,
  saves: [string, string][],
  profile: Profile,
  deps: HandlerDeps,
  span: Span,
): Promise<void> {
  if (err.stage === "parse") return; // chat noise — silent, uncounted
  errorsCounter.add(1, { stage: err.stage });
  if (err.stage === "internal") {
    await sendEngineFault(text, err, profile, deps, span);
    return;
  }
  if (err.stage === "fuel") fuelAbortsCounter.add(1);
  if (!passesNoiseGate(text, deps.savedNames())) return;
  await deps.send({
    host: deps.host("knife"),
    title: "that didn't check out",
    contents: errorDescription(text, err, saves),
    fields: [],
  });
}

/**
 * An engine fault: never the player's mistake, so the operator gets the whole
 * story at ERROR (which pages, Class A) and the player gets a generic line.
 */
async function sendEngineFault(
  text: string,
  err: WealErr,
  profile: Profile,
  deps: HandlerDeps,
  span: Span,
): Promise<void> {
  span.setAttribute("weal.stage", err.stage);
  log.emit({
    severityText: "ERROR",
    body: `weal engine fault (stage ${err.stage}) for ${profile.playerName}: ${err.message} — source: ${text}`,
    attributes: {
      "weal.stage": err.stage,
      "weal.player": profile.playerName,
      "weal.source": text,
      ...(err.span === null ? {} : { "weal.span": `${err.span.start}..${err.span.end}` }),
    },
  });
  await deps.send({
    host: deps.host("knife"),
    title: ENGINE_FAULT_TITLE,
    contents: ENGINE_FAULT_LINE,
    fields: [],
  });
}
