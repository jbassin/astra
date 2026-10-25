import path from "node:path";

import { astraContentRoot } from "@astra/content-build";
import { defineSiteConfig } from "@astra/site-kit/vite";

// The shared frontend preset (plugins, `@` alias, dev port from config.kdl). Importing a
// workspace package here needs `vite --configLoader runner` (package.json dev/build).
export default defineSiteConfig({
  root: import.meta.dirname,
  generated: ["episodes.ts", "transcripts.ts"],
  // build-content.ts reads the astra-data episodes snapshot; dev regenerates when it changes.
  contentInputs: () => [path.join(astraContentRoot(import.meta.dirname), "mouthpiece", "snapshot")],
});
