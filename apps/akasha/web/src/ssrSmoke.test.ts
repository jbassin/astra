import path from "node:path";

import { describeSsrSmoke } from "@astra/site-kit/ssrSmoke";

// The default build is the vite build alone: the smoke never needs `pnpm run build`'s
// Pagefind index.
describeSsrSmoke({
  appRoot: path.resolve(import.meta.dirname, ".."),
  routes: [
    { path: "/", contains: ["Akasha"] },
    { path: "/__no-such-page", status: 404, contains: ["Either this page is private"] },
  ],
});
