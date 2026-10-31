import { parseDocument } from "@astra/vellum-lang";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { DocumentView } from "./components/DocumentView";
import { type ImageResolver, isSameOriginPath } from "./imageResolver";

/**
 * The image resolver seam: an `<img>` only for a file the app ships, never a fetch from
 * another origin. Proves: no resolver keeps the alt text, a known asset becomes an `<img>`
 * (a figure with a caption when alone on its line), and external, missing and unsafe
 * sources keep the alt text.
 */
const DOC = `# Page

![Map of Althane](maps/althane.png "The coast, as the Watch drew it")

Inline ![a sigil](sigil.webp) in text, an ![outside picture](https://i.imgur.com/x.png),
and a ![lost map](missing.png).
`;

const SHIPPED: Record<string, { src: string; width: number; height: number }> = {
  "maps/althane.png": { src: "/assets/wiki/maps/althane.1a2b3c4d.png", width: 640, height: 400 },
  "sigil.webp": { src: "/assets/wiki/sigil.5e6f7a8b.webp", width: 32, height: 32 },
};
const resolve: ImageResolver = (src) => SHIPPED[src] ?? null;
const otherOrigin: ImageResolver = () => ({ src: "//evil.example/x.png" });

function render(resolveImage?: ImageResolver): string {
  return renderToStaticMarkup(
    <DocumentView document={parseDocument(DOC)} resolveImage={resolveImage} />,
  );
}

describe("image resolver seam", () => {
  test("no resolver → alt text only, no <img> (vellum-render, Storybook unchanged)", () => {
    const html = render();
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<figure");
    expect(html).toContain("<p><span>Map of Althane</span></p>");
    expect(html).toContain("<span>outside picture</span>");
  });

  test("a known asset alone on its line → figure with lazy img and caption", () => {
    const html = render(resolve);
    expect(html).toContain(
      '<figure class="gothic-figure"><img class="gothic-image" src="/assets/wiki/maps/althane.1a2b3c4d.png" alt="Map of Althane" width="640" height="400" loading="lazy" decoding="async"/><figcaption>The coast, as the Watch drew it</figcaption></figure>',
    );
  });

  test("a known asset inside text → inline img, no figure", () => {
    const html = render(resolve);
    expect(html).toContain('src="/assets/wiki/sigil.5e6f7a8b.webp" alt="a sigil"');
    expect(html.match(/<figure/g)).toHaveLength(1);
  });

  test("external and missing sources → alt text, never an <img>", () => {
    const html = render(resolve);
    expect(html).not.toContain("imgur");
    expect(html).toContain("<span>outside picture</span>");
    expect(html).toContain("<span>lost map</span>");
    expect(html.match(/<img/g)).toHaveLength(2);
  });

  test("a resolver that returns another origin is ignored", () => {
    const html = render(otherOrigin);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("evil.example");
  });

  test("a figure without a title has no caption", () => {
    const html = renderToStaticMarkup(
      <DocumentView
        document={parseDocument("![Map of Althane](maps/althane.png)\n")}
        resolveImage={resolve}
      />,
    );
    expect(html).toContain('<figure class="gothic-figure"><img');
    expect(html).not.toContain("<figcaption");
  });

  test("isSameOriginPath accepts only a single-slash absolute path", () => {
    expect(isSameOriginPath("/assets/wiki/a.png")).toBe(true);
    expect(isSameOriginPath("//host/a.png")).toBe(false);
    expect(isSameOriginPath("/\\host/a.png")).toBe(false);
    expect(isSameOriginPath("https://host/a.png")).toBe(false);
    expect(isSameOriginPath("a.png")).toBe(false);
  });
});
