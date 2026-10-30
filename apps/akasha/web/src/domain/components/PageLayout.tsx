// The page shell: the sticky header, then a grid of the left rail (the section tree), the
// page, and the right rail (page-specific blocks, then the "Connections" graph). Pages with
// nothing for the right rail use two columns. Below 1180 px the right rail moves under the
// page; below 860 px the left rail goes and the phone menu carries the sections (shell.css).
// The search dialog and the Popover island mount once here. `<body data-slug>` is set in
// __root (the Graph + TranscriptPlayer contract).
//
// The graph is lazy + ClientOnly so pixi never reaches SSR.
import { lazy, type ReactNode, Suspense } from "react";

import ClientOnly from "@/components/ClientOnly/ClientOnly";
import { Popover } from "@/domain/components/islands/Popover";
import { SearchDialog } from "@/domain/components/islands/Search";
import { SectionTree } from "@/domain/components/islands/SectionTree";
import { SiteHeader } from "@/domain/components/SiteHeader";

// Pixi/d3 are pulled in only by this lazy chunk, which ClientOnly resolves in the
// browser — keeps WebGL off the SSR path.
const Graph = lazy(() => import("@/domain/components/islands/Graph"));

export function PageLayout({
  children,
  rightSidebar,
  graph = true,
  leftRail,
  rails = true,
}: {
  children: ReactNode;
  /** Right-rail blocks above the graph; wrap each in `<section className="ak-rail-block">`. */
  rightSidebar?: ReactNode;
  /** The "Connections" graph at the foot of the right rail; chronicle pages opt out. */
  graph?: boolean;
  /** Replaces the section tree in the left rail. */
  leftRail?: ReactNode;
  /** False drops both rails for a full-width page (the home page; home.css). */
  rails?: boolean;
}) {
  const hasRight = rails && (graph || rightSidebar != null);
  const frameClass = !rails ? "ak-frame no-rails" : hasRight ? "ak-frame" : "ak-frame no-right";
  return (
    <div className="ak-page">
      <a className="ak-skip-link" href="#ak-main">
        Skip to the page
      </a>
      <SiteHeader />
      <div className={frameClass}>
        {rails && (
          <aside className="ak-rail ak-rail-left" aria-label="Section pages">
            {leftRail ?? <SectionTree />}
          </aside>
        )}
        <main id="ak-main" className="ak-main">
          {children}
        </main>
        {hasRight && (
          <aside className="ak-rail ak-rail-right" aria-label="About this page">
            {rightSidebar}
            {graph && (
              <section className="ak-rail-block ak-connections">
                <h2 className="ak-rail-title">Connections</h2>
                {/* graph-slot reserves the height server-side so the client-only graph
                    doesn't shift the layout when it hydrates. */}
                <div className="graph-slot">
                  <ClientOnly>
                    <Suspense fallback={null}>
                      <Graph />
                    </Suspense>
                  </ClientOnly>
                </div>
              </section>
            )}
          </aside>
        )}
      </div>
      <SearchDialog />
      <Popover />
    </div>
  );
}
