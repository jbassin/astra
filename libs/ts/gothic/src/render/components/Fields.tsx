import type { VellumFields } from "@astra/vellum-lang";
import type { ReactElement } from "react";

import { renderNodes } from "../mdastToReact";

/**
 * A deity/stat field-list (`:::fields`, full-vellum §3.3). Each item is one
 * `Term :: value` line — `term` is queryable flat text, `value` keeps its inline
 * content (links + `[[crossref]]`s, rendered via the shared renderer). Laid out
 * as a definition list: terms in a label column, values beside them.
 */
export function Fields({ node }: { node: VellumFields }): ReactElement {
  return (
    <dl className="gothic-content my-[0.6rem] grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
      {node.items.map((item, i) => (
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
