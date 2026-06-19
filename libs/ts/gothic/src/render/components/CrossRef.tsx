import type { CrossRef as CrossRefNode } from "@astra/vellum-lang";
import type { ReactElement } from "react";

/**
 * An inline cross-reference (`[[target#heading|alias]]`, full-vellum §3.2).
 *
 * gothic renders it as a link-styled placeholder showing `alias ?? target`, and
 * carries `target`/`heading` on `data-*` attributes so **akasha-backend (0007)**
 * can resolve it to a real URL + build the backlink graph. gothic does NOT
 * resolve targets (L6) — there is no `href` here, by design.
 */
export function CrossRef({ node }: { node: CrossRefNode }): ReactElement {
  const { target, heading, alias } = node;
  const text = alias ?? target;
  const title = heading ? `${target} #${heading}` : target;
  // No ARIA role / href here: a crossref is an UNRESOLVED placeholder until
  // akasha-backend (0007) resolves the target — only then does it become a real
  // link. Until then it is styled text carrying the target on `data-*` attrs.
  return (
    <span
      title={title}
      data-crossref=""
      data-crossref-target={target}
      data-crossref-heading={heading ?? undefined}
      className="text-accent underline decoration-dotted underline-offset-2 [[data-mode=diegetic]_&]:text-wax"
    >
      {text}
    </span>
  );
}
