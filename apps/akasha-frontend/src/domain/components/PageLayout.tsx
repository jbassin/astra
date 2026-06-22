// The Quartz page shell (faerrin PageLayout.astro): a 3-column grid — left sidebar
// (site title + Darkmode/ReaderMode + Explorer), center content, right sidebar
// (page-specific: SidebarImage, Backlinks). The Popover island mounts once here.
// `<body data-slug>` is set in __root (the Graph + TranscriptPlayer contract).
//
// Graph (slice 6) + Search (slice 8) join the right/left sidebars in their slices.
import type { ReactNode } from "react";
import { Darkmode } from "@/domain/components/islands/Darkmode";
import { Explorer } from "@/domain/components/islands/Explorer";
import { Popover } from "@/domain/components/islands/Popover";
import { ReaderMode } from "@/domain/components/islands/ReaderMode";
import { PageTitle } from "@/domain/components/PageTitle";

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
          <div className="sidebar-tools">
            <Darkmode />
            <ReaderMode />
          </div>
          <Explorer />
        </aside>
        <div className="center">{children}</div>
        <aside className="right sidebar">{rightSidebar}</aside>
      </div>
      <Popover />
    </div>
  );
}
