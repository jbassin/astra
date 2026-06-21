// Client RUM glue: fetch the config-sourced endpoint, then hand off to
// @astra/observe/web (the same shared browser-OTel library strider uses). Kept
// tiny + client-only (imported behind a mount guard in RootLayout) so the OTel
// web SDK only loads in the browser. This is orator's per-frontend seam (service
// name + config endpoint); the SSR frontends 0011-0013 use the createServerFn
// variant instead (orator is a static SPA — see rumConfig.ts).

import { initRum } from "@astra/observe/web";
import { getRumEndpoint } from "./rumConfig";

export async function startRum(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const endpoint = await getRumEndpoint();
    if (endpoint) initRum({ serviceName: "astra.orator-rum", endpoint });
  } catch (err) {
    console.warn("[orator] RUM init skipped:", err);
  }
}
