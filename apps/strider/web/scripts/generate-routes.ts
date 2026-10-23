// Standalone route-tree regeneration (thin caller over @astra/site-kit). A prod
// build strips editor.tsx via routeFileIgnorePattern, which breaks `tsc --noEmit`
// (createFileRoute("/editor") can't find "/editor" in the typed map); this writes a
// tree that ALWAYS includes editor (matches dev). Run it before typecheck.

import path from "node:path";
import { fileURLToPath } from "node:url";

import { generateRouteTree } from "@astra/site-kit";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await generateRouteTree({ root: ROOT });
