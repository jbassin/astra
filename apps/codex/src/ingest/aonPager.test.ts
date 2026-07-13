import { describe, expect, it, vi } from "vitest";

import {
  buildCategoryAggQuery,
  buildCategoryPageQuery,
  discoverCategories,
  type EsHit,
  fetchAllForCategory,
  parseCategoryBuckets,
} from "./aonPager";

function makeSyntheticHits(n: number): EsHit[] {
  return Array.from({ length: n }, (_, i) => {
    const name = String(i).padStart(6, "0");
    const url = `/x/${i}`;
    return { _id: `id-${i}`, _source: { name }, sort: [name, url] };
  });
}

/** Simulates real ES `search_after` semantics over an in-memory sorted array: finds
 * the first hit whose primary sort key is strictly greater than the cursor. */
function makeSearchOver(all: EsHit[], pageSize: number) {
  return vi.fn(async (body: unknown) => {
    const b = body as Record<string, unknown>;
    let startIdx = 0;
    const searchAfter = b.search_after as unknown[] | undefined;
    if (searchAfter) {
      const afterName = searchAfter[0] as string;
      const idx = all.findIndex((h) => (h.sort[0] as string) > afterName);
      startIdx = idx === -1 ? all.length : idx;
    }
    return { hits: { hits: all.slice(startIdx, startIdx + pageSize) } };
  });
}

describe("buildCategoryPageQuery", () => {
  it("sorts on name.keyword + url, never _id", () => {
    const body = buildCategoryPageQuery("skill", 1000);
    expect(body.sort).toEqual([{ "name.keyword": "asc" }, { url: "asc" }]);
    expect(JSON.stringify(body)).not.toContain("_id");
    expect(body.query).toEqual({ term: { category: "skill" } });
    expect(body.search_after).toBeUndefined();
  });

  it("threads search_after when given", () => {
    const body = buildCategoryPageQuery("skill", 1000, ["acrobatics", "/skills.aspx?id=1"]);
    expect(body.search_after).toEqual(["acrobatics", "/skills.aspx?id=1"]);
  });
});

describe("buildCategoryAggQuery", () => {
  it("is a size:0 terms aggregation on category", () => {
    expect(buildCategoryAggQuery(200)).toEqual({
      size: 0,
      aggs: { categories: { terms: { field: "category", size: 200 } } },
    });
  });
});

describe("discoverCategories / parseCategoryBuckets", () => {
  it("maps ES buckets to {category, docCount}", async () => {
    const agg = vi.fn(async (_body: unknown) => ({
      aggregations: {
        categories: {
          buckets: [
            { key: "equipment", doc_count: 8642 },
            { key: "feat", doc_count: 8460 },
          ],
        },
      },
    }));
    const result = await discoverCategories(agg);
    expect(result).toEqual([
      { category: "equipment", docCount: 8642 },
      { category: "feat", docCount: 8460 },
    ]);
    expect(parseCategoryBuckets(await agg(buildCategoryAggQuery()))).toEqual(result);
  });
});

describe("fetchAllForCategory", () => {
  it("pages a >10k-doc category via search_after, every request excluding _id from sort", async () => {
    const all = makeSyntheticHits(12_050);
    const pageSize = 1000;
    const search = makeSearchOver(all, pageSize);

    const result = await fetchAllForCategory("equipment", search, { pageSize });

    expect(result).toHaveLength(12_050);
    expect(search).toHaveBeenCalledTimes(13); // 12 full pages of 1000 + a terminal 50
    for (const call of search.mock.calls) {
      const body = call[0] as Record<string, unknown>;
      expect(body.sort).toEqual([{ "name.keyword": "asc" }, { url: "asc" }]);
    }
  });

  it("terminates on a terminal empty page when the doc count is an exact multiple of pageSize", async () => {
    const all = makeSyntheticHits(4);
    const pageSize = 2;
    const search = makeSearchOver(all, pageSize);

    const result = await fetchAllForCategory("skill", search, { pageSize });

    expect(result).toHaveLength(4);
    expect(search).toHaveBeenCalledTimes(3); // page(2) + page(2) + terminal empty page
    const lastBody = search.mock.calls[2]?.[0] as Record<string, unknown>;
    expect((lastBody.search_after as unknown[])[0]).toBe("000003");
  });

  it("returns an empty array for a category with zero hits", async () => {
    const search = makeSearchOver([], 1000);
    const result = await fetchAllForCategory("nonexistent", search, { pageSize: 1000 });
    expect(result).toEqual([]);
    expect(search).toHaveBeenCalledTimes(1);
  });

  it("awaits the throttle hook before every request, including the first", async () => {
    const all = makeSyntheticHits(3);
    const search = makeSearchOver(all, 10);
    const throttle = vi.fn(async () => {});

    await fetchAllForCategory("skill", search, { pageSize: 10, throttle });

    expect(throttle).toHaveBeenCalledTimes(1); // single page (3 < pageSize 10)
  });

  it("calls throttle once per request across multiple pages", async () => {
    const all = makeSyntheticHits(25);
    const pageSize = 10;
    const search = makeSearchOver(all, pageSize);
    const throttle = vi.fn(async () => {});

    const result = await fetchAllForCategory("skill", search, { pageSize, throttle });

    expect(result).toHaveLength(25);
    // pages of 10, 10, 5 -> 3 requests -> 3 throttle calls
    expect(throttle).toHaveBeenCalledTimes(3);
    expect(search).toHaveBeenCalledTimes(3);
  });
});
