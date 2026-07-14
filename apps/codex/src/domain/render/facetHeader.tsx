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

// ---------------------------------------------------------------------------
// spell
// ---------------------------------------------------------------------------

export function SpellFacetHeader({ entity }: { entity: CodexEntity }): ReactElement | null {
  const f = entity.facets;
  const parts: string[] = [];
  if (f.rank !== undefined) parts.push(f.rank === 0 ? "Cantrip" : `Rank ${f.rank}`);
  if (f.traditions !== undefined && f.traditions.length > 0) parts.push(f.traditions.join(", "));
  if (f.castTime !== undefined) parts.push(`Cast ${f.castTime}`);
  if (f.range !== undefined) parts.push(`Range ${f.range}`);
  if (f.area !== undefined) parts.push(`Area ${f.area}`);
  if (f.duration !== undefined) parts.push(`Duration ${f.duration}`);
  if (f.defense !== undefined) parts.push(`Defense ${f.defense}`);
  if (parts.length === 0) return null;
  return <Row>{parts.join(" | ")}</Row>;
}

// ---------------------------------------------------------------------------
// equipment family (weapon/armor/shield/equipment/consumable/treasure)
// ---------------------------------------------------------------------------

export function EquipmentFacetHeader({ entity }: { entity: CodexEntity }): ReactElement | null {
  const f = entity.facets;
  const parts: string[] = [];
  if (f.price !== undefined) parts.push(`Price ${f.price}`);
  if (f.bulk !== undefined) parts.push(`Bulk ${f.bulk}`);
  if (f.hands !== undefined) parts.push(`Hands ${f.hands}`);
  if (f.usage !== undefined) parts.push(`Usage ${f.usage.replace(/-/g, " ")}`);
  if (f.itemCategory !== undefined) parts.push(capitalizeCategory(f.itemCategory));
  if (parts.length === 0) return null;
  return <Row>{parts.join(" | ")}</Row>;
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
  return (
    <Row>
      {f.featLevel !== undefined ? (
        <span className="codex-feat-level">Feat {f.featLevel}</span>
      ) : null}{" "}
      {f.actionCost !== undefined ? <CodexActionGlyph raw={f.actionCost} /> : null}{" "}
      {f.prerequisites !== undefined && f.prerequisites.length > 0 ? (
        <span className="codex-feat-prereqs">Prerequisites {f.prerequisites.join(", ")}</span>
      ) : null}
    </Row>
  );
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
  const rendered = entries
    .map(([key, value]) => {
      const text = fmtFacetValue(value);
      return text !== null ? `${humanizeFacetKey(key)}: ${text}` : null;
    })
    .filter((s): s is string => s !== null);
  if (rendered.length === 0) return null;
  return <Row>{rendered.join(" | ")}</Row>;
}
