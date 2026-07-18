import { Fragment, type ReactElement, type ReactNode } from "react";

import type { CodexEntity } from "../../schema/entity";
import type { CodexNode } from "../../schema/nodes";
import { type ActionCost, ErrorChip } from "../../ui";
import { CodexActionGlyph } from "./actionGlyph";
import { capitalize } from "./text";
import { CodexTraitPills } from "./traits";

/**
 * D29-24 — the ONE total `CodexNode -> React` renderer, mirroring gothic's
 * `mdastToReact.tsx` shape: a flat switch over all 18 `CodexNode.kind`
 * values, `renderNodes` mapping over a list, an `ErrorChip`-carrying default
 * branch that can never throw. Unlike gothic's renderer (which resolves
 * targets via React context, `CrossRefResolverContext`), the embed
 * resolver/trait-membership set here are plain function parameters threaded
 * through every recursive call (`RenderCtx`) — D29-25's "injected, pure, no
 * fs/server dependency" requirement is easiest to keep honest that way, and
 * it keeps every render call directly unit-testable with a synthetic ctx.
 */

// ---------------------------------------------------------------------------
// RenderCtx — the D29-25 embed-inlining machinery (depth 1, cycle-guarded)
// ---------------------------------------------------------------------------

export interface RenderCtx {
  /** D29-25: resolves an embed's `targetId` to its full entity. Injected,
   * pure — S1 has no fs/server dependency; S2 wires this from the corpus
   * reader. Returning `undefined` is treated exactly like an unresolved embed
   * (fail-soft: plain text of `display`), which also covers the defensive
   * case of a `resolved: true` node whose target the resolver doesn't carry. */
  resolveEmbed: (targetId: string) => CodexEntity | undefined;
  /** D29-24: full `trait/<slug>` ids known to exist in the corpus — trait
   * pills link only when a member (an injected SET so trait-membership stays
   * pure/testable, per spec). */
  knownTraitIds: ReadonlySet<string>;
  /** D29-25 depth cap: 0 while rendering an entity's own top-level content;
   * >0 once inside an inlined embed's body. An embed encountered at depth > 0
   * renders as a crossref-style link, never inlined further (depth stays 1). */
  embedDepth: number;
  /** D29-25 cycle guard: target ids already being inlined along the current
   * chain — belt-and-suspenders alongside the depth cap (a self-referencing
   * embed at depth 0 must not recurse forever even if the depth check were
   * ever relaxed). */
  visitedEmbeds: ReadonlySet<string>;
}

/** The root ctx for rendering an entity's own top-level `body`/`loreBody`/
 * embedded-item bodies (depth 0, empty visited set). */
export function rootRenderCtx(opts: {
  resolveEmbed: RenderCtx["resolveEmbed"];
  knownTraitIds: ReadonlySet<string>;
}): RenderCtx {
  return { ...opts, embedDepth: 0, visitedEmbeds: new Set() };
}

/** A resolver that never resolves anything — every embed renders as
 * unresolved plain text. Handy for tests/pages that don't care about D29-25. */
export function noEmbeds(): RenderCtx["resolveEmbed"] {
  return () => undefined;
}

// ---------------------------------------------------------------------------
// B2 (adversarial): paragraph-carrying-block-children guard
// ---------------------------------------------------------------------------

const BLOCK_KINDS: ReadonlySet<CodexNode["kind"]> = new Set([
  "paragraph",
  "heading",
  "list",
  "table",
  "blockquote",
  "divider",
  "aside",
  "statRow",
]);

/** D29-24 adversarial B2: `localizedBoilerplate` is the one INLINE kind whose
 * own `children` can hold BLOCK nodes (resolved `@Localize` values are block
 * HTML) — a naive `paragraph -> <p>` wrapping one would emit `<p><p>...</p>
 * </p>`, which the browser silently hoists (hydration mismatch class, spec
 * B2). `localizedBoilerplate` needs walking here; the other INLINE kind that
 * can render as a BLOCK element is `embed` — a resolved, depth-0, not-yet-
 * visited embed renders a `<div class="codex-embed-card">` (D29-25,
 * `renderEmbed` below), so a paragraph carrying one of those must also
 * become a `<div>` (S5 P3 real-corpus find: `creature/red-dragon-adult`'s
 * body places a resolved `creature-family` embed inline inside prose text,
 * producing `<p><div>...</div></p>` — invalid nesting the browser silently
 * re-parents, a hydration mismatch). Every other inline kind is a true leaf
 * (no `children` field at all). */
function paragraphCarriesBlockContent(children: readonly CodexNode[], ctx: RenderCtx): boolean {
  return children.some((child) => {
    if (BLOCK_KINDS.has(child.kind)) return true;
    if (child.kind === "localizedBoilerplate") {
      return paragraphCarriesBlockContent(child.children, ctx);
    }
    if (child.kind === "embed") return embedRendersAsBlock(child, ctx);
    return false;
  });
}

// ---------------------------------------------------------------------------
// small display helpers
// ---------------------------------------------------------------------------

/** Foundry's `[[/act ...]]` macro vocabulary → action cost (D29-24
 * inlineAction: "action glyph where cost is knowable, else plain label").
 * Provenance: the real corpus uses exactly 39 distinct `action` slugs across
 * all `inlineAction` nodes (exhaustive scan, bodies + embedded items); each
 * cost below is read from the corresponding `action/<slug>.json` entity's own
 * `facets.actionCost`. Only glyph-knowable costs ("1" | "2" | "reaction") get
 * an entry — the 9 `actionCost: "passive"` slugs (exploration/downtime
 * activities: coerce, gather-information, impersonate, lie,
 * make-an-impression, sense-direction, subsist, track, treat-disease) and the
 * one costless slug (disable-device — its action entity carries no actionCost
 * facet) are DELIBERATELY unmapped so they take the plain-label path, exactly
 * like an unrecognized future slug. */
const ACTION_COST_BY_SLUG: Readonly<Record<string, ActionCost>> = {
  // actionCost "1" (26 slugs)
  balance: "1",
  climb: "1",
  "command-an-animal": "1",
  "create-a-diversion": "1",
  demoralize: "1",
  disarm: "1",
  escape: "1",
  feint: "1",
  "force-open": "1",
  grapple: "1",
  hide: "1",
  "maneuver-in-flight": "1",
  "palm-an-object": "1",
  perform: "1",
  "point-out": "1",
  reposition: "1",
  request: "1",
  seek: "1",
  "sense-motive": "1",
  shove: "1",
  sneak: "1",
  steal: "1",
  swim: "1",
  "treat-poison": "1",
  trip: "1",
  "tumble-through": "1",
  // actionCost "2" (2 slugs)
  "administer-first-aid": "2",
  "pick-a-lock": "2",
  // actionCost "reaction" (1 slug)
  "grab-an-edge": "reaction",
};

function humanizeSlug(slug: string): string {
  return slug
    .split("-")
    .filter((part) => part.length > 0)
    .map(capitalize)
    .join(" ");
}

// ---------------------------------------------------------------------------
// D29-50 (P4.5 S5) — the tan "in-world artifact" callout ornament (style doc
// §3.2): a thin double-hairline rule bracketing the box top+bottom, flared
// into a small inward-pointing chevron at both ends. The corpus's
// `CodexNode` taxonomy has no flavor-vs-mechanical distinction on `aside`/
// resolved `embed` nodes (both just render generic block content), so per
// the spec's own documented fallback BOTH get the tan family here — the
// blue family (informational notices) is reserved for the edition banner +
// the facet drawer's superseded explainer (`editionBanner.tsx`/
// `FacetPanel.tsx`), never this renderer. Rendered as an inline SVG (never a
// unicode glyph — the spec's explicit binding) so it scales cleanly with the
// callout's own width via `preserveAspectRatio="none"`.
// ---------------------------------------------------------------------------

function CalloutTanRule(): ReactElement {
  return (
    <svg
      className="codex-callout-tan-rule"
      viewBox="0 0 100 6"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <line x1="6" y1="1.6" x2="94" y2="1.6" />
      <line x1="6" y1="4.4" x2="94" y2="4.4" />
      <path d="M6 0 L0.5 3 L6 6" fill="none" />
      <path d="M94 0 L99.5 3 L94 6" fill="none" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// embed inlining (D29-25)
// ---------------------------------------------------------------------------

function embedLink(targetId: string, display: string, key: number): ReactNode {
  return (
    <a key={key} href={`/${targetId}`} data-crossref="" data-crossref-target={targetId}>
      {display}
    </a>
  );
}

/** Whether `renderEmbed` will produce the BLOCK-level `codex-embed-card` div
 * for this node under this ctx (vs. an inline span/link) — the exact same
 * three conditions `renderEmbed` checks below, factored out so the B2
 * paragraph-wrapper guard can ask the question without duplicating (and
 * risking drifting from) that decision. `resolveEmbed` is an injected, pure,
 * in-memory lookup (D29-25) — calling it here too is cheap, no I/O. */
function embedRendersAsBlock(node: Extract<CodexNode, { kind: "embed" }>, ctx: RenderCtx): boolean {
  if (!node.resolved) return false;
  if (!ctx.resolveEmbed(node.target)) return false;
  if (ctx.embedDepth > 0 || ctx.visitedEmbeds.has(node.target)) return false;
  return true;
}

function renderEmbed(
  node: Extract<CodexNode, { kind: "embed" }>,
  key: number,
  ctx: RenderCtx,
): ReactNode {
  const fallbackText = node.display ?? node.target;
  if (!node.resolved) {
    return (
      <span key={key} data-embed-unresolved="">
        {fallbackText}
      </span>
    );
  }
  const target = ctx.resolveEmbed(node.target);
  if (!target) {
    // Defensive fail-soft: `resolved: true` but the injected resolver has no
    // data for it (e.g. a fixture/dev gap) — same rendering as unresolved.
    return (
      <span key={key} data-embed-unresolved="">
        {fallbackText}
      </span>
    );
  }
  if (ctx.embedDepth > 0 || ctx.visitedEmbeds.has(node.target)) {
    // D29-25 depth cap + cycle guard: already inside an inlined body ->
    // render as a crossref-style link, never expand further.
    return embedLink(node.target, node.display ?? target.name, key);
  }
  const childCtx: RenderCtx = {
    ...ctx,
    embedDepth: ctx.embedDepth + 1,
    visitedEmbeds: new Set([...ctx.visitedEmbeds, node.target]),
  };
  return (
    <div key={key} className="codex-embed-card" data-embed-source={node.target}>
      <CalloutTanRule />
      <div className="codex-callout-tan-body">
        {renderNodes(target.body, childCtx)}
        <a href={`/${node.target}`} className="codex-embed-source-link" data-crossref="">
          source: {target.name}
        </a>
      </div>
      <CalloutTanRule />
    </div>
  );
}

// ---------------------------------------------------------------------------
// the total switch
// ---------------------------------------------------------------------------

function renderNode(node: CodexNode, key: number, ctx: RenderCtx): ReactNode {
  switch (node.kind) {
    // ---- inline leaves ----
    case "text": {
      let out: ReactNode = node.content;
      if (node.marks.superscript) out = <sup key={key}>{out}</sup>;
      if (node.marks.italic) out = <em key={key}>{out}</em>;
      if (node.marks.bold) out = <strong key={key}>{out}</strong>;
      return out;
    }
    case "crossref":
      return (
        <a
          key={key}
          href={`/${node.targetId}`}
          data-crossref=""
          data-crossref-target={node.targetId}
        >
          {node.display}
        </a>
      );
    case "brokenRef":
      // D29-2: NEVER a link — a plain span of the display text.
      return (
        <span key={key} data-broken-ref="">
          {node.display}
        </span>
      );
    case "check": {
      const parts: string[] = [];
      if (node.dc !== undefined) parts.push(`DC ${node.dc}`);
      parts.push(capitalize(node.type));
      const auto = parts.join(" ") + (node.basic ? " (basic)" : "");
      return (
        <span key={key} className="codex-check">
          {node.label ?? auto}
        </span>
      );
    }
    case "damage":
      return (
        <span key={key} className="codex-damage">
          {node.label ?? node.display}
        </span>
      );
    case "inlineRoll":
      return (
        <span key={key} className="codex-inline-roll">
          {node.label ?? node.formula}
        </span>
      );
    case "inlineAction": {
      const text = node.label ?? humanizeSlug(node.action);
      const cost = ACTION_COST_BY_SLUG[node.action];
      if (cost !== undefined) {
        return (
          <span key={key} className="codex-inline-action">
            <CodexActionGlyph raw={cost} /> {text}
          </span>
        );
      }
      return (
        <span key={key} className="codex-inline-action">
          {text}
        </span>
      );
    }
    case "template": {
      const auto = `${node.distance}-foot ${node.shape}`;
      return (
        <span key={key} className="codex-template">
          {node.label ?? auto}
        </span>
      );
    }
    case "embed":
      return renderEmbed(node, key, ctx);
    case "actionGlyph":
      return <CodexActionGlyph key={key} raw={node.cost} />;
    case "localizedBoilerplate":
      // Render children in place — the B2 guard lives in the PARENT
      // paragraph (it must decide its own wrapper tag), not here. A KEYED
      // Fragment (not the bare `<>` shorthand, which can't carry a key) —
      // otherwise this node's inner `renderNodes` keys (0, 1, 2, ...) can
      // collide with a SIBLING's own keys once React flattens the two
      // sibling arrays together at the parent level.
      return <Fragment key={key}>{renderNodes(node.children, ctx)}</Fragment>;

    // ---- block/structural ----
    case "paragraph": {
      const Tag = paragraphCarriesBlockContent(node.children, ctx) ? "div" : "p";
      return (
        <Tag key={key} className={Tag === "div" ? "codex-content" : undefined}>
          {renderNodes(node.children, ctx)}
        </Tag>
      );
    }
    case "heading": {
      const depth = Math.min(Math.max(node.level, 1), 6);
      const Tag = `h${depth}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      return (
        <Tag key={key} className="codex-heading">
          {renderNodes(node.children, ctx)}
          {node.meta !== undefined ? <span className="codex-heading-meta">{node.meta}</span> : null}
        </Tag>
      );
    }
    case "list": {
      const Tag = node.ordered ? "ol" : "ul";
      return (
        <Tag key={key}>
          {node.items.map((item, i) => (
            <li key={i}>{renderNodes(item, ctx)}</li>
          ))}
        </Tag>
      );
    }
    case "table":
      return (
        <table key={key}>
          {node.caption ? <caption>{renderNodes(node.caption, ctx)}</caption> : null}
          <tbody>
            {node.rows.map((row, r) => (
              <tr key={r}>
                {row.cells.map((cell, c) =>
                  row.header ? (
                    <th key={c}>{renderNodes(cell, ctx)}</th>
                  ) : (
                    <td key={c}>{renderNodes(cell, ctx)}</td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "blockquote":
      // Corpus-extinct (KNOWN_EXTINCT_KINDS, spec §1 amendment) — unit-covered
      // via a synthetic node only; still a real, total case here.
      return <blockquote key={key}>{renderNodes(node.children, ctx)}</blockquote>;
    case "divider":
      return <hr key={key} />;
    case "aside":
      return (
        <div key={key} className="codex-card codex-card-inset codex-aside">
          <CalloutTanRule />
          <div className="codex-callout-tan-body">{renderNodes(node.children, ctx)}</div>
          <CalloutTanRule />
        </div>
      );

    default: {
      // Totality guarantee (D29-24): never throw. The 18-member union is
      // exhaustive today, but a future corpus-schema kind reaching here
      // (or, in tests, a deliberately malformed node) still degrades to a
      // visible, non-throwing chip — the gothic `ErrorChip` idiom, wrapped so
      // the markup also carries `data-render-error` (ErrorChip itself has no
      // `data-*`, only `role="note"`/`title`).
      const unknown = node as { kind: string };
      const message = `?${unknown.kind}`;
      return (
        <span key={key} data-render-error="">
          <ErrorChip message={message} />
        </span>
      );
    }
  }
}

/** Render a list of `CodexNode`s to React. Pure, total (never throws). */
export function renderNodes(nodes: readonly CodexNode[], ctx: RenderCtx): ReactNode {
  return nodes.map((node, i) => renderNode(node, i, ctx));
}

// ---------------------------------------------------------------------------
// S2: collectEmbedTargetIds — the loader-side embed-inlining companion to
// renderEmbed above. Walks a node list the SAME way `renderNodes` structurally
// would (mirrors `paragraphCarriesBlockContent`'s traversal shape) and collects
// every RESOLVED embed's target id, WITHOUT recursing into another embed's own
// (not-yet-fetched) body — exactly the depth-0 target set D29-25's inlining pass
// needs prefetched. Pure — no fs/server dependency, so it's unit-testable here
// alongside the renderer, even though only the S2 corpus-reading server fn calls
// it in production.
// ---------------------------------------------------------------------------

function walkEmbedTargets(node: CodexNode, into: Set<string>): void {
  switch (node.kind) {
    case "embed":
      if (node.resolved) into.add(node.target);
      return;
    case "paragraph":
    case "heading":
      for (const c of node.children) walkEmbedTargets(c, into);
      return;
    case "list":
      for (const item of node.items) for (const c of item) walkEmbedTargets(c, into);
      return;
    case "table":
      for (const row of node.rows) {
        for (const cell of row.cells) for (const c of cell) walkEmbedTargets(c, into);
      }
      if (node.caption) for (const c of node.caption) walkEmbedTargets(c, into);
      return;
    case "blockquote":
    case "aside":
      for (const c of node.children) walkEmbedTargets(c, into);
      return;
    case "localizedBoilerplate":
      for (const c of node.children) walkEmbedTargets(c, into);
      return;
    case "statRow":
      // P10 (D29-94): cells are InlineNode[][] — embed prefetch must still see
      // them (a resolved embed inside a cell needs the same depth-0 prefetch
      // as one inside a paragraph).
      for (const cell of node.cells) for (const c of cell) walkEmbedTargets(c, into);
      return;
    default:
      return; // divider + every other leaf inline kind carries no embeds
  }
}

/** Every distinct RESOLVED embed target id reachable at depth 0 in `nodes`
 * (an entity's own `body`/`loreBody`, or one `EmbeddedItem.body`) — the set the
 * S2 loader prefetches via the corpus reader before rendering, per D29-25. */
export function collectEmbedTargetIds(nodes: readonly CodexNode[]): Set<string> {
  const ids = new Set<string>();
  for (const node of nodes) walkEmbedTargets(node, ids);
  return ids;
}

/** Also exported for reuse by page-shape components (statblock/facetHeader)
 * that need trait pills wired to the same injected membership set. */
export { CodexTraitPills };

// re-exported so a bare `data-render-error` never needs a separate import
// path for tests asserting the totality gate.
export const RENDER_ERROR_ATTR = "data-render-error";
export { ErrorChip };
