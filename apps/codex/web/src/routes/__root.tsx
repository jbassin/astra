/// <reference types="vite/client" />
import { SiteDocument, siteHead } from "@astra/site-kit/document";
import { createRootRoute, Outlet } from "@tanstack/react-router";

import { HeaderNav } from "@/domain/nav/HeaderNav";
import { HeaderTitle } from "@/domain/nav/HeaderTitle";
import { Omnibar } from "@/domain/search/Omnibar";
import { GlyphDefs } from "@/ui";

// D29-46 — codex's own self-hosted parchment-system fonts (mirrors the prior
// `@fontsource/ibm-plex-mono` two-file-per-weight pattern verbatim, now 4
// families / 8 weight files instead of 1 family / 2 files). Alegreya SC (the
// style doc's caption face) is deliberately NOT here — deferred, no
// art-plate/illustration component consumes it yet (D29-46).
import "@fontsource/cinzel/700.css";
import "@fontsource/cormorant-sc/600.css";
import "@fontsource/eb-garamond/400.css";
import "@fontsource/eb-garamond/400-italic.css";
import "@fontsource/eb-garamond/600.css";
import "@fontsource/eb-garamond/700.css";
import "@fontsource/oswald/500.css";
import "@fontsource/oswald/700.css";
import "@/styles/globals.css";

// D29-30: `<meta name="robots" content="noindex">` from day one, in every page's
// SSR HTML (C-1 defense-in-depth — the Caddy `X-Robots-Tag` + robots.txt land at
// P5). This is the ROOT head, so it's present unconditionally regardless of which
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
      {/* SVG `<symbol>`/`<use>` dedupe (P8 follow-up) — the 5 distinct
        action/edition glyph shapes, mounted ONCE here so every
        `ActionGlyph`/`EditionIcon` instance on the page can `<use
        href="#...">` against it instead of re-emitting its own path
        data. Must precede any `<use>` that references it (progressive
        HTML streaming) — first thing in `<body>`, before the header. */}
      <GlyphDefs />
      <header className="site-head">
        {/* D29-112 (P11 S4) — the wordmark is now conditional: listing/
          entity/rules routes show the RESOLVED page title (+ a home
          glyph carrying the same `Link to="/"` the wordmark always
          did) instead; landing/`/search`/`/categories`/`/sources` keep
          the plain wordmark, unchanged. SSR-clean (`useMatches`-driven,
          no effect) — see `HeaderTitle.tsx`. */}
        <HeaderTitle />
        {/* P4.5 S2 (D29-47), curated P11 S4 (D29-110) — the global
          category nav (5 dropdowns + the bare Rules/Sources/All
          categories links), replacing the old brand+tagline header.
          Spans the curated 28-category set; `navData.ts` owns the
          grouping. */}
        <HeaderNav />
        {/* D29-36 — the header search omnibar, present on every page. */}
        <Omnibar />
      </header>
      <Outlet />
      {/* R6 (D29-66) — the global footer is deleted outright, no
        replacement (stakeholder-accepted zero-global-disclaimer risk). */}
    </SiteDocument>
  );
}
