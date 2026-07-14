// Client RUM glue (thin caller over @astra/site-kit/web). Kept tiny + client-only
// (imported behind a mount guard in __root) so neither @astra/config nor the OTel
// web SDK reaches the SSR bundle. The endpoint + service name come from config.kdl
// via the getRumConfig server fn (config-single-source); the shared startRum owns
// the fetch-then-init dance.

import { startRum as startRumKit } from "@astra/site-kit/web";

import { getRumConfig } from "./rumConfig";

export function startRum(): Promise<void> {
  return startRumKit(getRumConfig);
}
