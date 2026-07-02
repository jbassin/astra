/// <reference types="vite/client" />
import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { useEffect } from "react";

import PixiHost from "@/components/PixiHost/PixiHost";
import { EntitiesObservedProvider } from "@/components/SiteHeader/entitiesObserved";
import SiteHeader from "@/components/SiteHeader/SiteHeader";

import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@astra/gothic/theme.css";
import "@/styles/globals.css";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "The Strider" },
      { name: "description", content: "Faction map of The Strider" },
    ],
    links: [{ rel: "icon", type: "image/svg+xml", href: "/favicon.svg" }],
  }),
  component: RootComponent,
});

function RootComponent() {
  // Client RUM (S1): browser OTel → SigNoz. Effects never run during SSR, and the
  // dynamic import keeps the web SDK out of the SSR bundle.
  useEffect(() => {
    void import("@/observe/rum").then((m) => {
      void m.startRum();
    });
  }, []);

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body suppressHydrationWarning>
        <PixiHost>
          <EntitiesObservedProvider>
            <SiteHeader />
            <Outlet />
          </EntitiesObservedProvider>
          <Scripts />
        </PixiHost>
      </body>
    </html>
  );
}
