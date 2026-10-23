// Standalone route-tree regeneration (thin caller over @astra/site-kit). Writes a
// tree that always includes every route (matches dev), so `tsc --noEmit` doesn't
// break on any prod-stripped route. Run manually after adding/removing a route file
// (D29-31: codex's own `typecheck` stays bare `tsc --noEmit` against the COMMITTED
// tree — unlike ledger/heartwood-frontend, it does not re-run this on every
// typecheck, since codex has no build-time content step that would otherwise force
// a "regenerate before type-checking" ordering).

import path from "node:path";
import { fileURLToPath } from "node:url";

import { generateRouteTree } from "@astra/site-kit";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await generateRouteTree({ root: ROOT });
