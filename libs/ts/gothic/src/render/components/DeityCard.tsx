import { type DocumentKind, parseFieldItems, type VellumBlock } from "@astra/vellum-lang";
import type { RootContent } from "mdast";
import type { ReactElement, ReactNode } from "react";
import { grimeStyle } from "../grimeStyle";
import { collectText, renderNodes } from "../mdastToReact";

/**
 * One run of `Term :: value` lines, rendered as the deity field grid — the same
 * definition-list skin as `:::fields`, so a deity's profile reads consistently
 * with a standalone field-list.
 */
function FieldGrid({ items }: { items: ReturnType<typeof parseFieldItems> }): ReactElement | null {
  if (items.length === 0) return null;
  return (
    <dl className="gothic-content my-[0.4rem] grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
      {items.map((item, i) => (
        <div key={i} className="contents">
          <dt className="font-display text-[0.95rem] uppercase tracking-[0.04em] text-accent [[data-mode=diegetic]_&]:text-wax">
            {item.term}
          </dt>
          <dd className="m-0">{renderNodes(item.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The divine stat block (`:::deity[Name]{category=…}`). A mechanical stat card
 * whose body is `Term :: value` field-lines (the deity owns its fields, so no
 * nested `:::fields` is needed). A `##`/`###` heading in the body — e.g.
 * `### Devotee Benefits` — splits the body into labelled sections, each its own
 * field grid. The `{category}` brace is the corner tag's qualifier (the divine
 * rank), mirroring a statblock's `level`.
 */
export function DeityCard({
  block,
  kind,
}: {
  block: VellumBlock;
  kind: DocumentKind;
}): ReactElement {
  const { attributes, label, labelNodes, children } = block;
  const name = labelNodes ? renderNodes(labelNodes) : (attributes.name ?? "Deity");
  const category = attributes.category;

  // Segment the body on headings: each heading is a section sub-label, and the
  // field-lines between headings render as one grid.
  const segments: ReactNode[] = [];
  let run: RootContent[] = [];
  const flushRun = (key: string) => {
    if (run.length > 0) {
      segments.push(<FieldGrid key={key} items={parseFieldItems(run)} />);
      run = [];
    }
  };
  children.forEach((node, i) => {
    if (node.type === "heading") {
      flushRun(`grid-${i}`);
      segments.push(
        <h3
          key={`head-${i}`}
          className="mb-[0.15rem] mt-[0.8rem] font-display text-[0.95rem] uppercase tracking-[0.06em] text-accent-amber [[data-mode=diegetic]_&]:text-wax"
        >
          {renderNodes(node.children)}
        </h3>,
      );
    } else {
      run.push(node);
    }
  });
  flushRun("grid-end");

  return (
    <section
      data-kind={kind}
      className="gothic-card gothic-card-stat"
      style={grimeStyle((label ?? "") + collectText(children))}
    >
      <header className="mb-2 flex items-baseline justify-between gap-3 border-b border-rule pb-[0.4rem] [[data-mode=diegetic]_&]:border-[color-mix(in_srgb,var(--color-parchment-edge)_70%,transparent)]">
        <span className="font-display text-[1.4rem] uppercase leading-[1.1] tracking-[0.02em] text-accent [[data-mode=diegetic]_&]:text-parchment-ink">
          {name}
        </span>
        <span className="flex items-baseline gap-[0.4rem] whitespace-nowrap">
          <span className="font-mono text-[0.65rem] uppercase tracking-[0.16em] text-ink-dim [[data-mode=diegetic]_&]:text-parchment-ink-dim">
            deity
          </span>
          {category ? (
            <span className="font-mono text-[0.8rem] uppercase tracking-[0.06em] text-accent-amber [[data-mode=diegetic]_&]:text-parchment-ink-dim">
              {category}
            </span>
          ) : null}
        </span>
      </header>
      {segments}
    </section>
  );
}
