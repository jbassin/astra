import { ShaderBackground, starfield } from "@astra/backdrop";
/// <reference types="vite/client" />
import { createRootRoute, HeadContent, Link, Outlet, Scripts } from "@tanstack/react-router";

import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@astra/gothic/theme.css";
import "@/styles/globals.css";
import { useEffect } from "react";

import ClientOnly from "@/components/ClientOnly/ClientOnly";
import { SITE } from "@/generated/site";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: `${SITE.title} — tarot` },
      { name: "description", content: SITE.description },
    ],
    links: [{ rel: "icon", type: "image/svg+xml", href: "/favicon.svg" }],
  }),
  component: RootComponent,
});

function RootComponent() {
  // Client RUM: browser OTel → SigNoz. Effects never run during SSR, and the dynamic
  // import keeps the web SDK out of the SSR bundle.
  useEffect(() => {
    void import("@/observe/rum").then((m) => {
      void m.startRum();
    });
  }, []);

  return (
    <html lang="en">
      <head>
        {/* Dark-only void theme: force the dark palette before first paint, pre-
            hydration so there's no flash (gothic ships dark unconditionally). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `document.documentElement.setAttribute("saved-theme","dark")`,
          }}
        />
        <HeadContent />
      </head>
      <body suppressHydrationWarning>
        <ClientOnly>
          <ShaderBackground spec={starfield} />
        </ClientOnly>
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
        <Scripts />
      </body>
    </html>
  );
}
