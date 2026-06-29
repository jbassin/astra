/// <reference types="vite/client" />
import { createRootRoute, HeadContent, Link, Outlet, Scripts } from "@tanstack/react-router";
import { useEffect } from "react";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@astra/gothic/theme.css";
import "@/styles/globals.css";
import { SITE } from "@/lib/site";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: `${SITE.title} — Iridi` },
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
          // biome-ignore lint/security/noDangerouslySetInnerHtml: tiny static pre-paint theme script
          dangerouslySetInnerHTML={{
            __html: `document.documentElement.setAttribute("saved-theme","dark")`,
          }}
        />
        <HeadContent />
      </head>
      <body suppressHydrationWarning>
        <header className="site-head">
          <Link to="/" className="site-brand">
            ❦ {SITE.title}
          </Link>
          <span className="site-tagline">setting-wiki review</span>
        </header>
        <Outlet />
        <footer className="site-foot">
          <span>{SITE.title} — human-gated wiki maintenance</span>
        </footer>
        <Scripts />
      </body>
    </html>
  );
}
