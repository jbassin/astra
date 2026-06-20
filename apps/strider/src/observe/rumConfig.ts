import { loadConfig } from "@astra/config";
import { createServerFn } from "@tanstack/react-start";

// Server-only RPC: returns the browser RUM ingest endpoint from config.kdl
// (config-single-source). createServerFn keeps @astra/config — and the config
// read — out of the client bundle; the client gets a typed fetch stub.
export const getRumEndpoint = createServerFn({ method: "GET" }).handler(() => {
  return loadConfig().telemetry.rumEndpoint;
});
