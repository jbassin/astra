import path from "node:path";

import { describeSsrSmoke } from "@astra/site-kit/ssrSmoke";

// The content routes render straight from the generated modules. The `/` draw is client-only
// (Decision D), so it renders the deterministic "Shuffling" fallback, not a reading.
describeSsrSmoke({
  appRoot: path.resolve(import.meta.dirname, ".."),
  routes: [
    { path: "/", contains: ["Harrow", "Shuffling"] },
    { path: "/gallery", contains: ["Hierophant"] },
    { path: "/spreads", contains: ["Pilgrimage"] },
    { path: "/spreads/history", contains: ["Pilgrimage"] },
    { path: "/__no-such-page", status: 404, contains: ["in the deck"] },
  ],
});
