/// <reference types="vite/client" />
import { SiteDocument, siteHead } from "@astra/site-kit/document";
import { createRootRoute, Link, Outlet } from "@tanstack/react-router";

import { Icon } from "@/ui/Icon";

// builder's own faces, self-hosted: Texturina (display, with the optical-size axis) and
// Atkinson Hyperlegible Next (reading text, with tabular figures for the numbers).
import "@fontsource-variable/texturina/opsz.css";
import "@fontsource-variable/atkinson-hyperlegible-next/wght.css";
import "@fontsource-variable/atkinson-hyperlegible-next/wght-italic.css";
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
          <Icon name="scroll-quill" className="brand-icon" />
          <span>Character builder</span>
        </Link>
      </header>
      <Outlet />
      <footer className="site-foot">
        <p>
          Icons by Lorc, Delapouite and other artists at{" "}
          <a href="https://game-icons.net" rel="noreferrer">
            game-icons.net
          </a>
          , licensed{" "}
          <a href="https://creativecommons.org/licenses/by/3.0/" rel="noreferrer">
            CC BY 3.0
          </a>
          .
        </p>
      </footer>
    </SiteDocument>
  );
}
