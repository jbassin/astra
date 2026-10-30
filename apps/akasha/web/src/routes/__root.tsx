/// <reference types="vite/client" />
import { SiteDocument, siteHead } from "@astra/site-kit/document";
import { createRootRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { Fragment } from "react";
import "@astra/site-kit/theme";

// akasha's faces: Literata (reading text, with italics and the optical-size axis) and Archivo
// (interface text, with the width axis). tokens.css points gothic's font tokens at them.
import "@fontsource-variable/literata/opsz.css";
import "@fontsource-variable/literata/opsz-italic.css";
import "@fontsource-variable/archivo/wdth.css";

import { SpaLinks } from "@/domain/components/islands/SpaLinks";
import { useCurrentSlug } from "@/domain/components/shellHooks";
import { getSectionCounts } from "@/domain/lib/pageDataFns";
import { THEME_SCRIPT } from "@/domain/lib/theme";

import "@/styles/globals.css";
import { SPEAKER_CSS } from "@/generated/speakers";

export const Route = createRootRoute({
  head: () => siteHead({ title: "Akasha — the Færrin wiki", description: "The Færrin wiki" }),
  // Pages per section, for the section tree's head and the phone menu. SSR runs it once and
  // the router keeps it (`defaultStaleTime: Infinity`). The counts are decoration, so an
  // unknown server-function id (a tab from an older build resolves to `undefined`) renders
  // the shell without them.
  loader: async () => ({ sectionCounts: (await getSectionCounts()) ?? null }),
  component: RootComponent,
});

function RootComponent() {
  // `<body data-slug>` is the load-bearing contract the Graph + TranscriptPlayer
  // islands read (faerrin set it in PageLayout): the deepest route match's `slug`.
  const slug = useCurrentSlug();
  // The page that is on screen: `location` moves to the next page as soon as a
  // navigation starts, `resolvedLocation` only once its loader has finished.
  const pathname = useRouterState({
    select: (s) => (s.resolvedLocation ?? s.location).pathname,
  });

  return (
    <SiteDocument
      rum={() => import("@/observe/rumConfig")}
      head={
        <>
          {/* Applies the stored theme to <html> before first paint (src/domain/lib/theme.ts).
              React never renders `data-theme`; the theme controls set it directly. */}
          {/* oxlint-disable-next-line react/no-danger -- an inline pre-paint script or CSS built from constants */}
          <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
          {/* Speaker colors: `--text<Name>` vars + per-speaker transcript rules, generated
              from ontology-being at build (see scripts/build-content.ts). */}
          {/* oxlint-disable-next-line react/no-danger -- an inline pre-paint script or CSS built from constants */}
          <style dangerouslySetInnerHTML={{ __html: SPEAKER_CSS }} />
        </>
      }
      bodyProps={{ "data-slug": slug }}
    >
      <SpaLinks />
      {/* Navigation is client-side, but each page mounts fresh, as a page load did: the
          islands (Graph, SectionTree, Search, PhoneMenu, TranscriptPlayer, Popover) set up
          against the new page and tear down the old one. A hash change keeps the page
          mounted. */}
      <Fragment key={pathname}>
        <Outlet />
      </Fragment>
    </SiteDocument>
  );
}
