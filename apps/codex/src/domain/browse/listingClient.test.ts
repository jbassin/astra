// @vitest-environment jsdom
//
// The `typeof window === "undefined"` SSR guard in `memoizedEntity`/
// `memoizedListing` means the client-cache behavior this file exercises only
// runs under a real `window` — same convention `BrowseListing.test.tsx`
// already uses (opting into jsdom per-file, plain "node" is codex's default).
//
// `@/server/corpusFns` is mocked wholesale — `memoizedEntity` (P8 S3,
// D29-82) only cares HOW MANY TIMES the underlying `getEntityPage` fetch
// runs, never its real payload shape (that's `entityPageData.test.ts`'s
// job, testing `resolveEntityPageData` directly).

import { afterEach, describe, expect, it, vi } from "vitest";

const getEntityPage = vi.fn();
vi.mock("@/server/corpusFns", () => ({
  getEntityPage: (...args: unknown[]) => getEntityPage(...args),
  getCategoryListing: vi.fn(),
}));

import { _resetEntityClientForTests, memoizedEntity } from "./listingClient";

afterEach(() => {
  _resetEntityClientForTests();
  getEntityPage.mockReset();
});

describe("memoizedEntity (P8 S3, D29-82)", () => {
  it("fetches once and caches by (category, slug) — a revisit is a cache hit, not a re-fetch", async () => {
    getEntityPage.mockResolvedValue({ entity: { name: "Heal" } });
    const a = await memoizedEntity("spell", "heal");
    const b = await memoizedEntity("spell", "heal");
    expect(getEntityPage).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it("a different slug is a separate fetch", async () => {
    getEntityPage.mockResolvedValue({ entity: { name: "x" } });
    await memoizedEntity("spell", "heal");
    await memoizedEntity("spell", "fireball");
    expect(getEntityPage).toHaveBeenCalledTimes(2);
  });

  it("the same slug under a DIFFERENT category is a separate fetch (composite key)", async () => {
    getEntityPage.mockResolvedValue({ entity: { name: "x" } });
    await memoizedEntity("spell", "heal");
    await memoizedEntity("ritual", "heal");
    expect(getEntityPage).toHaveBeenCalledTimes(2);
  });

  it("in-flight concurrent calls for the same key share ONE fetch (the promise itself is cached, not just the resolved value)", async () => {
    let resolveFn: (v: unknown) => void = () => undefined;
    getEntityPage.mockReturnValue(
      new Promise((resolve) => {
        resolveFn = resolve;
      }),
    );
    const p1 = memoizedEntity("spell", "heal");
    const p2 = memoizedEntity("spell", "heal");
    resolveFn({ entity: { name: "Heal" } });
    await Promise.all([p1, p2]);
    expect(getEntityPage).toHaveBeenCalledTimes(1);
  });

  it("_resetEntityClientForTests clears the cache — the next call re-fetches", async () => {
    getEntityPage.mockResolvedValue({ entity: { name: "Heal" } });
    await memoizedEntity("spell", "heal");
    _resetEntityClientForTests();
    await memoizedEntity("spell", "heal");
    expect(getEntityPage).toHaveBeenCalledTimes(2);
  });

  it("caps at ~50 entries, evicting the LEAST-recently-touched key on overflow", async () => {
    getEntityPage.mockImplementation((input: { data: { category: string; slug: string } }) =>
      Promise.resolve({ entity: { name: input.data.slug } }),
    );
    // Fill past the cap with 51 distinct slugs — slug "0" is the oldest.
    for (let i = 0; i < 51; i++) {
      await memoizedEntity("spell", String(i));
    }
    getEntityPage.mockClear();
    await memoizedEntity("spell", "0"); // evicted -> re-fetches
    expect(getEntityPage).toHaveBeenCalledTimes(1);
    getEntityPage.mockClear();
    await memoizedEntity("spell", "50"); // still cached (most recent) -> no fetch
    expect(getEntityPage).toHaveBeenCalledTimes(0);
  });
});
