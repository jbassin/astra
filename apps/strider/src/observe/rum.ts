// Client RUM glue (S1): fetch the config-sourced endpoint via the server fn,
// then hand off to @astra/observe/web. Kept tiny + client-only (imported behind
// a mount guard in __root) so neither @astra/config nor the OTel web SDK reaches
// the SSR bundle. The browser-OTel machinery lives in the shared library; this
// is the per-frontend seam (service name + config endpoint) that 0011-0013 copy.

import { initRum } from "@astra/observe/web";
import { getRumEndpoint } from "./rumConfig";

export async function startRum(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const endpoint = await getRumEndpoint();
    if (endpoint) initRum({ serviceName: "astra.strider-rum", endpoint });
  } catch (err) {
    console.warn("[strider] RUM init skipped:", err);
  }
}
