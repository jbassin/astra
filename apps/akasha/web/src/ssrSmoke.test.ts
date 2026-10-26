import path from "node:path";

import { describeSsrSmoke } from "@astra/site-kit/ssrSmoke";

// The default build is the vite build alone: the smoke never needs `pnpm run build`'s
// Pagefind index.
describeSsrSmoke({
  appRoot: path.resolve(import.meta.dirname, ".."),
  routes: [
    { path: "/", contains: ["Akasha"] },
    // Every route's page data comes from a server function, run inline at SSR.
    { path: "/Timeline", contains: ["data-pagefind-body", "Timeline"] },
    { path: "/Script/Unsorted/2025-10-20", contains: ["transcript-line"] },
    { path: "/Divinity", contains: ["items under this folder"] },
    { path: "/tags", contains: ["Tag Index"] },
    { path: "/chronicle", contains: ["chronicle-show-card"] },
    { path: "/__no-such-page", status: 404, contains: ["Either this page is private"] },
  ],
});
