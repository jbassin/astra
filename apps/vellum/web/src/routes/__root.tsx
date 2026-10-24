/// <reference types="vite/client" />
import { SiteDocument, siteHead } from "@astra/site-kit/document";
import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import "@astra/site-kit/theme";

import "@/styles/globals.css";

export const Route = createRootRoute({
  head: () =>
    siteHead({
      title: "Vellum — the Færrin document forge",
      description: "Write PF2e vellum documents, preview them, export to PNG.",
    }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <SiteDocument rum={() => import("@/observe/rumConfig")} forceDarkTheme>
      <header className="site-head">
        <Link to="/" className="site-brand">
          Vellum
        </Link>
        <nav className="site-nav">
          <Link to="/editor">Editor</Link>
        </nav>
      </header>
      <Outlet />
    </SiteDocument>
  );
}
