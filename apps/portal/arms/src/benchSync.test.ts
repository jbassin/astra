import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { BENCH_FILE, generate, replaceBlock } from "./benchSync";

describe("the bench page", () => {
  it("embeds the module's current sources (run: pnpm --filter @astra/portal-arms sync-bench)", () => {
    const html = readFileSync(BENCH_FILE, "utf8");
    expect(replaceBlock(html, generate())).toBe(html);
  });

  it("carries the shaders the module draws with", () => {
    const block = generate();
    expect(block).toContain("INK_BUFFER_FRAG");
    expect(block).toContain("armFx");
    expect(block).not.toContain("</script>\n  };");
  });
});
