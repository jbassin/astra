import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeLayer } from "./writeLayer";

// All writes target a throwaway temp dir (the `layersDir` seam) so the guard
// logic is exercised without touching the repo's real content/layers.
let dir: string;
const VALID = "0863-07-13T192559-test-node.kdl";

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "strider-writelayer-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("writeLayer — happy path", () => {
  it("writes a new file and returns 200 + relative path", () => {
    const res = writeLayer({ filename: VALID, content: "hello\n" }, dir);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, path: `content/layers/${VALID}` });
    expect(readFileSync(path.join(dir, VALID), "utf8")).toBe("hello\n");
  });
});

describe("writeLayer — rejects bad input (400)", () => {
  it("non-object / missing / wrong-type body", () => {
    expect(writeLayer(null, dir).status).toBe(400);
    expect(writeLayer({ content: "x" }, dir).status).toBe(400);
    expect(writeLayer({ filename: VALID, content: 123 }, dir).status).toBe(400);
  });

  it("empty and oversized content", () => {
    expect(writeLayer({ filename: VALID, content: "" }, dir).status).toBe(400);
    const huge = "x".repeat(64 * 1024 + 1);
    expect(writeLayer({ filename: VALID, content: huge }, dir).status).toBe(400);
  });

  it("filenames that don't match the allowlist (incl. traversal attempts)", () => {
    for (const filename of [
      "evil.kdl",
      "0863-7-13T192559-bad-month.kdl",
      "0863-07-13T192559-UPPER.kdl",
      "0863-07-13T192559-x.txt",
      "0863-07-13T192559-legacy.md",
      "../../etc/passwd",
      "../0863-07-13T192559-escape.kdl",
      "0863-07-13T192559-x.kdl/../../escape.kdl",
    ]) {
      const res = writeLayer({ filename, content: "x" }, dir);
      expect(res.status, filename).toBe(400);
      expect(res.body.ok).toBe(false);
    }
  });
});

describe("writeLayer — never overwrites (409)", () => {
  it("rejects a second write to the same filename", () => {
    expect(writeLayer({ filename: VALID, content: "first" }, dir).status).toBe(200);
    const res = writeLayer({ filename: VALID, content: "second" }, dir);
    expect(res.status).toBe(409);
    // original content is untouched
    expect(readFileSync(path.join(dir, VALID), "utf8")).toBe("first");
  });

  it("does not leave a partial file when input is invalid", () => {
    writeLayer({ filename: "evil.kdl", content: "x" }, dir);
    expect(existsSync(path.join(dir, "evil.kdl"))).toBe(false);
  });
});
