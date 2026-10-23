import { describe, expect, test } from "vitest";

import { listJobsByStatusQuery } from "./store";

// No live PG in CI (store.ts's own doc comment) — this proves the D11 SQL shape
// (0022 S8) without a connection: postgres.js takes the statuses array as ONE
// `= any($1)` param, restoring the natural form the old Bun `SQL.unsafe` bug
// (2c2fd10) forced an `in ($1, $2, …)` scalar-expansion workaround around.
describe("listJobsByStatusQuery", () => {
  test("passes the statuses as one array param to = any($1)", () => {
    const { query, params } = listJobsByStatusQuery(["queued", "running"]);
    expect(query).toContain("status = any($1)");
    expect(query).not.toMatch(/\bin\s*\(/i);
    expect(params).toEqual([["queued", "running"]]);
  });

  test("still builds a query for a single status", () => {
    const { query, params } = listJobsByStatusQuery(["error"]);
    expect(query).toContain("status = any($1)");
    expect(params).toEqual([["error"]]);
  });
});
