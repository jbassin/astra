import {
  type CodexEntity,
  type CodexNode,
  type InlineNode,
  capitalize,
  collectText,
} from "@astra/codex-corpus";
import { Fragment, type ReactElement, type ReactNode } from "react";

import { ErrorChip } from "../../ui";
import { type ActionCost, CodexActionGlyph } from "./actionGlyph";

/**
 * The ONE total `CodexNode -> React` renderer, mirroring gothic's
 * `mdastToReact.tsx` shape: a flat switch over all 19 `CodexNode.kind`
 * values, `renderNodes` mapping over a list, an `ErrorChip`-carrying default
 * branch that can never throw. Unlike gothic's renderer (which resolves
 * targets via React context, `CrossRefResolverContext`), the embed
 * resolver/trait-membership set here are plain function parameters threaded
 * through every recursive call (`RenderCtx`) — keeping the renderer injected,
 * pure and free of any fs/server dependency is easiest that way, and
 * it keeps every render call directly unit-testable with a synthetic ctx.
 */

// ---------------------------------------------------------------------------
// RenderCtx — the embed-inlining machinery (depth 1, cycle-guarded)
// ---------------------------------------------------------------------------

export interface RenderCtx {
  /** Resolves an embed's `targetId` to its full entity. Injected, pure — the
   * renderer has no fs/server dependency; the server wires this from the
   * corpus reader. Returning `undefined` is treated exactly like an unresolved embed
   * (fail-soft: plain text of `display`), which also covers the defensive
   * case of a `resolved: true` node whose target the resolver doesn't carry. */
  resolveEmbed: (targetId: string) => CodexEntity | undefined;
  /** Full `trait/<slug>` ids known to exist in the corpus — trait pills link
   * only when a member (an injected SET so trait-membership stays
   * pure/testable). */
  knownTraitIds: ReadonlySet<string>;
  /** Embed depth cap: 0 while rendering an entity's own top-level content;
   * >0 once inside an inlined embed's body. An embed encountered at depth > 0
   * renders as a crossref-style link, never inlined further (depth stays 1). */
  embedDepth: number;
  /** Embed cycle guard: target ids already being inlined along the current
   * chain — belt-and-suspenders alongside the depth cap (a self-referencing
   * embed at depth 0 must not recurse forever even if the depth check were
   * ever relaxed). */
  visitedEmbeds: ReadonlySet<string>;
  /** A per-PAGE heading-id assigner
   * (`headingIds.ts`'s `createHeadingIdAssigner()`), called with a
   * heading's plain text to get its `id`. Optional: a bare `rootRenderCtx`
   * call (most existing unit tests, and any future direct construction)
   * carries no assigner, so the heading case renders with no `id` at all —
   * only the page-level composition roots (`EntityRenderPane.tsx`,
   * `scripts/regen-goldens.ts`) spread a fresh one in per page, since it
   * MUST be reset per page (never shared across two different entities'
   * renders — see that file's own comment on why goldens can't just reuse
   * the shared fixture-env `ctx`). */
  headingId?: (text: string) => string;
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
 * unresolved plain text. Handy for tests/pages that don't care about embeds. */
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

/** `localizedBoilerplate` is the one INLINE kind whose
 * own `children` can hold BLOCK nodes (resolved `@Localize` values are block
 * HTML) — a naive `paragraph -> <p>` wrapping one would emit `<p><p>...</p>
 * </p>`, which the browser silently hoists (a hydration mismatch).
 * `localizedBoilerplate` needs walking here; the other INLINE kind that can
 * render as a BLOCK element is `embed` — a resolved, depth-0, not-yet-visited
 * embed renders a `<div class="codex-embed-card">` (`renderEmbed` below), so a
 * paragraph carrying one of those must also become a `<div>` (a real-corpus
 * case: `creature/red-dragon-adult`'s body places a resolved `creature-family`
 * embed inline inside prose text, producing `<p><div>...</div></p>` — invalid
 * nesting the browser silently re-parents, a hydration mismatch). Every other
 * inline kind is a true leaf (no `children` field at all). */
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

/** Foundry's `[[/act ...]]` macro vocabulary → action cost (inlineAction:
 * an action glyph where the cost is knowable, else a plain label).
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
// heading inline-run whitespace normalization
// ---------------------------------------------------------------------------

/** `true` when `prev` and `next` need a space inserted between them — i.e.
 * NEITHER already ends/starts with whitespace of its own. Never doubles an
 * existing boundary space (`"Double Brew "` + `"Level 9"` stays
 * single-spaced); reviewer-measured on the real corpus: 48 headings carry a
 * no-whitespace boundary, 0 are mid-word joins (the second run never starts
 * lowercase) — a space insertion is always correct. */
function boundaryNeedsSpace(prev: string, next: string): boolean {
  if (prev.length === 0 || next.length === 0) return false;
  return !/\s$/.test(prev) && !/^\s/.test(next);
}

/** Adjacent inline TEXT runs in a HEADING's children join with exactly one
 * space when their shared boundary carries none (`nodes.tsx`'s heading case
 * only — paragraph/inline flow elsewhere is untouched, per spec). Only
 * text-to-text boundaries are touched: a non-text neighbor (crossref, an
 * action glyph, ...) resets adjacency, same posture as every other
 * inline-node boundary in this renderer. Real corpus cause: the AoN
 * `<title right=…>` extraction sometimes splits a heading into two
 * verbatim text runs with no space of their own between them ("Chemical
 * Hardiness"+"Level 11"). */
function normalizeHeadingChildren(children: readonly InlineNode[]): InlineNode[] {
  const out: InlineNode[] = [];
  for (const child of children) {
    const prev = out.at(-1);
    if (
      prev !== undefined &&
      prev.kind === "text" &&
      child.kind === "text" &&
      boundaryNeedsSpace(prev.content, child.content)
    ) {
      out.push({ ...child, content: ` ${child.content}` });
      continue;
    }
    out.push(child);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The tan "in-world artifact" callout ornament (from the style doc): a thin
// double-hairline rule bracketing the box top+bottom, flared into a small
// inward-pointing chevron at both ends. The corpus's `CodexNode` taxonomy
// has no flavor-vs-mechanical distinction on `aside`/resolved `embed` nodes
// (both just render generic block content), so BOTH get the tan family here
// — the blue family (informational notices) is reserved for the edition
// banner + the facet drawer's superseded explainer (`editionBanner.tsx`/
// `FacetPanel.tsx`), never this renderer. Rendered as an inline SVG (never a
// unicode glyph, by design) so it scales cleanly with the
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
// embed inlining
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
 * in-memory lookup — calling it here too is cheap, no I/O. */
function embedRendersAsBlock(node: Extract<CodexNode, { kind: "embed" }>, ctx: RenderCtx): boolean {
  if (!node.resolved) return false;
  if (!ctx.resolveEmbed(node.target)) return false;
  if (ctx.embedDepth > 0 || ctx.visitedEmbeds.has(node.target)) return false;
  return true;
}

/** NEVER render `node.target` (a raw internal id/slug,
 * e.g. "class-feature/advanced-alchemy", is not user-facing prose): both
 * the genuinely-unresolved branch and the defensive resolved-but-
 * unprefetched branch below render `display ?? nothing`. Ingest captures
 * no `{label}` for `@Embed[...]` (0/2,714 real uses carry one), so this
 * fail-soft alone covers the ~6 genuinely-absent-on-AoN cases (most of which
 * also sit inside a lore section the lore suppression already removes —
 * this is the defensive floor, not the user-visible fix). */
function unresolvedEmbedFallback(display: string | undefined, key: number): ReactNode {
  if (display === undefined) return null;
  return (
    <span key={key} data-embed-unresolved="">
      {display}
    </span>
  );
}

function renderEmbed(
  node: Extract<CodexNode, { kind: "embed" }>,
  key: number,
  ctx: RenderCtx,
): ReactNode {
  if (!node.resolved) {
    return unresolvedEmbedFallback(node.display, key);
  }
  const target = ctx.resolveEmbed(node.target);
  if (!target) {
    // Defensive fail-soft: `resolved: true` but the injected resolver has no
    // data for it (e.g. a fixture/dev gap) — same rendering as unresolved.
    return unresolvedEmbedFallback(node.display, key);
  }
  if (ctx.embedDepth > 0 || ctx.visitedEmbeds.has(node.target)) {
    // Embed depth cap + cycle guard: already inside an inlined body ->
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
      // NEVER a link — a plain span of the display text.
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
      // Headings only, never paragraph/inline flow: the
      // AoN `<title right=…>` extraction (`aonMarkup.ts`) sometimes splits
      // a heading into two adjacent verbatim text runs with no whitespace
      // of their own at the boundary ("Chemical Hardiness"+"Level 11" ->
      // "Chemical HardinessLevel 11" un-normalized); normalize BEFORE
      // computing the id, so the anchor id and the visible text agree.
      const children = normalizeHeadingChildren(node.children);
      // SSR-visible anchor id, absent entirely when
      // no per-page assigner is wired (`ctx.headingId` optional, see
      // `RenderCtx`'s own doc comment).
      const id = ctx.headingId?.(collectText(children));
      return (
        <Tag key={key} id={id} className="codex-heading">
          {renderNodes(children, ctx)}
          {node.meta !== undefined ? <span className="codex-heading-meta">{node.meta}</span> : null}
        </Tag>
      );
    }
    case "list": {
      const Tag = node.ordered ? "ol" : "ul";
      return (
        <Tag key={key}>
          {node.items.map((item, i) => (
            // oxlint-disable-next-line react/no-array-index-key -- a static list in source order with no unique id; it never reorders
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
              // oxlint-disable-next-line react/no-array-index-key -- a static list in source order with no unique id; it never reorders
              <tr key={r}>
                {row.cells.map((cell, c) =>
                  row.header ? (
                    // oxlint-disable-next-line react/no-array-index-key -- a static list in source order with no unique id; it never reorders
                    <th key={c}>{renderNodes(cell, ctx)}</th>
                  ) : (
                    // oxlint-disable-next-line react/no-array-index-key -- a static list in source order with no unique id; it never reorders
                    <td key={c}>{renderNodes(cell, ctx)}</td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "blockquote":
      // Corpus-extinct (KNOWN_EXTINCT_KINDS) — unit-covered
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
    case "statRow": {
      // A collapsed AoN statblock row. `codex-stat-line` /
      // `codex-stat-line-cell` — deliberately NOT `codex-stat-row`, which is
      // ALREADY TAKEN by the structured statblock's own Row component
      // (`statblock.tsx`, styled at `globals.css` — a collision would restyle
      // pages this round doesn't touch). Each cell reuses the same
      // block-content guard a paragraph applies to its own children
      // (`paragraphCarriesBlockContent`, generic over any `CodexNode[]` —
      // cells are `InlineNode[]`, a subtype) — 0 real occurrences today
      // (cells are text+crossref only per the census), pure future-proofing
      // against re-snapshot drift.
      return (
        <div key={key} className="codex-stat-line">
          {node.cells.map((cell, c) => {
            const Tag = paragraphCarriesBlockContent(cell, ctx) ? "div" : "span";
            return (
              // oxlint-disable-next-line react/no-array-index-key -- a static list in source order with no unique id; it never reorders
              <Tag key={c} className="codex-stat-line-cell">
                {renderNodes(cell, ctx)}
              </Tag>
            );
          })}
        </div>
      );
    }

    default: {
      // Totality guarantee: never throw. The 19-member union is
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

// Exported so tests asserting the totality gate share the attribute name.
export const RENDER_ERROR_ATTR = "data-render-error";
