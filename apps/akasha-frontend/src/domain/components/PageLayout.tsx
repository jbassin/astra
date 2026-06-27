// The Quartz page shell (faerrin PageLayout.astro): a 3-column grid — left sidebar
// (site title + Search + Explorer), center content, right sidebar
// (page-specific: SidebarImage, Backlinks). The Popover island mounts once here.
// `<body data-slug>` is set in __root (the Graph + TranscriptPlayer contract).
//
// Graph (slice 6) lives in the right sidebar — lazy + ClientOnly so pixi never
// reaches SSR. Search (slice 8) joins later.
import { lazy, type ReactNode, Suspense } from "react";
import ClientOnly from "@/components/ClientOnly/ClientOnly";
import { Explorer } from "@/domain/components/islands/Explorer";
import { Popover } from "@/domain/components/islands/Popover";
import { Search } from "@/domain/components/islands/Search";
import { PageTitle } from "@/domain/components/PageTitle";

// Pixi/d3 are pulled in only by this lazy chunk, which ClientOnly resolves in the
// browser — keeps WebGL off the SSR path (Risk 5).
const Graph = lazy(() => import("@/domain/components/islands/Graph"));

export function PageLayout({
  children,
  rightSidebar,
}: {
  children: ReactNode;
  rightSidebar?: ReactNode;
}) {
  return (
    <div id="quartz-root" className="page">
      <div id="quartz-body">
        <aside className="left sidebar">
          <PageTitle />
          <Search />
          <Explorer />
        </aside>
        <div className="center">{children}</div>
        <aside className="right sidebar">
          {rightSidebar}
          {/* graph-slot reserves height server-side so the client-only graph
              doesn't shift the layout when it hydrates. */}
          <div className="graph-slot">
            <ClientOnly>
              <Suspense fallback={null}>
                <Graph />
              </Suspense>
            </ClientOnly>
          </div>
        </aside>
      </div>
      <Popover />
    </div>
  );
}
