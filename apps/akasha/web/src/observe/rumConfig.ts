import { loadConfig } from "@astra/config";
import { createServerFn } from "@tanstack/react-start";

// Server-only RPC: the browser RUM endpoint + service name from config.kdl
// (config-single-source — including the client-side service name, which the browser
// can't read directly). createServerFn keeps @astra/config — and the config read —
// out of the client bundle; the client gets a typed fetch stub. The createServerFn
// MUST stay in app source (the tanstackStart vite plugin transforms it here);
// @astra/site-kit owns the generic glue (startRum). This is the per-app seam.
export const getRumConfig = createServerFn({ method: "GET" }).handler(() => {
  const cfg = loadConfig();
  return {
    endpoint: cfg.telemetry.rumEndpoint,
    serviceName: `${cfg.akashaFrontend.serviceName}-rum`,
  };
});
