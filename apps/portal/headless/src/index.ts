/**
 * portal-headless entrypoint (spec 0027 S2, D27-5/-6/-9/-10/-11). Telemetry (traces,
 * metrics, logs, HTTP spans, the SIGTERM flush) is already installed by
 * `node --import @astra/observe/register`; this reads config, wires the Playwright page
 * adapter into the `Supervisor` state machine, then binds `/health`. Mirrors
 * vellum-render's "warm the browser before serving" shape.
 */
import { loadConfig } from "@astra/config";
import {
  exitAfterFlush,
  getLogger,
  getTracer,
  lazyCounter,
  logger,
  onShutdown,
} from "@astra/observe";

import { SERVICE_NAME } from "./constants";
import { createHealthServer, snapshotFromSupervisor } from "./health";
import { createPlaywrightPageAdapter } from "./playwrightDriver";
import { Supervisor, type SupervisorEvent } from "./supervisor";

const log = logger(SERVICE_NAME);
const tracer = getTracer(SERVICE_NAME);
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

async function main(): Promise<void> {
  const cfg = loadConfig();
  const ph = cfg.portalHeadless;
  const { gmPassword } = ph;
  if (!gmPassword) {
    throw new Error("portal-headless.gm-password needs a ref= in config.kdl's portal-headless {}");
  }

  log.info(
    `portal-headless targeting ${ph.foundryOrigin} (world "${ph.world}") as ${ph.gmUsername}`,
  );

  const page = createPlaywrightPageAdapter({ origin: ph.foundryOrigin });

  const supervisor = new Supervisor({
    page,
    username: ph.gmUsername,
    // Resolved fresh at every login call, never cached (D27-14) — this closure is the
    // ONLY place the plaintext password exists outside the page context itself.
    resolvePassword: () => gmPassword.require(),
    reloadIntervalMs: ph.reloadIntervalHours * 60 * 60 * 1000,
    log: (level, message) => {
      // The supervisor's own level names; the severity number follows from the text.
      getLogger(SERVICE_NAME).emit({ severityText: level.toUpperCase(), body: message });
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
  server.listen(ph.port, () => log.info(`portal-headless /health on :${ph.port}`));

  onShutdown(() => {
    supervisor.stop();
    server.close();
  });
}

main().catch((e: unknown) => {
  log.fatal(`astra.portal-headless failed to start: ${e}`);
  void exitAfterFlush(1);
});
