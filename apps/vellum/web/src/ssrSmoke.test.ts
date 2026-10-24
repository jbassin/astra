import path from "node:path";

import { describeSsrSmoke } from "@astra/site-kit/ssrSmoke";

describeSsrSmoke({
  appRoot: path.resolve(import.meta.dirname, ".."),
  routes: [
    { path: "/", contains: ["Vellum — the Færrin document forge"] },
    { path: "/editor", contains: ["Editor"] },
    { path: "/__no-such-page", status: 404, contains: ["That page doesn’t exist."] },
  ],
});
