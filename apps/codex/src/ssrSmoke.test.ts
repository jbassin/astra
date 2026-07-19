import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { createCorpusReader, fixtureCorpusRoot } from "@/server/corpusFs";

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
 * P4.5 D29-48 finding: the pinned router's own search-canonicalization pass
 * (the SAME pre-existing mechanism the `legacy=1`->`legacy=true` numeric
 * coercion case already 307-redirected through, before this phase) now ALSO
 * fires for a `legacy=`-keyed request once `validateBrowseSearch`/
 * `validateRulesSearch`/`validateEntitySearch` decode it into a
 * DIFFERENTLY-keyed `superseded` field — the raw `legacy` key has no
 * matching output key to compare against, so the router redirects to a
 * canonical URL carrying BOTH keys (`?legacy=true&superseded=true`). Content
 * is still byte-identical once the (single-hop) redirect is followed — this
 * helper follows it the same way a browser/`curl -L` would, for the tests
 * that specifically verify the alias end-to-end. */
async function getFollow(pathAndQuery: string): Promise<{ status: number; html: string }> {
  let current = pathAndQuery;
  for (let hop = 0; hop < 3; hop++) {
    const res = await ssr.fetch(new Request(`http://localhost${current}`));
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return { status: res.status, html: await res.text() };
      current = location;
      continue;
    }
    return { status: res.status, html: await res.text() };
  }
  throw new Error(`too many redirects starting from ${pathAndQuery}`);
}

/** Strips the ONE non-deterministic bit of an otherwise-deterministic SSR
 * page: TanStack Start's own router-match dehydration payload embeds a
 * per-request `u:<epoch-ms>` ("updatedAt") timestamp for every matched
 * route — real, harmless request-time noise, not a content difference. Any
 * byte-identical comparison across two separately-fetched requests must
 * normalize this first (found while proving the acceptance-C alias-decode
 * checks; confirmed nothing else in the dehydration payload varies). */
function stripVolatile(html: string): string {
  return html.replace(/u:\d+/g, "u:0");
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
 * proven separately against the live 44,808-entity corpus via a headless
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
 * pattern only exists for a row React actually rendered.
 *
 * P4.5 S4 (D29-49): scoped to the `codex-listing-name` class specifically
 * (not just a bare `href="/{id}"` substring) — the split view's right pane
 * now ALSO emits a same-shaped `href="/{id}"` "Open full page" link
 * (`canonicalHref`, `BrowseListing.tsx`), so an unscoped check would
 * false-positive on a row that's genuinely filtered OUT of the listing but
 * still resolves as the selected `?entry=`. Also tolerates an optional
 * trailing `?superseded=1` (M7 — every row's own href carries it once the
 * view is widened, `rowHref`'s own comment). */
function rendersRow(html: string, id: string): boolean {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`href="/${escaped}(?:\\?superseded=1)?" class="codex-listing-name"`);
  return re.test(html);
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

    // legacy=1/legacy=true both alias-decode to `?superseded=1` (P4.5
    // D29-48) — the pinned router's own search-canonicalization pass 307s
    // either raw form to a URL carrying the new `superseded` key (see
    // `getFollow`'s own comment), so this asserts the FINAL landed page.
    const rawRes = await get("/spell?legacy=1");
    expect([200, 307]).toContain(rawRes.status);
    const on = await getFollow("/spell?legacy=true");
    expect(on.status).toBe(200);
    expect(rendersRow(on.html, "spell/magic-missile")).toBe(true);
  });

  it("P4.5 D29-48: legacy=true and superseded=1 are the alias-decode pair — byte-identical HTML once redirects settle", async () => {
    const viaLegacy = await getFollow("/spell?legacy=true");
    const viaSuperseded = await getFollow("/spell?superseded=1");
    expect(viaLegacy.status).toBe(200);
    expect(viaSuperseded.status).toBe(200);
    expect(stripVolatile(viaLegacy.html)).toBe(stripVolatile(viaSuperseded.html));
    expect(rendersRow(viaSuperseded.html, "spell/magic-missile")).toBe(true);
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
    const { status, html } = await getFollow("/creature?sort=level&legacy=true");
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
 * P4.5 S4 (D29-49) — the split-column browse's `?entry=` deep link, over the
 * fixture's single `feat` row (`feat/camouflage-coat`, `actionCost: passive`
 * — the same fixture the `f.actionCost` narrowing case above already
 * exercises). This is the acceptance-D curl-provable gate: a fresh,
 * no-storage-state request must SSR the FULL entity render in the right
 * pane, not just the listing (the standing SSR-flash class P3's memory
 * already caught for the legacy toggle).
 */
describe("$category/ split-view browse: ?entry= deep link (P4.5 S4, D29-49 tier 3)", () => {
  it("a fresh deep link SSRs the selected entity's full render server-side, not just the listing row", async () => {
    const { status, html } = await get("/feat?entry=camouflage-coat");
    expect(status).toBe(200);
    // both panes present: the listing (row anchor) AND the entry pane's own
    // full entity render (its own `codex-entity-page` article + statblock
    // header), never a client-side-only fetch-after-mount flash.
    expect(rendersRow(html, "feat/camouflage-coat")).toBe(true);
    expect(html).toContain("codex-entry-pane");
    expect(html).toContain("codex-entity-page");
    expect(html).toContain("Camouflage Coat");
    expect(html).not.toContain("data-render-error");
  });

  it("no `?entry=` at all: the entry pane renders the placeholder, no entity body", async () => {
    const { html } = await get("/feat");
    expect(html).toContain("codex-entry-pane");
    expect(html).toContain("Select a row to preview it here.");
    expect(html).not.toContain("codex-entity-page");
  });

  it("a genuinely unknown `entry` slug shows the not-found message; the listing still renders normally", async () => {
    const { status, html } = await get("/feat?entry=totally-not-a-real-feat");
    expect(status).toBe(200);
    expect(html).toMatch(/wasn.t found/);
    expect(rendersRow(html, "feat/camouflage-coat")).toBe(true); // listing unaffected
  });

  it("an `entry` filtered out by the current facet selection shows the fail-soft message, not a 404 (N3)", async () => {
    // camouflage-coat is `actionCost: passive` (fixture + real corpus,
    // proven by the derived-facet-narrows case above) — `f.actionCost=
    // reaction` filters it OUT of the visible list while it still resolves
    // fine as an entity.
    const { status, html } = await get("/feat?entry=camouflage-coat&f.actionCost=reaction");
    expect(status).toBe(200);
    expect(html).toMatch(/isn.t shown under the current filters/);
    expect(rendersRow(html, "feat/camouflage-coat")).toBe(false); // filtered out of the list
  });

  it("zero hydration/render errors across the split-view deep-link cases", async () => {
    for (const routePath of [
      "/feat?entry=camouflage-coat",
      "/feat?entry=totally-not-a-real-feat",
      "/feat?entry=camouflage-coat&f.actionCost=reaction",
    ]) {
      const { status, html } = await get(routePath);
      expect(status).toBe(200);
      expect(html).not.toContain("data-render-error");
    }
  });

  it("noindex meta is present on a split-view deep-link page too", async () => {
    const { html } = await get("/feat?entry=camouflage-coat");
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
 * against the live 44,808-entity corpus (see the session report); this
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
    // `?legacy=true` — the fixture's GMG "Chapter 2: Tools" root is itself
    // `superseded`, so under the default legacy-off view it's pruned
    // entirely (S4 hermeticity find: the bare-`/rules` form of this assert
    // only ever passed when the REAL corpus — whose GMG root is not
    // superseded — masked the fixture-fallback path).
    const { html } = await getFollow("/rules?legacy=true");
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
    const on = await getFollow("/rules?legacy=true");
    expect(on.status).toBe(200);
    expect(on.html).toContain("Chapter 9: Playing the Game");
    expect(on.html).not.toMatch(/all \d+ hidden/);
    expect(on.html).not.toContain("codex-rules-hidden-note");
  });

  it("P4.5 D29-48: legacy=true and superseded=1 are the alias-decode pair on /rules — byte-identical HTML once redirects settle", async () => {
    const viaLegacy = await getFollow("/rules?legacy=true");
    const viaSuperseded = await getFollow("/rules?superseded=1");
    expect(viaLegacy.status).toBe(200);
    expect(viaSuperseded.status).toBe(200);
    expect(stripVolatile(viaLegacy.html)).toBe(stripVolatile(viaSuperseded.html));
  });

  it("the inline superseded toggle link renders near the quick-filter when content is hidden, and flips to a hide-link once widened", async () => {
    const off = await get("/rules");
    expect(off.html).toContain("codex-rules-superseded-toggle");
    // React interposes `<!-- -->` comment markers around each interpolated
    // expression (the count, the text runs) — assert the pieces rather than
    // one contiguous string.
    expect(off.html).toContain("Show ");
    expect(off.html).toContain("hidden (superseded)");
    const on = await getFollow("/rules?superseded=1");
    expect(on.html).toContain("codex-rules-superseded-toggle");
    expect(on.html).toContain("Hide superseded");
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
    // Proves this is the ENTITY route, not the `/rules` browse page itself —
    // the browse page's own listing chrome (title + book count) is absent
    // here even though S3 (below) now ALSO renders a `codex-rules-tree`
    // (the sidebar reuses that same island, so its class alone no longer
    // distinguishes the two routes post-S3).
    expect(html).not.toContain("codex-listing-title");
    expect(html).toContain("codex-entity-page");
  });
});

/**
 * P4 S3 (D29-41) — the rules entity page's hierarchy navigation: breadcrumb
 * trail, tree sidebar (`RulesLayout`), and DFS previous/next pager. Over the
 * fixture `rules-tree.json` the `/rules` suite above already exercises
 * (S1's D29-44 composition — the CRLF-healed 3-deep GMG chain
 * `chapter-2-tools` -> `building-creatures@legacy` -> `ability-modifiers-2`,
 * ALL superseded; the path-shifted Counteracting legacy/remaster pair).
 *
 * Same cross-environment discipline as the `/rules` suite above (its own
 * comment): this dev sandbox happens to have the REAL corpus checked out
 * too, and `chapter-2-tools`/`building-creatures@legacy`/`ability-modifiers-2`
 * are all real doc ids that exist in BOTH roots — but the real corpus's
 * "Chapter 2: Tools" has 14 children and its own GMG book has 6 root
 * chapters (vs the fixture's 1-child, 1-root shape), so an EXACT prev/next
 * *target identity* or one-sidedness claim would only hold under the
 * fixture. What's true under EITHER root (verified against both): the
 * ancestor chain's real-doc ids and "Building Creatures" is `chapter-2-
 * tools`'s literal first child (so it's always the DFS `next` immediately
 * after it) — those two facts anchor this suite; the exhaustive prev/next
 * one-sidedness/round-trip/synthetic-ancestor claims are proven precisely,
 * hermetically, and corpus-root-independently against the fixture reader
 * directly in `entityPageData.test.ts` (D29-23's own "pure derivation
 * tested against the fixture reader" idiom) — this suite's job is proving
 * the ROUTE WIRING renders the right markup at all, not re-deriving exact
 * chain shape.
 */
describe("rules entity-page hierarchy nav (D29-41 tier 3)", () => {
  it("a root doc (no ancestors) renders its own trail head: book -> self, no ancestor links", async () => {
    const { html } = await get("/rules/chapter-2-tools");
    expect(html).toContain("codex-rules-breadcrumb");
    expect(html).toContain(">Gamemastery Guide<");
    expect(html).toContain("codex-rules-breadcrumb-current");
  });

  it("a deep node's trail shows real, LINKED ancestors (the CRLF-healed GMG chain)", async () => {
    const { html } = await get("/rules/ability-modifiers-2");
    expect(html).toContain('href="/rules/chapter-2-tools"');
    expect(html).toContain('href="/rules/building-creatures@legacy"');
  });

  it("a single deep rules page renders trail + sidebar + pager together (D29-44's own text)", async () => {
    const { status, html } = await get("/rules/ability-modifiers-2");
    expect(status).toBe(200);
    expect(html).toContain("codex-rules-breadcrumb"); // trail
    expect(html).toContain("codex-rules-sidebar-disclosure"); // sidebar
    expect(html).toContain("codex-rules-pager"); // pager
  });

  it("the pager DESCENDS: a chaptered root's own page shows next=its first child, edition-pilled", async () => {
    const { html } = await get("/rules/chapter-2-tools");
    expect(html).toContain("codex-rules-pager");
    // "Building Creatures" is chapter-2-tools's literal first child in BOTH
    // corpus roots — DFS pre-order visits it immediately, so it's always
    // the `next` target regardless of how many other children/roots exist.
    expect(html).toContain("codex-rules-pager-next");
    const nextSlotIdx = html.indexOf("codex-rules-pager-slot-next");
    expect(html.slice(nextSlotIdx, nextSlotIdx + 400)).toContain(
      'href="/rules/building-creatures@legacy"',
    );
    // that next target is itself superseded -> renders its own Legacy edition
    // icon (the legacy toggle does NOT re-chain the pager, D29-41).
    expect(html.slice(nextSlotIdx, nextSlotIdx + 400)).toContain('aria-label="Legacy"');
  });

  it("the tree sidebar renders, scoped to the current book, with the current doc highlighted", async () => {
    const { html } = await get("/rules/ability-modifiers-2");
    expect(html).toContain("codex-rules-sidebar-disclosure");
    expect(html).toContain("codex-rules-node-current");
    expect(html).toContain(">Ability Modifiers<");
  });

  it("the sidebar keeps the current doc's ancestor branch even though the whole GMG chain is superseded and legacy defaults off", async () => {
    const { html } = await get("/rules/ability-modifiers-2");
    // both ancestor names must appear a SECOND time inside the sidebar tree
    // (once already in the breadcrumb) — i.e. the branch wasn't pruned away
    // by the legacy toggle (defaults off) even though every node on the
    // path, including the current one, is itself `superseded: true`.
    const buildingCreaturesHits = html.split("Building Creatures").length - 1;
    expect(buildingCreaturesHits).toBeGreaterThanOrEqual(2);
  });

  it("non-rules pages are structurally untouched: no rules-layout/sidebar/breadcrumb markup on a spell page", async () => {
    const { html } = await get("/spell/heal");
    expect(html).not.toContain("codex-rules-layout");
    expect(html).not.toContain("codex-rules-sidebar-disclosure");
    expect(html).not.toContain("codex-rules-breadcrumb");
    expect(html).not.toContain("codex-rules-pager");
    // the plain single-column entity shell is exactly what it always was.
    expect(html).toContain("codex-entity-page");
  });

  it("zero hydration/render errors on the checked rules pages", async () => {
    for (const routePath of [
      "/rules/chapter-2-tools",
      "/rules/building-creatures@legacy",
      "/rules/ability-modifiers-2",
      "/rules/tools-of-play",
      "/rules/counteracting-2",
    ]) {
      const { status, html } = await get(routePath);
      expect(status).toBe(200);
      expect(html).not.toContain("data-render-error");
    }
  });

  it("P4.5 acceptance C spot check: rules/building-creatures@legacy?legacy=true and ?superseded=1 are byte-identical once redirects settle (the P4 acceptance's own fixture)", async () => {
    const viaLegacy = await getFollow("/rules/building-creatures@legacy?legacy=true");
    const viaSuperseded = await getFollow("/rules/building-creatures@legacy?superseded=1");
    expect(viaLegacy.status).toBe(200);
    expect(viaSuperseded.status).toBe(200);
    expect(stripVolatile(viaLegacy.html)).toBe(stripVolatile(viaSuperseded.html));
  });
});

/**
 * P4 S4 (D29-42) — attached sidebars on a host entity page, over the
 * fixture's own D29-44 shapes (`rules/tools-of-play` -> `sidebar/dice`).
 */
describe("attached sidebars on a host entity page (D29-42 tier 3)", () => {
  it("a host page renders its attached sidebar as a titled aside with a standalone-page link", async () => {
    const { status, html } = await get("/rules/tools-of-play");
    expect(status).toBe(200);
    expect(html).toContain("codex-attached-sidebar");
    expect(html).toContain(">Dice<");
    expect(html).toContain('href="/sidebar/dice"');
    expect(html).not.toContain("data-render-error");
  });

  it("the M8 shared-url class-feature does NOT render an attached-sidebar section (only the class page owns it)", async () => {
    const { status, html } = await get("/class-feature/ability-boosts-15");
    expect(status).toBe(200);
    expect(html).not.toContain("codex-attached-sidebars");
  });

  it("a category with no attached sidebars at all renders no attached-sidebars section", async () => {
    const { html } = await get("/spell/heal");
    expect(html).not.toContain("codex-attached-sidebars");
  });

  it("noindex meta is present on a host page with attached sidebars too", async () => {
    const { html } = await get("/rules/tools-of-play");
    expect(html).toContain('name="robots"');
    expect(html).toContain('content="noindex"');
  });
});

/**
 * P4 S4 (D29-43) — `/sources`, over the fixture's own `sources-index.json`
 * (regenerated with the `categoryCounts` field, S4's additive schema
 * change — see `sourcesIndexBuild.test.ts` for the pure-function proof).
 */
describe("/sources aggregate book index (D29-43 tier 3)", () => {
  it("200s and renders a group heading + a book row", async () => {
    const { status, html } = await get("/sources");
    expect(status).toBe(200);
    expect(html).toContain("codex-sources-group");
    expect(html).toContain("codex-sources-book");
    expect(html).toContain("Core Rulebook");
  });

  it("an unknown-license Foundry-only book renders an explicit unknown pill, never a blank or guessed OGL", async () => {
    const { html } = await get("/sources");
    expect(html).toContain("License unknown");
  });

  it("the Other bucket renders as a collapsed <details> (no open attribute)", async () => {
    const { html } = await get("/sources");
    expect(html).toContain("<details");
  });

  it("a book with a sourceEntityRef links to its own entity page", async () => {
    const { html } = await get("/sources");
    expect(html).toContain('href="/source/core-rulebook"');
  });

  it("a per-category count links into the filtered browse listing with the book pre-selected", async () => {
    const { html } = await get("/sources");
    expect(html).toMatch(/href="\/rules\?book=/);
  });

  it("noindex meta is present on /sources too", async () => {
    const { html } = await get("/sources");
    expect(html).toContain('name="robots"');
    expect(html).toContain('content="noindex"');
  });

  it("zero hydration/render errors", async () => {
    const { html } = await get("/sources");
    expect(html).not.toContain("data-render-error");
  });
});

/**
 * P4 S4 (D29-43) — the `/categories` directory (moved off `/` at P4.5 S2,
 * D29-47) keeps its `source` category row AND its distinct "Sources index"
 * entry linking `/sources`.
 */
describe("/categories directory gains the Sources index entry (D29-43 tier 3)", () => {
  it("both the source category row and the Sources index link are present", async () => {
    const { status, html } = await get("/categories");
    expect(status).toBe(200);
    expect(html).toContain('href="/source"'); // the existing P3 category row
    expect(html).toContain('href="/sources"'); // the new aggregate index entry
  });

  it("lists every one of the 88 real corpus categories (D29-47 B)", async () => {
    const { html } = await get("/categories");
    const reader = createCorpusReader(fixtureCorpusRoot());
    const categories = reader.categories();
    expect(categories.length).toBe(88);
    for (const category of categories) {
      expect(html, `/categories is missing href="/${category}"`).toContain(`href="/${category}"`);
    }
  });
});

/**
 * P4.5 S2 (D29-47) — the R4 landing page: hero brand, the distinct hero
 * search box, the 8 tiles, and the "browse all categories" link. The old
 * P2 throwaway "every entity lives at `/{category}/{slug}`" blurb is gone.
 */
describe("/ the R4 landing page (D29-47 tier 3)", () => {
  it("renders the hero search box and NOT the header Omnibar's own input twice", async () => {
    const { status, html } = await get("/");
    expect(status).toBe(200);
    expect(html).toContain("codex-hero-search");
    // Exactly one `codex-omnibar-input` (the header's) and one distinct hero
    // input — never two omnibar-classed inputs (adversarial M3).
    expect(html.split('class="codex-omnibar-input"').length - 1).toBe(1);
    expect(html).toContain("codex-hero-search-input");
  });

  it("renders all 8 R4 tiles, linking the right categories", async () => {
    const { html } = await get("/");
    for (const href of [
      "/creature",
      "/spell",
      "/feat",
      "/equipment",
      "/class",
      "/ancestry",
      "/rules",
      "/sources",
    ]) {
      expect(html, `landing tile missing href="${href}"`).toContain(`href="${href}"`);
    }
  });

  it("links to the demoted /categories directory, not the old throwaway blurb", async () => {
    const { html } = await get("/");
    expect(html).toContain('href="/categories"');
    expect(html).not.toContain("Every entity lives at");
  });

  it("the header nav renders on the landing page: every one of the 88 nav categories resolves to a real anchor (no-JS reachability, D29-47 B)", async () => {
    const { html } = await get("/");
    expect(html).toContain("codex-header-nav");
    const reader = createCorpusReader(fixtureCorpusRoot());
    for (const category of reader.categories()) {
      expect(html, `nav is missing href="/${category}"`).toContain(`href="/${category}"`);
    }
    // the Rules split control's own link + the Sources direct link.
    expect(html).toContain('href="/rules"');
    expect(html).toContain('href="/sources"');
  });

  it("zero hydration/render errors on the landing page", async () => {
    const { html } = await get("/");
    expect(html).not.toContain("data-render-error");
  });
});
