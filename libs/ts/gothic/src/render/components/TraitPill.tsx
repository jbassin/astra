import type { ReactElement } from "react";

/**
 * A PF2e-style trait pill. Visual only — the name is rendered verbatim. Amber
 * stamp in mechanical mode; a wax-red ink stamp on parchment in diegetic mode
 * (the ancestor `[data-mode="diegetic"]` on the export frame flips it).
 */
export function TraitPill({ name }: { name: string }): ReactElement {
  return (
    <span className="inline-block rounded-[2px] bg-accent-amber px-[0.5rem] py-[0.22rem] font-mono text-[0.72rem] uppercase leading-none tracking-[0.08em] text-void [[data-mode=diegetic]_&]:bg-wax [[data-mode=diegetic]_&]:text-parchment">
      {name}
    </span>
  );
}
