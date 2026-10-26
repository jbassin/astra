/// <reference types="vite/client" />
import { mouthpieceInterference, ShaderBackground } from "@astra/backdrop";
import { SiteDocument, siteHead } from "@astra/site-kit/document";
import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import "@astra/site-kit/theme";

import "@/styles/globals.css";

export const Route = createRootRoute({
  head: () =>
    siteHead({
      title: "Mouthpiece — the Færrin podcast",
      description: "The Færrin roundtable podcast",
    }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <SiteDocument rum={() => import("@/observe/rumConfig")}>
      <ShaderBackground spec={mouthpieceInterference} />
      <header className="site-head">
        <Link to="/" className="site-brand">
          Mouthpiece
        </Link>
        <span className="site-tagline">the Færrin roundtable</span>
      </header>
      <Outlet />
      <footer className="site-foot">
        <span>Mouthpiece — built from transcripts</span>
      </footer>
    </SiteDocument>
  );
}
