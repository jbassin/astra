// The root document every SSR frontend's `src/routes/__root.tsx` renders
// (`@astra/site-kit/document`): the html/head/body skeleton, the head meta, and the browser RUM
// bootstrap. The fonts and theme CSS are the separate side-effect entry
// `@astra/site-kit/theme`. The app's root route keeps its own head extras, body attributes and
// layout.

import { HeadContent, Scripts } from "@tanstack/react-router";
import { type ComponentProps, type ReactNode, useEffect, useRef } from "react";

import type { RumConfig } from "./web";

/**
 * The root route's `head`: charset, viewport, title, description and the SVG favicon, plus any
 * extra `meta` entries after the description (codex's `robots: noindex`).
 */
export function siteHead(opts: {
  title: string;
  description: string;
  meta?: ReadonlyArray<{ name: string; content: string }>;
}) {
  return {
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: opts.title },
      { name: "description", content: opts.description },
      ...(opts.meta ?? []),
    ],
    links: [{ rel: "icon", type: "image/svg+xml", href: "/favicon.svg" }],
  };
}

/**
 * Loads the app's `src/observe/rumConfig.ts`. The `createServerFn` must stay in app source:
 * TanStack Start's vite plugin transforms server functions only inside the app.
 */
export type RumConfigLoader = () => Promise<{ getRumConfig: () => Promise<RumConfig> }>;

export interface SiteDocumentProps {
  /** The body content; `<Scripts />` follows it. */
  children: ReactNode;
  /** `() => import("@/observe/rumConfig")`. */
  rum: RumConfigLoader;
  /** Extra head nodes, rendered before `<HeadContent />`. */
  head?: ReactNode;
  /** Attributes for `<body>` (such as akasha's `data-slug`). */
  bodyProps?: Omit<ComponentProps<"body">, "children"> & { [data: `data-${string}`]: string };
}

export function SiteDocument({ children, rum, head, bodyProps }: SiteDocumentProps) {
  // Browser RUM: effects never run during SSR, and the dynamic imports keep the OTel web SDK
  // and the server-function stub out of the SSR render and the main client chunk. The ref
  // keeps the first loader, so a new inline arrow on re-render doesn't restart RUM.
  const rumLoader = useRef(rum);
  useEffect(() => {
    void Promise.all([import("./web"), rumLoader.current()]).then(([web, cfg]) =>
      web.startRum(cfg.getRumConfig),
    );
  }, []);

  // `suppressHydrationWarning` on <html>: a pre-paint script in `head` may set attributes
  // there before hydration (akasha's `data-theme`). It covers only <html>'s own attributes.
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {head}
        <HeadContent />
      </head>
      <body {...bodyProps} suppressHydrationWarning>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
