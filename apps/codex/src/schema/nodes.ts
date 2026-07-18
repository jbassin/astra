import { z } from "zod";

/**
 * CodexNode — the P2 renderer contract (D29-2, spec §2/§3). ONE Zod discriminated
 * union over 19 kinds, no `dangerouslySetInnerHTML` of source-derived HTML anywhere
 * downstream. `CORPUS_SCHEMA_VERSION` (`src/ingest/emit.ts`) bumps on ANY breaking
 * change here (a kind added/removed/reshaped) — NOT the committed root
 * `corpus-manifest.json`'s own `schemaVersion` (a different, fetch-pin concept, see
 * `src/schema/manifest.ts` and `emit.ts`'s own doc comment).
 *
 * Two tiers, both riding the same discriminant field (`kind`) so `CodexNodeSchema`
 * stays a single flat `z.discriminatedUnion`:
 *   - BLOCK (paragraph/heading/list/table/blockquote/divider/aside/statRow) —
 *     structural; their recursive fields (`children`/`items`/`rows`/`caption`) hold
 *     arbitrary `CodexNode`s (block-in-block for nested lists/asides, or bare inline
 *     runs for simple list items — both are real shapes in the corpus). `statRow`
 *     (P10, D29-93) is the one exception: its `cells` field holds `InlineNode[][]`,
 *     not recursive `CodexNode[]` — an AoN statblock row is always paragraph-shaped
 *     content (D29-91), never block-in-block.
 *   - INLINE (text/crossref/brokenRef/check/damage/inlineRoll/inlineAction/template/
 *     embed/actionGlyph/localizedBoilerplate) — leaves; no inline-in-inline nesting
 *     (styling is carried on `text` via `marks`, never by wrapping one inline node in
 *     another).
 *
 * Ambiguities resolved while writing this contract (spec text described shapes in
 * prose, not exact field names):
 *   - `inlineRoll`'s own roll-form field is named `rollKind` (not `kind`) to avoid
 *     colliding with the node's own `kind: "inlineRoll"` discriminant.
 *   - `table`'s "header row flag" is per-row (`TableRow.header`), not a single
 *     document-level flag — real AoN tables mix header/body rows freely.
 *   - `embed`'s "target codex id or raw uuid target pre-join" is one `target: string`
 *     field plus a `resolved: boolean` flag, rather than two mutually-exclusive
 *     optional fields — `join.ts` flips `resolved` in place once it resolves a raw
 *     `@Embed`/`<document>` reference against the corpus, so the node's shape is
 *     stable across the pre-join/post-join transform stages.
 *   - Images and `<column>`/`<center>` are NOT node kinds (D29-2): images are
 *     dropped at transform (report-counted), columns/centers flatten to sequential
 *     blocks before nodes are ever constructed — neither survives into this schema.
 *     `<row>` is the one exception (P10, D29-91/D29-93): a row whose parsed
 *     children are ALL paragraphs, with no wrapper tag opened anywhere inside its
 *     own scope, and at least 2 children, collapses to a `statRow` block instead of
 *     flattening — see `aonMarkup.ts`'s own file header for the full candidacy
 *     rule. A single-cell or nested-wrapper row still flattens exactly as before.
 *
 * S2 widenings (`apps/codex/src/ingest/enrichers.ts`, verified against the real
 * Foundry snapshot — see the codex-0029 memory for the full census):
 *   - `check`/`template`/`damage` gained an optional `label` — the enricher's
 *     trailing `{label}` suffix (a Foundry chat-display override, distinct from any
 *     `name:` pipe-key) is real at scale (Check 136, Template 487, Damage 7 uses)
 *     and was otherwise silently lost.
 *   - `check` gained an optional `extra: Record<string, string | boolean>` — real
 *     `@Check[...]` pipe-args carry far more keys than `dc`/`basic`/`traits`
 *     (`against`, `defense`, `showDC`, `name`, `options`, `overrideTraits`,
 *     `immutable`, `roller`, `rollerRole`, all verified in the packs). Per D29-6's
 *     "unknown FORMS hard-fail, not unknown keys within a known form" policy, these
 *     survive in `extra` (bare flags become `true`) instead of hard-failing or being
 *     silently dropped; `enrichers.ts` also `report()`s each one so drift is visible.
 *   - `localizedBoilerplate` is the one node NOT confined to its tier: real resolved
 *     `@Localize` values (69 of the 200 distinct keys actually used in the packs)
 *     contain block HTML (`<p>`/`<ul>`/`<hr>`/headings) and/or nested enrichers, not
 *     flat text — `text: string` couldn't hold that. It now carries
 *     `children: CodexNode[]` (recursively parsed, same "arbitrary CodexNode array"
 *     pattern already used by `aside`/`blockquote`/list items) and keeps its schema
 *     definition alongside the recursive block schemas below even though it stays a
 *     member of the `InlineNode` union (so it can still appear as a paragraph child
 *     for the 3 real cases where `@Localize` sits inline next to a `@Check`, while
 *     also legally standing alone as a bare array element for the ~7280 cases where
 *     it's the sole content of its source `<p>`).
 */

// ---------------------------------------------------------------------------
// leaf value schemas
// ---------------------------------------------------------------------------

const TextMarks = z
  .object({
    bold: z.boolean(),
    italic: z.boolean(),
    superscript: z.boolean(),
  })
  .strict();
export type TextMarks = z.infer<typeof TextMarks>;

// ---------------------------------------------------------------------------
// inline node kinds (leaves — no nested CodexNode fields)
// ---------------------------------------------------------------------------

const TextNode = z
  .object({ kind: z.literal("text"), content: z.string(), marks: TextMarks })
  .strict();

/** A resolved internal reference (Foundry `@UUID`, an AoN internal `[label](/Url…)`
 * link, or a same-corpus `<document>` embed target) — `targetId` is always a codex
 * entity id (`{category}/{slug}` or `{category}/{slug}@legacy`, D29-1), never a raw
 * Foundry uuid or AoN URL. */
const CrossrefNode = z
  .object({ kind: z.literal("crossref"), targetId: z.string().min(1), display: z.string() })
  .strict();

/** An unresolved reference, preserved as plain text (D29-6): relative `@UUID[.<id>]`
 * that didn't resolve within its own document, a broken alias, etc. `target` keeps
 * the raw unresolved reference string for the transform report; `excludedRef`
 * (Macro/RollTable targets) uses this same node shape at render time — the
 * distinction is a report CLASS, not a schema kind (D29-6). */
const BrokenRefNode = z
  .object({ kind: z.literal("brokenRef"), target: z.string(), display: z.string() })
  .strict();

const CheckNode = z
  .object({
    kind: z.literal("check"),
    type: z.string().min(1), // e.g. "perception", "stealth", "flat", "fortitude"
    dc: z.number().optional(),
    basic: z.boolean().optional(),
    traits: z.array(z.string()).optional(),
    /** The `{label}` chat-display override suffix (136 real uses) — distinct from
     * the `name:` pipe-key. */
    label: z.string().optional(),
    /** Permissive catch-all for every other real pipe-key/bare-flag (`against`,
     * `defense`, `showDC`, `name`, `options`, `overrideTraits`, `immutable`,
     * `roller`, `rollerRole`, ...) — see the file-level "S2 widenings" note. */
    extra: z.record(z.string(), z.union([z.string(), z.boolean()])).optional(),
  })
  .strict();

/** `@Damage` (D29-6): raw formula kept verbatim (depth-aware bracket parse, e.g.
 * `(floor((@actor.level+1)/2)+1)d6[poison]`) alongside a computed human-readable
 * string; actor-relative formulas display as formula text (reference site, not a
 * VTT — no `@actor.*` evaluation happens anywhere in this pipeline). */
const DamageNode = z
  .object({
    kind: z.literal("damage"),
    formula: z.string().min(1),
    display: z.string(),
    /** The `{label}` chat-display override suffix (7 real uses, e.g. `{1d6 damage
     * per level}` on an actor-relative formula). */
    label: z.string().optional(),
  })
  .strict();

/** All three `[[/r`/`[[/br`/`[[/gmr` forms (D29-6) share this shape; `rollKind` is
 * the enricher's own roll-form tag, distinct from this node's `kind` discriminant. */
const InlineRollNode = z
  .object({
    kind: z.literal("inlineRoll"),
    rollKind: z.enum(["r", "br", "gmr"]),
    formula: z.string().min(1),
    label: z.string().optional(),
  })
  .strict();

/** The `[[/act …]]` form (D29-6, 1,343 uses) — a Foundry action-macro reference, not
 * a dice roll. */
const InlineActionNode = z
  .object({
    kind: z.literal("inlineAction"),
    action: z.string().min(1), // action slug
    options: z.record(z.string(), z.string()).optional(),
    label: z.string().optional(),
  })
  .strict();

/** `@Template` (D29-6): area-effect shape + distance, e.g.
 * `@Template[emanation|distance:30]`. */
const TemplateNode = z
  .object({
    kind: z.literal("template"),
    shape: z.string().min(1), // "emanation" | "burst" | "cone" | "line" | "cube" | ...
    distance: z.number(),
    /** The `{label}` chat-display override suffix (487 real uses, e.g. `{10-foot
     * radius}`). */
    label: z.string().optional(),
  })
  .strict();

/** Covers Foundry `@Embed` AND AoN `<document>` (D29-2). Pre-join, `target` is the
 * raw uuid/AoN-doc reference and `resolved` is `false`; `join.ts` resolves it to a
 * codex entity id in place and flips `resolved` to `true`. Inlining the embed's
 * content is a P2 render decision, not this schema's concern. */
const EmbedNode = z
  .object({
    kind: z.literal("embed"),
    target: z.string().min(1),
    resolved: z.boolean(),
    display: z.string().optional(),
  })
  .strict();

/** The numbered/lettered action-cost glyph (`<span class="action-glyph">`) — kept as
 * a raw token string (`"1"`, `"2"`, `"3"`, `"R"`, `"F"`, `"1 to 3"`, ...) since the
 * source corpus doesn't normalize these to one vocabulary. */
const ActionGlyphNode = z
  .object({ kind: z.literal("actionGlyph"), cost: z.string().min(1) })
  .strict();

// ---------------------------------------------------------------------------
// block node kinds (structural — recursive fields hold arbitrary CodexNode)
// ---------------------------------------------------------------------------

/** Forward type declarations: the recursive interface has to exist before the zod
 * schemas that reference it via `z.lazy`, and the zod schemas have to exist before
 * `CodexNodeSchema` closes the loop — see the block below for how the three tie
 * together (standard zod recursive-schema pattern; evaluation order works because
 * `z.lazy` callbacks only run at parse time, never at module-load time). */
/** `localizedBoilerplate` is hand-written (not `z.infer`) because its `children`
 * field is recursive (`CodexNode[]`, see the file-level "S2 widenings" note) — it
 * can't be inferred until `CodexNode` itself exists below. */
export interface LocalizedBoilerplateNode {
  kind: "localizedBoilerplate";
  children: CodexNode[];
  sourceKey: string;
}

export type InlineNode =
  | z.infer<typeof TextNode>
  | z.infer<typeof CrossrefNode>
  | z.infer<typeof BrokenRefNode>
  | z.infer<typeof CheckNode>
  | z.infer<typeof DamageNode>
  | z.infer<typeof InlineRollNode>
  | z.infer<typeof InlineActionNode>
  | z.infer<typeof TemplateNode>
  | z.infer<typeof EmbedNode>
  | z.infer<typeof ActionGlyphNode>
  | LocalizedBoilerplateNode;

export interface ParagraphNode {
  kind: "paragraph";
  children: InlineNode[];
}
export interface HeadingNode {
  kind: "heading";
  level: number;
  children: InlineNode[];
  /** The AoN `<title right=…>` right-annotation string (action cost/level, e.g.
   * "Cantrip 1") — absent for Foundry-sourced headings (D29-2). */
  meta?: string;
}
export interface ListNode {
  kind: "list";
  ordered: boolean;
  items: CodexNode[][];
}
export interface TableRow {
  cells: CodexNode[][];
  header: boolean;
}
export interface TableNode {
  kind: "table";
  rows: TableRow[];
  caption?: CodexNode[];
}
export interface BlockquoteNode {
  kind: "blockquote";
  children: CodexNode[];
}
export interface DividerNode {
  kind: "divider";
}
export interface AsideNode {
  kind: "aside";
  children: CodexNode[];
}
/** P10 (D29-91/D29-93): an AoN `<row gap="…">` statblock row collapsed at ingest
 * (see `aonMarkup.ts` for the candidacy rule + boundary-trim semantics). `cells`
 * is `InlineNode[][]`, not recursive `CodexNode[]` — every real candidate corpus-
 * wide is paragraph-shaped inline content, never block-in-block. */
export interface StatRowNode {
  kind: "statRow";
  cells: InlineNode[][];
}

export type BlockNode =
  | ParagraphNode
  | HeadingNode
  | ListNode
  | TableNode
  | BlockquoteNode
  | DividerNode
  | AsideNode
  | StatRowNode;

export type CodexNode = BlockNode | InlineNode;

const CodexNodeSchema: z.ZodType<CodexNode> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    ParagraphNodeSchema,
    HeadingNodeSchema,
    ListNodeSchema,
    TableNodeSchema,
    BlockquoteNodeSchema,
    DividerNodeSchema,
    AsideNodeSchema,
    StatRowNodeSchema,
    TextNode,
    CrossrefNode,
    BrokenRefNode,
    CheckNode,
    DamageNode,
    InlineRollNode,
    InlineActionNode,
    TemplateNode,
    EmbedNode,
    ActionGlyphNode,
    LocalizedBoilerplateNodeSchema,
  ]),
);

// `localizedBoilerplate`'s schema lives here (below `CodexNodeSchema`, above
// `InlineNodeSchema`) rather than up with the other leaf schemas: its `children`
// field needs `z.lazy(() => CodexNodeSchema)`, same recursive-field idiom as
// `ListNodeSchema`/`TableRowSchema`/etc below — but `InlineNodeSchema` (unlike
// `CodexNodeSchema`) is built eagerly, not inside its own `z.lazy`, so this const
// must exist before that eager build runs.
const LocalizedBoilerplateNodeSchema = z
  .object({
    kind: z.literal("localizedBoilerplate"),
    children: z.array(z.lazy((): z.ZodType<CodexNode> => CodexNodeSchema)),
    sourceKey: z.string().min(1),
  })
  .strict();

// NOTE: none of the schemas below carry an explicit `z.ZodType<X>` annotation
// (except `CodexNodeSchema` itself, which has to in order to close the recursive
// loop) — zod v4's `discriminatedUnion` needs each member's own inferred literal-
// discriminant metadata to build its lookup map, which a broad `ZodType<X>`
// annotation erases. Concrete inference (object literal -> the exact ZodObject
// type) is what keeps every discriminatedUnion below type-checkable.
const InlineNodeSchema = z.discriminatedUnion("kind", [
  TextNode,
  CrossrefNode,
  BrokenRefNode,
  CheckNode,
  DamageNode,
  InlineRollNode,
  InlineActionNode,
  TemplateNode,
  EmbedNode,
  ActionGlyphNode,
  LocalizedBoilerplateNodeSchema,
]);

/** P10 (D29-93): `cells` is `z.array(InlineNodeSchema)`, not a `z.lazy` recursive
 * field — same reason it sits down here rather than up with the other leaf
 * schemas: it needs the already-built eager `InlineNodeSchema` above, which in
 * turn needs `LocalizedBoilerplateNodeSchema` already built (the same ordering
 * constraint documented at that schema's own definition). `cells.length >= 2` +
 * every cell non-empty are the D29-93 Zod pins; a cell can never trim to fully
 * empty in practice (`aonMarkup.ts`'s `inlineIsMeaningful` filters all-whitespace
 * paragraphs upstream, before a row is ever a candidate), so the non-empty pin is
 * satisfiable by construction, not just aspirational. */
const StatRowNodeSchema = z
  .object({
    kind: z.literal("statRow"),
    cells: z.array(z.array(InlineNodeSchema).min(1)).min(2),
  })
  .strict();

const ParagraphNodeSchema = z
  .object({ kind: z.literal("paragraph"), children: z.array(InlineNodeSchema) })
  .strict();

const HeadingNodeSchema = z
  .object({
    kind: z.literal("heading"),
    level: z.number().int().positive(),
    children: z.array(InlineNodeSchema),
    meta: z.string().optional(),
  })
  .strict();

const ListNodeSchema = z
  .object({
    kind: z.literal("list"),
    ordered: z.boolean(),
    items: z.array(z.array(z.lazy((): z.ZodType<CodexNode> => CodexNodeSchema))),
  })
  .strict();

const TableRowSchema = z
  .object({
    cells: z.array(z.array(z.lazy((): z.ZodType<CodexNode> => CodexNodeSchema))),
    header: z.boolean(),
  })
  .strict();

const TableNodeSchema = z
  .object({
    kind: z.literal("table"),
    rows: z.array(TableRowSchema),
    caption: z.array(z.lazy((): z.ZodType<CodexNode> => CodexNodeSchema)).optional(),
  })
  .strict();

const BlockquoteNodeSchema = z
  .object({
    kind: z.literal("blockquote"),
    children: z.array(z.lazy((): z.ZodType<CodexNode> => CodexNodeSchema)),
  })
  .strict();

const DividerNodeSchema = z.object({ kind: z.literal("divider") }).strict();

const AsideNodeSchema = z
  .object({
    kind: z.literal("aside"),
    children: z.array(z.lazy((): z.ZodType<CodexNode> => CodexNodeSchema)),
  })
  .strict();

const BlockNodeSchema = z.union([
  ParagraphNodeSchema,
  HeadingNodeSchema,
  ListNodeSchema,
  TableNodeSchema,
  BlockquoteNodeSchema,
  DividerNodeSchema,
  AsideNodeSchema,
  StatRowNodeSchema,
]);

export {
  CodexNodeSchema,
  BlockNodeSchema,
  InlineNodeSchema,
  TextNode as TextNodeSchema,
  CrossrefNode as CrossrefNodeSchema,
  BrokenRefNode as BrokenRefNodeSchema,
  CheckNode as CheckNodeSchema,
  DamageNode as DamageNodeSchema,
  InlineRollNode as InlineRollNodeSchema,
  InlineActionNode as InlineActionNodeSchema,
  TemplateNode as TemplateNodeSchema,
  EmbedNode as EmbedNodeSchema,
  ActionGlyphNode as ActionGlyphNodeSchema,
  LocalizedBoilerplateNodeSchema,
  ParagraphNodeSchema,
  HeadingNodeSchema,
  ListNodeSchema,
  TableNodeSchema,
  TableRowSchema,
  BlockquoteNodeSchema,
  DividerNodeSchema,
  AsideNodeSchema,
  StatRowNodeSchema,
};

export function parseCodexNode(data: unknown): CodexNode {
  return CodexNodeSchema.parse(data);
}
