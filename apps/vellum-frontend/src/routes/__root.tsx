/// <reference types="vite/client" />
import { createRootRoute, HeadContent, Link, Outlet, Scripts } from "@tanstack/react-router";
import { useEffect } from "react";

import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@astra/gothic/theme.css";
import "@/styles/globals.css";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Vellum — the Færrin document forge" },
      { name: "description", content: "Write PF2e vellum documents, preview them, export to PNG." },
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
        <header className="site-head">
          <Link to="/" className="site-brand">
            Vellum
          </Link>
          <nav className="site-nav">
            <Link to="/editor">Editor</Link>
          </nav>
        </header>
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
