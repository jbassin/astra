import type { DocumentKind, VellumBlock } from "@astra/vellum-lang";
import type { ReactElement } from "react";

import { grimeStyle } from "../grimeStyle";
import { collectText, renderNodes } from "../mdastToReact";

/**
 * Diegetic prose layout for handout / edict — an in-world document. The
 * parchment skin, gold-leaf drop-cap, and suppressed trait glyphs come from the
 * `[data-mode="diegetic"]` axis on the export frame; the component stays
 * theme-agnostic (the same source renders in either skin).
 */
export function ProseCard({
  block,
  kind,
}: {
  block: VellumBlock;
  kind: DocumentKind;
}): ReactElement {
  const { label, labelNodes, children } = block;
  return (
    <section
      data-kind={kind}
      className="gothic-card gothic-card-prose"
      style={grimeStyle((label ?? "") + collectText(children))}
    >
      {labelNodes ? (
        <header className="mb-2 font-display text-[1.25rem] uppercase tracking-[0.03em] text-accent-amber [&_svg]:ml-[0.15em] [&_svg]:text-accent-amber [[data-mode=diegetic]_&]:text-parchment-ink [[data-mode=diegetic]_&_svg]:text-wax">
          {renderNodes(labelNodes)}
        </header>
      ) : null}
      <div className="gothic-content gothic-prose-body">{renderNodes(children)}</div>
    </section>
  );
}
