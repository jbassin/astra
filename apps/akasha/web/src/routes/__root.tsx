/// <reference types="vite/client" />
import { SiteDocument, siteHead } from "@astra/site-kit/document";
import { createRootRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { Fragment } from "react";
import "@astra/site-kit/theme";

import { SpaLinks } from "@/domain/components/islands/SpaLinks";

import "@/styles/globals.css";
import { SPEAKER_CSS } from "@/generated/speakers";

export const Route = createRootRoute({
  head: () => siteHead({ title: "Akasha — the Færrin wiki", description: "The Færrin wiki" }),
  component: RootComponent,
});

function RootComponent() {
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
  // The page that is on screen: `location` moves to the next page as soon as a
  // navigation starts, `resolvedLocation` only once its loader has finished.
  const pathname = useRouterState({
    select: (s) => (s.resolvedLocation ?? s.location).pathname,
  });

  return (
    <SiteDocument
      rum={() => import("@/observe/rumConfig")}
      forceDarkTheme
      head={
        // Speaker colors: `--text<Name>` vars + per-speaker transcript rules, generated
        // from ontology-being at build (see scripts/build-content.ts).
        // oxlint-disable-next-line react/no-danger -- an inline pre-paint script or CSS built from constants
        <style dangerouslySetInnerHTML={{ __html: SPEAKER_CSS }} />
      }
      bodyProps={{ "data-slug": slug }}
    >
      {/* The astra signature backdrop — a CSS-only animated nebula (NOT pixi:
          akasha already runs a WebGL force-graph, and a second pixi Application
          conflicts). Decorative, fixed behind all content. */}
      <div className="site-backdrop" aria-hidden="true" />
      <SpaLinks />
      {/* Navigation is client-side, but each page mounts fresh, as a page load did: the
          islands (Graph, Explorer, Search, TranscriptPlayer, Popover) set up against the
          new page and tear down the old one. A hash change keeps the page mounted. */}
      <Fragment key={pathname}>
        <Outlet />
      </Fragment>
    </SiteDocument>
  );
}
