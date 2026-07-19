import type { ReactElement, ReactNode } from "react";

import type { CodexEntity } from "../../schema/entity";
import { formatFacetValue } from "../browse/formatFacetValue";
import { CodexActionGlyph } from "./actionGlyph";
import { type RenderCtx, renderNodes } from "./nodes";
import { humanizeFacetKey } from "./text";

/**
 * D29-26 — the spell/equipment-family/feat facet headers, plus the generic
 * scalar-facet key→value line for the other ~80 categories. Every group
 * reads NAMED fields explicitly (never a wholesale `facets` dump) — the
 * "Facet-spillover quirk" (spec) means `featLevel`/`rank` mirror `level` on
 * every Foundry-merged entity, so a header outside its home group must not
 * accidentally pick those up.
 */

function Row({ children }: { children: ReactNode }): ReactElement {
  return <div className="codex-facet-row">{children}</div>;
}

/**
 * D29-50 (P4.5 S5) — the style doc §3.8 discipline: "bold = mechanical
 * label, italic = narrative emphasis." Every populated facet on these
 * headers is a mechanical label/value pair (Traditions, Cast, Price,
 * Prerequisites, ...), so each part renders as a bold body-serif label
 * (`<strong>`) followed by its plain-weight value — the SAME grammar
 * `statblock.tsx`'s `Row`/`codex-stat-label` already uses, extended here to
 * the facet-header lines that used to be un-labeled joined strings (the
 * plain "Feat 13 passive Prerequisites..." line the spec calls out by
 * name). A bare value with no natural label (e.g. a spell's trait-tradition
 * list has no separate label word beyond its own header) still renders
 * plain, unlabeled — not every part needs a `label`.
 */
function Part({ label, children }: { label?: string; children: ReactNode }): ReactElement {
  return (
    <span className="codex-facet-part">
      {label !== undefined ? <strong className="codex-facet-label">{label}</strong> : null}
      {label !== undefined ? " " : null}
      {children}
    </span>
  );
}

/** Joins an array of already-rendered `Part`s with the style doc's own
 * " | " separator (a plain text node between spans, not a border/rule —
 * matches the original joined-string look this replaces). */
function PartsRow({ parts }: { parts: readonly ReactNode[] }): ReactElement {
  return (
    <Row>
      {parts.map((part, i) => (
        // Index-keyed: a fixed-shape, never-reordered per-render array of
        // facet parts with no natural id (same idiom as this directory's
        // other corpus-array renderers — `no-array-index-key` is off
        // repo-wide for `codex/src/domain/render/**`, `.oxlintrc.json`).
        <span key={i}>
          {i > 0 ? <span className="codex-facet-sep"> | </span> : null}
          {part}
        </span>
      ))}
    </Row>
  );
}

// ---------------------------------------------------------------------------
// D29-62 (R3, P6): mastheadExtra — the AoN masthead's non-"Source" bold-label
// lines the ingest-time structural strip pulled out of `body`, re-surfaced
// here. Shared by every one of the 5 category-group render sites below
// (D29-62's own "written total, not category-gated" instruction) rather than
// duplicated per component — `value`'s rich inline content (crossrefs, ...)
// renders via the SAME `renderNodes`-family renderer the body already uses.
//
// IMPLEMENTATION-TIME FIX (P6 Track A): D29-62's own worked examples name
// fields — spell's Traditions/Range, armor's Bulk/Price — that are ALSO
// already-typed `Facets` fields these same headers render directly. A naive
// "always append every collected pair" (D29-62's literal wording) produces a
// visible duplicate label for any entity where both are populated (verified
// live: `spell/heal` shows "Traditions" and "Range" TWICE — once from the
// typed facet with the plain Foundry string, once from `mastheadExtra` with
// the richer AoN crossref-bearing version; `armor/breastplate` shows "Price"
// and "Bulk" twice; `feat/camouflage-coat` shows "Prerequisites" twice — a
// real, common case, not a rare edge). Each header now tracks the
// (normalized) labels its OWN typed parts already used and filters
// `mastheadExtra` against that set before appending — de-duplicated by
// LABEL, not by field name, so it needs no per-category field-name mapping
// and generalizes to every header uniformly. Fields with no typed-facet
// counterpart at all (Bloodline/Target/AC Bonus/Category/Group/Cost/Primary
// Check/...) are entirely unaffected — they were never in a header's own
// label set, so they still render as the new information D29-62 intends.
// ---------------------------------------------------------------------------

const EMPTY_LABELS: ReadonlySet<string> = new Set();

/** Case/whitespace/trailing-colon-insensitive label comparison — the
 * Generic header's own labels carry a trailing ":" (its "Key: value"
 * grammar) that the masthead's bold label text never does. */
function normLabel(s: string): string {
  return s.trim().toLowerCase().replace(/:$/, "");
}

function mastheadExtraParts(
  entity: CodexEntity,
  ctx: RenderCtx,
  shownLabels: ReadonlySet<string> = EMPTY_LABELS,
): ReactElement[] {
  if (entity.mastheadExtra === undefined) return [];
  return entity.mastheadExtra
    .filter((pair) => !shownLabels.has(normLabel(pair.label)))
    .map((pair, i) => (
      // Index-keyed (post-filter): a fixed-shape, never-reordered per-render
      // array with no natural id — same idiom as `PartsRow`'s own key
      // comment above.
      <Part key={`masthead-${i}`} label={pair.label}>
        {renderNodes(pair.value, ctx)}
      </Part>
    ));
}

/** The fifth D29-62 call site: `creature`/`hazard` groups render their own
 * `Statblock` component instead of one of the 4 typed facet headers below —
 * this renders `mastheadExtra` for them (not expected per R3's own scope,
 * but written total so nothing silently drops if it ever happens). Neither
 * statblock names a "label" the way the 4 headers below do, so there's no
 * typed-label set to de-dup against here. */
export function MastheadExtraFallback({
  entity,
  ctx,
}: {
  entity: CodexEntity;
  ctx: RenderCtx;
}): ReactElement | null {
  const parts = mastheadExtraParts(entity, ctx);
  if (parts.length === 0) return null;
  return <PartsRow parts={parts} />;
}

// ---------------------------------------------------------------------------
// spell
// ---------------------------------------------------------------------------

export function SpellFacetHeader({
  entity,
  ctx,
}: {
  entity: CodexEntity;
  ctx: RenderCtx;
}): ReactElement | null {
  const f = entity.facets;
  const parts: ReactNode[] = [];
  const shownLabels = new Set<string>();
  if (f.rank !== undefined) {
    if (f.rank === 0) {
      parts.push(<Part key="rank">Cantrip</Part>);
    } else {
      parts.push(<Part label="Rank">{f.rank}</Part>);
      shownLabels.add("rank");
    }
  }
  if (f.traditions !== undefined && f.traditions.length > 0) {
    parts.push(
      <Part key="traditions" label="Traditions">
        {f.traditions.join(", ")}
      </Part>,
    );
    shownLabels.add("traditions");
  }
  if (f.castTime !== undefined) {
    parts.push(
      <Part key="cast" label="Cast">
        {f.castTime}
      </Part>,
    );
    shownLabels.add("cast");
  }
  if (f.range !== undefined) {
    parts.push(
      <Part key="range" label="Range">
        {f.range}
      </Part>,
    );
    shownLabels.add("range");
  }
  if (f.area !== undefined) {
    parts.push(
      <Part key="area" label="Area">
        {f.area}
      </Part>,
    );
    shownLabels.add("area");
  }
  if (f.duration !== undefined) {
    parts.push(
      <Part key="duration" label="Duration">
        {f.duration}
      </Part>,
    );
    shownLabels.add("duration");
  }
  if (f.defense !== undefined) {
    parts.push(
      <Part key="defense" label="Defense">
        {f.defense}
      </Part>,
    );
    shownLabels.add("defense");
  }
  parts.push(...mastheadExtraParts(entity, ctx, shownLabels));
  if (parts.length === 0) return null;
  return <PartsRow parts={parts} />;
}

// ---------------------------------------------------------------------------
// equipment family (weapon/armor/shield/equipment/consumable/treasure)
// ---------------------------------------------------------------------------

export function EquipmentFacetHeader({
  entity,
  ctx,
}: {
  entity: CodexEntity;
  ctx: RenderCtx;
}): ReactElement | null {
  const f = entity.facets;
  const parts: ReactNode[] = [];
  const shownLabels = new Set<string>();
  if (f.price !== undefined) {
    parts.push(
      <Part key="price" label="Price">
        {f.price}
      </Part>,
    );
    shownLabels.add("price");
  }
  if (f.bulk !== undefined) {
    parts.push(
      <Part key="bulk" label="Bulk">
        {f.bulk}
      </Part>,
    );
    shownLabels.add("bulk");
  }
  if (f.hands !== undefined) {
    parts.push(
      <Part key="hands" label="Hands">
        {f.hands}
      </Part>,
    );
    shownLabels.add("hands");
  }
  if (f.usage !== undefined) {
    parts.push(
      <Part key="usage" label="Usage">
        {f.usage.replace(/-/g, " ")}
      </Part>,
    );
    shownLabels.add("usage");
  }
  if (f.itemCategory !== undefined) {
    parts.push(<Part key="category">{capitalizeCategory(f.itemCategory)}</Part>);
  }
  if (f.itemSubcategory !== undefined) {
    parts.push(<Part key="subcategory">{f.itemSubcategory}</Part>);
  }
  parts.push(...mastheadExtraParts(entity, ctx, shownLabels));
  if (parts.length === 0) return null;
  return <PartsRow parts={parts} />;
}

function capitalizeCategory(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// feat
// ---------------------------------------------------------------------------

export function FeatFacetHeader({
  entity,
  ctx,
}: {
  entity: CodexEntity;
  ctx: RenderCtx;
}): ReactElement | null {
  const f = entity.facets;
  const hasAny =
    f.featLevel !== undefined ||
    f.prerequisites !== undefined ||
    f.actionCost !== undefined ||
    entity.mastheadExtra !== undefined;
  if (!hasAny) return null;
  const parts: ReactNode[] = [];
  const shownLabels = new Set<string>();
  if (f.featLevel !== undefined) {
    parts.push(
      <Part key="feat" label="Feat">
        {f.featLevel}
      </Part>,
    );
    shownLabels.add("feat");
  }
  if (f.actionCost !== undefined) {
    parts.push(<Part key="cost">{<CodexActionGlyph raw={f.actionCost} />}</Part>);
  }
  if (f.prerequisites !== undefined && f.prerequisites.length > 0) {
    parts.push(
      <Part key="prereqs" label="Prerequisites">
        {f.prerequisites.join(", ")}
      </Part>,
    );
    shownLabels.add("prerequisites");
  }
  parts.push(...mastheadExtraParts(entity, ctx, shownLabels));
  return <PartsRow parts={parts} />;
}

// ---------------------------------------------------------------------------
// generic (everything else): populated scalar facets as a compact key→value
// line, EXCLUDING the featLevel/rank spillover pair (spec: "is NOT rendered
// outside its home group").
// ---------------------------------------------------------------------------

// P11 S2 (D29-104) — `itemCategory` joins the spillover set: `GenericFacetLine`
// was dumping the raw internal-taxonomy facet key ("Item Category: …") on
// every one of the ~80 other categories' pages (measured leak: 1,594
// entities/5 categories — class-feature/deity/action/familiar-ability/
// creature-ability; equipment's OWN itemCategory is unaffected, it routes to
// the bespoke `EquipmentFacetHeader` above, a separate render path this
// component never touches). `featLevel`/`rank` are the pre-existing D29-26
// spillover pair (facet-mirroring quirk on Foundry-merged entities); never a
// second set — this is the one render-side exclusion list.
const SPILLOVER_KEYS: ReadonlySet<string> = new Set(["featLevel", "rank", "itemCategory"]);

/**
 * P14 S2 (D29-138) — routes every generic-group facet VALUE through the P13
 * humanizer (`formatFacetValue`) instead of a bare `String(v)`: fixes raw
 * Foundry/enum codes like ancestry/vehicle/warfare-army's `size: "med"`
 * showing as "Size: med" instead of "Size: Medium", plus the
 * stringified-list leak ("['arcane', 'divine']") on any array-typed facet.
 * `formatFacetValue` is zero-import/pure (its own file header); imported
 * directly rather than `facetDefs.ts`'s heavier `humanizedLabelFor` (spec's
 * own layering note — `domain/render` already imports from `domain/browse`
 * elsewhere, `EntityHeader.tsx`/`ClassPage.tsx`, an established seam, not a
 * new one). An array humanizes EACH element independently (then joins with
 * ", ") rather than the whole array as one blob — the same shape
 * `formatFacetValue`'s own internal stringified-list handling produces for
 * the string-typed case just below it. Facet KEYS/structure/styling are
 * unchanged — only the rendered VALUE text differs. */
function fmtFacetValue(v: unknown): string | null {
  if (Array.isArray(v)) {
    const parts = v
      .filter((x) => x !== null && x !== undefined)
      .map((x) => formatFacetValue(String(x)));
    return parts.length > 0 ? parts.join(", ") : null;
  }
  if (v === null || v === undefined) return null;
  return formatFacetValue(String(v));
}

/**
 * P11 S2 (D29-104) — two more generic-group facet keys need bespoke
 * (non-"Key: value") rendering rather than `fmtFacetValue`'s plain-text
 * grammar:
 *   - `valued` (condition, 42/98 carry it, `Facets.valued: boolean`) is a
 *     flag, not a labeled value — render the bare word "Valued" ONLY when
 *     `true` (never "Valued: false"/"Valued: true"); `false`/absent render
 *     nothing, same as any other unpopulated facet.
 *   - `actionCost` (the generic-group survivors of the same field
 *     `FeatFacetHeader` already special-cases, e.g. creature-ability's
 *     generic-group members) renders via `CodexActionGlyph` — the
 *     `FeatFacetHeader` idiom — instead of "Action Cost: passive" text.
 *     Recorded + accepted: the majority generic-group value is `passive`
 *     (762/1,131), which renders as the bare unlabeled glyph-span, matching
 *     `FeatFacetHeader`'s own golden-pinned rendering of the same value.
 * Returns `undefined` for any OTHER key — the caller falls through to the
 * plain generic renderer.
 */
function specialFacetPart(key: string, value: unknown): ReactElement | null | undefined {
  if (key === "valued") {
    return value === true ? <Part key="valued">Valued</Part> : null;
  }
  if (key === "actionCost") {
    if (typeof value !== "string" || value.trim() === "") return null;
    return (
      <Part key="actionCost">
        <CodexActionGlyph raw={value} />
      </Part>
    );
  }
  return undefined;
}

export function GenericFacetLine({
  entity,
  ctx,
}: {
  entity: CodexEntity;
  ctx: RenderCtx;
}): ReactElement | null {
  const entries = Object.entries(entity.facets).filter(([key]) => !SPILLOVER_KEYS.has(key));
  const shownLabels = new Set<string>();
  const parts: ReactNode[] = entries
    .map(([key, value]) => {
      const special = specialFacetPart(key, value);
      if (special !== undefined) {
        if (special !== null) shownLabels.add(normLabel(humanizeFacetKey(key)));
        return special;
      }
      const text = fmtFacetValue(value);
      if (text === null) return null;
      // The generic key->value convention keeps its original "Key: value"
      // colon punctuation (unlike the spell/feat/equipment headers' bare
      // "Label value" grammar) — appended to the bold label itself so the
      // colon reads as part of the label, not the value.
      const label = humanizeFacetKey(key);
      shownLabels.add(normLabel(label));
      return (
        <Part key={key} label={`${label}:`}>
          {text}
        </Part>
      );
    })
    .filter((p): p is ReactElement => p !== null);
  parts.push(...mastheadExtraParts(entity, ctx, shownLabels));
  if (parts.length === 0) return null;
  return <PartsRow parts={parts} />;
}
