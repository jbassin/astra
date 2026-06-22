import { describe, expect, it } from "vitest";
import { escapeHtml, searchDoc, searchUrl } from "./searchDoc";

describe("searchDoc (Pagefind index doc, N1)", () => {
  it("maps the home slug to / and others to /slug", () => {
    expect(searchUrl("index")).toBe("/");
    expect(searchUrl("Anzu")).toBe("/Anzu");
    expect(searchUrl("Script/Through-a-Song,-Darkly/2025-10-20")).toBe(
      "/Script/Through-a-Song,-Darkly/2025-10-20",
    );
  });

  it("scopes the body with data-pagefind-body and an h1 title", () => {
    const doc = searchDoc("Anzu", "<p>body</p>");
    expect(doc).toContain("<article data-pagefind-body>");
    expect(doc).toContain("<h1>Anzu</h1>");
    expect(doc).toContain("<p>body</p>");
    expect(doc).toContain("<title>Anzu</title>");
  });

  it("escapes the title (not the trusted body html)", () => {
    expect(escapeHtml('A & B "C" <d>')).toBe("A &amp; B &quot;C&quot; &lt;d&gt;");
    const doc = searchDoc("A & B", "<p>kept</p>");
    expect(doc).toContain("<h1>A &amp; B</h1>");
    expect(doc).toContain("<p>kept</p>");
  });
});
