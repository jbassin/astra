import type { ReactElement } from "react";

import type { AttachedSidebarView } from "../../server/entityPageData";
import { EditionIcon } from "../../ui";
import { Citation } from "./citation";
import { type RenderCtx, renderNodes } from "./nodes";

/**
 * D29-42 — attached sidebars render AFTER a host entity page's own body, as
 * styled `<aside>` cards: title + FULL rendered body + citation + a link to
 * the standalone `/sidebar/{slug}` page (which remains canonical — this is
 * an inline COPY of the same data, not a replacement for it). Bodies are
 * already resolved server-side (`entityPageData.ts`'s `resolveAttachedSidebars`
 * — one serverFn, no second round-trip); this component only renders.
 *
 * **Depth 1 only, by construction:** this file never reads a sidebar's own
 * `attachedSidebars` (the resolver never even fetches it, `entityPageData.ts`'s
 * own comment) — a sidebar aside can never itself grow further asides.
 *
 * **Embeds inside a sidebar body (the M7 "second layer renders as links"
 * posture, spec D29-42):** rendered with the SAME `ctx` the host page's own
 * body used, but at `embedDepth + 1` — i.e. treated exactly like an
 * already-once-inlined embed's body (`nodes.tsx`'s own `renderEmbed`: once
 * `embedDepth > 0`, a resolved target renders as a link, never expands
 * further). Deliberately NOT a second embed-prefetch pass: a sidebar body's
 * OWN depth-0 embed targets are never added to `ctx`'s resolver map, so in
 * practice most sidebar-body embeds fall back to the ordinary "unresolved"
 * treatment (plain text) unless the same target happens to already be in the
 * host page's own embed map — the same fail-soft rendering every other
 * not-inlined embed in this app already exhibits, not a new class. This
 * keeps the feature to ONE server round-trip with no unbounded extra corpus
 * reads (measured max 7 sidebars/host, spec's own budget note).
 *
 * **Superseded interplay:** an attached sidebar that is itself `superseded`
 * follows the host page's own superseded-visibility param (P4.5 D29-48: a
 * plain per-page URL read, no site-wide toggle) — hidden when `superseded`
 * is false, with an "N hidden" note reusing `RulesTree.tsx`'s own
 * microcopy/CSS class (`codex-rules-hidden-note`) rather than inventing a
 * second wording.
 */
export function AttachedSidebars({
  sidebars,
  superseded,
  ctx,
}: {
  sidebars: readonly AttachedSidebarView[];
  superseded: boolean;
  ctx: RenderCtx;
}): ReactElement | null {
  if (sidebars.length === 0) return null;
  const visible = superseded ? sidebars : sidebars.filter((s) => !s.superseded);
  const hiddenCount = sidebars.length - visible.length;

  return (
    <section className="codex-attached-sidebars" aria-label="Related sidebars">
      <h2 className="codex-heading">Sidebars</h2>
      {hiddenCount > 0 ? (
        <p className="codex-rules-hidden-note">
          {hiddenCount === sidebars.length ? `all ${hiddenCount} hidden` : `${hiddenCount} hidden`}
        </p>
      ) : null}
      {visible.map((sidebar) => (
        <aside key={sidebar.id} className="codex-card codex-attached-sidebar">
          <h3 className="codex-attached-sidebar-title">
            {sidebar.name}
            {sidebar.superseded ? <EditionIcon edition="legacy" /> : null}
          </h3>
          <div className="codex-content">
            {renderNodes(sidebar.body, { ...ctx, embedDepth: ctx.embedDepth + 1 })}
          </div>
          <Citation source={sidebar.source} />
          <a className="codex-attached-sidebar-link" href={`/${sidebar.id}`}>
            View standalone sidebar →
          </a>
        </aside>
      ))}
    </section>
  );
}
