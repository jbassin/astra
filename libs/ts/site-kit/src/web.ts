// Client RUM glue — the browser-only seam of the frontend template. Imported
// behind a mount guard (dynamic import in __root) so neither the OTel web SDK nor
// any server-fn machinery loads during SSR. The browser-OTel itself lives in
// `@astra/observe/web`; this owns the tiny "fetch the config, then init" dance.
//
// The per-app seam is the `getConfig` thunk: a `createServerFn` the app defines
// (keeps @astra/config out of the client bundle), returning the RUM endpoint +
// service name from config.kdl (config-single-source — including the browser-side
// service name, which the client can't read directly).

import { initRum } from "@astra/observe/web";

export interface RumConfig {
  endpoint: string;
  serviceName: string;
}

/** Fetch the config-sourced RUM endpoint + service name, then hand off to @astra/observe/web. */
export async function startRum(getConfig: () => Promise<RumConfig>): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const { endpoint, serviceName } = await getConfig();
    if (endpoint) initRum({ serviceName, endpoint });
  } catch (err) {
    console.warn("[site-kit] RUM init skipped:", err);
  }
}
