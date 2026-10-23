import { createMemoryHistory } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { getRouter } from "./router";

/**
 * `getRouter()` builds a real SSR request's memory history at the framework
 * boundary (the `createStartHandler` machinery, not this test) — a bare
 * `createRouter()` instance has no history at all in a `document`-less (server)
 * environment until one is supplied, so `buildLocation` can't run without one.
 * Attaching a memory history here mirrors that request-scoped wiring without
 * touching `pathParamsAllowedCharacters` or any other router OPTION under test.
 */
async function loadedRouter(initialPath: string) {
  const router = getRouter();
  router.update({ history: createMemoryHistory({ initialEntries: [initialPath] }) });
  await router.load();
  return router;
}

// D29-22/M9: the router's `pathParamsAllowedCharacters: ["@"]` option (verified
// against the pinned `@tanstack/router-core` — the config type only accepts a
// fixed literal-character union, `@` included). Without it, `router.buildLocation`
// (the same machinery `<Link params={...}>` uses to interpolate an href) would
// percent-encode `@` to `%40`; this is a route test over the ACTUAL configured
// router (not a synthetic one), so a future accidental removal of the option
// fails here.
describe("router: pathParamsAllowedCharacters (D29-22/M9)", () => {
  it("interpolates an `@legacy`-suffixed slug param verbatim, not percent-encoded", async () => {
    const router = await loadedRouter("/spell/heal");
    const location = router.buildLocation({
      to: "/$category/$slug",
      params: { category: "spell", slug: "heal@legacy" },
    });
    expect(location.href).toBe("/spell/heal@legacy");
    expect(location.href).not.toContain("%40");
  });

  it("round-trips a non-ASCII slug param losslessly (encode -> decode)", async () => {
    // D29-22: non-ASCII bytes ALWAYS get percent-encoded in a real href (standard
    // URI behavior, unrelated to `pathParamsAllowedCharacters` — that option only
    // covers the small ASCII reserved-character set) — the actual requirement is
    // that decoding the built path segment recovers the exact original slug.
    const router = await loadedRouter("/spell/heal");
    const location = router.buildLocation({
      to: "/$category/$slug",
      params: { category: "creature", slug: "ixamè" },
    });
    const slugSegment = location.pathname.split("/").pop() ?? "";
    expect(decodeURIComponent(slugSegment)).toBe("ixamè");
  });
});
