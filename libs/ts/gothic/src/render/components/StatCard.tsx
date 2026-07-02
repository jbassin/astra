import type { DocumentKind, VellumBlock } from "@astra/vellum-lang";
import type { ReactElement } from "react";

import { grimeStyle } from "../grimeStyle";
import { collectText, renderNodes } from "../mdastToReact";
import { TraitPill } from "./TraitPill";

function splitTraits(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((trait) => trait.trim())
    .filter(Boolean);
}

/**
 * Mechanical "stat" layout shared by statblock / hazard / item / spell. Layout
 * only — every field is the author's text, rendered verbatim. The kind tag
 * distinguishes the four; `level` shows beside the tag, `price` in the body.
 */
export function StatCard({
  block,
  kind,
}: {
  block: VellumBlock;
  kind: DocumentKind;
}): ReactElement {
  const { attributes, label, labelNodes, children } = block;
  const traits = splitTraits(attributes.traits);
  // Render the label's inline nodes (so `[Name :action[free]]` shows the glyph);
  // fall back to the `name=` attribute or the kind when there's no label.
  const name = labelNodes ? renderNodes(labelNodes) : (attributes.name ?? kind);
  // The corner tag defaults to the kind, but `tag=` overrides it. `data-kind`
  // still distinguishes the four stat kinds for any consumer styling.
  const tag = attributes.tag ?? kind;
  const level = attributes.level;
  const price = attributes.price;

  return (
    <section
      data-kind={kind}
      className="gothic-card gothic-card-stat"
      style={grimeStyle((label ?? "") + collectText(children))}
    >
      <header className="mb-2 flex items-baseline justify-between gap-3 border-b border-rule pb-[0.4rem] [[data-mode=diegetic]_&]:border-[color-mix(in_srgb,var(--color-parchment-edge)_70%,transparent)]">
        <span className="font-display text-[1.4rem] uppercase leading-[1.1] tracking-[0.02em] text-accent [&_svg]:ml-[0.15em] [&_svg]:text-accent-amber [[data-mode=diegetic]_&]:text-parchment-ink [[data-mode=diegetic]_&_svg]:text-wax">
          {name}
        </span>
        <span className="flex items-baseline gap-[0.4rem] whitespace-nowrap">
          <span className="whitespace-nowrap font-mono text-[0.65rem] uppercase tracking-[0.16em] text-ink-dim [[data-mode=diegetic]_&]:text-parchment-ink-dim">
            {tag}
          </span>
          {level ? (
            <span className="font-mono text-[0.8rem] uppercase tracking-[0.06em] text-accent-amber [[data-mode=diegetic]_&]:text-parchment-ink-dim">
              {level}
            </span>
          ) : null}
        </span>
      </header>
      {price ? (
        <div className="mb-2 font-mono text-[0.85rem] text-accent-amber [[data-mode=diegetic]_&]:text-parchment-ink-dim">
          {price}
        </div>
      ) : null}
      {traits.length ? (
        <div className="mb-[0.6rem] flex flex-wrap gap-[0.35rem]">
          {traits.map((trait, i) => (
            <TraitPill key={i} name={trait} />
          ))}
        </div>
      ) : null}
      <div className="gothic-content gothic-card-body">{renderNodes(children)}</div>
    </section>
  );
}
