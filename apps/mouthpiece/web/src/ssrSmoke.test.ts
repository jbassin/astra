import path from "node:path";

import { describeSsrSmoke } from "@astra/site-kit/ssrSmoke";

describeSsrSmoke({
  appRoot: path.resolve(import.meta.dirname, ".."),
  routes: [
    { path: "/", contains: ["Mouthpiece"] },
    { path: "/__no-such-page", status: 404, contains: ["This episode is private"] },
  ],
});
