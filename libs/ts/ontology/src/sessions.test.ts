import { describe, expect, test } from "vitest";

import { loadSessionOverrides, parseSessionOverrides, skippedKeys } from "./sessions";

describe("sessions.kdl", () => {
  test("the checkout's file loads, and its skips are the excluded sessions", () => {
    const overrides = loadSessionOverrides();
    const skipped = skippedKeys(overrides);
    expect(skipped.has("2025-8-11")).toBe(true); // The Blue Remains
    expect(skipped.has("2025-7-7")).toBe(true); // Starfinder
    expect(skipped.has("2025-6-30")).toBe(true);
    const special = overrides.sessions.find((s) => s.key === "2026-10-19-recap-of-2025-8-28");
    expect(special?.kind).toBe("special");
    expect(special?.skip).toBe(false);
  });

  test("decodes every property and the note", () => {
    const o = parseSessionOverrides(
      'session "2026-9-7" title="The Bell" kind="session"\n' +
        'session "2025-8-11" skip=#true { note "why" }\n',
    );
    expect(o.sessions).toEqual([
      { key: "2026-9-7", skip: false, kind: "session", title: "The Bell" },
      { key: "2025-8-11", skip: true, note: "why" },
    ]);
    expect([...skippedKeys(o)]).toEqual(["2025-8-11"]);
  });

  test("rejects what the Python schema rejects", () => {
    expect(() => parseSessionOverrides('session "2025-08-11x"')).toThrow(/session key/);
    expect(() => parseSessionOverrides('session "2025-8-11" skipp=#true')).toThrow();
    expect(() => parseSessionOverrides('session "2025-8-11" kind="bonus"')).toThrow();
    expect(() => parseSessionOverrides('session "2025-8-11" title=" "')).toThrow(/empty/);
    expect(() => parseSessionOverrides('session "2025-8-11"\nsession "2025-8-11"')).toThrow(
      /twice/,
    );
  });
});
