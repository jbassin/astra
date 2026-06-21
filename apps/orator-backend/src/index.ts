/**
 * orator-backend entrypoint — astra's lift of faerrin `lark` (single-process Bun
 * Discord music bot: voice + library + REST + operator SPA). Wires telemetry first
 * (principle #1 / [[telemetry-built-in]]), then config + ontology + the Postgres
 * store, then optionally the Discord bot, then serves the REST API + the SPA.
 *
 * The bot is **optional**: without a resolved token the web UI + library + REST
 * still run, and playback routes return 503 (the deferred live-Discord seam).
 */

import { getLogger, initTelemetry } from "@astra/observe";

// Telemetry before anything that emits — traces/metrics/logs → SigNoz.
initTelemetry("astra.orator-backend");
const log = getLogger("astra.orator-backend");

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "@astra/config";
import { loadBeing } from "@astra/ontology";
import { buildAllowlist } from "./allowlist";
import { startBot } from "./bot/index";
import type { PlaybackEngine } from "./bot/playback";
import { PostgresStore } from "./db/store";
import { ffmpegProber } from "./media/probe";
import { realYtDlp } from "./media/ytdlp";
import { type AppConfig, startServer } from "./server/app";
import { IngestService } from "./server/ingest";
import { JobHub } from "./server/jobhub";

/** Resolve a SOPS `ref=` secret; unresolved (e.g. not provisioned) → "" (feature off). */
function resolveSecret(ref: { resolve: () => string } | null | undefined): string {
  try {
    return ref?.resolve() ?? "";
  } catch {
    return "";
  }
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const being = loadBeing();

  // Operators = ontology admin snowflakes ∪ the optional config override (M1).
  const allowlist = buildAllowlist(being, cfg.orator.allowedUserIds);

  const dataDir = resolve(process.env.ORATOR_DATA_DIR ?? resolve(import.meta.dir, "../data"));
  const distDir = resolve(process.env.ORATOR_DIST_DIR ?? resolve(import.meta.dir, "../dist"));
  mkdirSync(dataDir, { recursive: true });

  const store = new PostgresStore(cfg.orator.databaseUrl);
  await store.ensureSchema();

  // Ingest: yt-dlp + ffmpeg through a bounded pool. Loudness measurement is a
  // memory-pressure knob (each item can spawn yt-dlp + an ffmpeg pass), as is
  // concurrency — both tunable via env, mirroring lark's server entrypoint.
  const hub = new JobHub();
  const ingestConcurrency =
    Number(process.env.ORATOR_INGEST_CONCURRENCY) || cfg.orator.ingestConcurrency;
  const measureLoudness = process.env.ORATOR_MEASURE_LOUDNESS !== "0" && cfg.orator.measureLoudness;
  const ingest = new IngestService({
    store,
    dataDir,
    ytdlp: realYtDlp,
    hub,
    prober: measureLoudness ? ffmpegProber : undefined,
    concurrency: ingestConcurrency,
  });
  // Resume any import interrupted by a crash/restart (dedup skips finished items).
  const resumed = await ingest.resumeInterrupted();
  if (resumed > 0)
    log.emit({ severityText: "INFO", body: `resuming ${resumed} interrupted download job(s)` });

  const publicOrigin = cfg.orator.publicOrigin;
  const config: AppConfig = {
    port: Number(process.env.PORT) || cfg.orator.port,
    sessionSecret: resolveSecret(cfg.orator.sessionSecret),
    allowlist,
    oauth: {
      clientId: resolveSecret(cfg.orator.discordClientId),
      clientSecret: resolveSecret(cfg.orator.discordClientSecret),
      redirectUri: `${publicOrigin}/auth/callback`,
    },
    publicOrigin,
    secureCookies: publicOrigin.startsWith("https://"),
    distDir,
    dataDir,
    guildId: cfg.orator.guildId,
    targetLufs: cfg.orator.targetLufs,
  };

  // The Discord bot (voice/playback) is optional: without a token the web UI +
  // library still run, and playback routes return 503.
  let playback: PlaybackEngine | undefined;
  const token = resolveSecret(cfg.orator.discordToken);
  if (token && config.guildId) {
    try {
      const bot = await startBot({
        token,
        guildId: config.guildId,
        store,
        targetLufs: config.targetLufs,
      });
      playback = bot.engine;
      log.emit({ severityText: "INFO", body: "discord bot online (in-process voice)" });
    } catch (err) {
      log.emit({
        severityText: "ERROR",
        body: `discord bot failed to start (playback disabled): ${err}`,
      });
    }
  } else {
    log.emit({
      severityText: "INFO",
      body: "no DISCORD_TOKEN/guild — playback disabled (web UI + library still run)",
    });
  }

  const { server } = startServer(config, store, {
    services: { playback, ingest, hub, prober: ffmpegProber },
  });
  log.emit({
    severityText: "INFO",
    body: `orator-backend listening on http://localhost:${server.port}`,
  });
  log.emit({
    severityText: "INFO",
    body: `operator allowlist: ${allowlist.size} id(s); data dir: ${dataDir}`,
  });
}

main().catch((e) => {
  log.emit({ severityText: "FATAL", body: `orator-backend failed to start: ${e}` });
  process.exit(1);
});
