/**
 * orator-backend entrypoint — astra's lift of faerrin `lark` (single-process Bun
 * Discord music bot: voice + library + REST + operator SPA). Wires telemetry first
 * (principle #1 / [[telemetry-built-in]]), then config + ontology + the Postgres
 * store, then optionally the Discord bot, then serves the REST API + the SPA.
 *
 * The bot is **optional**: without a resolved token the web UI + library + REST
 * still run, and playback routes return 503 (the deferred live-Discord seam).
 * The session secret and the operator allowlist are NOT optional: either one missing
 * or empty stops startup before anything else runs (fail closed, 0037 SVC-2).
 */

import { getLogger, initTelemetry } from "@astra/observe";

// Telemetry before anything that emits — traces/metrics/logs → SigNoz.
const telemetry = initTelemetry("astra.orator-backend");
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
import {
  MIN_SESSION_SECRET_BYTES,
  optionalSecret,
  requireAllowlist,
  requireSecret,
} from "./startup";

async function main(): Promise<void> {
  const cfg = loadConfig();
  const being = loadBeing();

  // Operators = ontology admin snowflakes ∪ the optional config override (M1).
  // Fail closed before touching the DB: no operators, or a blank session secret (which
  // would sign forgeable cookies), stops startup (0037 SVC-2).
  const allowlist = requireAllowlist(buildAllowlist(being, cfg.orator.allowedUserIds));
  const sessionSecret = requireSecret(
    cfg.orator.sessionSecret,
    "sessionSecret",
    MIN_SESSION_SECRET_BYTES,
  );

  // All runtime config comes from config.kdl via @astra/config (config-single-source)
  // — no env overrides. The data dir is the Compose audio-volume mount; the dist dir
  // is a fixed structural path (the SPA Vite-built next to the app), not config.
  const dataDir = resolve(cfg.orator.dataDir);
  // `import.meta.dir` is a Bun-only extension — `import.meta.dirname` is the
  // standard (Node 20.11+/24, and Bun too) equivalent (R3, 0022 S8).
  const distDir = resolve(import.meta.dirname, "../dist");
  mkdirSync(dataDir, { recursive: true });

  const store = new PostgresStore(cfg.orator.databaseUrl);
  await store.ensureSchema();

  // Ingest: yt-dlp + ffmpeg through a bounded pool. Concurrency + loudness-measurement
  // are memory-pressure knobs (each item can spawn yt-dlp + an ffmpeg pass), sourced
  // from kdl (lark exposed them as LARK_* env; astra keeps them config-single-source).
  const hub = new JobHub();
  const ingest = new IngestService({
    store,
    dataDir,
    ytdlp: realYtDlp,
    hub,
    prober: cfg.orator.measureLoudness ? ffmpegProber : undefined,
    concurrency: cfg.orator.ingestConcurrency,
  });
  // Resume any import interrupted by a crash/restart (dedup skips finished items).
  const resumed = await ingest.resumeInterrupted();
  if (resumed > 0)
    log.emit({ severityText: "INFO", body: `resuming ${resumed} interrupted download job(s)` });

  const publicOrigin = cfg.orator.publicOrigin;
  const config: AppConfig = {
    port: cfg.orator.port,
    sessionSecret,
    allowlist,
    oauth: {
      clientId: optionalSecret(cfg.orator.discordClientId),
      clientSecret: optionalSecret(cfg.orator.discordClientSecret),
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
  const token = optionalSecret(cfg.orator.discordToken);
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
  // srvx's Server has no `.port` (R3, 0022 S8 — B3); `.url` is only populated once
  // listening completes (async on the Node runtime), so log from `.ready()`.
  void server.ready().then((s) => {
    log.emit({ severityText: "INFO", body: `orator-backend listening on ${s.url}` });
  });
  log.emit({
    severityText: "INFO",
    body: `operator allowlist: ${allowlist.size} id(s); data dir: ${dataDir}`,
  });
}

main().catch((e) => {
  const body = `orator-backend failed to start: ${e}`;
  // stderr too: OTel logs aren't mirrored locally, and `docker logs` must say why a
  // fail-closed refusal is crash-looping.
  console.error(body);
  log.emit({ severityText: "FATAL", body });
  // Flush first, so a fail-closed refusal reaches SigNoz (and Class A paging) instead of
  // dying in the batch buffer.
  void telemetry.shutdown().finally(() => process.exit(1));
});

// Flush buffered spans/metrics/logs before the container stops (compose SIGTERM).
// Installing our own handler overrides Bun's default terminate, so we exit once flushed.
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.once(sig, () => {
    void telemetry.shutdown().finally(() => process.exit(0));
  });
}
