import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

/**
 * SSR render smoke + D29-29 tier 3 route tests, in ONE file sharing ONE
 * `beforeAll` build. (Deliberately not split across two test files: vitest runs
 * files in parallel by default, and two independent "build dist/ if absent"
 * `beforeAll`s racing the SAME `vite build` output directory produced a real,
 * observed corruption — a `dist/server/server.js` that 500'd on cases the exact
 * same build passes cleanly when built serially. One shared build for the
 * whole file sidesteps that class of bug entirely.)
 *
 * We chose a build + `ssr.fetch(...)` assertion over a full Playwright lane: it
 * runs in the existing `test` lane with no new CI infra. Build prerequisite:
 * needs `dist/server/server.js`, so `beforeAll` builds once if it's absent
 * (CI's test job starts without a build) — this ALSO always exercises the
 * fixture-fallback corpus root in CI (D29-23: zero `data/` by construction), the
 * same root every route test below runs against.
 */
const APP_ROOT = path.resolve(import.meta.dirname, "..");
const SERVER_BUNDLE = path.join(APP_ROOT, "dist/server/server.js");
const RUNNER = path.join(APP_ROOT, "scripts/ssrSmoke.ts");
// 0022 S11 — off bun: `pnpm run build` for the workspace script, `node --import
// nodeTsResolve.mjs` for the raw-TS runner subprocess (same hook every server.ts
// entry uses).
const NODE_TS_RESOLVE_HOOK = path.join(APP_ROOT, "../../libs/ts/site-kit/src/nodeTsResolve.mjs");

let ssr: { fetch: (req: Request) => Promise<Response> };

beforeAll(async () => {
  if (!existsSync(SERVER_BUNDLE)) {
    execFileSync("pnpm", ["run", "build"], { cwd: APP_ROOT, stdio: "inherit" });
  }
  const mod = (await import(SERVER_BUNDLE)) as {
    default: { fetch: (req: Request) => Promise<Response> };
  };
  ssr = mod.default;
}, 180_000);

describe("SSR smoke", () => {
  it("SSRs an entity page (spell/heal, off the fixture-fallback corpus in CI)", () => {
    const out = execFileSync("node", ["--import", NODE_TS_RESOLVE_HOOK, RUNNER], {
      cwd: APP_ROOT,
      encoding: "utf8",
    });
    expect(out).toContain("status=200");
    expect(out).toContain("marker=true");
    expect(out).toContain("noindex=true");
    expect(out).toContain("noRenderError=true");
  });
});

async function get(pathAndQuery: string): Promise<{ status: number; html: string }> {
  const res = await ssr.fetch(new Request(`http://localhost${pathAndQuery}`));
  return { status: res.status, html: await res.text() };
}

/**
 * D29-29 tier 3 — route tests over the fixture corpus, run as real HTTP-shaped
 * requests against the same built SSR server the smoke above uses.
 * `resolveEntityPageData`'s own unit tests (`corpusFns.test.ts`) already cover
 * the loader's data-shaping in isolation; this proves the actual route wiring —
 * `notFound()`, the `$category/$slug` param decode, and the head/meta noindex
 * tag — end to end.
 */
describe("$category/$slug route (D29-22/-23/-25/-29 tier 3)", () => {
  it("renders a plain entity", async () => {
    const { status, html } = await get("/spell/heal");
    expect(status).toBe(200);
    expect(html).toContain("Heal");
    expect(html).not.toContain("data-render-error");
  });

  it("renders the @legacy pair member, `@` unencoded on the wire", async () => {
    const { status, html } = await get("/spell/heal@legacy");
    expect(status).toBe(200);
    expect(html).toContain("Heal");
    // the edition banner links to the remaster member(s) by id
    expect(html).toContain("spell/heal");
  });

  it("renders the same @legacy pair member via a percent-encoded request path", async () => {
    // Proves the decode direction independently of which literal bytes a client
    // happens to send — some HTTP clients percent-encode `@` even though it's a
    // legal raw pchar.
    const { status, html } = await get("/spell/heal%40legacy");
    expect(status).toBe(200);
    expect(html).toContain("Heal");
  });

  it("renders a real non-ASCII slug", async () => {
    const { status, html } = await get("/creature/ixam%C3%A8");
    expect(status).toBe(200);
    expect(html).toContain("Ixam");
  });

  it("resolves the D29-21 rescued index-slug entities", async () => {
    const ancestry = await get("/ancestry/index");
    expect(ancestry.status).toBe(200);
    const archetype = await get("/archetype/index");
    expect(archetype.status).toBe(200);
  });

  it("noindex meta is present on every entity page's SSR HTML", async () => {
    const { html } = await get("/spell/heal");
    expect(html).toContain('name="robots"');
    expect(html).toContain('content="noindex"');
  });

  it("404s for an unknown category", async () => {
    const { status } = await get("/not-a-real-category/heal");
    expect(status).toBe(404);
  });

  it("404s for an unknown slug in a real category", async () => {
    const { status } = await get("/spell/not-a-real-spell");
    expect(status).toBe(404);
  });

  it("a literal `../`-style traversal attempt never reaches the loader as `..` at all", async () => {
    // `%2e%2e` in a path segment is normalized away by the URL parser itself
    // (RFC 3986 dot-segment removal) BEFORE the request ever reaches our router —
    // `/spell/%2e%2e` collapses to `/`, which harmlessly 200s the index
    // placeholder (proven here so a future refactor can't silently regress that
    // into a 500/leak). The literal `slug === ".."` guard branch itself — for a
    // caller that bypasses normal URL semantics — is exhaustively unit-tested in
    // `corpusFs.test.ts`/`corpusFns.test.ts` against the fixture corpus directly.
    const { status, html } = await get("/spell/%2e%2e");
    expect(status).toBe(200);
    expect(html).not.toContain("data-render-error");
  });

  it("404s (not 500) for a leading-underscore slug", async () => {
    const { status } = await get("/spell/_index");
    expect(status).toBe(404);
  });
});

/**
 * D29-37 — the faceted `/{category}` browse route, over the same
 * fixture-fallback corpus. Small, hand-countable fixture rows (spell: 4 rows,
 * 2 superseded; feat: 1 row) let every fixture entity be checked by NAME/
 * PRESENCE rather than a total-row count — this environment happens to have
 * a real corpus checked out too (`data/corpus/`, `corpusFs.ts`'s own
 * "real root when present" precedence), and the fixture rows are themselves
 * a verbatim sample OF that real corpus (`feat/camouflage-coat`,
 * `creature/grick`, `spell/magic-missile`, ... all cross-checked identical
 * in both), so a presence/absence assertion holds true whichever root is
 * actually being served — CI (fixture-only) and this environment (real
 * corpus, real data present) alike. The REAL-corpus spot-set proper (feat
 * actionCost=reaction, creature family+level+humanized size, equipment
 * per-10 price, spell tradition+rank, hazard-reuses-creature-panel, a
 * facet-less long-tail category, real click-to-settled-DOM latency) is
 * proven separately against the live 46,192-entity corpus via a headless
 * browser (see the P3 S3 session report) — this suite is CI's hermetic,
 * deterministic, corpus-size-agnostic gate.
 */
/** Whether `id` was actually SSR-RENDERED as a visible listing row (its
 * `<a href="/{id}" class="codex-listing-name">` anchor is present) —
 * distinct from a plain `html.includes(name)`, which is nearly VACUOUS for
 * a browse page: the loader ships the FULL row set (D29-35), so TanStack
 * Start's `window.$_TSR` dehydration payload embeds EVERY row's name
 * regardless of which rows a facet filter actually narrowed to (verified —
 * `Camouflage Coat` appears in `/feat?f.actionCost=reaction`'s raw HTML via
 * the dehydrated JSON blob alone, `id:"feat/camouflage-coat"`, even though
 * it's genuinely filtered OUT of the rendered `<ul>`). The href-anchor
 * pattern only exists for a row React actually rendered. */
function rendersRow(html: string, id: string): boolean {
  return html.includes(`href="/${id}"`);
}

describe("$category/ browse route (D29-35 tier 3)", () => {
  it("renders the FULL enriched row set (facets/traits survive the loader — the dead P2 trim)", async () => {
    const { status, html } = await get("/feat");
    expect(status).toBe(200);
    expect(rendersRow(html, "feat/camouflage-coat")).toBe(true);
    // the facet panel renders itemCategory's option, derived from `facets`
    // (`itemCategory` has no facetDefs labelMap — its raw lowercase value
    // renders as-is, unlike `size`/`actionCost`).
    expect(html).toContain("codex-facet-panel");
    expect(html).toContain('class="codex-facet-option-label">ancestry<');
  });

  it("a derived enum facet filter narrows correctly", async () => {
    const { html } = await get("/feat?f.actionCost=passive");
    expect(rendersRow(html, "feat/camouflage-coat")).toBe(true);
    const { html: htmlNoMatch } = await get("/feat?f.actionCost=reaction");
    expect(rendersRow(htmlNoMatch, "feat/camouflage-coat")).toBe(false);
  });

  it("legacy=1 behavior: superseded rows hidden by default, shown under the toggle", async () => {
    const off = await get("/spell");
    expect(off.status).toBe(200);
    // Magic Missile is superseded (a classic legacy-only spell in both the
    // fixture and the real corpus) -> absent from the default RENDERED view
    // (still present in the dehydration blob, hence the href-anchor check).
    expect(rendersRow(off.html, "spell/magic-missile")).toBe(false);

    // legacy=1 canonicalizes (307) to legacy=true — the D29-35 URL round trip.
    const rawRes = await get("/spell?legacy=1");
    // `get()` doesn't auto-follow redirects — assert the redirect status,
    // then the canonical target explicitly.
    expect([200, 307]).toContain(rawRes.status);
    const on = await get("/spell?legacy=true");
    expect(on.status).toBe(200);
    expect(rendersRow(on.html, "spell/magic-missile")).toBe(true);
  });

  it("a comma-bearing enum value round-trips through the URL codec (the real-corpus family/book bug's fixture-corpus regression guard)", async () => {
    // Backslash-escaped comma, as `filterStateToSearch` itself would encode
    // it — see `urlState.ts`'s own comment on why a bare `,` is ambiguous
    // with the csv-list separator.
    const { status, html } = await get(
      `/creature?${new URLSearchParams({ "f.family": "Dragon\\, Adamantine" }).toString()}`,
    );
    expect(status).toBe(200);
    expect(rendersRow(html, "creature/adamantine-dragon-adult")).toBe(true);
  });

  it("trait tri-state include+exclude simultaneously", async () => {
    // "Ixamè" is dragon-tagged WITHOUT primal; "Adamantine Dragon (Adult)"
    // is dragon-tagged WITH primal — traits=dragon,-primal must render the
    // former and exclude the latter, regardless of what else the active
    // corpus root also happens to tag "dragon".
    const { status, html } = await get("/creature?traits=dragon,-primal");
    expect(status).toBe(200);
    expect(rendersRow(html, "creature/ixamè")).toBe(true);
    expect(rendersRow(html, "creature/adamantine-dragon-adult")).toBe(false);
  });

  it("collision disambiguation: two visible rows sharing a name get source.book appended", async () => {
    // Fixture (and real-corpus) "Grick" / "Grick-2" are both
    // superseded:false and both named "Grick" — a real collision under the
    // default (legacy-off) view.
    const { status, html } = await get(
      `/creature?${new URLSearchParams({ q: "Grick" }).toString()}`,
    );
    expect(status).toBe(200);
    expect(rendersRow(html, "creature/grick")).toBe(true);
    expect(rendersRow(html, "creature/grick-2")).toBe(true);
    expect(html).toContain("Crown of the Kobold King");
    expect(html).toContain("Pathfinder #157");
  });

  it("sort=level places the '—' (no-level) bucket last and hides letter anchors", async () => {
    const { status, html } = await get("/creature?sort=level&legacy=true");
    expect(status).toBe(200);
    expect(html).not.toContain("Jump to letter");
  });

  it("404s for an unknown category exactly as the entity route does", async () => {
    const { status } = await get("/not-a-real-category");
    expect(status).toBe(404);
  });

  it("noindex meta is present on the browse route's SSR HTML too", async () => {
    const { html } = await get("/feat");
    expect(html).toContain('name="robots"');
    expect(html).toContain('content="noindex"');
  });
});

/**
 * P4 S2 (D29-40) — the `/rules` tree browser, over the fixture corpus's own
 * `rules-tree.json` (S1's D29-44 composition: the CRLF-healed GMG
 * "Chapter 2: Tools" root, the Counteracting path-shift pair, a
 * breadcrumb-less synthetic root). A static route smoke, same posture as
 * the `$category/` suite above — the FULL real-corpus interaction gates
 * (INTERIOR-level ordering, click-to-expand, latency) are proven separately
 * against the live 46,192-entity corpus (see the session report); this
 * proves the route itself: static-route precedence over `$category`, the
 * loader wiring, and root-level SSR content (roots always render — only
 * their CHILDREN default-collapse, so a deep node's link isn't asserted
 * here without a real click).
 */
describe("/rules tree browser (D29-40 tier 3)", () => {
  it("200s and out-ranks the $category/ route for the literal 'rules' category", async () => {
    const { status, html } = await get("/rules");
    expect(status).toBe(200);
    // the tree browser's own shell, not `codex-listing-controls`' sort/filter
    // bar ($category/'s own markup) — proves the STATIC route matched, not
    // $category with category="rules".
    expect(html).toContain("codex-rules-tree");
  });

  it("every fixture book name renders", async () => {
    const { html } = await get("/rules");
    for (const book of ["Player Core", "Core Rulebook", "Gamemastery Guide", "Treasure Vault"]) {
      expect(html).toContain(book);
    }
  });

  it("a root doc with an id renders as a link (the CRLF-healed GMG 'Chapter 2: Tools' root)", async () => {
    const { html } = await get("/rules");
    expect(html).toContain('href="/rules/chapter-2-tools"');
  });

  // The next two assertions are written to hold whether this process
  // resolved the FIXTURE corpus (CI, a fresh clone — D29-23) or a REAL
  // corpus checked out at `apps/codex/data` (this dev environment,
  // `corpusFs.test.ts`'s own "either root is a valid outcome" precedent):
  // the FIXTURE's own synthetic/all-hidden shapes differ in specifics from
  // the real corpus's (fixture: Player Core's breadcrumb-less "Chapter 1:
  // Introduction"/Core Rulebook's 1-doc all-superseded chain; real corpus:
  // Player Core 2's "Chapter 3: Classes"/Dark Archive 29-29 + Guns & Gears
  // 65-65) — so these assert the STRUCTURAL pattern (a synthetic node's CSS
  // class; the "all N hidden" wording for SOME N), not a specific book/name,
  // matching the `$category/` suite's own cross-environment discipline.
  it("a synthetic (no-id) node renders as plain text, never a link (structural — corpus-agnostic)", async () => {
    const { html } = await get("/rules");
    expect(html).toContain("codex-rules-node-synthetic");
  });

  it("legacy off (default): at least one fully-superseded book renders as an 'all N hidden' collapsed header, never silently dropped", async () => {
    const { html } = await get("/rules");
    expect(html).toMatch(/all \d+ hidden/);
  });

  it("legacy=1 (canonicalized to legacy=true) reveals the Core Rulebook section as a normal (non-collapsed) tree, no hidden notes at all", async () => {
    const on = await get("/rules?legacy=true");
    expect(on.status).toBe(200);
    expect(on.html).toContain("Chapter 9: Playing the Game");
    expect(on.html).not.toMatch(/all \d+ hidden/);
    expect(on.html).not.toContain("codex-rules-hidden-note");
  });

  it("noindex meta is present on the tree browser's SSR HTML too", async () => {
    const { html } = await get("/rules");
    expect(html).toContain('name="robots"');
    expect(html).toContain('content="noindex"');
  });

  it("/rules/{slug} still falls through to the $category/$slug route (static /rules doesn't shadow it)", async () => {
    const { status, html } = await get("/rules/tools-of-play");
    expect(status).toBe(200);
    expect(html).toContain("Tools of Play");
    expect(html).not.toContain("codex-rules-tree");
  });
});
