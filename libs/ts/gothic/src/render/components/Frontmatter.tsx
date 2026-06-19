import type { Frontmatter as FrontmatterData } from "@astra/vellum-lang";
import type { ReactElement } from "react";
import { TraitPill } from "./TraitPill";

/** True when the frontmatter has anything worth rendering as a page header. */
export function hasFrontmatterHeader(fm: FrontmatterData): boolean {
  return Boolean(fm.title) || fm.tags.length > 0;
}

/**
 * The page header derived from a document's YAML frontmatter (full-vellum §3.1):
 * the title (ruled display heading) + the tag set (as pills). `aliases`/`img`/
 * `extra` are metadata for akasha (resolution, hero image) — not rendered here.
 */
export function Frontmatter({
  frontmatter,
}: {
  frontmatter: FrontmatterData;
}): ReactElement | null {
  if (!hasFrontmatterHeader(frontmatter)) return null;
  const { title, tags } = frontmatter;
  return (
    <header className="border-b-2 border-rule-bright pb-2 [[data-mode=diegetic]_&]:border-[color-mix(in_srgb,var(--color-parchment-edge)_70%,transparent)]">
      {title ? (
        <h1 className="font-display text-[2.4rem] uppercase leading-[1.1] tracking-[0.015em] text-accent [[data-mode=diegetic]_&]:text-wax">
          {title}
        </h1>
      ) : null}
      {tags.length ? (
        <div className="mt-2 flex flex-wrap gap-[0.35rem]">
          {tags.map((tag, i) => (
            <TraitPill key={i} name={tag} />
          ))}
        </div>
      ) : null}
    </header>
  );
}
