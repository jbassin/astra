import path from "node:path";

import { describeSsrSmoke } from "@astra/site-kit/ssrSmoke";

// The landing page renders straight from the generated modules: the masthead, every linked
// site, and public-origin hosts resolved from config.kdl.
describeSsrSmoke({
  appRoot: path.resolve(import.meta.dirname, ".."),
  routes: [
    {
      path: "/",
      contains: [
        "Ledger",
        "Strider",
        "Akasha",
        "Mouthpiece",
        "Harrow",
        "Vellum",
        "strider.iridi.cc",
        "vellum.iridi.cc",
      ],
    },
    { path: "/__no-such-page", status: 404, contains: ["in the ledger"] },
  ],
});
