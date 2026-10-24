/**
 * `node --import @astra/observe/register <entry>`: telemetry before any app code runs.
 *
 * Every astra Node service starts this way: the app's server bundle builds this module as
 * `dist-server/register.mjs` (`@astra/site-kit/bundle`), and the `deploy/node.Dockerfile` CMD
 * and each app's `start` script pass it to `--import`. Because it runs before the entry
 * module is even loaded, the tracer, meter and logger providers exist when app modules
 * evaluate, and `node:http` is patched before any server is created. It installs:
 *
 * - traces, metrics and logs exporting OTLP/HTTP to the collector this process can reach
 *   (`ASTRA_RUNTIME=container` picks the in-cluster name), with `service.name` and
 *   `deployment.environment` on every signal;
 * - HTTP server and client spans (`node:http`) and fetch spans (undici);
 * - every log record mirrored to stdout, so `docker logs` is useful;
 * - one SIGTERM/SIGINT handler that runs the app's `onShutdown` hooks, flushes, and exits,
 *   bounded by `telemetry.shutdown-timeout-ms`.
 *
 * The service name comes from config.kdl: the entry's nearest `package.json` names its
 * config block in `"astra": { "config": "<namespace>" }`, and that block's `service-name`
 * is the name (`serviceNameFor` in `./node.ts`).
 */

import { installNodeTelemetry, serviceNameFor } from "./node";

const entry = process.argv[1];
if (!entry) throw new Error("@astra/observe/register needs an entry: node --import … <entry>");
installNodeTelemetry(serviceNameFor(entry));
