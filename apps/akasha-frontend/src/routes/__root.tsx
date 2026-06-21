/// <reference types="vite/client" />
import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
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

  // `<body data-slug>` is the load-bearing contract the Graph + TranscriptPlayer
  // islands read (faerrin set it in PageLayout). Each route's loader returns its
  // `slug`; surface the deepest match's value here.
  const slug = useRouterState({
    select: (s) => {
      for (let i = s.matches.length - 1; i >= 0; i--) {
        const ld = s.matches[i]?.loaderData as { slug?: string } | undefined;
        if (ld?.slug) return ld.slug;
      }
      return "";
    },
  });

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body data-slug={slug} suppressHydrationWarning>
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
