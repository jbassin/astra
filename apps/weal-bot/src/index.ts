/**
 * weal-bot entrypoint — astra's first long-running TS/Bun service. Wires telemetry
 * first (principle #1 / [[telemetry-built-in]]), then config + ontology + the Postgres
 * store, and starts the Discord gateway + the internal speak API.
 */

import { getLogger, initTelemetry } from "@astra/observe";

// Telemetry before anything that emits — traces/metrics/logs → SigNoz.
initTelemetry("astra.weal-bot");
const log = getLogger("astra.weal-bot");

import { loadConfig } from "@astra/config";
import { loadBeing } from "@astra/ontology";
import { PostgresStore } from "./db";
import { Gateway } from "./gateway";
import { Roster } from "./roster";
import { startSpeakServer } from "./speak";

function resolveSecret(ref: { resolve: () => string } | null | undefined): string {
  try {
    return ref?.resolve() ?? "";
  } catch {
    return ""; // unresolved (e.g. rotated-at-cutover dice-feed-url) → feature disabled
  }
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const being = loadBeing();

  const roster = Roster.fromBeing(being);
  const hosts = new Map(being.weal_hosts.map((h) => [h.slug, h]));

  const store = new PostgresStore(cfg.weal.databaseUrl);
  await store.ensureSchema();
  const funcs = (await store.getAllFuncs()).map((f) => [f.name, f.payload] as [string, string]);
  log.emit({ severityText: "INFO", body: `loaded ${funcs.length} saved macros` });

  const gateway = new Gateway(
    {
      discordToken: resolveSecret(cfg.weal.discordToken),
      diceFeedUrl: resolveSecret(cfg.weal.diceFeedUrl),
      feedWsUrl: cfg.weal.feedWsUrl,
      feedToken: resolveSecret(cfg.weal.feedToken),
    },
    roster,
    hosts,
    store,
    funcs,
  );

  await gateway.start();
  startSpeakServer(cfg.weal.bindAddr, gateway);
}

main().catch((e) => {
  log.emit({ severityText: "FATAL", body: `weal-bot failed to start: ${e}` });
  process.exit(1);
});
