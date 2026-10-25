import path from "node:path";

import { astraContentRoot } from "@astra/content-build";
import { defaultBeingFile } from "@astra/ontology";
import { defineSiteConfig } from "@astra/site-kit/vite";

// The shared frontend preset (plugins, `@` alias, dev port from config.kdl). Importing a
// workspace package here needs `vite --configLoader runner` (package.json dev/build).
export default defineSiteConfig({
  root: import.meta.dirname,
  generated: ["site.ts", "bodies.ts"],
  // build-content.ts reads the astra-data snapshot, corpus and linguist data, and the being
  // file; dev regenerates when any of them changes.
  contentInputs: () => {
    const data = astraContentRoot(import.meta.dirname);
    return [
      path.join(data, "akasha"),
      path.join(data, "linguist", "data"),
      path.join(data, "linguist", "timeline"),
      defaultBeingFile(),
    ];
  },
});
