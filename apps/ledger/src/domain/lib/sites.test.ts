import { describe, expect, it } from "vitest";
import { SITES } from "@/generated/sites";

// The generated registry is the heart of ledger: every linked site must resolve to a
// real public-origin from config.kdl (config-single-source — no hardcoded URLs), in a
// stable order, with no empty content.
describe("SITES registry", () => {
  it("lists exactly the player-facing sites, in order", () => {
    expect(SITES.map((s) => s.key)).toEqual([
      "strider",
      "akasha",
      "mouthpiece",
      "harrow",
      "vellum",
    ]);
  });

  it("resolves every href to a real https <site>.iridi.cc origin", () => {
    for (const site of SITES) {
      expect(site.href).toMatch(/^https:\/\/[a-z-]+\.iridi\.cc$/);
      expect(site.title.length).toBeGreaterThan(0);
      expect(site.blurb.length).toBeGreaterThan(0);
    }
  });

  it("points each card at its own site (host contains the key)", () => {
    for (const site of SITES) {
      const host = new URL(site.href).host;
      // harrow's host is harrow.iridi.cc; akasha/mouthpiece/vellum/strider likewise.
      expect(host.startsWith(site.key)).toBe(true);
    }
  });
});
