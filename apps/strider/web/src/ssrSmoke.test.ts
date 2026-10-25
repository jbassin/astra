import path from "node:path";

import { describeSsrSmoke } from "@astra/site-kit/ssrSmoke";

describeSsrSmoke({
  appRoot: path.resolve(import.meta.dirname, ".."),
  routes: [
    { path: "/", contains: ["The Strider"] },
    { path: "/factions/ternion-heavy-industries", contains: ["Ternion Heavy Industries"] },
    { path: "/__no-such-page", status: 404, contains: ["Back to the map"] },
    // The editor is dev-only: a production build answers /editor with the not-found page.
    { path: "/editor", status: 404, contains: ["Back to the map"] },
  ],
});
