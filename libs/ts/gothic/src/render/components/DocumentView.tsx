/** @jsxRuntime automatic @jsxImportSource react */
import type { VellumBlock, VellumDocument, VellumNode } from "@astra/vellum-lang";
import type { CSSProperties, ReactElement, ReactNode } from "react";

import { type CrossRefResolver, CrossRefResolverContext } from "../crossrefResolver";
import { type ImageResolver, ImageResolverContext } from "../imageResolver";
import { renderNodes } from "../mdastToReact";
import { DeityCard } from "./DeityCard";
import { Fields } from "./Fields";
import { Frontmatter } from "./Frontmatter";
import { ProseCard } from "./ProseCard";
import { StatCard } from "./StatCard";
import { TimelineBlock } from "./TimelineBlock";

function Block({ block }: { block: VellumBlock }): ReactElement {
  switch (block.kind) {
    case "handout":
    case "edict":
      return <ProseCard block={block} kind={block.kind} />;
    case "deity":
      return <DeityCard block={block} kind={block.kind} />;
    default:
      // statblock / hazard / item / spell
      return <StatCard block={block} kind={block.kind} />;
  }
}

/** Render one top-level node: a kind block, prose, columns, fields, or a timeline. */
function Node({ node }: { node: VellumNode }): ReactNode {
  switch (node.type) {
    case "block":
      return <Block block={node} />;
    case "prose":
      // Loose top-level markdown — a real heading scale (h1→h6), unlike the flat
      // section labels inside cards.
      return <div className="gothic-content gothic-prose">{renderNodes(node.children)}</div>;
    case "columns":
      return (
        <div
          className="gothic-columns"
          style={{ "--vellum-column-count": node.columns.length } as CSSProperties}
        >
          {node.columns.map((column, i) => (
            // oxlint-disable-next-line react/no-array-index-key -- a static list in source order with no unique id; it never reorders
            <div key={i} className="gothic-column">
              {column.map((child, j) => (
                // oxlint-disable-next-line react/no-array-index-key -- a static list in source order with no unique id; it never reorders
                <Node key={j} node={child} />
              ))}
            </div>
          ))}
        </div>
      );
    case "fields":
      return <Fields node={node} />;
    case "timeline":
      return <TimelineBlock node={node} />;
    default: {
      // Exhaustiveness guard: VellumNode is a closed union, so a new variant
      // becomes a compile error here rather than silently rendering nothing.
      const _exhaustive: never = node;
      return _exhaustive;
    }
  }
}

/**
 * Renders a parsed document. The `[data-vellum-export]` element is the card
 * boundary the render service screenshots (vellum-frontend); `data-mode` drives
 * the mechanical|diegetic skin entirely in CSS (structure stays theme-agnostic).
 * The frontmatter (title/tags) renders as a page header above the nodes.
 *
 * `resolveCrossref` (optional) lets a consuming app (akasha-frontend 0011) turn
 * `[[crossref]]` placeholders into real `<a href>` links; omitted, crossrefs stay
 * unresolved placeholders (gothic's L6 default — render service / Storybook).
 *
 * `resolveImage` (optional) maps a Markdown image's path to the same-origin URL the app
 * serves it at (akasha-frontend's `akasha/assets/`); omitted, images render their alt text.
 */
export function DocumentView({
  document,
  resolveCrossref,
  resolveImage,
}: {
  document: VellumDocument;
  resolveCrossref?: CrossRefResolver;
  resolveImage?: ImageResolver;
}): ReactElement {
  const article = (
    <article
      data-vellum-export=""
      data-mode={document.mode}
      className="flex flex-col gap-5 font-body text-ink"
    >
      <Frontmatter frontmatter={document.frontmatter} />
      {document.nodes.map((node, i) => (
        // oxlint-disable-next-line react/no-array-index-key -- a static list in source order with no unique id; it never reorders
        <Node key={i} node={node} />
      ))}
    </article>
  );
  const withImages = resolveImage ? (
    <ImageResolverContext.Provider value={resolveImage}>{article}</ImageResolverContext.Provider>
  ) : (
    article
  );
  return resolveCrossref ? (
    <CrossRefResolverContext.Provider value={resolveCrossref}>
      {withImages}
    </CrossRefResolverContext.Provider>
  ) : (
    withImages
  );
}
