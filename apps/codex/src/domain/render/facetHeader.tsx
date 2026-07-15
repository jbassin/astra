import type { ReactElement, ReactNode } from "react";

import type { CodexEntity } from "../../schema/entity";
import { CodexActionGlyph } from "./actionGlyph";
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
// spell
// ---------------------------------------------------------------------------

export function SpellFacetHeader({ entity }: { entity: CodexEntity }): ReactElement | null {
  const f = entity.facets;
  const parts: ReactNode[] = [];
  if (f.rank !== undefined) {
    parts.push(f.rank === 0 ? <Part key="rank">Cantrip</Part> : <Part label="Rank">{f.rank}</Part>);
  }
  if (f.traditions !== undefined && f.traditions.length > 0) {
    parts.push(
      <Part key="traditions" label="Traditions">
        {f.traditions.join(", ")}
      </Part>,
    );
  }
  if (f.castTime !== undefined) {
    parts.push(
      <Part key="cast" label="Cast">
        {f.castTime}
      </Part>,
    );
  }
  if (f.range !== undefined) {
    parts.push(
      <Part key="range" label="Range">
        {f.range}
      </Part>,
    );
  }
  if (f.area !== undefined) {
    parts.push(
      <Part key="area" label="Area">
        {f.area}
      </Part>,
    );
  }
  if (f.duration !== undefined) {
    parts.push(
      <Part key="duration" label="Duration">
        {f.duration}
      </Part>,
    );
  }
  if (f.defense !== undefined) {
    parts.push(
      <Part key="defense" label="Defense">
        {f.defense}
      </Part>,
    );
  }
  if (parts.length === 0) return null;
  return <PartsRow parts={parts} />;
}

// ---------------------------------------------------------------------------
// equipment family (weapon/armor/shield/equipment/consumable/treasure)
// ---------------------------------------------------------------------------

export function EquipmentFacetHeader({ entity }: { entity: CodexEntity }): ReactElement | null {
  const f = entity.facets;
  const parts: ReactNode[] = [];
  if (f.price !== undefined) {
    parts.push(
      <Part key="price" label="Price">
        {f.price}
      </Part>,
    );
  }
  if (f.bulk !== undefined) {
    parts.push(
      <Part key="bulk" label="Bulk">
        {f.bulk}
      </Part>,
    );
  }
  if (f.hands !== undefined) {
    parts.push(
      <Part key="hands" label="Hands">
        {f.hands}
      </Part>,
    );
  }
  if (f.usage !== undefined) {
    parts.push(
      <Part key="usage" label="Usage">
        {f.usage.replace(/-/g, " ")}
      </Part>,
    );
  }
  if (f.itemCategory !== undefined) {
    parts.push(<Part key="category">{capitalizeCategory(f.itemCategory)}</Part>);
  }
  if (parts.length === 0) return null;
  return <PartsRow parts={parts} />;
}

function capitalizeCategory(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// feat
// ---------------------------------------------------------------------------

export function FeatFacetHeader({ entity }: { entity: CodexEntity }): ReactElement | null {
  const f = entity.facets;
  const hasAny =
    f.featLevel !== undefined || f.prerequisites !== undefined || f.actionCost !== undefined;
  if (!hasAny) return null;
  const parts: ReactNode[] = [];
  if (f.featLevel !== undefined) {
    parts.push(
      <Part key="feat" label="Feat">
        {f.featLevel}
      </Part>,
    );
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
  }
  return <PartsRow parts={parts} />;
}

// ---------------------------------------------------------------------------
// generic (everything else): populated scalar facets as a compact key→value
// line, EXCLUDING the featLevel/rank spillover pair (spec: "is NOT rendered
// outside its home group").
// ---------------------------------------------------------------------------

const SPILLOVER_KEYS: ReadonlySet<string> = new Set(["featLevel", "rank"]);

function fmtFacetValue(v: unknown): string | null {
  if (Array.isArray(v)) {
    const joined = v
      .filter((x) => x !== null && x !== undefined)
      .map(String)
      .join(", ");
    return joined.length > 0 ? joined : null;
  }
  if (v === null || v === undefined) return null;
  return String(v);
}

export function GenericFacetLine({ entity }: { entity: CodexEntity }): ReactElement | null {
  const entries = Object.entries(entity.facets).filter(([key]) => !SPILLOVER_KEYS.has(key));
  const parts: ReactNode[] = entries
    .map(([key, value]) => {
      const text = fmtFacetValue(value);
      if (text === null) return null;
      // The generic key->value convention keeps its original "Key: value"
      // colon punctuation (unlike the spell/feat/equipment headers' bare
      // "Label value" grammar) — appended to the bold label itself so the
      // colon reads as part of the label, not the value.
      return (
        <Part key={key} label={`${humanizeFacetKey(key)}:`}>
          {text}
        </Part>
      );
    })
    .filter((p): p is ReactElement => p !== null);
  if (parts.length === 0) return null;
  return <PartsRow parts={parts} />;
}
