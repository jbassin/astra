import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CodexTraitPills, humanizeTraitToken } from "./traits";

describe("humanizeTraitToken", () => {
  it("hyphenated tokens become title-case words", () => {
    expect(humanizeTraitToken("reach-15")).toBe("Reach 15");
    expect(humanizeTraitToken("unarmed")).toBe("Unarmed");
    expect(humanizeTraitToken("deadly-d8")).toBe("Deadly D8");
  });
});

describe("CodexTraitPills (D29-24): links only for known traits", () => {
  it("a trait present in the injected known-set renders as a link", () => {
    const out = renderToStaticMarkup(
      <CodexTraitPills traits={["satyr"]} knownTraitIds={new Set(["trait/satyr"])} />,
    );
    expect(out).toContain('href="/trait/satyr"');
    expect(out).toContain("Satyr");
  });

  it("a numeric qualifier trait (e.g. reach-15) with no matching entity renders unlinked", () => {
    const out = renderToStaticMarkup(
      <CodexTraitPills traits={["reach-15"]} knownTraitIds={new Set(["trait/satyr"])} />,
    );
    expect(out).not.toContain("<a ");
    expect(out).toContain("Reach 15");
  });

  it("empty traits array renders nothing", () => {
    expect(renderToStaticMarkup(<CodexTraitPills traits={[]} knownTraitIds={new Set()} />)).toBe(
      "",
    );
  });

  it("mixed known/unknown traits render each correctly", () => {
    const out = renderToStaticMarkup(
      <CodexTraitPills
        traits={["satyr", "magical", "reach-15"]}
        knownTraitIds={new Set(["trait/satyr"])}
      />,
    );
    expect(out).toContain('href="/trait/satyr"');
    expect(out).toContain("Magical");
    expect(out).toContain("Reach 15");
  });
});
