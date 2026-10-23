// Build/test-time only: the absolute path to site-kit's Node ESM resolve hook
// (`nodeTsResolve.mjs` — see its own header comment). Tooling that spawns
// `node --import <hook>` (vitest global setups, ssrSmoke tests, vitePlugins) resolves
// it via the package export `@astra/site-kit/nodeTsResolveHook` instead of climbing
// `../../libs/ts/...`, so no caller depends on its own depth under `apps/`. Never
// import from client/runtime code — it carries a filesystem path.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const nodeTsResolveHook = join(dirname(fileURLToPath(import.meta.url)), "nodeTsResolve.mjs");
