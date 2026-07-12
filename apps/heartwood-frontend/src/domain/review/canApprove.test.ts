import { describe, expect, it } from "vitest";

import { canApprove } from "./canApprove";

const SKELETON = "---\ndate: 2025-8-28\ntags: []\n---\n\n";

describe("canApprove — create", () => {
  it("blocks an empty (untouched skeleton) body", () => {
    expect(
      canApprove({
        op: "create",
        needsPlacement: false,
        savePersisted: true,
        source: SKELETON,
        corpusBody: null,
      }),
    ).toBe(false);
  });

  it("blocks a whitespace-only body", () => {
    expect(
      canApprove({
        op: "create",
        needsPlacement: false,
        savePersisted: true,
        source: `${SKELETON}   \n\t\n`,
        corpusBody: null,
      }),
    ).toBe(false);
  });

  it("blocks a body that only fills in frontmatter fields (no prose)", () => {
    const source = "---\ndate: 2025-8-28\ntags: [foo, bar]\n---\n\n";
    expect(
      canApprove({
        op: "create",
        needsPlacement: false,
        savePersisted: true,
        source,
        corpusBody: null,
      }),
    ).toBe(false);
  });

  it("allows once real prose is written", () => {
    const source = `${SKELETON}Down where Hallia gives up on itself, Sableclutch swallows what the city throws away.`;
    expect(
      canApprove({
        op: "create",
        needsPlacement: false,
        savePersisted: true,
        source,
        corpusBody: null,
      }),
    ).toBe(true);
  });

  it("blocks while placement is unresolved even with prose written", () => {
    const source = `${SKELETON}Real prose here.`;
    expect(
      canApprove({
        op: "create",
        needsPlacement: true,
        savePersisted: true,
        source,
        corpusBody: null,
      }),
    ).toBe(false);
  });

  it("blocks while a save is pending or failed, even with prose written", () => {
    const source = `${SKELETON}Real prose here.`;
    expect(
      canApprove({
        op: "create",
        needsPlacement: false,
        savePersisted: false,
        source,
        corpusBody: null,
      }),
    ).toBe(false);
  });
});

describe("canApprove — rewrite", () => {
  const CORPUS = "---\ntitle: Iconoclasm\n---\n\nExisting canon prose, untouched.";

  it("blocks when the buffer is byte-identical to the live corpus page", () => {
    expect(
      canApprove({
        op: "rewrite",
        needsPlacement: false,
        savePersisted: true,
        source: CORPUS,
        corpusBody: CORPUS,
      }),
    ).toBe(false);
  });

  it("allows once the buffer diverges from the corpus page", () => {
    expect(
      canApprove({
        op: "rewrite",
        needsPlacement: false,
        savePersisted: true,
        source: `${CORPUS} One more sentence.`,
        corpusBody: CORPUS,
      }),
    ).toBe(true);
  });

  it("blocks a changed rewrite while a save is still pending", () => {
    expect(
      canApprove({
        op: "rewrite",
        needsPlacement: false,
        savePersisted: false,
        source: `${CORPUS} One more sentence.`,
        corpusBody: CORPUS,
      }),
    ).toBe(false);
  });
});
