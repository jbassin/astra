/**
 * The wiki's inline images: astra-data's `akasha/assets/` folder, shipped same-origin.
 *
 * BUILD-ONLY (build-content.ts). Each file whose path is in the asset path form
 * (`isAssetPath`: png, jpg/jpeg, webp, gif; never svg) is copied into `public/` at a
 * content-hashed URL under `/assets/wiki/`, so vite copies it into `dist/client/` and the
 * SSR server serves it with the year-long `immutable` cache it gives every file under
 * `/assets/` (site-kit `isHashedAssetPath`). A changed image gets a new URL; the page HTML,
 * rendered fresh, points at it. `imageResolver` maps the path an author wrote
 * (`![alt](maps/althane.png)`) to that URL and the image's size, for gothic's `<img>`.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { ImageResolver } from "@astra/gothic";
import { isAssetPath } from "@astra/vellum-lang";

/** Where the copies live, under `public/` and in the URL. Inside vite's hashed `assets/`. */
const WIKI_ASSET_DIR = "assets/wiki";

interface WikiAsset {
  /** The path authors write, relative to `akasha/assets/`. */
  path: string;
  /** The URL the site serves it at: `/assets/wiki/<dir>/<stem>.<hash>.<ext>`. */
  url: string;
  bytes: Buffer;
  width?: number;
  height?: number;
}

type Size = { width: number; height: number };

/** PNG: the signature, then the IHDR chunk's width and height (big-endian). */
function pngSize(b: Buffer): Size | null {
  const ok = b.length >= 24 && b.readUInt32BE(0) === 0x89504e47;
  return ok && b.toString("ascii", 12, 16) === "IHDR"
    ? { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
    : null;
}

/** GIF: the logical screen size (little-endian). */
function gifSize(b: Buffer): Size | null {
  return b.length >= 10 && b.toString("ascii", 0, 3) === "GIF"
    ? { width: b.readUInt16LE(6), height: b.readUInt16LE(8) }
    : null;
}

/** WebP: a RIFF container whose first chunk is VP8 (lossy), VP8L (lossless) or VP8X. */
function webpSize(b: Buffer): Size | null {
  if (b.length < 30 || b.toString("ascii", 0, 4) !== "RIFF") return null;
  if (b.toString("ascii", 8, 12) !== "WEBP") return null;
  const chunk = b.toString("ascii", 12, 16);
  if (chunk === "VP8 ") {
    return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === "VP8L") {
    const bits = b.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X") {
    return { width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 };
  }
  return null;
}

/** JPEG: walk the segments to the first start-of-frame (SOF0-15, minus DHT/JPG/DAC). */
function jpegSize(b: Buffer): Size | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1] ?? 0;
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    const isSof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isSof) return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

/** Width and height from an image's header, or null when the bytes aren't one we read. */
export function imageSize(b: Buffer): Size | null {
  return pngSize(b) ?? gifSize(b) ?? webpSize(b) ?? jpegSize(b);
}

function hashedUrl(rel: string, bytes: Buffer): string {
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 10);
  const ext = path.posix.extname(rel);
  return `/${WIKI_ASSET_DIR}/${rel.slice(0, -ext.length)}.${hash}${ext.toLowerCase()}`;
}

/**
 * Every shippable image under `dir` (none when the folder doesn't exist yet), sorted by
 * path. Files not in the asset path form (an svg, a README) and anything that isn't a regular
 * file (a symlink) are returned in `skipped`.
 */
export function scanAssets(dir: string): { assets: WikiAsset[]; skipped: string[] } {
  const assets: WikiAsset[] = [];
  const skipped: string[] = [];
  const walk = (sub: string) => {
    for (const entry of fs.readdirSync(path.join(dir, sub), { withFileTypes: true })) {
      const rel = sub ? `${sub}/${entry.name}` : entry.name;
      // Symlinks, FIFOs and the like are never followed or read, only skipped: a symlinked
      // "image" could otherwise publish a file from outside the folder.
      if (entry.isDirectory()) walk(rel);
      else if (entry.isFile() && isAssetPath(rel)) {
        const bytes = fs.readFileSync(path.join(dir, rel));
        assets.push({ path: rel, url: hashedUrl(rel, bytes), bytes, ...imageSize(bytes) });
      } else skipped.push(rel);
    }
  };
  if (fs.existsSync(dir)) walk("");
  return {
    assets: assets.toSorted((a, b) => a.path.localeCompare(b.path)),
    skipped: skipped.toSorted(),
  };
}

/** Replace `public/assets/wiki/` with the hashed copies (vite copies public/ to dist/client). */
export function writeAssets(assets: readonly WikiAsset[], publicDir: string): void {
  fs.rmSync(path.join(publicDir, WIKI_ASSET_DIR), { recursive: true, force: true });
  for (const a of assets) {
    const file = path.join(publicDir, a.url);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, a.bytes);
  }
}

/** gothic's `resolveImage`: the author's path → the shipped URL and size; else null. */
export function imageResolver(assets: readonly WikiAsset[]): ImageResolver {
  const byPath = new Map(assets.map((a) => [a.path, a]));
  return (src) => {
    const a = byPath.get(src);
    return a ? { src: a.url, width: a.width, height: a.height } : null;
  };
}

/** The build step: scan `assetsDir`, write the copies, return the resolver and a log line. */
export function shipWikiAssets(
  assetsDir: string,
  publicDir: string,
): { resolveImage: ImageResolver; summary: string } {
  const { assets, skipped } = scanAssets(assetsDir);
  writeAssets(assets, publicDir);
  const note = skipped.length > 0 ? ` (skipped, not png/jpeg/webp/gif: ${skipped.join(", ")})` : "";
  return { resolveImage: imageResolver(assets), summary: `${assets.length} inline images${note}` };
}
