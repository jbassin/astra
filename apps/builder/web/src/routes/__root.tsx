/// <reference types="vite/client" />
import { SiteDocument, siteHead } from "@astra/site-kit/document";
import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import "@astra/site-kit/theme";

// akasha's faces: Literata (reading text) and Archivo (interface text). tokens.css points
// gothic's font tokens at them.
import "@fontsource-variable/literata/opsz.css";
import "@fontsource-variable/archivo/wdth.css";
import "@/styles/globals.css";

export const Route = createRootRoute({
  head: () =>
    siteHead({
      title: "Character builder",
      description: "Build your first D&D character, one step at a time.",
      // Player and DM links are private; keep every page out of search engines.
      meta: [{ name: "robots", content: "noindex, nofollow" }],
    }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <SiteDocument rum={() => import("@/observe/rumConfig")}>
      <header className="site-head">
        <Link to="/" className="site-brand">
          Character builder
        </Link>
      </header>
      <Outlet />
    </SiteDocument>
  );
}
