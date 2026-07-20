import type { ReactElement, ReactNode } from "react";

import type {
  AssayComparable,
  AssayEntry,
  AssaySummonBand,
  AssayVariant,
} from "../../schema/assay";
import type { CodexEntity } from "../../schema/entity";
import type { RenderCtx } from "./nodes";

/**
 * D30-40 — the codex-side half of round 4's assay surface: renders the
 * `apps/assay`-produced verdict (D30-38's export schema, threaded in as
 * `EntityPageData.assay` by `entityPageData.ts`) on the spell `EntityPage`,
 * fail-soft in every direction — an absent `assay` prop (not a spell, no
 * entry, artifact missing/malformed) renders nothing at all, which is what
 * keeps the 7 committed goldens (including `spell-heal.html`) byte-identical
 * with NO changes to them: `entityPage.tsx`'s own bare construction never
 * passes an `assay` prop, so this component always short-circuits to `null`
 * there.
 *
 * Static SSR only — no client component, no hydration, reuses the SAME
 * `data-crossref`/`data-crossref-target` convention `nodes.tsx`'s crossref/
 * embed-source links already use (`Popover.tsx` attaches to
 * `a[data-crossref]` document-wide), so a comparable-spell link gets the
 * SAME hover-preview behavior as any other internal link on the page with
 * zero new wiring.
 */

// ---------------------------------------------------------------------------
// D30-40 — curated `reasonCode` -> copy map (the P13 `formatFacetValue`
// lesson: never print a raw internal reason string). The ONE reasonCode
// literal the FINAL spec text actually names is `"no-comparable-profile"`
// (D30-38's similarity-floor rule); this map is intentionally small and
// trivially extensible — any OTHER code Track A's export ever emits falls
// through to `LEDGER_FALLBACK_COPY` below, a generic but still honest
// sentence, rather than ever leaking the raw code to a reader.
// ---------------------------------------------------------------------------

const LEDGER_REASON_COPY: Readonly<Record<string, string>> = {
  "no-comparable-profile":
    "There isn't a close enough comparable spell in the corpus to judge this one against yet.",
  utility:
    "This is a utility spell — its value isn't damage or a measurable battlefield effect, so it isn't scored.",
  "long-cast":
    "This spell casts over minutes or longer, outside the combat-turn economy the power model measures.",
  ambiguous:
    "This spell's targeting doesn't parse cleanly as hostile or beneficial, so it isn't scored.",
  "unpriced-modifier": "This spell's payload is a numeric modifier the model doesn't price yet.",
  summon: "Summoning spells are judged by their summon level band rather than a power score.",
  "teleport-utility":
    "Teleportation and travel effects aren't scored — their value isn't comparable to damage or conditions.",
  "extraction-edge-case":
    "This spell's mechanics couldn't be extracted cleanly enough to score honestly.",
  "non-literal-formula":
    "This spell's damage scales by a formula the extractor can't evaluate, so it isn't scored.",
  "low-confidence":
    "The extracted mechanics for this spell are low-confidence, so it isn't scored rather than mis-scored.",
  "wall-terrain":
    "Wall and terrain effects aren't scored — their value depends on positioning, not a measurable budget.",
  "effect-item-payload":
    "This spell's payload lives in a linked effect the model doesn't price yet.",
  "cantrip-too-thin": "Too few comparable cantrips exist to judge this one against.",
};

const LEDGER_FALLBACK_COPY =
  "This spell doesn't have enough assay data yet for a verdict — it isn't scored or matched to comparables.";

function ledgerCopyFor(reasonCode: string | undefined): string {
  if (reasonCode !== undefined) {
    const known = LEDGER_REASON_COPY[reasonCode];
    if (known !== undefined) return known;
  }
  return LEDGER_FALLBACK_COPY;
}

/** At most one decimal place, no trailing ".0" — the artifact's own numbers
 * are already clean, this just guards against a stray float tail. */
function fmtNum(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function fmtSigned(n: number): string {
  return n > 0 ? `+${fmtNum(n)}` : fmtNum(n);
}

// ---------------------------------------------------------------------------
// per-field lines
// ---------------------------------------------------------------------------

/** "Power: in band" / "Power: +2.3 ranks hot" + "EV X vs budget Y at rank R"
 * — D30-40's own two-line worked example. `verdict` is Track A's own
 * synthesized prose (the export schema's `verdict?: string`, distinct from
 * `reasonCode`'s "typed enum, NOT prose"); this renders it VERBATIM rather
 * than re-deriving hot/cold wording from `residualRanks` itself, since
 * Track A owns that phrasing. */
function QuantitativeLines({ entry }: { entry: AssayEntry }): ReactElement | null {
  const hasVerdict = entry.verdict !== undefined;
  const hasEvBudget = entry.ev !== undefined && entry.budget !== undefined;
  if (!hasVerdict && !hasEvBudget) return null;
  return (
    <p className="codex-assay-line">
      {hasVerdict ? <>Power: {entry.verdict}. </> : null}
      {hasEvBudget ? (
        <>
          EV {fmtNum(entry.ev as number)} vs budget {fmtNum(entry.budget as number)} at rank{" "}
          {entry.rank}.
        </>
      ) : null}
    </p>
  );
}

function ComparableLink({ comparable }: { comparable: AssayComparable }): ReactElement {
  return (
    <a href={`/${comparable.id}`} data-crossref="" data-crossref-target={comparable.id}>
      {comparable.name}
    </a>
  );
}

/** "linked similar spells + '(ranks N–M)'" (D30-40) — plus the r10 thin-data
 * note whenever ANY comparable's own `rank` is 9 or higher (the D30-38
 * "includes rank 9-10 neighbors" similarity-floor edge, surfaced rather than
 * silently absorbed into an otherwise-normal-looking list). */
function ComparablesLine({ entry }: { entry: AssayEntry }): ReactElement | null {
  const comparables = entry.comparables;
  if (comparables === undefined || comparables.length === 0) return null;
  const hasThinRank = comparables.some((c) => c.rank >= 9);
  return (
    <p className="codex-assay-line">
      Comparable spells:{" "}
      {comparables.map((c, i) => (
        // Index-keyed alongside the id: a fixed-shape, never-reordered
        // per-render array (the same `PartsRow`/`mastheadExtraParts` idiom
        // used elsewhere in this directory) — `c.id` alone would do, but a
        // malformed export could in principle repeat one.
        <span key={`${i}-${c.id}`}>
          {i > 0 ? ", " : ""}
          <ComparableLink comparable={c} />
        </span>
      ))}
      {entry.rankRange !== undefined ? (
        <>
          {" "}
          (ranks {entry.rankRange[0]}–{entry.rankRange[1]})
        </>
      ) : null}
      {hasThinRank ? <> (includes rank 9–10 neighbors — thin data)</> : null}
    </p>
  );
}

/** D30-37's own kind-precedence text: a summon band "rides as an additional
 * field," not a competing `kind` — rendered whenever present, regardless of
 * `entry.kind` (Phantasmal Minion's own `kind:"quantitative"` + summonBand
 * pairing is the named worked example). */
function SummonBandLine({ band }: { band: AssaySummonBand }): ReactElement {
  return (
    <p className="codex-assay-line">
      Summon band: base level {band.baseLevel} vs. the curve&rsquo;s level {band.curveLevel} (
      {fmtSigned(band.delta)}).
    </p>
  );
}

/** Every scoreable field this component knows how to render, in a fixed
 * order (quantitative score, then comparables, then the summon-band rider —
 * D30-37's rider is independent of `kind` so it's always checked last
 * regardless of what else rendered). Falls all the way through to the
 * curated ledger sentence when NONE of the above produced anything —
 * covers the literal `kind:"ledger"` case AND any other entry shape that
 * happens to carry no scoreable/comparable field at all, so a spell page
 * with a real `assay` entry NEVER renders an empty card (Goal B's "every
 * ... spell's codex page shows something truthful"). */
function assayContentNodes(entry: AssayEntry): ReactNode[] {
  const nodes: ReactNode[] = [];
  const quant = QuantitativeLines({ entry });
  if (quant) nodes.push(quant);
  const comparables = ComparablesLine({ entry });
  if (comparables) nodes.push(comparables);
  if (entry.summonBand !== undefined) nodes.push(<SummonBandLine band={entry.summonBand} />);
  if (nodes.length === 0) {
    nodes.push(
      <p className="codex-assay-line codex-assay-ledger">{ledgerCopyFor(entry.reasonCode)}</p>,
    );
  }
  return nodes;
}

/** "Variants render as sub-lines" (D30-40) — one indented sub-block per
 * `variants[]` member, labeled, recursing through the SAME field-rendering
 * logic as the primary entry (a variant carries the identical shared-field
 * shape, `schema/assay.ts`'s own `AssayVariantSchema`). */
function AssayVariantBlock({ variant }: { variant: AssayVariant }): ReactElement {
  return (
    <div className="codex-assay-variant">
      <p className="codex-assay-variant-label">
        <strong>{variant.label}</strong>
      </p>
      {assayContentNodes(variant)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// the card
// ---------------------------------------------------------------------------

/**
 * D30-40 — mounts wherever `entityPage.tsx` renders a spell (both the
 * standalone `/{category}/{slug}` route AND the `?entry=` split-view
 * preview pane, since both flow through the SAME `EntityPageData` ->
 * `EntityRenderPane` -> `EntityPage` chain — accepted, recorded in the
 * spec's status header). Gated on `entity.category === "spell"` as a
 * defensive SECOND check (belt-and-suspenders alongside
 * `resolveEntityPageData`'s own server-side gate, D30-40's "Spell category
 * only") — `assay` itself is already never populated for a non-spell
 * entity, so this never fires in practice, but a render-layer component
 * shouldn't rely on a server-layer invariant alone.
 */
export function AssayBlock({
  entity,
  assay,
  ctx,
}: {
  entity: CodexEntity;
  assay: AssayEntry | undefined;
  ctx: RenderCtx;
}): ReactElement | null {
  if (entity.category !== "spell" || assay === undefined) return null;
  return (
    <section className="codex-card codex-card-prose codex-assay">
      <h2 id={ctx.headingId?.("Assay")}>
        Assay <span className="codex-assay-tag">(experimental)</span>
      </h2>
      <div className="codex-content">
        {assayContentNodes(assay)}
        {assay.variants?.map((v, i) => (
          <AssayVariantBlock key={`${i}-${v.label}`} variant={v} />
        ))}
      </div>
    </section>
  );
}
