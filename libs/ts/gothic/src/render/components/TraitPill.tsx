import type { ReactElement } from "react";

/**
 * A PF2e-style trait pill. Visual only — the name is rendered verbatim. Amber
 * stamp in mechanical mode; a wax-red ink stamp on parchment in diegetic mode
 * (the ancestor `[data-mode="diegetic"]` on the export frame flips it).
 */
export function TraitPill({ name }: { name: string }): ReactElement {
  return (
    <span className="rounded-[1px] bg-accent-amber px-2 py-[0.12rem] font-mono text-[0.7rem] uppercase tracking-[0.08em] text-void [[data-mode=diegetic]_&]:bg-wax [[data-mode=diegetic]_&]:text-parchment">
      {name}
    </span>
  );
}
