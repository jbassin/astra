import { describe, expect, it, vi } from "vitest";

import type { BlockNode, CodexNode, HeadingNode, InlineNode, TextMarks } from "../../schema/nodes";
import {
  collisionBaseSlug,
  LORE_SUPPRESSION_THRESHOLD,
  reportLoreSuppression,
  stripCoveredFeatureSections,
  suppressLoreSections,
  type CoveredFeatureRef,
} from "./loreDedupe";

/**
 * P14 S2 (D29-135) — direct unit coverage of the section-split + shingle-
 * coverage machinery, independent of any fixture/render pipeline (the
 * ClassPage/EntityPage integration tests exercise the real anadi/witch
 * fixtures separately).
 */

const PLAIN_MARKS: TextMarks = { bold: false, italic: false, superscript: false };

function text(content: string): InlineNode {
  return { kind: "text", content, marks: { ...PLAIN_MARKS } };
}

function para(...children: InlineNode[]): BlockNode {
  return { kind: "paragraph", children };
}

function heading(level: number, content: string): HeadingNode {
  return { kind: "heading", level, children: [text(content)] };
}

function embed(target: string, resolved = true): InlineNode {
  return { kind: "embed", target, resolved };
}

function table(...rows: { header?: boolean; cells: string[] }[]): BlockNode {
  return {
    kind: "table",
    rows: rows.map((r) => ({
      header: r.header ?? false,
      cells: r.cells.map((c) => [text(c)]),
    })),
  };
}

describe("LORE_SUPPRESSION_THRESHOLD", () => {
  it("is pinned at 0.5 (the spec's own pin — tune here, not silently elsewhere)", () => {
    expect(LORE_SUPPRESSION_THRESHOLD).toBe(0.5);
  });
});

describe("collisionBaseSlug (D29-132 idiom, mirrored render-side)", () => {
  it("an unsuffixed id is unchanged", () => {
    expect(collisionBaseSlug("class-feature/perception-expertise")).toBe(
      "class-feature/perception-expertise",
    );
  });

  it("strips a trailing collision suffix", () => {
    expect(collisionBaseSlug("class-feature/perception-expertise-8")).toBe(
      "class-feature/perception-expertise",
    );
  });

  it("strips a trailing @legacy marker", () => {
    expect(collisionBaseSlug("class-feature/weapon-specialization@legacy")).toBe(
      "class-feature/weapon-specialization",
    );
  });

  it("strips @legacy THEN the collision suffix, same order as ingest's classFeatureBaseSlug", () => {
    expect(collisionBaseSlug("class-feature/weapon-specialization-3@legacy")).toBe(
      "class-feature/weapon-specialization",
    );
  });
});

// ---------------------------------------------------------------------------
// suppressLoreSections
// ---------------------------------------------------------------------------

describe("suppressLoreSections: preamble (nodes before the first heading)", () => {
  it("a preamble duplicating body prose suppresses (present in 77/77 real loreBody docs)", () => {
    const body: CodexNode[] = [
      para(
        text(
          "Anadi people are reclusive sapient spiders who hail from the jungles of southern Garund",
        ),
      ),
    ];
    const loreBody: CodexNode[] = [
      para(
        text(
          "Anadi people are reclusive sapient spiders who hail from the jungles of southern Garund",
        ),
      ),
    ];
    const result = suppressLoreSections(loreBody, body);
    expect(result.nodes).toEqual([]);
    expect(result.totalSections).toBe(1);
    expect(result.suppressedSections).toBe(1);
  });

  it("a genuinely unique preamble survives", () => {
    const body: CodexNode[] = [para(text("completely unrelated mechanical body prose here"))];
    const loreBody: CodexNode[] = [
      para(text("a wholly original flavor sentence found nowhere else in this document at all")),
    ];
    const result = suppressLoreSections(loreBody, body);
    expect(result.nodes.length).toBeGreaterThan(0);
    expect(result.suppressedSections).toBe(0);
  });
});

describe("suppressLoreSections: per-heading split (review blocker — NOT top-level-only)", () => {
  // Mirrors the real alchemist shape the spec's own review caught: a
  // top-level split would fold "Class Features" -> "Duplicate Feature" ->
  // "Versatile Vial" into ONE giant section (avg coverage crosses
  // threshold, destroying the unique table); splitting at EVERY heading
  // isolates "Versatile Vial" into its own low-coverage section that
  // survives while "Duplicate Feature" suppresses on its own.
  const DUP_SENTENCE =
    "You know how to prepare fast acting chemicals into versatile vials for use later";

  const body: CodexNode[] = [
    heading(1, "Class Features"),
    heading(2, "Duplicate Feature"),
    para(text(DUP_SENTENCE)),
    heading(2, "Versatile Vial"),
    para(text("a short mechanic blurb, unrelated to the lore table below in every way")),
  ];

  const loreBody: CodexNode[] = [
    heading(1, "Class Features"),
    heading(2, "Duplicate Feature"),
    para(text(DUP_SENTENCE)),
    heading(2, "Versatile Vial"),
    table(
      { header: true, cells: ["Tier", "Effect"] },
      { header: false, cells: ["Lesser", "Deals a small amount of acid damage on a hit"] },
      {
        header: false,
        cells: ["Greater", "Deals a large amount of acid damage on a critical hit"],
      },
    ),
  ];

  it("the dup subsection suppresses while the unique table subsection survives", () => {
    const result = suppressLoreSections(loreBody, body);
    const survivorText = JSON.stringify(result.nodes);
    expect(survivorText).not.toContain(DUP_SENTENCE);
    expect(survivorText).toContain("Versatile Vial");
    expect(survivorText).toContain("Lesser");
    expect(survivorText).toContain("Greater");
  });

  it("the empty top-level 'Class Features' heading-only section suppresses (no text of its own)", () => {
    // 4 real sections: the H1 (heading-only, no body before H2), the dup H2,
    // the unique H2 -> 3 suppress (H1 heading-only + dup), 1 survives.
    const result = suppressLoreSections(loreBody, body);
    expect(result.totalSections).toBe(3);
    expect(result.suppressedSections).toBe(2);
  });
});

describe("suppressLoreSections: zero survivors omits the whole card", () => {
  it("every section suppressed -> nodes is empty", () => {
    const shared = "identical text in both body and lore for this synthetic doc example case";
    const body: CodexNode[] = [para(text(shared))];
    const loreBody: CodexNode[] = [para(text(shared))];
    const result = suppressLoreSections(loreBody, body);
    expect(result.nodes).toEqual([]);
  });
});

describe("suppressLoreSections: (a) ClassPage-only base-slug embed removal", () => {
  it("an embed matching a grantedBaseSlugs entry is stripped, leaving the section text-empty -> suppressed", () => {
    const body: CodexNode[] = [para(text("unrelated class body prose"))];
    const loreBody: CodexNode[] = [
      heading(2, "Basic Lesson"),
      // bare, unsuffixed target — the real corpus shape (a lore embed
      // carries the collision-family's bare base slug, never the
      // post-D29-132 SUFFIXED stream targetId).
      para(embed("class-feature/basic-lesson")),
    ];
    const result = suppressLoreSections(loreBody, body, {
      grantedBaseSlugs: new Set(["class-feature/basic-lesson"]),
    });
    expect(result.nodes).toEqual([]);
    expect(result.suppressedSections).toBe(1);
  });

  it("without grantedBaseSlugs (EntityPage's own call shape), the same embed is NOT stripped by (a) — it renders fail-soft empty via D29-136 instead, same end result but a different mechanism", () => {
    const body: CodexNode[] = [para(text("unrelated class body prose"))];
    const loreBody: CodexNode[] = [
      heading(2, "Basic Lesson"),
      para(embed("class-feature/basic-lesson")),
    ];
    const result = suppressLoreSections(loreBody, body);
    // Still suppresses — an unresolved-looking embed contributes no TEXT
    // via `collectText` regardless (its own `display` is unset), so the
    // "no text after (a)" rule fires even when (a) itself was a no-op.
    expect(result.nodes).toEqual([]);
  });

  it("an embed NOT matching any grantedBaseSlugs entry survives untouched", () => {
    const body: CodexNode[] = [para(text("unrelated class body prose"))];
    const loreBody: CodexNode[] = [
      heading(2, "Some Other Feature"),
      para(text("prose that is unique and "), embed("class-feature/something-else", false)),
    ];
    const result = suppressLoreSections(loreBody, body, {
      grantedBaseSlugs: new Set(["class-feature/basic-lesson"]),
    });
    expect(result.nodes.length).toBeGreaterThan(0);
  });
});

describe("suppressLoreSections: (b) extraReferenceText widens the coverage reference", () => {
  const FEATURE_PROSE = "you gain a plus one status bonus to a single skill check of your choice";

  it("a section covered ONLY by a granted feature's stream body suppresses when extraReferenceText is passed", () => {
    const body: CodexNode[] = [para(text("completely unrelated body prose, no overlap at all"))];
    const loreBody: CodexNode[] = [heading(2, "Basic Lesson"), para(text(FEATURE_PROSE))];
    const result = suppressLoreSections(loreBody, body, { extraReferenceText: FEATURE_PROSE });
    expect(result.nodes).toEqual([]);
  });

  it("the SAME section survives when extraReferenceText is omitted — proving it's actually load-bearing, not a no-op", () => {
    const body: CodexNode[] = [para(text("completely unrelated body prose, no overlap at all"))];
    const loreBody: CodexNode[] = [heading(2, "Basic Lesson"), para(text(FEATURE_PROSE))];
    const result = suppressLoreSections(loreBody, body);
    expect(result.nodes.length).toBeGreaterThan(0);
  });
});

describe("reportLoreSuppression (the dev-report hook)", () => {
  it("warns when EVERY section suppressed (the risky over-suppression case)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    reportLoreSuppression("class/test", { nodes: [], totalSections: 2, suppressedSections: 2 });
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain("class/test");
    warn.mockRestore();
  });

  it("stays silent on partial suppression", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    reportLoreSuppression("class/test", {
      nodes: [heading(2, "x")],
      totalSections: 2,
      suppressedSections: 1,
    });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("stays silent when there were no sections at all (no loreBody / an empty one)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    reportLoreSuppression("class/test", { nodes: [], totalSections: 0, suppressedSections: 0 });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// stripCoveredFeatureSections
// ---------------------------------------------------------------------------

describe("stripCoveredFeatureSections (ClassPage Description extension)", () => {
  const feature: CoveredFeatureRef = {
    name: "Basic Lesson",
    body: [para(text("you gain a plus one status bonus to a single skill check of your choice"))],
  };

  it("a heading matching the feature name AND covered prose strips", () => {
    const body: CodexNode[] = [
      heading(2, "Basic Lesson"),
      para(text("you gain a plus one status bonus to a single skill check of your choice")),
    ];
    const { body: out, suppressedCount } = stripCoveredFeatureSections(body, [feature]);
    expect(out).toEqual([]);
    expect(suppressedCount).toBe(1);
  });

  it("a heading matching the feature name but DIFFERENT prose survives — name match alone never strips", () => {
    const body: CodexNode[] = [
      heading(2, "Basic Lesson"),
      para(text("an entirely different sentence sharing no real content with the granted feature")),
    ];
    const { body: out, suppressedCount } = stripCoveredFeatureSections(body, [feature]);
    expect(out.length).toBeGreaterThan(0);
    expect(suppressedCount).toBe(0);
  });

  it("a heading matching no feature at all is never a candidate, regardless of its prose", () => {
    const body: CodexNode[] = [
      heading(2, "Weapon Specialization"),
      para(text("you gain a plus one status bonus to a single skill check of your choice")),
    ];
    const { body: out, suppressedCount } = stripCoveredFeatureSections(body, [feature]);
    expect(out.length).toBeGreaterThan(0);
    expect(suppressedCount).toBe(0);
  });

  it("the preamble (no heading) is never a strip candidate", () => {
    const body: CodexNode[] = [
      para(text("you gain a plus one status bonus to a single skill check of your choice")),
    ];
    const { body: out, suppressedCount } = stripCoveredFeatureSections(body, [feature]);
    expect(out).toEqual(body);
    expect(suppressedCount).toBe(0);
  });

  it("heading-name matching is case-insensitive", () => {
    const body: CodexNode[] = [
      heading(2, "basic lesson"),
      para(text("you gain a plus one status bonus to a single skill check of your choice")),
    ];
    const { suppressedCount } = stripCoveredFeatureSections(body, [feature]);
    expect(suppressedCount).toBe(1);
  });
});
