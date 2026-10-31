import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

// The validator CLI end to end, on a throwaway akasha/{content,assets} pair. Async execFile:
// a synchronous child blocks the vitest worker.
const SCRIPT = resolve(import.meta.dirname, "../scripts/validate-corpus.ts");

let root = "";
afterEach(() => rmSync(root, { recursive: true, force: true }));

function corpus(page: string, assets: string[] = []): { content: string; assets: string } {
  root = mkdtempSync(join(tmpdir(), "validate-corpus-"));
  const content = join(root, "akasha", "content");
  const assetDir = join(root, "akasha", "assets");
  mkdirSync(content, { recursive: true });
  writeFileSync(join(content, "Page.vellum"), page);
  for (const a of assets) {
    mkdirSync(join(assetDir, a, ".."), { recursive: true });
    writeFileSync(join(assetDir, a), "");
  }
  return { content, assets: assetDir };
}

function validate(args: string[]): Promise<{ code: number; out: string }> {
  return new Promise((done) => {
    execFile(process.execPath, ["--import", "tsx", SCRIPT, ...args], (err, stdout, stderr) => {
      const code = err ? (typeof err.code === "number" ? err.code : -1) : 0;
      done({ code, out: stderr + stdout });
    });
  });
}

describe("validate-corpus images", () => {
  test("an image naming a file in the sibling assets folder passes", async () => {
    const { content } = corpus("![Map](maps/althane.png)\n", ["maps/althane.png"]);
    const { code, out } = await validate(["--dir", content]);
    expect(out).toContain("0 with bad images");
    expect(code).toBe(0);
  });

  test("external, missing and alt-less images fail the page", async () => {
    const { content } = corpus(
      "![Out](https://i.imgur.com/a.png)\n\n![Lost](lost.png)\n\n![](here.png)\n",
      ["here.png"],
    );
    const { code, out } = await validate(["--dir", content]);
    expect(code).toBe(1);
    expect(out).toContain("✖ Page.vellum  (images)");
    expect(out).toContain("external image https://i.imgur.com/a.png");
    expect(out).toContain("image lost.png: no such file");
    expect(out).toContain("image here.png: needs alt text");
  });

  test("--assets points at another folder (heartwood validates a page in a temp dir)", async () => {
    const { content, assets } = corpus("![Map](althane.png)\n", ["althane.png"]);
    const lone = mkdtempSync(join(root, "probe-"));
    writeFileSync(join(lone, "Page.vellum"), "![Map](althane.png)\n");
    expect((await validate(["--dir", lone])).code).toBe(1);
    expect((await validate(["--dir", lone, "--assets", assets])).code).toBe(0);
    expect((await validate(["--dir", content, "--assets", lone])).code).toBe(1);
  });

  test("a symlinked image doesn't count, and a symlink loop doesn't crash the walk", async () => {
    const { content, assets } = corpus("![Map](leak.png)\n", ["maps/real.png"]);
    writeFileSync(join(root, "secret.txt"), "x");
    symlinkSync(join(root, "secret.txt"), join(assets, "leak.png"));
    symlinkSync("..", join(assets, "maps", "loop"));
    const { code, out } = await validate(["--dir", content]);
    expect(code).toBe(1);
    expect(out).toContain("image leak.png: no such file");
  });
});
