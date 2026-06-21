import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { main } from "./build-content";

// Proves the content pipeline is wired: running build-content emits the generated
// site module the app imports. Slice 2 extends this to the snapshot sources.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const GENERATED = path.resolve(HERE, "../src/generated/site.ts");

describe("build-content", () => {
  it("emits the generated site module", async () => {
    await main();
    expect(existsSync(GENERATED)).toBe(true);
    expect(readFileSync(GENERATED, "utf8")).toContain('title: "Akasha"');
  });
});
