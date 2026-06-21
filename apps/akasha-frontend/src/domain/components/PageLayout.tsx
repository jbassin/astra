// The center-column page shell — the Quartz `.page > #quartz-body > .center` grid
// faerrin's PageLayout.astro renders. Slice 3 ships the center column only; the left
// (PageTitle/Search/Explorer) and right (Graph/TOC/Backlinks rail) sidebars + the
// islands land in slice 5. `<body data-slug>` is set in __root (the Graph +
// TranscriptPlayer contract).
import type { ReactNode } from "react";

export function PageLayout({ children }: { children: ReactNode }) {
  return (
    <div id="quartz-root" className="page">
      <div id="quartz-body">
        <div className="center">{children}</div>
      </div>
    </div>
  );
}
