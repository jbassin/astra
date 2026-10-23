import { describe, expect, it, vi } from "vitest";

import type { FetchLike } from "./aonClient";
import { createAonClient } from "./aonClient";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("createAonClient", () => {
  it("POSTs JSON with the descriptive contact User-Agent", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init: RequestInit) =>
      jsonResponse(200, { ok: true }),
    );
    const search = createAonClient({ fetchImpl });
    await search({ size: 0 });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://elasticsearch.aonprd.com/aon/_search");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["user-agent"]).toMatch(/astra-codex-ingest/);
    expect(headers["user-agent"]).toMatch(/josh\.r\.bassin@gmail\.com/);
  });

  it("retries a transient 503 then returns the eventual success", async () => {
    let calls = 0;
    const fetchImpl: FetchLike = async () => {
      calls += 1;
      return calls === 1 ? jsonResponse(503, {}) : jsonResponse(200, { ok: true });
    };
    const retryDelay = vi.fn(async () => {});
    const search = createAonClient({ fetchImpl, retryDelay, maxRetries: 3 });

    const result = await search<{ ok: boolean }>({});

    expect(result.ok).toBe(true);
    expect(calls).toBe(2);
    expect(retryDelay).toHaveBeenCalledTimes(1);
  });

  it("gives up after maxRetries and throws", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(500, {}));
    const retryDelay = vi.fn(async () => {});
    const search = createAonClient({ fetchImpl, retryDelay, maxRetries: 2 });

    await expect(search({})).rejects.toThrow(/500/);
    expect(fetchImpl).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("does not retry a non-retryable 400", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(400, {}));
    const search = createAonClient({ fetchImpl });

    await expect(search({})).rejects.toThrow(/400/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("treats 429 as retryable", async () => {
    let calls = 0;
    const fetchImpl: FetchLike = async () => {
      calls += 1;
      return calls === 1 ? jsonResponse(429, {}) : jsonResponse(200, { ok: true });
    };
    const retryDelay = vi.fn(async () => {});
    const search = createAonClient({ fetchImpl, retryDelay, maxRetries: 1 });

    const result = await search<{ ok: boolean }>({});
    expect(result.ok).toBe(true);
    expect(calls).toBe(2);
  });
});
