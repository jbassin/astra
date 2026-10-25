/// <reference types="vite/client" />
import { SiteDocument, siteHead } from "@astra/site-kit/document";
import { createRootRoute, Outlet } from "@tanstack/react-router";

import { HeaderNav } from "@/domain/nav/HeaderNav";
import { HeaderTitle } from "@/domain/nav/HeaderTitle";
import { Omnibar } from "@/domain/search/Omnibar";
import { GlyphDefs } from "@/ui";

// Codex's own self-hosted parchment-system fonts (the `@fontsource`
// one-file-per-weight pattern: 4 families / 8 weight files). Alegreya SC (the
// style doc's caption face) is deliberately NOT here — no
// art-plate/illustration component consumes it yet.
import "@fontsource/cinzel/700.css";
import "@fontsource/cormorant-sc/600.css";
import "@fontsource/eb-garamond/400.css";
import "@fontsource/eb-garamond/400-italic.css";
import "@fontsource/eb-garamond/600.css";
import "@fontsource/eb-garamond/700.css";
import "@fontsource/oswald/500.css";
import "@fontsource/oswald/700.css";
import "@/styles/globals.css";

// `<meta name="robots" content="noindex">` in every page's SSR HTML
// (defense-in-depth alongside the Caddy `X-Robots-Tag` + robots.txt). This is
// the ROOT head, so it's present unconditionally regardless of which
// route matched.
export const Route = createRootRoute({
  head: () =>
    siteHead({
      title: "codex — a Pathfinder 2e reference",
      description: "A Pathfinder Second Edition rules & compendium reference.",
      meta: [{ name: "robots", content: "noindex" }],
    }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <SiteDocument rum={() => import("@/observe/rumConfig")}>
      {/* SVG `<symbol>`/`<use>` dedupe — the edition glyph shapes, mounted
        ONCE here so every `EditionIcon` instance on the page can `<use
        href="#...">` against it instead of re-emitting its own path
        data. Must precede any `<use>` that references it (progressive
        HTML streaming) — first thing in `<body>`, before the header. */}
      <GlyphDefs />
      <header className="site-head">
        {/* The wordmark is conditional: listing/
          entity/rules routes show the RESOLVED page title (+ a home
          glyph carrying the same `Link to="/"` the wordmark always
          did) instead; landing/`/search`/`/categories`/`/sources` keep
          the plain wordmark. SSR-clean (`useMatches`-driven,
          no effect) — see `HeaderTitle.tsx`. */}
        <HeaderTitle />
        {/* The global category nav (5 dropdowns + the bare
          Rules/Sources/All categories links). Spans the curated
          28-category set; `navData.ts` owns the grouping. */}
        <HeaderNav />
        {/* The header search omnibar, present on every page. */}
        <Omnibar />
      </header>
      <Outlet />
      {/* No global footer (an accepted zero-global-disclaimer risk). */}
    </SiteDocument>
  );
}
