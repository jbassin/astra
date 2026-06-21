/// <reference types="vite/client" />
import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
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
      { title: "Akasha — the Færrin wiki" },
      { name: "description", content: "The Færrin wiki" },
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
        <HeadContent />
      </head>
      <body suppressHydrationWarning>
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
