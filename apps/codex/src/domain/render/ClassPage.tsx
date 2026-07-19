// P12 S3 (D29-119/-120) — the bespoke `class` page composition, swapping in
// for the S2 placeholder (`routes/class/$slug.tsx`'s `ClassMainPane`) when
// `entity.stats?.kind === "class"`. This is a FULL composition root (mirrors
// `EntityRenderPane.tsx`, not a component IT wraps) — item 6 of the spec's
// own render order is "Attached sidebars as today", meaning ClassPage itself
// owns that section, so it also owns the same `<Popover/>` mount
// `EntityRenderPane` does for every other standalone entity page. (No
// `<TableOfContents/>` here — stakeholder-dropped post-P12: the class page's
// own fixed section order + the progression table's per-level anchors already
// cover in-page navigation, so the "On this page" box was redundant chrome.)
// The `popover-hint` class on this component's own root article is NOT
// optional polish: `Popover.tsx` fetches a hovered crossref's target page and
// clones whatever carries that class — 1,066 `class-feature/*` docs crossref
// `class/*`, so a class page missing it would silently break every one of
// those hover cards (the exact review blocker D29-119's header-extraction
// step exists to protect).
import { Fragment, useEffect, useMemo, useState, type ReactElement, type ReactNode } from "react";

import type { CodexEntity, SubclassOption } from "../../schema/entity";
import type { ClassPageData, SlimFeatureDoc } from "../../server/classPageData";
import type { EntityPageData } from "../../server/entityPageData";
import { EditionIcon } from "../../ui";
import { ABILITY_LABELS } from "../browse/facetDefs";
import { memoizedEntity } from "../browse/listingClient";
import { Popover } from "../components/islands/Popover";
import { AttachedSidebars } from "./AttachedSidebars";
import {
  buildProgressionRows,
  rankLabel,
  stripClassProgressionTable,
  type ProgressionRow,
} from "./classProgression";
import { EntityHeader } from "./EntityHeader";
import { createHeadingIdAssigner } from "./headingIds";
import {
  collisionBaseSlug,
  reportLoreSuppression,
  stripCoveredFeatureSections,
  suppressLoreSections,
} from "./loreDedupe";
import { type RenderCtx, renderNodes, rootRenderCtx } from "./nodes";
import { collectText, humanizeSlug } from "./text";

/** A codex id (`{category}/{slug}`) split client-side, WITHOUT importing
 * `server/entityPageData.ts`'s own `splitCodexId` (that module pulls in
 * `corpusFs.ts`'s `node:fs` dependency — see its own header comment on why
 * it must never be imported from a route/component file). Structurally
 * identical to that function; duplicated here rather than shared because the
 * two live on opposite sides of the client/server bundle boundary. */
function splitTargetId(id: string): { category: string; slug: string } | null {
  const idx = id.indexOf("/");
  if (idx <= 0 || idx === id.length - 1) return null;
  return { category: id.slice(0, idx), slug: id.slice(idx + 1) };
}

// ---------------------------------------------------------------------------
// Core Traits box
// ---------------------------------------------------------------------------

function Row({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div className="codex-stat-row">
      <span className="codex-stat-label">{label}</span> {children}
    </div>
  );
}

/** `[]` -> "Chosen at 1st level" (psychic — the one real 0-length case,
 * D29-113); otherwise every ability slug's full name, "or"-joined (the
 * common 1-2 element case: cleric's `["wis"]` -> "Wisdom", fighter's
 * `["dex","str"]` -> "Dexterity or Strength" — kept in the corpus's own
 * array order, never re-sorted). */
function formatKeyAbility(keyAbility: readonly string[]): string {
  if (keyAbility.length === 0) return "Chosen at 1st level";
  return keyAbility.map((k) => ABILITY_LABELS[k] ?? k.toUpperCase()).join(" or ");
}

/** `value` (named skills, humanized) + "plus N more" from `additional` — the
 * spec's own literal composition. Both parts are independently optional
 * (fighter's `value: []`/`additional: 3` renders bare "plus 3 more"; a
 * hypothetical class with named skills and `additional: 0` would render just
 * the names) though every measured real class carries both. */
function formatTrainedSkills(value: readonly string[], additional: number): string {
  const parts: string[] = [];
  if (value.length > 0) parts.push(value.map(humanizeSlug).join(", "));
  if (additional > 0) parts.push(`plus ${additional} more`);
  return parts.length > 0 ? parts.join(", ") : "None";
}

function CoreTraitsBox({
  stats,
  headingId,
}: {
  stats: Extract<CodexEntity["stats"], { kind: "class" }>;
  headingId?: string;
}): ReactElement {
  const attackParts = [
    `Simple ${rankLabel(stats.attacks.simple)}`,
    `Martial ${rankLabel(stats.attacks.martial)}`,
    `Advanced ${rankLabel(stats.attacks.advanced)}`,
    `Unarmed ${rankLabel(stats.attacks.unarmed)}`,
  ];
  // D29-113 — `other` is a fixed 5th key on every raw doc, empty on 24/27;
  // gated on the same non-empty-name predicate extract-time emission used
  // (never an empty "Rank 0" row for the 24 that don't carry a real one).
  if (stats.attacks.other !== undefined) {
    attackParts.push(`${stats.attacks.other.name} ${rankLabel(stats.attacks.other.rank)}`);
  }
  const defenseParts = [
    `Unarmored ${rankLabel(stats.defenses.unarmored)}`,
    `Light ${rankLabel(stats.defenses.light)}`,
    `Medium ${rankLabel(stats.defenses.medium)}`,
    `Heavy ${rankLabel(stats.defenses.heavy)}`,
  ];
  return (
    <section className="codex-class-traits-section">
      <h2 className="codex-heading" id={headingId}>
        Core Traits
      </h2>
      <div className="codex-card codex-card-stat codex-class-traits">
        <Row label="Key Ability">{formatKeyAbility(stats.keyAbility)}</Row>
        <Row label="Hit Points">{`${stats.hp} per level`}</Row>
        <Row label="Perception">{rankLabel(stats.perception)}</Row>
        <Row label="Saving Throws">
          {`Fortitude ${rankLabel(stats.savingThrows.fortitude)}, Reflex ${rankLabel(stats.savingThrows.reflex)}, Will ${rankLabel(stats.savingThrows.will)}`}
        </Row>
        <Row label="Attacks">{attackParts.join(", ")}</Row>
        <Row label="Defenses">{defenseParts.join(", ")}</Row>
        <Row label="Trained Skills">
          {formatTrainedSkills(stats.trainedSkills.value, stats.trainedSkills.additional)}
        </Row>
        <Row label="Spellcasting">{stats.spellcasting ? "Yes" : "No"}</Row>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Progression table
// ---------------------------------------------------------------------------

/** Comma-joins a mix of plain strings and React nodes (anchor links), each
 * wrapped in a keyed `Fragment` so the array survives React's reconciliation
 * regardless of node type. */
function joinWithComma(parts: readonly ReactNode[]): ReactNode {
  return parts.map((part, i) => (
    <Fragment key={i}>
      {i > 0 ? ", " : ""}
      {part}
    </Fragment>
  ));
}

function ProgressionRowCells({
  row,
  slimByTargetId,
  streamIdByTargetId,
}: {
  row: ProgressionRow;
  slimByTargetId: ReadonlyMap<string, SlimFeatureDoc>;
  streamIdByTargetId: ReadonlyMap<string, string | undefined>;
}): ReactElement {
  const parts: ReactNode[] = [];
  for (const grant of row.grants) {
    // D29-114 — a `targetId: null` stub (the 17 real cases, e.g. cleric's
    // "First Doctrine") renders as PLAIN TEXT, never a dead link; same
    // fallback for the belt-and-braces case where `targetId` resolved at
    // augment time but `resolveGrantedFeatures` still failed to read the doc
    // (a stale/hand-edited fixture) — both degrade identically.
    const slim = grant.targetId ? slimByTargetId.get(grant.targetId) : undefined;
    const streamId = grant.targetId ? streamIdByTargetId.get(grant.targetId) : undefined;
    const displayName = slim?.name ?? grant.name;
    parts.push(streamId ? <a href={`#${streamId}`}>{displayName}</a> : displayName);
  }
  for (const label of row.cadence) parts.push(label);
  return (
    <tr>
      <td>{row.level}</td>
      <td>{parts.length > 0 ? joinWithComma(parts) : "—"}</td>
    </tr>
  );
}

function ProgressionTable({
  stats,
  grantedFeatures,
  streamIdByTargetId,
  headingId,
}: {
  stats: Extract<CodexEntity["stats"], { kind: "class" }>;
  grantedFeatures: readonly SlimFeatureDoc[];
  streamIdByTargetId: ReadonlyMap<string, string | undefined>;
  headingId?: string;
}): ReactElement {
  const rows = buildProgressionRows(stats);
  const slimByTargetId = new Map(grantedFeatures.map((f) => [f.id, f] as const));
  return (
    <section className="codex-class-progression-section">
      <h2 className="codex-heading" id={headingId}>
        Progression
      </h2>
      <div className="codex-content codex-class-progression">
        <table className="codex-class-progression-table">
          <thead>
            <tr>
              <th>Level</th>
              <th>Features</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <ProgressionRowCells
                key={row.level}
                row={row}
                slimByTargetId={slimByTargetId}
                streamIdByTargetId={streamIdByTargetId}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Subclass section
// ---------------------------------------------------------------------------

function SubclassPillButton({
  option,
  selected,
  onToggle,
}: {
  option: SubclassOption;
  selected: boolean;
  onToggle: (targetId: string) => void;
}): ReactElement {
  return (
    <button
      type="button"
      className={
        selected
          ? "codex-class-subclass-pill codex-class-subclass-pill-selected"
          : "codex-class-subclass-pill"
      }
      aria-pressed={selected}
      onClick={() => onToggle(option.targetId)}
    >
      {option.name}
      {option.superseded ? <EditionIcon edition="legacy" /> : null}
    </button>
  );
}

/** Renders one selected subclass doc's full prose inline: a heading (real
 * `id`, from the SAME per-page assigner every other heading here uses — SSR-
 * selected ones surface in the ToC by construction, D29-119's own accepted
 * "client-toggle-added headings don't" trade-off) + its body. `extraEmbeds`
 * is set ONLY for a client-fetched (non-SSR) doc — its own self-contained
 * `EntityPageData.embeds` map, since the D29-117 merged `data.embeds` only
 * ever covers the class body + granted features + SSR-selected subclasses. */
function SubclassDocSection({
  doc,
  ctx,
  extraEmbeds,
}: {
  doc: CodexEntity;
  ctx: RenderCtx;
  extraEmbeds: Record<string, CodexEntity> | undefined;
}): ReactElement {
  const docCtx: RenderCtx = extraEmbeds
    ? { ...ctx, resolveEmbed: (targetId) => extraEmbeds[targetId] }
    : ctx;
  return (
    <div className="codex-class-subclass-doc">
      <h3 className="codex-heading" id={ctx.headingId?.(doc.name)}>
        {doc.name}
      </h3>
      <div className="codex-content">{renderNodes(doc.body, docCtx)}</div>
    </div>
  );
}

function SubclassSection({
  stats,
  data,
  superseded,
  ctx,
  selectedSubclassIds,
  onSubclassToggle,
  headingId,
}: {
  stats: Extract<CodexEntity["stats"], { kind: "class" }>;
  data: ClassPageData;
  superseded: boolean;
  ctx: RenderCtx;
  selectedSubclassIds: ReadonlySet<string>;
  onSubclassToggle: (targetId: string) => void;
  headingId?: string;
}): ReactElement | null {
  // `stats` (a prop) is a STABLE reference across re-renders driven by this
  // component's own local state (`extra`): it's a plain property read off
  // `data.entity.stats`, which only changes identity when `data` itself does
  // (a genuine loader rerun) — `useMemo` keyed on it here, and every further
  // derivation below keyed on ITS output, keeps the whole chain (and the
  // `useEffect` further down) from re-running on every unrelated local
  // re-render, while satisfying `react-hooks/exhaustive-deps` at each step.
  const options = useMemo(() => stats.subclassOptions ?? [], [stats]);

  // D29-115/-119 — grouped by category, preserving each category's own
  // first-encounter order (the augment pass's own array order — cleric: one
  // "doctrine" row; witch/champion/psychic/wizard: two labeled rows).
  const byCategory = useMemo(() => {
    const map = new Map<string, SubclassOption[]>();
    for (const option of options) {
      const list = map.get(option.category);
      if (list) list.push(option);
      else map.set(option.category, [option]);
    }
    return map;
  }, [options]);
  const ssrByTargetId = useMemo(
    () => new Map((data.selectedSubclasses ?? []).map((d) => [d.id, d] as const)),
    [data.selectedSubclasses],
  );
  const optionsByTargetId = useMemo(
    () => new Map(options.map((o) => [o.targetId, o] as const)),
    [options],
  );

  const [extra, setExtra] = useState<ReadonlyMap<string, EntityPageData>>(new Map());

  useEffect(() => {
    // Effects never run during SSR (React's own contract — `TableOfContents.
    // tsx`'s own comment) — this only ever fires client-side, after
    // hydration, on a genuine `?subclass=` change. Unselected pills fetch ON
    // DEMAND here via the existing `memoizedEntity` client seam (D29-117):
    // an already-SSR-resolved id is skipped, and `memoizedEntity`'s own
    // promise cache absorbs a duplicate call for an in-flight id (this
    // effect's deps intentionally don't chase referential identity too
    // tightly, so an occasional harmless re-check is expected, not a bug).
    for (const targetId of selectedSubclassIds) {
      if (ssrByTargetId.has(targetId) || extra.has(targetId)) continue;
      const option = optionsByTargetId.get(targetId);
      if (!option) continue; // not one of THIS class's own options — ignore
      const split = splitTargetId(targetId);
      if (!split) continue;
      void memoizedEntity(split.category, split.slug).then((result) => {
        if (!result) return;
        setExtra((prev) => (prev.has(targetId) ? prev : new Map(prev).set(targetId, result)));
      });
    }
  }, [selectedSubclassIds, ssrByTargetId, optionsByTargetId, extra]);

  if (options.length === 0) return null;

  return (
    <section className="codex-class-subclass-section">
      <h2 className="codex-heading" id={headingId}>
        Subclasses
      </h2>
      {[...byCategory.entries()].map(([category, categoryOptions]) => (
        // `fieldset`/`legend` — the semantically-correct native grouping for
        // a labeled set of toggle buttons (oxlint's own
        // `jsx-a11y/prefer-tag-over-role` steers away from a bare
        // `role="group"`); default UA fieldset chrome is reset in CSS.
        <fieldset key={category} className="codex-class-subclass-group">
          <legend className="codex-class-subclass-category-label">{humanizeSlug(category)}</legend>
          <div className="codex-class-subclass-pills">
            {categoryOptions
              .filter((option) => superseded || !option.superseded)
              .map((option) => (
                <SubclassPillButton
                  key={option.targetId}
                  option={option}
                  selected={selectedSubclassIds.has(option.targetId)}
                  onToggle={onSubclassToggle}
                />
              ))}
          </div>
        </fieldset>
      ))}
      {options
        .filter((option) => selectedSubclassIds.has(option.targetId))
        .map((option) => {
          const ssrDoc = ssrByTargetId.get(option.targetId);
          if (ssrDoc) {
            return (
              <SubclassDocSection
                key={option.targetId}
                doc={ssrDoc}
                ctx={ctx}
                extraEmbeds={undefined}
              />
            );
          }
          const extraData = extra.get(option.targetId);
          if (extraData) {
            return (
              <SubclassDocSection
                key={option.targetId}
                doc={extraData.entity}
                ctx={ctx}
                extraEmbeds={extraData.embeds}
              />
            );
          }
          return (
            <div
              key={option.targetId}
              className="codex-class-subclass-doc codex-class-subclass-pending"
            >
              Loading {option.name}&hellip;
            </div>
          );
        })}
    </section>
  );
}

// ---------------------------------------------------------------------------
// ClassPage
// ---------------------------------------------------------------------------

export function ClassPage({
  data,
  superseded,
  selectedSubclassIds,
  onSubclassToggle,
}: {
  data: ClassPageData;
  superseded: boolean;
  /** URL-derived (`?subclass=`), full `targetId`s — the route owns decoding/
   * encoding (`splitCsv`/`joinCsv`), this component only reads membership. */
  selectedSubclassIds: ReadonlySet<string>;
  /** "Component reports, route navigates" (the site's own established split
   * — `BrowseListing.tsx`'s `onSupersededReveal`/`onEntrySelect`): fired with
   * the toggled pill's own `targetId`, the CALLER decides add-vs-remove
   * against the current URL and performs the actual `navigate()`. */
  onSubclassToggle: (targetId: string) => void;
}): ReactElement | null {
  const { entity } = data;
  const stats = entity.stats?.kind === "class" ? entity.stats : undefined;
  if (!stats) return null; // defensive — the caller (`ClassMainPane`) only reaches this for stats-bearing docs

  const baseCtx = rootRenderCtx({
    resolveEmbed: (targetId) => data.embeds[targetId],
    knownTraitIds: new Set(data.knownTraitIds),
  });
  // A FRESH assigner every render (the `EntityRenderPane.tsx` precedent):
  // deterministic over the current render's own content, so a client-only
  // re-render (a subclass pill toggle) recomputes a consistent id space for
  // whatever's now on the page, with no cross-render state to keep in sync.
  const ctx: RenderCtx = { ...baseCtx, headingId: createHeadingIdAssigner() };

  // D29-119 (review-corrected) — pre-assign the section + stream heading ids
  // IN RENDER ORDER, from this SAME assigner, before building any JSX: the
  // progression table (rendered at position 2) needs the stream headings'
  // ids (rendered at position 4) for its anchor hrefs.
  const coreTraitsId = ctx.headingId?.("Core Traits");
  const progressionId = ctx.headingId?.("Progression");
  const hasSubclasses = (stats.subclassOptions?.length ?? 0) > 0;
  const subclassesId = hasSubclasses ? ctx.headingId?.("Subclasses") : undefined;
  const grantedFeatures = data.grantedFeatures ?? [];
  const streamIdByTargetId = new Map<string, string | undefined>(
    grantedFeatures.map((f) => [f.id, ctx.headingId?.(`Level ${f.level}: ${f.name}`)] as const),
  );
  const descriptionId = ctx.headingId?.("Description");

  const { body: bodyAfterProgressionStrip, suppressedCount } = stripClassProgressionTable(
    entity.body,
  );
  if (suppressedCount !== 1) {
    // Belt-and-braces (D29-119's own "assert exactly-one" text) — measured
    // exactly 1 on all 27 real stats-bearing classes; a future re-snapshot
    // drifting this is worth a loud dev-time signal, not a 500.
    console.warn(
      `[codex] ${entity.id}: expected exactly 1 "Your Level"/"Class Features" progression ` +
        `table to suppress from the Description body, found ${suppressedCount}.`,
    );
  }
  // P14 S2 (D29-135) — completes P12's own declared "dedup'd Description"
  // intent: `entity.body`'s own "Class Features" chapter restates each
  // granted feature's prose a SECOND time (the stream above is the first),
  // under a heading matching the feature's own name — strip any such
  // section whose prose the stream's OWN feature body covers (belt-and-
  // suspenders: a heading that merely shares a feature's name, with
  // genuinely different prose under it, survives untouched).
  const grantedBaseSlugs = new Set(grantedFeatures.map((f) => collisionBaseSlug(f.id)));
  const streamReferenceText = grantedFeatures.map((f) => collectText(f.body)).join(" ");
  const { body: descriptionBody } = stripCoveredFeatureSections(
    bodyAfterProgressionStrip,
    grantedFeatures,
  );

  // Real-corpus finding (S3 build verification, `alchemist`/several others):
  // `loreBody` (a merged Foundry JOURNAL page — D29-8, e.g. alchemist's own
  // "Roleplaying the Alchemist" entry) independently restates the SAME
  // proficiency-summary + progression table a second time when present —
  // the identical redundancy-with-the-structured-render concern D29-119's
  // suppression predicate targets, just via a SECOND source document rather
  // than `entity.body` itself. Its own duplicate progression table is
  // stripped the same way first; the P14 S2 suppression pass (D29-135) then
  // runs per-heading-section over what's left, ALSO removing (a) any embed
  // node restating a granted feature by its collision-base slug (a lore
  // embed carries the bare base slug — e.g. "class-feature/perception-
  // expertise" — while the post-D29-132 stream targetId is suffixed, e.g.
  // "-8"; exact-id membership would be a no-op here) and (b) any section
  // whose remaining prose the widened reference text (body + every granted
  // feature's own stream body) covers.
  const loreResult =
    entity.loreBody !== undefined
      ? suppressLoreSections(stripClassProgressionTable(entity.loreBody).body, entity.body, {
          grantedBaseSlugs,
          extraReferenceText: streamReferenceText,
        })
      : undefined;
  if (loreResult) reportLoreSuppression(entity.id, loreResult);

  return (
    <article
      className="codex-entity-page codex-class-page popover-hint"
      data-entity-id={entity.id}
      data-category={entity.category}
    >
      <Popover />
      <EntityHeader entity={entity} ctx={ctx} standalone />

      <CoreTraitsBox stats={stats} headingId={coreTraitsId} />

      <ProgressionTable
        stats={stats}
        grantedFeatures={grantedFeatures}
        streamIdByTargetId={streamIdByTargetId}
        headingId={progressionId}
      />

      {hasSubclasses ? (
        <SubclassSection
          stats={stats}
          data={data}
          superseded={superseded}
          ctx={ctx}
          selectedSubclassIds={selectedSubclassIds}
          onSubclassToggle={onSubclassToggle}
          headingId={subclassesId}
        />
      ) : null}

      <section className="codex-class-feature-stream">
        {grantedFeatures.map((feature) => (
          <div key={feature.id} className="codex-class-feature">
            <h2 className="codex-heading" id={streamIdByTargetId.get(feature.id)}>
              {`Level ${feature.level}: ${feature.name}`}
            </h2>
            <div className="codex-content">{renderNodes(feature.body, ctx)}</div>
          </div>
        ))}
      </section>

      <section className="codex-class-description-section">
        <h2 className="codex-heading" id={descriptionId}>
          Description
        </h2>
        <div className="codex-content codex-body">{renderNodes(descriptionBody, ctx)}</div>
      </section>

      {/* Same convention as `EntityPage` — additive (several real classes DO
          carry `loreBody`, e.g. alchemist's "Roleplaying the Alchemist"
          journal merge, verified against the real corpus) — never silently
          drop it. D29-135 — the whole card (heading included) is omitted
          when suppression eats every section, not just left empty. */}
      {loreResult !== undefined && loreResult.nodes.length > 0 ? (
        <section className="codex-card codex-card-prose codex-lore">
          <h2 id={ctx.headingId?.("Lore")}>Lore</h2>
          <div className="codex-content">{renderNodes(loreResult.nodes, ctx)}</div>
        </section>
      ) : null}

      {data.attachedSidebars !== undefined ? (
        <AttachedSidebars sidebars={data.attachedSidebars} superseded={superseded} ctx={ctx} />
      ) : null}
    </article>
  );
}
