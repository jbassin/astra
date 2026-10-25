/**
 * weal-bot entrypoint — astra's first long-running TS service. Telemetry (traces,
 * metrics, logs, HTTP/fetch spans and the SIGTERM flush) is already installed by
 * `node --import @astra/observe/register`; this wires config + ontology + the Postgres
 * store, and starts the Discord gateway + the healthcheck endpoint.
 */

import { loadConfig } from "@astra/config";
import { exitAfterFlush, logger } from "@astra/observe";
import { loadBeing } from "@astra/ontology";
import { describeResult } from "@astra/pg-migrate";

import { PostgresStore } from "./db";
import { loadValidatedFuncs } from "./engine";
import { Gateway } from "./gateway";
import { startHealthServer } from "./health";
import { Roster } from "./roster";

const log = logger("astra.weal-bot");

async function main(): Promise<void> {
  const cfg = loadConfig();
  const being = loadBeing();

  const roster = Roster.fromBeing(being);
  const hosts = new Map(being.weal_hosts.map((h) => [h.slug, h]));

  const store = new PostgresStore(cfg.weal.databaseUrl);
  // Apply pending schema migrations; a refusal (an edited applied migration) stops startup.
  const migrated = await store.migrate();
  (migrated.ahead.length > 0 ? log.warn : log.info)(describeResult(migrated));
  // Boot load: funcs_v2 in id order, each loaded (and evaluated) after the prior
  // valid rows; a failing row is WARN-skipped inside loadValidatedFuncs.
  const rows = await store.getAllFuncsV2();
  const funcs = loadValidatedFuncs(rows);
  log.info(`loaded ${funcs.length}/${rows.length} saved weal v2 sources`);

  const gateway = new Gateway(
    {
      // Unset → "" → that feature off.
      discordToken: cfg.weal.discordToken?.optional() ?? "",
      feedWsUrl: cfg.weal.feedWsUrl,
      feedToken: cfg.weal.feedToken?.optional() ?? "",
    },
    roster,
    hosts,
    store,
    funcs,
  );

  await gateway.start();
  startHealthServer(cfg.weal.bindAddr);
}

// A startup failure (a migration refusal, a bad config, Discord down at boot): the FATAL
// record prints to stdout (so `docker logs` says why it crash-loops) and is flushed to
// SigNoz (Class A paging) before the exit.
main().catch((e: unknown) => {
  log.fatal(`weal-bot failed to start: ${String(e)}`);
  void exitAfterFlush(1);
});
