// Standalone route-tree regeneration (thin caller over @astra/site-kit). Writes a
// tree that always includes every route (matches dev), so `tsc --noEmit` doesn't
// break on any prod-stripped route — notably the `ssr: false` /editor route. Run it
// after adding/renaming a route, then commit src/routeTree.gen.ts.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateRouteTree } from "@astra/site-kit";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await generateRouteTree({ root: ROOT });
