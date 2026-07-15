/// <reference types="vite/client" />
import { createRootRoute, HeadContent, Link, Outlet, Scripts } from "@tanstack/react-router";
import { useEffect } from "react";

import { setLegacyToggle, useLegacyToggle } from "@/domain/browse/legacyToggle";
import { Omnibar } from "@/domain/search/Omnibar";

// D29-46 — codex's own self-hosted parchment-system fonts (mirrors the prior
// `@fontsource/ibm-plex-mono` two-file-per-weight pattern verbatim, now 4
// families / 8 weight files instead of 1 family / 2 files). Alegreya SC (the
// style doc's caption face) is deliberately NOT here — deferred, no
// art-plate/illustration component consumes it yet (D29-46).
import "@fontsource/cinzel/700.css";
import "@fontsource/cormorant-sc/600.css";
import "@fontsource/eb-garamond/400.css";
import "@fontsource/eb-garamond/400-italic.css";
import "@fontsource/eb-garamond/600.css";
import "@fontsource/eb-garamond/700.css";
import "@fontsource/oswald/500.css";
import "@fontsource/oswald/700.css";
import "@/styles/globals.css";

// D29-30: `<meta name="robots" content="noindex">` from day one, in every page's
// SSR HTML (C-1 defense-in-depth — the Caddy `X-Robots-Tag` + robots.txt land at
// P5). This is the ROOT head, so it's present unconditionally regardless of which
// route matched.
export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "codex — a Pathfinder 2e reference" },
      {
        name: "description",
        content: "A Pathfinder Second Edition rules & compendium reference.",
      },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "icon", type: "image/svg+xml", href: "/favicon.svg" }],
  }),
  component: RootComponent,
});

function RootComponent() {
  // Client RUM: browser OTel → SigNoz. Effects never run during SSR, and the
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
      <body>
        <header className="site-head">
          <Link to="/" className="site-brand">
            codex
          </Link>
          <span className="site-tagline">a Pathfinder 2e reference</span>
          {/* D29-36 — the header search omnibar, present on every page. */}
          <Omnibar />
          <LegacyToggleControl />
        </header>
        <Outlet />
        <footer className="site-foot">
          <span>codex — public, unofficial, noindexed</span>
        </footer>
        <Scripts />
      </body>
    </html>
  );
}

/**
 * D29-35 — the site-wide legacy toggle's header control. Hidden-by-default
 * posture: it's a small, low-emphasis control (not a prominent banner) since
 * superseded content is the exception, not the norm. `legacyToggle.ts` owns
 * the actual precedence/persistence logic (module-eval-time URL-wins-on-
 * load seed, `localStorage` persistence) — this component only reads/writes
 * the live value.
 */
function LegacyToggleControl() {
  const legacy = useLegacyToggle();
  return (
    <label className="site-legacy-toggle">
      <input type="checkbox" checked={legacy} onChange={(e) => setLegacyToggle(e.target.checked)} />
      <span>Show legacy (pre-remaster)</span>
    </label>
  );
}
