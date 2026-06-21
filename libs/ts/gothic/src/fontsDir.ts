// Build-time only: the absolute path to gothic's webfont directory. gothic owns
// the fonts (theme.css references absolute /fonts/*); tooling that file-serves or
// copies them (site-kit's dev middleware, app Dockerfiles) resolves this via the
// package export `@astra/gothic/fontsDir` instead of climbing `../../../`. Never
// import from client/runtime code — it carries a filesystem path.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const fontsDir = join(dirname(fileURLToPath(import.meta.url)), "fonts");
