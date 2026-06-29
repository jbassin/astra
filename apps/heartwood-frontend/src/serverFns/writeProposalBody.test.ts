import { describe, expect, it } from "vitest";
import { validateWrite } from "./writeProposalBody";

// The write fn's pure guard: the id-slug shape is the traversal defense (no slash/dot →
// no `../`), plus a size cap. fs.ts's `within` is the second line of defense.
describe("validateWrite", () => {
  it("accepts a well-formed slug id", () => {
    expect(validateWrite({ date: "2025-8-28", id: "org-iconoclasm-index", source: "x" }).ok).toBe(
      true,
    );
  });

  it("rejects a traversal id", () => {
    expect(validateWrite({ date: "2025-8-28", id: "../../etc/passwd", source: "x" }).ok).toBe(
      false,
    );
    expect(validateWrite({ date: "2025-8-28", id: "a/b", source: "x" }).ok).toBe(false);
    expect(validateWrite({ date: "2025-8-28", id: "a.vellum", source: "x" }).ok).toBe(false);
  });

  it("rejects a bad date", () => {
    expect(validateWrite({ date: "../2025", id: "ok", source: "x" }).ok).toBe(false);
  });

  it("rejects an oversize body", () => {
    const big = "x".repeat(256 * 1024 + 1);
    expect(validateWrite({ date: "2025-8-28", id: "ok", source: big }).ok).toBe(false);
  });
});
