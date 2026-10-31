import { describe, expect, test } from "vitest";

import { loadBeing } from "./index";
import {
  campaignOverrides,
  loadSessionOverrides,
  parseSessionOverrides,
  skippedKeys,
} from "./sessions";

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

  test("files a session under a campaign", () => {
    const o = parseSessionOverrides('session "2026-9-3" campaign="urth" { note "Noah GMs" }');
    expect(o.sessions).toEqual([
      { key: "2026-9-3", skip: false, campaign: "urth", note: "Noah GMs" },
    ]);
    expect([...campaignOverrides(o)]).toEqual([["2026-9-3", "urth"]]);
    expect(campaignOverrides(loadSessionOverrides()).get("2026-9-3")).toBe("urth");
  });

  test("an unknown campaign slug fails the load when the roster is given", () => {
    const text = 'session "2026-9-3" campaign="urht"';
    expect(parseSessionOverrides(text).sessions[0]?.campaign).toBe("urht");
    expect(() => parseSessionOverrides(text, "sessions.kdl", ["urth"])).toThrow(/urht/);
    const slugs = loadBeing().campaigns.map((c) => c.slug);
    expect(() => loadSessionOverrides(undefined, slugs)).not.toThrow();
  });

  test("rejects what the Python schema rejects", () => {
    expect(() => parseSessionOverrides('session "2026-9-3" skip=#true campaign="urth"')).toThrow(
      /skipped/,
    );
    expect(() => parseSessionOverrides('session "2026-9-3" campaign=" "')).toThrow(/empty/);
    expect(() => parseSessionOverrides('session "2025-08-11x"')).toThrow(/session key/);
    expect(() => parseSessionOverrides('session "2025-8-11" skipp=#true')).toThrow();
    expect(() => parseSessionOverrides('session "2025-8-11" kind="bonus"')).toThrow();
    expect(() => parseSessionOverrides('session "2025-8-11" title=" "')).toThrow(/empty/);
    expect(() => parseSessionOverrides('session "2025-8-11"\nsession "2025-8-11"')).toThrow(
      /twice/,
    );
  });
});
