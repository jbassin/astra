import type { VellumTimeline } from "@astra/vellum-lang";
import type { ReactElement } from "react";
import { renderNodes } from "../mdastToReact";

/**
 * A timeline (`:::timeline`, full-vellum §3.4) — the structured replacement for
 * the wiki's raw `<ul><li>` HTML. Each entry carries an optional `{marker}`
 * (era/date) shown in a left rail; the rest is the entry's content. A
 * marker-less entry keeps an empty rail cell so the content column stays aligned.
 */
export function TimelineBlock({ node }: { node: VellumTimeline }): ReactElement {
  return (
    <ol className="gothic-content my-[0.6rem] grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 border-l-2 border-rule pl-4 [[data-mode=diegetic]_&]:border-[color-mix(in_srgb,var(--color-parchment-edge)_70%,transparent)]">
      {node.entries.map((entry, i) => (
        <li key={i} className="contents">
          <span className="whitespace-nowrap font-mono text-[0.8rem] uppercase tracking-[0.06em] text-accent-amber [[data-mode=diegetic]_&]:text-wax">
            {entry.marker ?? ""}
          </span>
          <div className="[&>:first-child]:mt-0">{renderNodes(entry.children)}</div>
        </li>
      ))}
    </ol>
  );
}
