/**
 * orator-backend entrypoint — astra's lift of faerrin `lark` (single-process Bun
 * Discord music bot: voice + library + REST + operator SPA). Telemetry (traces, metrics,
 * logs, HTTP/fetch spans and the SIGTERM flush) is already installed by
 * `node --import @astra/observe/register`; this wires config + ontology + the Postgres
 * store, then optionally the Discord bot, then serves the REST API + the SPA through
 * `@astra/service-kit` (`/healthz`, route-named spans, the ordered shutdown).
 *
 * The bot is **optional**: without a resolved token the web UI + library + REST
 * still run, and playback routes return 503 (the deferred live-Discord seam).
 * The session secret and the operator allowlist are NOT optional: either one missing
 * or empty stops startup before anything else runs (fail closed, 0037 SVC-2).
 */

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { loadConfig } from "@astra/config";
import { exitAfterFlush, logger } from "@astra/observe";
import { loadBeing } from "@astra/ontology";
import { describeResult } from "@astra/pg-migrate";

import { buildAllowlist } from "./allowlist";
import { startBot } from "./bot/index";
import type { PlaybackEngine } from "./bot/playback";
import { PostgresStore } from "./db/store";
import { ffmpegProber } from "./media/probe";
import { createYtDlp } from "./media/ytdlp";
import { type AppConfig, startServer } from "./server/app";
import { IngestService } from "./server/ingest";
import { JobHub } from "./server/jobhub";
import { requireAllowlist, requireSessionSecret } from "./startup";

const log = logger("astra.orator-backend");

async function main(): Promise<void> {
  const cfg = loadConfig();
  const being = loadBeing();

  // Operators = ontology admin snowflakes ∪ the optional config override (M1).
  // Fail closed before touching the DB: no operators, or a blank session secret (which
  // would sign forgeable cookies), stops startup (0037 SVC-2).
  const allowlist = requireAllowlist(buildAllowlist(being, cfg.orator.allowedUserIds));
  const sessionSecret = requireSessionSecret(cfg.orator.sessionSecret);

  // All runtime config comes from config.kdl via @astra/config (config-single-source)
  // — no env overrides. The data dir is the Compose audio-volume mount; the dist dir
  // is a fixed structural path (the SPA Vite-built next to the app), not config.
  const dataDir = resolve(cfg.orator.dataDir);
  // `import.meta.dir` is a Bun-only extension — `import.meta.dirname` is the
  // standard (Node 20.11+/24, and Bun too) equivalent (R3, 0022 S8).
  const distDir = resolve(import.meta.dirname, "../dist");
  mkdirSync(dataDir, { recursive: true });

  const store = new PostgresStore(cfg.orator.databaseUrl);
  // Apply pending schema migrations; a refusal (an edited applied migration) stops startup.
  const migrated = await store.migrate();
  (migrated.ahead.length > 0 ? log.warn : log.info)(describeResult(migrated));

  // Ingest: yt-dlp + ffmpeg through a bounded pool. Concurrency + loudness-measurement
  // are memory-pressure knobs (each item can spawn yt-dlp + an ffmpeg pass), sourced
  // from kdl (lark exposed them as LARK_* env; astra keeps them config-single-source).
  const hub = new JobHub();
  const ingest = new IngestService({
    store,
    dataDir,
    ytdlp: createYtDlp({
      enumerateTimeoutMs: cfg.orator.ytdlpEnumerateTimeoutS * 1000,
      downloadTimeoutMs: cfg.orator.ytdlpDownloadTimeoutS * 1000,
    }),
    hub,
    prober: cfg.orator.measureLoudness ? ffmpegProber : undefined,
    concurrency: cfg.orator.ingestConcurrency,
  });
  // Resume any import interrupted by a crash/restart (dedup skips finished items).
  const resumed = await ingest.resumeInterrupted();
  if (resumed > 0) log.info(`resuming ${resumed} interrupted download job(s)`);

  const publicOrigin = cfg.orator.publicOrigin;
  const config: AppConfig = {
    port: cfg.orator.port,
    sessionSecret,
    allowlist,
    oauth: {
      clientId: cfg.orator.discordClientId?.optional() ?? "",
      clientSecret: cfg.orator.discordClientSecret?.optional() ?? "",
      redirectUri: `${publicOrigin}/auth/callback`,
    },
    publicOrigin,
    secureCookies: publicOrigin.startsWith("https://"),
    distDir,
    dataDir,
    guildId: cfg.orator.guildId,
    targetLufs: cfg.orator.targetLufs,
    rumEndpoint: cfg.telemetry.rumEndpoint,
  };

  // The Discord bot (voice/playback) is optional: without a token the web UI +
  // library still run, and playback routes return 503.
  let playback: PlaybackEngine | undefined;
  let stopBot: (() => void) | undefined;
  const token = cfg.orator.discordToken?.optional();
  if (token && config.guildId) {
    try {
      const bot = await startBot({
        token,
        guildId: config.guildId,
        store,
        targetLufs: config.targetLufs,
      });
      playback = bot.engine;
      stopBot = bot.stop;
      log.info("discord bot online (in-process voice)");
    } catch (err) {
      log.error(`discord bot failed to start (playback disabled): ${err}`);
    }
  } else {
    log.info("no DISCORD_TOKEN/guild — playback disabled (web UI + library still run)");
  }

  const { service } = startServer(config, store, {
    services: { playback, ingest, hub, prober: ffmpegProber },
  });
  // On SIGTERM the kit drains the server first; then these run, last registered first:
  // the bot leaves Discord, then the store closes its Postgres pool.
  service.onShutdown(() => store.close());
  if (stopBot) service.onShutdown(stopBot);
  log.info(`operator allowlist: ${allowlist.size} id(s); data dir: ${dataDir}`);
}

// A fail-closed refusal: the FATAL record prints to stdout (`docker logs` says why it
// crash-loops) and is flushed to SigNoz (Class A paging) before the exit.
main().catch((e) => {
  log.fatal(`orator-backend failed to start: ${e}`);
  void exitAfterFlush(1);
});
