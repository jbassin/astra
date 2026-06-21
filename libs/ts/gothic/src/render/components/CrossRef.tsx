import type { CrossRef as CrossRefNode } from "@astra/vellum-lang";
import { type ReactElement, useContext } from "react";
import { CrossRefResolverContext } from "../crossrefResolver";

/** Shared link/placeholder styling — amber accent, dotted underline, wax in diegetic. */
const CROSSREF_CLASS =
  "text-accent underline decoration-dotted underline-offset-2 [[data-mode=diegetic]_&]:text-wax";

/**
 * An inline cross-reference (`[[target#heading|alias]]`, full-vellum §3.2).
 *
 * By default gothic renders it as a link-styled **placeholder** showing
 * `alias ?? target`, carrying `target`/`heading` on `data-*` attributes — gothic
 * does NOT resolve targets (L6). A consumer that knows the URL map (akasha-frontend
 * 0011) injects a resolver via `<DocumentView resolveCrossref>`; when it returns a
 * hit this renders a real `<a href>` instead (still carrying the `data-*` attrs so
 * Popover/backlink tooling can hook it).
 */
export function CrossRef({ node }: { node: CrossRefNode }): ReactElement {
  const { target, heading, alias } = node;
  const text = alias ?? target;
  const title = heading ? `${target} #${heading}` : target;
  const resolution = useContext(CrossRefResolverContext)?.(node) ?? null;

  if (resolution) {
    return (
      <a
        href={resolution.href}
        title={title}
        data-crossref=""
        data-crossref-target={target}
        data-crossref-heading={heading ?? undefined}
        className={CROSSREF_CLASS}
      >
        {text}
      </a>
    );
  }

  // Unresolved (no resolver, or a dangling target): styled text, no href, the
  // target on `data-*` attrs so the consumer can still resolve/report it.
  return (
    <span
      title={title}
      data-crossref=""
      data-crossref-target={target}
      data-crossref-heading={heading ?? undefined}
      className={CROSSREF_CLASS}
    >
      {text}
    </span>
  );
}
