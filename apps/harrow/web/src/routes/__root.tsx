import { ShaderBackground, starfield } from "@astra/backdrop";
import { SiteDocument, siteHead } from "@astra/site-kit/document";
import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import "@astra/site-kit/theme";

import "@/styles/globals.css";

import { SITE } from "@/generated/site";

export const Route = createRootRoute({
  head: () => siteHead({ title: `${SITE.title} — tarot`, description: SITE.description }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <SiteDocument rum={() => import("@/observe/rumConfig")}>
      <ShaderBackground spec={starfield} />
      <header className="site-head">
        <Link to="/" className="site-brand">
          ✦ {SITE.title}
        </Link>
        <nav className="site-nav">
          <Link
            to="/"
            className="nav-link"
            activeProps={{ className: "nav-link active" }}
            activeOptions={{ exact: true }}
          >
            Draw
          </Link>
          <Link to="/gallery" className="nav-link" activeProps={{ className: "nav-link active" }}>
            Cards
          </Link>
          <Link
            to="/spreads"
            className="nav-link"
            activeProps={{ className: "nav-link active" }}
            activeOptions={{ exact: true }}
          >
            Spread
          </Link>
          <Link
            to="/spreads/history"
            className="nav-link"
            activeProps={{ className: "nav-link active" }}
          >
            History
          </Link>
        </nav>
      </header>
      <Outlet />
      <footer className="site-foot">
        <span>{SITE.title} — draw, and read your fortune</span>
      </footer>
    </SiteDocument>
  );
}
