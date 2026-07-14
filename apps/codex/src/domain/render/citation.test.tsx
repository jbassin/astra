import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { Source } from "../../schema/entity";
import { Citation } from "./citation";

function html(source: Source): string {
  return renderToStaticMarkup(<Citation source={source} />);
}

describe("Citation (D29-26): book + page + license badge, fail-soft", () => {
  it("book + page + a known license all render", () => {
    const out = html({ book: "Treasure Vault", page: 164, license: "OGL" });
    expect(out).toContain("Treasure Vault");
    expect(out).toContain("pg. 164");
    expect(out).toContain("OGL");
  });

  it("page absent -> no 'pg.' suffix, book+license still render", () => {
    const out = html({ book: "Pathfinder Lost Omens Impossible Lands", license: "OGL" });
    expect(out).not.toContain("pg.");
    expect(out).toContain("Pathfinder Lost Omens Impossible Lands");
    expect(out).toContain("OGL");
  });

  it("license unknown -> the badge is omitted, book line still renders", () => {
    const out = html({ book: "Foundry Journal: Ancestries", license: "unknown" });
    expect(out).toContain("Foundry Journal: Ancestries");
    expect(out).not.toContain("unknown");
  });

  it("book literally 'unknown' -> the WHOLE citation line is omitted", () => {
    const out = renderToStaticMarkup(
      <div data-wrapper="">
        <Citation source={{ book: "unknown", license: "unknown" }} />
      </div>,
    );
    expect(out).toBe('<div data-wrapper=""></div>');
  });

  it("ORC license renders too", () => {
    expect(html({ book: "Howl of the Wild", page: 33, license: "ORC" })).toContain("ORC");
  });
});
