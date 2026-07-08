/**
 * portal-headless entrypoint (spec 0027 S2, D27-5/-6/-9/-10/-11) — wires telemetry
 * first (principle #1 / [[telemetry-built-in]]), then config, then the Playwright page
 * adapter into the `Supervisor` state machine, then binds `/health`. Mirrors
 * vellum-render's "warm the browser before serving" shape and portal-server's
 * SIGTERM + `telemetry.shutdown()` pattern.
 */
import { getLogger, getTracer, initTelemetry, lazyCounter } from "@astra/observe";

import { SERVICE_NAME } from "./constants";

// Telemetry before anything that emits — traces/metrics/logs → SigNoz.
const telemetry = initTelemetry(SERVICE_NAME);
const log = getLogger(SERVICE_NAME);
const tracer = getTracer(SERVICE_NAME);

import type { SecretRef } from "@astra/config";
import { loadConfig } from "@astra/config";

import { createHealthServer, snapshotFromSupervisor } from "./health";
import { createPlaywrightPageAdapter } from "./playwrightDriver";
import { Supervisor, type SupervisorEvent } from "./supervisor";

// lazyCounter, NEVER `getMeter().createCounter()` at module scope — the ES-import-
// hoisting permanent-no-op gotcha ([[telemetry-coverage-pass]]). These bind to the
// real meter on first `.add()`, by which point `initTelemetry` above has already run.
const joinsCounter = lazyCounter(SERVICE_NAME, "astra.portal_headless.joins", {
  description: "Successful /join logins by the headless GM session",
});
const relaunchesCounter = lazyCounter(SERVICE_NAME, "astra.portal_headless.relaunches", {
  description: "Browser relaunches after a crash/hang/nav-error",
});
const worldDownDwellMsCounter = lazyCounter(
  SERVICE_NAME,
  "astra.portal_headless.world_down_dwell_ms",
  {
    description: "Cumulative time spent in the world-down (backoff-idle) state",
    unit: "ms",
  },
);
const consoleCounter = lazyCounter(SERVICE_NAME, "astra.portal_headless.module_console", {
  description:
    "Captured page-console warn/error lines (D27-9 — makes a misconfigured " +
    "bridge-user-id diagnosable from SigNoz instead of a devtools console nobody has open)",
});

/** Resolves a SOPS `ref=` secret; throws with a clear pointer back to config.kdl if
 * unresolved (mirrors portal-server's `requireSecret`). */
function requireSecret(ref: SecretRef | null | undefined, field: string): string {
  const value = ref?.resolve();
  if (!value) {
    throw new Error(
      `cfg.portalHeadless.${field} is unresolved — set portal-headless.${field} ref= in ` +
        "config.kdl's portal-headless {} block (and provision the SOPS key / env override)",
    );
  }
  return value;
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const ph = cfg.portalHeadless;

  log.emit({
    severityText: "INFO",
    body: `portal-headless targeting ${ph.foundryOrigin} (world "${ph.world}") as ${ph.gmUsername}`,
  });

  const page = createPlaywrightPageAdapter({ origin: ph.foundryOrigin });

  const supervisor = new Supervisor({
    page,
    username: ph.gmUsername,
    // Resolved fresh at every login call, never cached (D27-14) — this closure is the
    // ONLY place the plaintext password exists outside the page context itself.
    resolvePassword: () => requireSecret(ph.gmPassword, "gmPassword"),
    reloadIntervalMs: ph.reloadIntervalHours * 60 * 60 * 1000,
    log: (level, message) => {
      log.emit({ severityText: level.toUpperCase(), body: message });
    },
    onEvent: (event: SupervisorEvent) => {
      switch (event.type) {
        case "transition":
          // One short span per transition — enough to see the state timeline in
          // SigNoz without a span per probe tick.
          tracer.startActiveSpan(`portal-headless.state.${event.state}`, (span) => {
            span.end();
          });
          break;
        case "join":
          joinsCounter.add(1);
          break;
        case "relaunch":
          relaunchesCounter.add(1);
          break;
        case "world-down-dwell":
          worldDownDwellMsCounter.add(event.ms);
          break;
        case "console":
          consoleCounter.add(1, { level: event.level });
          break;
      }
    },
  });

  await supervisor.start();

  const server = createHealthServer(() => snapshotFromSupervisor(supervisor));
  server.listen(ph.port, () => {
    log.emit({ severityText: "INFO", body: `portal-headless /health on :${ph.port}` });
  });

  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.once(sig, () => {
      supervisor.stop();
      server.close();
      void telemetry.shutdown().finally(() => process.exit(0));
    });
  }
}

main().catch((e: unknown) => {
  log.emit({ severityText: "FATAL", body: `astra.portal-headless failed to start: ${e}` });
  process.exit(1);
});
