import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { imageResolver, imageSize, scanAssets, writeAssets } from "./wikiAssets";

let tmp = "";
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

/** A buffer of `n` zero bytes with `parts` written at their offsets. */
function bytes(n: number, parts: [number, number[] | string][]): Buffer {
  const b = Buffer.alloc(n);
  for (const [at, v] of parts)
    (typeof v === "string" ? Buffer.from(v, "ascii") : Buffer.from(v)).copy(b, at);
  return b;
}

const PNG_640x400 = bytes(33, [
  [0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  [12, "IHDR"],
  [16, [0, 0, 2, 0x80, 0, 0, 1, 0x90]],
]);

describe("imageSize", () => {
  it("reads PNG, GIF, WebP and JPEG headers", () => {
    expect(imageSize(PNG_640x400)).toEqual({ width: 640, height: 400 });
    expect(
      imageSize(
        bytes(13, [
          [0, "GIF89a"],
          [6, [0x20, 0, 0x10, 0]],
        ]),
      ),
    ).toEqual({ width: 32, height: 16 });
    // VP8X stores width-1 and height-1 in 24 bits.
    expect(
      imageSize(
        bytes(30, [
          [0, "RIFF"],
          [8, "WEBPVP8X"],
          [24, [99, 0, 0, 49, 0, 0]],
        ]),
      ),
    ).toEqual({
      width: 100,
      height: 50,
    });
    // SOI, an APP0 segment of length 4, then SOF0 with height 200 and width 300.
    const jpeg = bytes(24, [
      [0, [0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0, 200, 1, 0x2c]],
    ]);
    expect(imageSize(jpeg)).toEqual({ width: 300, height: 200 });
  });

  it("returns null for bytes it doesn't know", () => {
    expect(imageSize(Buffer.from("<svg/>"))).toBeNull();
    expect(imageSize(Buffer.alloc(0))).toBeNull();
  });
});

describe("scanAssets / writeAssets / imageResolver", () => {
  it("hashes each image into /assets/wiki/, skips non-images, resolves only known paths", () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-assets-"));
    const dir = path.join(tmp, "assets");
    fs.mkdirSync(path.join(dir, "maps"), { recursive: true });
    fs.writeFileSync(path.join(dir, "maps", "althane.PNG"), PNG_640x400);
    fs.writeFileSync(path.join(dir, "icon.svg"), "<svg/>");
    fs.writeFileSync(path.join(dir, "README.md"), "notes");

    const { assets, skipped } = scanAssets(dir);
    expect(skipped).toEqual(["README.md", "icon.svg"]);
    expect(assets).toHaveLength(1);
    const [map] = assets;
    expect(map?.path).toBe("maps/althane.PNG");
    expect(map?.url).toMatch(/^\/assets\/wiki\/maps\/althane\.[0-9a-f]{10}\.png$/);

    const pub = path.join(tmp, "public");
    fs.mkdirSync(path.join(pub, "assets", "wiki"), { recursive: true });
    fs.writeFileSync(path.join(pub, "assets", "wiki", "stale.png"), "old");
    writeAssets(assets, pub);
    expect(fs.existsSync(path.join(pub, "assets", "wiki", "stale.png"))).toBe(false);
    expect(fs.readFileSync(path.join(pub, map?.url ?? "")).equals(PNG_640x400)).toBe(true);

    const resolve = imageResolver(assets);
    expect(resolve("maps/althane.PNG")).toEqual({ src: map?.url, width: 640, height: 400 });
    expect(resolve("icon.svg")).toBeNull();
    expect(resolve("https://i.imgur.com/x.png")).toBeNull();
  });

  it("returns nothing when astra-data has no assets folder yet", () => {
    expect(scanAssets("/nonexistent/akasha/assets")).toEqual({ assets: [], skipped: [] });
  });
});
