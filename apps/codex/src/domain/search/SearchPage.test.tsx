// @vitest-environment jsdom
//
// D29-101c (P11 S1): the filter-only-search regression test. `/pagefind/
// pagefind.js` genuinely doesn't exist in this test environment (D29-12),
// so `loadPagefind()`'s real fail-soft path always resolves `null` and
// there's no way to OBSERVE which argument reaches `pf.search` without
// mocking the module — unlike `Omnibar.test.tsx` (which never needs to,
// since it only ever asserts the fail-soft-disabled-input UI). `SearchPage`
// takes `search`/`onSearchChange` as plain props (no router context needed),
// so it mounts directly.

import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const searchSpy = vi.fn().mockResolvedValue({ results: [] });

vi.mock("./pagefindClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./pagefindClient")>();
  return {
    ...actual,
    loadPagefind: () =>
      Promise.resolve({
        search: searchSpy,
        filters: () => Promise.resolve({}),
      }),
  };
});

import { SearchPage } from "./SearchPage";

afterEach(() => {
  searchSpy.mockClear();
});

describe("SearchPage filter-only search (D29-101c)", () => {
  it("passes null (not empty string) to pf.search when the query is empty but a filter is set", async () => {
    render(<SearchPage search={{ traits: "fire" }} onSearchChange={() => {}} />);
    await waitFor(() => expect(searchSpy).toHaveBeenCalled());
    const [term, options] = searchSpy.mock.calls[0] as [
      string | null,
      { filters?: Record<string, string[]> },
    ];
    expect(term).toBeNull();
    expect(options.filters?.traits).toEqual(["fire"]);
  });

  it("still passes the real query string when non-empty", async () => {
    render(<SearchPage search={{ q: "fireball" }} onSearchChange={() => {}} />);
    await waitFor(() => expect(searchSpy).toHaveBeenCalled());
    const [term] = searchSpy.mock.calls[0] as [string | null];
    expect(term).toBe("fireball");
  });

  it("never calls pf.search when neither a query nor a filter is set", async () => {
    render(<SearchPage search={{}} onSearchChange={() => {}} />);
    // Give the debounce+effect window a chance to fire, then assert it didn't.
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(searchSpy).not.toHaveBeenCalled();
  });
});
