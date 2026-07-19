import type { CodexNode, HeadingNode, InlineNode } from "../../schema/nodes";
import { collectText } from "./text";

/**
 * P14 S2 (D29-135) — render-time lore/body deduplication. Two entry points,
 * sharing the same section-splitting + 5-word-shingle coverage machinery:
 *
 *   - `suppressLoreSections` — the Lore card's own suppression pass, wired
 *     into BOTH `entityPage.tsx` (ancestry etc.) and `ClassPage.tsx`
 *     (loreBody). Splits `loreBody` into sections at EVERY heading, any
 *     level — the review-corrected granularity (spec header: a top-level-
 *     only split produced one giant "Class Features" H1 section on every
 *     class, coverage 0.59-0.89, whole-section-suppressing the UNIQUE
 *     alchemist Versatile Vial table along with the genuine dup prose
 *     around it — at per-heading granularity the table's own section
 *     scores ~0.01 and survives while the dup chapter scores ~0.96 and
 *     suppresses). Nodes before the first heading form an implicit leading
 *     "preamble" section (present in 77/77 real loreBody docs).
 *   - `stripCoveredFeatureSections` — the ClassPage Description extension:
 *     strips a `entity.body` feature-heading section when its heading NAME
 *     case-insensitively matches a granted feature AND its prose is
 *     covered by THAT feature's own stream body — belt-and-suspenders, a
 *     bare name match never strips alone.
 *
 * Both are pure — no fs/server dependency, same posture as `nodes.tsx`.
 */

// ---------------------------------------------------------------------------
// tunable — exported + tested (spec: "one exported tested constant")
// ---------------------------------------------------------------------------

/** Section text whose 5-word-shingle overlap with the reference text is at
 * or above this fraction is a near-total duplicate — suppressed. Below it,
 * the section is kept WHOLE, never partially trimmed (spec: "coverage >=
 * threshold -> suppress; below -> keep it whole"). Tuning this is a
 * one-line change; the canary tests (real-corpus survivor shapes: shisk's
 * Heritages, alchemist's Versatile Vial table) are the safety net (spec §6
 * risk — "the suppression heuristic is the round's real correctness
 * risk"). */
export const LORE_SUPPRESSION_THRESHOLD = 0.5;

const SHINGLE_SIZE = 5;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

/** Every contiguous `size`-word window of `words`, deduplicated. A `words`
 * run shorter than `size` collapses to ONE shingle (its whole, shorter run)
 * rather than zero — so a short section/reference still participates in
 * the coverage test below instead of trivially never matching anything. */
function shinglesOf(words: readonly string[], size: number): ReadonlySet<string> {
  const out = new Set<string>();
  if (words.length === 0) return out;
  if (words.length < size) {
    out.add(words.join(" "));
    return out;
  }
  for (let i = 0; i <= words.length - size; i++) {
    out.add(words.slice(i, i + size).join(" "));
  }
  return out;
}

/** The fraction of `sectionText`'s own shingles that also appear in
 * `referenceText`'s shingle set. `0` for an empty `sectionText` — the
 * caller's own emptiness branch (a section with no text left at all) always
 * decides suppression before this ever runs on one, but this stays total.
 *
 * The window size ADAPTS DOWN to `min(SHINGLE_SIZE, sectionWords.length)`
 * rather than always using a fixed 5 — real-corpus finding (S2 build
 * verification, every class's "Perception" subsection): a short section
 * ("Expert in Perception", 3 words) restating a short body passage
 * byte-identically was surviving un-suppressed, because a 3-word section
 * shingle can never equal a 5-word reference shingle even when the exact
 * 3-word run appears verbatim inside the (much longer) reference text.
 * Building BOTH sides' shingles at the section's own shorter window size
 * fixes this while leaving every section >= `SHINGLE_SIZE` words (the
 * overwhelming majority) at the original fixed-5 behavior. */
function shingleCoverage(sectionText: string, referenceText: string): number {
  const sectionWords = tokenize(sectionText);
  if (sectionWords.length === 0) return 0;
  const windowSize = Math.min(SHINGLE_SIZE, sectionWords.length);
  const sectionShingles = shinglesOf(sectionWords, windowSize);
  if (sectionShingles.size === 0) return 0;
  const referenceShingles = shinglesOf(tokenize(referenceText), windowSize);
  let covered = 0;
  for (const s of sectionShingles) if (referenceShingles.has(s)) covered++;
  return covered / sectionShingles.size;
}

// ---------------------------------------------------------------------------
// the D29-132 collision-base-slug idiom, mirrored here (render-side —
// deliberately NOT imported from `ingest/augmentClassStats.ts`: the render
// lane stays dependency-free of the transform lane, same "no fs/server
// dependency" posture `nodes.tsx` already keeps, extended to "no ingest
// dependency"). Strips a trailing `@legacy` marker then a trailing `-N`
// collision suffix — the exact same two-step `classFeatureBaseSlug` uses,
// so a lore embed's bare pre-collision target and a granted feature's
// post-D29-132 SUFFIXED targetId land on the identical key (the review
// blocker this exists to fix: exact-id membership is a no-op for 260/469
// lore embeds, since loreBody embeds carry the bare base slug while the
// post-fix stream ids are suffixed).
// ---------------------------------------------------------------------------

const TRAILING_SUFFIX_RE = /-(\d+)$/;
const LEGACY_SUFFIX = "@legacy";

/** Exported so `ClassPage.tsx` can build its own `grantedBaseSlugs` set from
 * `data.grantedFeatures[].id` (the caller's responsibility — this module
 * never reads `GrantedFeature`/`SlimFeatureDoc` shapes itself). */
export function collisionBaseSlug(id: string): string {
  const withoutLegacy = id.endsWith(LEGACY_SUFFIX) ? id.slice(0, -LEGACY_SUFFIX.length) : id;
  return withoutLegacy.replace(TRAILING_SUFFIX_RE, "");
}

// ---------------------------------------------------------------------------
// D29-135(a): ClassPage-only embed removal by collision-base-slug. Walks the
// full node tree (embeds can sit inside a paragraph/list-item/table-cell,
// not just at the section's own top level) — mirrors `nodes.tsx`'s
// `paragraphCarriesBlockContent`/`walkEmbedTargets` traversal shape.
// ---------------------------------------------------------------------------

function stripEmbedNode(node: CodexNode, baseSlugs: ReadonlySet<string>): CodexNode | null {
  if (node.kind === "embed") {
    return baseSlugs.has(collisionBaseSlug(node.target)) ? null : node;
  }
  switch (node.kind) {
    case "paragraph":
      return { ...node, children: stripEmbedsInline(node.children, baseSlugs) };
    case "heading":
      return { ...node, children: stripEmbedsInline(node.children, baseSlugs) };
    case "list":
      return { ...node, items: node.items.map((item) => stripEmbedsBlock(item, baseSlugs)) };
    case "table":
      return {
        ...node,
        rows: node.rows.map((row) => ({
          ...row,
          cells: row.cells.map((cell) => stripEmbedsBlock(cell, baseSlugs)),
        })),
        ...(node.caption ? { caption: stripEmbedsBlock(node.caption, baseSlugs) } : {}),
      };
    case "blockquote":
      return { ...node, children: stripEmbedsBlock(node.children, baseSlugs) };
    case "aside":
      return { ...node, children: stripEmbedsBlock(node.children, baseSlugs) };
    case "localizedBoilerplate":
      return { ...node, children: stripEmbedsBlock(node.children, baseSlugs) };
    case "statRow":
      return { ...node, cells: node.cells.map((cell) => stripEmbedsInline(cell, baseSlugs)) };
    default:
      return node;
  }
}

function stripEmbedsBlock(
  nodes: readonly CodexNode[],
  baseSlugs: ReadonlySet<string>,
): CodexNode[] {
  const out: CodexNode[] = [];
  for (const node of nodes) {
    const stripped = stripEmbedNode(node, baseSlugs);
    if (stripped !== null) out.push(stripped);
  }
  return out;
}

/** `paragraph`/`heading`/`statRow` children are typed `InlineNode[]`, a
 * subtype of `CodexNode[]` — `stripEmbedNode` never changes a node's own
 * `kind`, so every element `stripEmbedsBlock` keeps is still structurally an
 * `InlineNode` whenever the input was. The cast documents that
 * locally-provable invariant (the repo's own "as never" MCP-seam precedent
 * for a narrow cast) rather than widening every recursive helper's return
 * type to accept/return a union it can't otherwise narrow back down. */
function stripEmbedsInline(
  nodes: readonly InlineNode[],
  baseSlugs: ReadonlySet<string>,
): InlineNode[] {
  return stripEmbedsBlock(nodes, baseSlugs) as InlineNode[];
}

function stripHeadingEmbeds(heading: HeadingNode, baseSlugs: ReadonlySet<string>): HeadingNode {
  return { ...heading, children: stripEmbedsInline(heading.children, baseSlugs) };
}

// ---------------------------------------------------------------------------
// section splitting — EVERY heading (any level) starts a new section; nodes
// before the first heading form an implicit leading "preamble" section
// (`heading: undefined`) — present in 77/77 real loreBody docs.
// ---------------------------------------------------------------------------

interface Section {
  heading: HeadingNode | undefined;
  body: CodexNode[];
}

function splitSections(nodes: readonly CodexNode[]): Section[] {
  const sections: Section[] = [];
  let current: Section = { heading: undefined, body: [] };
  for (const node of nodes) {
    if (node.kind === "heading") {
      // Skip pushing ONLY the genuinely-empty leading preamble (no heading,
      // no body nodes at all) — every other section, including a
      // heading-only one with nothing before the next heading, is a real
      // section and gets pushed (its own emptiness is decided by the
      // caller's coverage/emptiness test, not silently dropped here).
      if (!(current.heading === undefined && current.body.length === 0)) {
        sections.push(current);
      }
      current = { heading: node, body: [] };
    } else {
      current.body.push(node);
    }
  }
  sections.push(current);
  return sections;
}

// ---------------------------------------------------------------------------
// suppressLoreSections
// ---------------------------------------------------------------------------

export interface SuppressLoreSectionsOptions {
  /** ClassPage only (D29-135a): collision-base slugs of every granted
   * feature's resolved targetId — a lore section's embed nodes whose OWN
   * collision-base slug is a member are stripped BEFORE the coverage
   * check. Absent/undefined on `EntityPage` (ancestry etc., which has no
   * grantedFeatures at all) — a no-op there, matching today's behavior. */
  grantedBaseSlugs?: ReadonlySet<string>;
  /** ClassPage only: extra reference text folded into the coverage
   * check's reference alongside `body` — the granted-stream feature
   * bodies, so a lore restatement of a feature counts as covered even
   * when that exact prose lives only in the stream, never in `body`
   * itself. */
  extraReferenceText?: string;
}

export interface LoreDedupeResult {
  /** Surviving section content, in original document order (heading node,
   * when the section carried one, immediately followed by its surviving
   * body nodes) — ready to feed straight into `renderNodes`. Empty when
   * every section suppressed (the caller omits the whole Lore card,
   * heading included, in that case). */
  nodes: CodexNode[];
  totalSections: number;
  suppressedSections: number;
}

/**
 * The Lore-card suppression pass (D29-135). Per section: (a) ClassPage only
 * — strip embed nodes matching `options.grantedBaseSlugs`; (b) 5-word-
 * shingle-test the section's remaining text against `body`'s text (+
 * `options.extraReferenceText`) — coverage >= `LORE_SUPPRESSION_THRESHOLD`
 * suppresses the WHOLE section (heading included), below keeps it whole. A
 * section left with no text at all after (a) (embed-only subsections)
 * suppresses unconditionally, coverage math skipped (0 shingles is not a
 * meaningful "below threshold, keep").
 */
export function suppressLoreSections(
  loreBody: readonly CodexNode[],
  body: readonly CodexNode[],
  options: SuppressLoreSectionsOptions = {},
): LoreDedupeResult {
  const sections = splitSections(loreBody);
  const referenceText =
    options.extraReferenceText !== undefined && options.extraReferenceText.length > 0
      ? `${collectText(body)} ${options.extraReferenceText}`
      : collectText(body);

  const survivingNodes: CodexNode[] = [];
  let suppressedSections = 0;

  for (const section of sections) {
    const filteredBody = options.grantedBaseSlugs
      ? stripEmbedsBlock(section.body, options.grantedBaseSlugs)
      : section.body;
    const filteredHeading =
      section.heading !== undefined && options.grantedBaseSlugs
        ? stripHeadingEmbeds(section.heading, options.grantedBaseSlugs)
        : section.heading;

    const sectionText = collectText(filteredBody);
    const suppressed =
      sectionText.trim() === "" ||
      shingleCoverage(sectionText, referenceText) >= LORE_SUPPRESSION_THRESHOLD;

    if (suppressed) {
      suppressedSections++;
      continue;
    }
    if (filteredHeading !== undefined) survivingNodes.push(filteredHeading);
    survivingNodes.push(...filteredBody);
  }

  return { nodes: survivingNodes, totalSections: sections.length, suppressedSections };
}

/** Loud-drift dev signal (spec: "a `suppressedCount`-style dev report — the
 * P12 assert pattern — so corpus drift surfaces loudly"): the one genuinely
 * risky outcome is a Lore card that HAD real sections but suppressed every
 * single one (the heuristic ate the whole card) — worth a console.warn so a
 * future re-snapshot/threshold change surfaces loudly instead of silently
 * hiding real content. Zero sections (no loreBody, or an empty one) and
 * partial suppression are both expected, unremarkable outcomes and stay
 * silent. */
export function reportLoreSuppression(entityId: string, result: LoreDedupeResult): void {
  if (result.totalSections > 0 && result.suppressedSections === result.totalSections) {
    console.warn(
      `[codex] ${entityId}: loreDedupe suppressed ALL ${result.totalSections} lore section(s) — ` +
        `the Lore card is now fully empty. Worth checking against the real doc: either genuinely ` +
        `all-duplicate (expected, e.g. a thin loreBody) or the suppression threshold/a corpus ` +
        `re-snapshot ate real unique content.`,
    );
  }
}

// ---------------------------------------------------------------------------
// stripCoveredFeatureSections — the ClassPage Description extension
// ---------------------------------------------------------------------------

/** The minimal shape `stripCoveredFeatureSections` needs from a granted
 * feature — deliberately narrower than `SlimFeatureDoc` (`classPageData.ts`)
 * so this module stays independent of the server layer; `ClassPage.tsx`
 * passes `data.grantedFeatures` straight through (structurally compatible). */
export interface CoveredFeatureRef {
  name: string;
  body: readonly CodexNode[];
}

/**
 * D29-135's ClassPage Description extension: strips a `body` feature-
 * heading section when its heading text case-insensitively matches a
 * granted feature's name AND the section's prose is covered (same
 * shingle threshold) by THAT feature's own stream body — belt-and-
 * suspenders, an exact name match ALONE never strips (the review-upheld
 * containment: a class re-using a heading name for genuinely different
 * flavor text must survive). The preamble (no heading) is never a
 * candidate — there's no feature name to match against.
 */
export function stripCoveredFeatureSections(
  body: readonly CodexNode[],
  grantedFeatures: readonly CoveredFeatureRef[],
): { body: CodexNode[]; suppressedCount: number } {
  const byNormalizedName = new Map<string, CoveredFeatureRef>();
  for (const feature of grantedFeatures) {
    const key = feature.name.trim().toLowerCase();
    // First-encountered wins on a same-named duplicate grant — real corpus
    // never has two identically-named grants on one class (measured);
    // belt-and-braces only, never expected to matter.
    if (!byNormalizedName.has(key)) byNormalizedName.set(key, feature);
  }

  const sections = splitSections(body);
  const out: CodexNode[] = [];
  let suppressedCount = 0;

  for (const section of sections) {
    const headingText =
      section.heading !== undefined
        ? collectText([section.heading]).trim().toLowerCase()
        : undefined;
    const matched = headingText !== undefined ? byNormalizedName.get(headingText) : undefined;
    const sectionText = collectText(section.body);
    const covered =
      matched !== undefined &&
      sectionText.trim() !== "" &&
      shingleCoverage(sectionText, collectText(matched.body)) >= LORE_SUPPRESSION_THRESHOLD;

    if (covered) {
      suppressedCount++;
      continue;
    }
    if (section.heading !== undefined) out.push(section.heading);
    out.push(...section.body);
  }

  return { body: out, suppressedCount };
}
