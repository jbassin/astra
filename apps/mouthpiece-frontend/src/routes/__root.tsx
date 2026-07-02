import { mouthpieceInterference, ShaderBackground } from "@astra/backdrop";
/// <reference types="vite/client" />
import { createRootRoute, HeadContent, Link, Outlet, Scripts } from "@tanstack/react-router";

import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@astra/gothic/theme.css";
import "@/styles/globals.css";
import { useEffect } from "react";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Mouthpiece — the Færrin podcast" },
      { name: "description", content: "The Færrin roundtable podcast" },
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
        <Scripts />
      </body>
    </html>
  );
}
