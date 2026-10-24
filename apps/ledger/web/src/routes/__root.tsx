import { ledgerAurora, ShaderBackground } from "@astra/backdrop";
/// <reference types="vite/client" />
import { SiteDocument, siteHead } from "@astra/site-kit/document";
import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import "@astra/site-kit/theme";

import "@/styles/globals.css";

import { SITE } from "@/generated/site";

export const Route = createRootRoute({
  head: () => siteHead({ title: `${SITE.title} — Iridi`, description: SITE.description }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <SiteDocument rum={() => import("@/observe/rumConfig")} forceDarkTheme>
      <ShaderBackground spec={ledgerAurora} />
      <header className="site-head">
        <Link to="/" className="site-brand">
          ✦ {SITE.title}
        </Link>
        <span className="site-tagline">the campaign, indexed</span>
      </header>
      <Outlet />
      <footer className="site-foot">
        <span>{SITE.title} — one door to every site</span>
      </footer>
    </SiteDocument>
  );
}
