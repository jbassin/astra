import type { ReactElement, ReactNode } from "react";

import type { CodexEntity, EmbeddedItem, Facets } from "../../schema/entity";
import { CodexActionGlyph } from "./actionGlyph";
import { type RenderCtx, renderNodes } from "./nodes";
import { capitalize } from "./text";
import { CodexTraitPills } from "./traits";

/**
 * D29-26 — the creature/hazard statblock header (P1.6 `stats` + `facets`) and
 * the embedded-item sections (strikes/spellcasting/actions) shared by any
 * Actor-derived entity, not just creature/hazard (spec: "embeddedItems on
 * non-creature actors (vehicle etc.) render via the same grouped sections").
 * Every row is read from a NAMED field explicitly and omitted when absent —
 * fail-soft, never "undefined" text (D29-26).
 */

function fmtMod(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

function Row({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div className="codex-stat-row">
      <span className="codex-stat-label">{label}</span> {children}
    </div>
  );
}

/** A stat row with no single natural label (e.g. "AC 20, Fort +14, Ref +8"). */
function PlainRow({ children }: { children: ReactNode }): ReactElement {
  return <div className="codex-stat-row">{children}</div>;
}

// ---------------------------------------------------------------------------
// creature
// ---------------------------------------------------------------------------

function PerceptionSensesRow({ entity }: { entity: CodexEntity }): ReactElement | null {
  const senses = entity.stats?.kind === "creature" ? entity.stats.senses : undefined;
  const perception = senses?.mod ?? entity.facets.perception;
  if (perception === undefined && senses === undefined) return null;
  const list = senses?.list ?? [];
  const parts: string[] = [];
  if (perception !== undefined) parts.push(fmtMod(perception));
  if (senses?.details !== undefined) parts.push(senses.details);
  for (const s of list) {
    const acuity = s.acuity !== undefined ? `${s.acuity} ` : "";
    const range = s.range !== undefined ? ` ${s.range} feet` : "";
    parts.push(`${acuity}${s.type}${range}`);
  }
  return <Row label="Perception">{parts.join(", ")}</Row>;
}

function LanguagesRow({ entity }: { entity: CodexEntity }): ReactElement | null {
  const languages = entity.stats?.kind === "creature" ? entity.stats.languages : undefined;
  if (!languages || languages.length === 0) return null;
  return <Row label="Languages">{languages.map(capitalize).join(", ")}</Row>;
}

function SkillsRow({ entity }: { entity: CodexEntity }): ReactElement | null {
  const skills = entity.stats?.kind === "creature" ? entity.stats.skills : undefined;
  if (!skills || Object.keys(skills).length === 0) return null;
  const parts = Object.entries(skills).map(([name, mod]) => `${capitalize(name)} ${fmtMod(mod)}`);
  return <Row label="Skills">{parts.join(", ")}</Row>;
}

const ABILITY_ORDER = ["str", "dex", "con", "int", "wis", "cha"] as const;

function AbilityModsRow({ entity }: { entity: CodexEntity }): ReactElement | null {
  const mods = entity.stats?.kind === "creature" ? entity.stats.abilityMods : undefined;
  if (!mods || Object.keys(mods).length === 0) return null;
  const parts = ABILITY_ORDER.filter((k) => mods[k] !== undefined).map(
    (k) => `${k.toUpperCase()} ${fmtMod(mods[k] as number)}`,
  );
  return <PlainRow>{parts.join(", ")}</PlainRow>;
}

function AcSavesRow({ facets }: { facets: Facets }): ReactElement | null {
  const parts: string[] = [];
  if (facets.ac !== undefined) parts.push(`AC ${facets.ac}`);
  if (facets.fortitudeSave !== undefined) parts.push(`Fort ${fmtMod(facets.fortitudeSave)}`);
  if (facets.reflexSave !== undefined) parts.push(`Ref ${fmtMod(facets.reflexSave)}`);
  if (facets.willSave !== undefined) parts.push(`Will ${fmtMod(facets.willSave)}`);
  if (parts.length === 0) return null;
  return <PlainRow>{parts.join(", ")}</PlainRow>;
}

function HpImmunitiesRow({ entity }: { entity: CodexEntity }): ReactElement | null {
  const stats = entity.stats?.kind === "creature" ? entity.stats : undefined;
  const parts: string[] = [];
  if (entity.facets.hp !== undefined) parts.push(`HP ${entity.facets.hp}`);
  if (stats?.immunities && stats.immunities.length > 0) {
    parts.push(`Immunities ${stats.immunities.join(", ")}`);
  }
  if (stats?.resistances && stats.resistances.length > 0) {
    parts.push(
      `Resistances ${stats.resistances.map((r) => (r.value !== undefined ? `${r.type} ${r.value}` : r.type)).join(", ")}`,
    );
  }
  if (stats?.weaknesses && stats.weaknesses.length > 0) {
    parts.push(
      `Weaknesses ${stats.weaknesses.map((w) => (w.value !== undefined ? `${w.type} ${w.value}` : w.type)).join(", ")}`,
    );
  }
  if (parts.length === 0) return null;
  return <PlainRow>{parts.join("; ")}</PlainRow>;
}

function SpeedsRow({ entity }: { entity: CodexEntity }): ReactElement | null {
  const speeds = entity.stats?.kind === "creature" ? entity.stats.speeds : undefined;
  if (!speeds) return null;
  const parts: string[] = [];
  if (speeds.base !== undefined) parts.push(`${speeds.base} feet`);
  for (const s of speeds.other ?? []) parts.push(`${s.type} ${s.value} feet`);
  if (parts.length === 0) return null;
  return <Row label="Speed">{parts.join(", ")}</Row>;
}

export function CreatureStatblock({ entity }: { entity: CodexEntity }): ReactElement {
  return (
    <section className="codex-card codex-card-stat codex-statblock" data-kind="creature">
      <PerceptionSensesRow entity={entity} />
      <LanguagesRow entity={entity} />
      <SkillsRow entity={entity} />
      <AbilityModsRow entity={entity} />
      <AcSavesRow facets={entity.facets} />
      <HpImmunitiesRow entity={entity} />
      <SpeedsRow entity={entity} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// hazard
// ---------------------------------------------------------------------------

export function HazardStatblock({
  entity,
  ctx,
}: {
  entity: CodexEntity;
  ctx: RenderCtx;
}): ReactElement {
  const stats = entity.stats?.kind === "hazard" ? entity.stats : undefined;
  const parts: string[] = [];
  if (stats?.isComplex !== undefined) parts.push(stats.isComplex ? "Complex" : "Simple");
  if (stats?.stealth?.value !== undefined) {
    const detail = stats.stealth.details !== undefined ? ` (${stats.stealth.details})` : "";
    parts.push(`Stealth ${fmtMod(stats.stealth.value)}${detail}`);
  }
  if (stats?.hardness !== undefined) parts.push(`Hardness ${stats.hardness}`);
  return (
    <section className="codex-card codex-card-stat codex-statblock" data-kind="hazard">
      <AcSavesRow facets={entity.facets} />
      {entity.facets.hp !== undefined ? <PlainRow>{`HP ${entity.facets.hp}`}</PlainRow> : null}
      {parts.length > 0 ? <PlainRow>{parts.join(", ")}</PlainRow> : null}
      {stats?.disable !== undefined ? (
        <div className="codex-hazard-disable">
          <span className="codex-stat-label">Disable</span> {renderNodes(stats.disable, ctx)}
        </div>
      ) : null}
      {stats?.routine !== undefined ? (
        <div className="codex-hazard-routine">
          <span className="codex-stat-label">Routine</span> {renderNodes(stats.routine, ctx)}
        </div>
      ) : null}
      {stats?.reset !== undefined ? (
        <div className="codex-hazard-reset">
          <span className="codex-stat-label">Reset</span> {renderNodes(stats.reset, ctx)}
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// embedded-item sections (D29-26: shared by creature/hazard AND any other
// Actor-derived entity carrying `embeddedItems`, e.g. vehicle)
// ---------------------------------------------------------------------------

function StrikeRow({ item, ctx }: { item: EmbeddedItem; ctx: RenderCtx }): ReactElement {
  return (
    <div className="codex-strike">
      <CodexActionGlyph raw="1" /> <strong>{item.name}</strong>{" "}
      {item.attackBonus !== undefined ? fmtMod(item.attackBonus) : null}{" "}
      <CodexTraitPills traits={item.traits} knownTraitIds={ctx.knownTraitIds} />
      {item.damage !== undefined && item.damage.length > 0 ? (
        <span className="codex-strike-damage"> {item.damage.join(" plus ")}</span>
      ) : null}
    </div>
  );
}

function SpellcastingEntrySection({
  entry,
  spells,
}: {
  entry: EmbeddedItem;
  spells: readonly EmbeddedItem[];
}): ReactElement {
  const byLevel = new Map<number, EmbeddedItem[]>();
  for (const s of spells) {
    const level = s.level ?? 0;
    const arr = byLevel.get(level) ?? [];
    arr.push(s);
    byLevel.set(level, arr);
  }
  const levels = [...byLevel.keys()].sort((a, b) => b - a);
  return (
    <div className="codex-spellcasting-entry">
      <strong>{entry.name}</strong> {entry.dc !== undefined ? `DC ${entry.dc}` : null}{" "}
      {entry.attack !== undefined ? `(${fmtMod(entry.attack)} to hit)` : null}{" "}
      {entry.tradition !== undefined ? capitalize(entry.tradition) : null}
      {levels.map((level) => {
        const atLevel = byLevel.get(level);
        if (!atLevel) return null;
        return (
          <div key={level} className="codex-spell-level-group">
            <span className="codex-spell-level-label">
              {level === 0 ? "Cantrips" : `Level ${level}`}
            </span>{" "}
            {atLevel.map((s, i) => (
              <span key={s.slug}>
                {i > 0 ? ", " : ""}
                <a href={`/spell/${s.slug}`} data-crossref="">
                  {s.name}
                </a>
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function AbilityRow({ item, ctx }: { item: EmbeddedItem; ctx: RenderCtx }): ReactElement {
  return (
    <div className="codex-ability" data-ability-slug={item.slug}>
      <strong>{item.name}</strong>{" "}
      {item.actionCost !== undefined ? <CodexActionGlyph raw={item.actionCost} /> : null}{" "}
      <CodexTraitPills traits={item.traits} knownTraitIds={ctx.knownTraitIds} />
      <div className="codex-content">{renderNodes(item.body, ctx)}</div>
    </div>
  );
}

/** D29-26 — grouped embedded-item sections: strikes, spellcasting entries
 * (with their spells nested under them), then actions/abilities. Any other
 * embedded-item `type` (e.g. `lore`) is rendered in the generic "abilities"
 * bucket too — fail-soft, nothing is dropped. */
export function EmbeddedItemSections({
  items,
  ctx,
}: {
  items: readonly EmbeddedItem[];
  ctx: RenderCtx;
}): ReactElement | null {
  if (items.length === 0) return null;
  const strikes = items.filter((i) => i.type === "melee");
  const spellcastingEntries = items.filter((i) => i.type === "spellcastingEntry");
  const spells = items.filter((i) => i.type === "spell");
  const other = items.filter(
    (i) => i.type !== "melee" && i.type !== "spellcastingEntry" && i.type !== "spell",
  );

  return (
    <div className="codex-embedded-items">
      {strikes.length > 0 ? (
        <section className="codex-strikes">
          {strikes.map((s) => (
            <StrikeRow key={s.slug} item={s} ctx={ctx} />
          ))}
        </section>
      ) : null}
      {spellcastingEntries.length > 0 ? (
        <section className="codex-spellcasting">
          {spellcastingEntries.map((entry) => (
            <SpellcastingEntrySection key={entry.slug} entry={entry} spells={spells} />
          ))}
        </section>
      ) : null}
      {other.length > 0 ? (
        <section className="codex-abilities">
          {other.map((item) => (
            <AbilityRow key={item.slug} item={item} ctx={ctx} />
          ))}
        </section>
      ) : null}
    </div>
  );
}
