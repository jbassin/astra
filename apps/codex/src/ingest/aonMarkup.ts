import type { BlockNode, CodexNode, InlineNode, TableRow, TextMarks } from "../schema/nodes";

/**
 * AoN `markdown` field → `BlockNode[]` (D29-2, spec §4 S3). The field mixes real
 * markdown with AoN's custom pseudo-HTML tags; the grammar is undocumented (spec
 * §6) and was discovered by an empirical census over the REAL 2026-07-13 snapshot
 * (43,684 docs across 93 categories, every doc has a non-empty `markdown`).
 * Hand-rolled per D29-9 — an unmapped tag/entity/construct is a HARD FAIL
 * (`AonMarkupError`), never a silent passthrough.
 *
 * Tag census (open+close combined; every name below is deliberately handled):
 *   column 200,574 · row 174,300 · title 160,948 · traits 106,510 · trait 86,769 ·
 *   td 74,495 · actions 49,209 · tr 19,388 · li 18,868 · br 18,495 ·
 *   document 11,152 · aside 6,746 · ul 5,770 · spoilers 4,910 · image 3,193 ·
 *   table 1,426 · th 1,392 · date 245 · thead 218 · tbody 218 · sup 102 ·
 *   center 100 · tfoot 44 · ol 43 · h2 4 · span 4 · a 2 · t 2 · b 2
 *
 * Markdown census: links 452,448 (→ `ctx.resolveLink`) · `**bold**` ~203k pairs ·
 * `_italic_` ~46.9k pairs (single `*` is NOT emphasis in this corpus — all 39
 * single-star matches are artifacts of bold pairs split across table cells) ·
 * `---` divider lines 53,310 · `## `/`### ` headings 926 (levels 2/3 only) ·
 * `- ` list lines 13,100 · numbered-markdown lists 0 (`<ol>` HTML is used
 * instead) · pipe tables 0 · blockquote `>` 0 · backticks 0 · entities: only
 * `&amp;`/`&lt;`/`&gt;` · CRLF in 40,684 docs (normalized to LF first, D29-7).
 *
 * Mapping decisions (each verified against the census — see the numbers above):
 *   - `<title level=N right="…">` → heading (level 1–4; non-empty `right` — the
 *     action-cost/level annotation — lands in `meta`; `pfs`/`noclass`/`icon`
 *     attrs are pure AoN chrome, dropped). `<h2 class=…>` (3 opens) is a title
 *     synonym at level 2 — 2 of the 3 real occurrences are closed by
 *     `</title>`, so the heading close accepts either name (report-counted).
 *   - `<traits>…</traits>` → DROPPED with a report count: the pill labels are a
 *     verified duplicate of the structured facet fields — 98.77% of all 53,255
 *     blocks are fully covered by `_source.trait` ∪ `trait_raw` ∪ `size` ∪
 *     `rarity` (the dev sweep recomputes this), and the 653 residual mismatches
 *     are AoN's own tag-vs-facet disagreements (e.g. arcane-school pills say
 *     Uncommon while the rarity facet says common; legacy school pills scrubbed
 *     from remaster facet arrays) — upstream noise a parser can't adjudicate,
 *     so facets win. The 24 standalone
 *     `<trait label=…/>` pills OUTSIDE a wrapper (sidebar statblocks, labels not
 *     in any facet field) are inlined as their label's inline parse instead
 *     (report-counted) so no prose is lost.
 *   - `<actions string="…"/>` → actionGlyph (cost = the verbatim string, e.g.
 *     "Single Action", "Two Actions or Three Actions"). The 9,161 empty
 *     `string=""` uses mean "no glyph" (textual activation time follows) —
 *     dropped with a report count (actionGlyph.cost has min-length 1).
 *   - `<column>` → FLATTENED to sequential blocks (layout, not content — D29-2
 *     verbatim; columns nest, flattening recurses). `<row>` mostly flattens the
 *     same way, EXCEPT (P10, D29-91/D29-93 — amends the D29-2 verbatim-flatten
 *     posture): a row whose parsed children are ALL paragraphs, with NO wrapper
 *     tag (`row`/`column`/`center`) opened anywhere inside its own scope, and
 *     at least 2 children, collapses to a `statRow` block (`cells:
 *     InlineNode[][]`, one cell per child paragraph's inline run, trimmed at
 *     cell boundaries) instead of flattening — the AoN statblock stat-line
 *     idiom (`Str +7 … Cha +5`, `AC 32 Fort +25 …`). Candidacy is decided
 *     DURING parse via a wrapper-open counter sampled around the row's own
 *     recursive `parseSequence` call (see `collectStatRowCells`/the `row` case
 *     below) — a post-hoc `children.every(paragraph)` check on the FLATTENED
 *     result can't distinguish a real stat line from a deity/class/ancestry
 *     page whose paragraphs were spliced out of a nested `<column>`. A
 *     single-cell candidate (exactly 1 qualifying child) still flattens to
 *     that one paragraph (identical render either way, report-counted); an
 *     empty row still flattens to nothing; a row containing ANY nested
 *     wrapper still flattens unconditionally, same as `<column>`/`<center>`.
 *   - `<aside>`/`<spoilers>` → aside node (spoiler banners are inset callouts).
 *   - `<document level id override-title-right/>` → embed node
 *     (`target` = the raw doc id, `resolved: false` — the gate runner resolves);
 *     `level` is a render-depth hint (dropped silently); `override-title-right`
 *     (407 uses) is dropped WITH a report count (it's real content — an
 *     archetype-adjusted feat level — but embed has no meta field; revisit in P2
 *     if the count matters). Attrs legitimately span newlines here.
 *   - `<image src>` (3,193, all self-closed) → DROPPED, report-counted (D29-2:
 *     art we neither host nor hotlink; the spec's "22 hits" was a sampling
 *     undercount — the full-corpus number is 3,193).
 *   - `<table>` → table node: HTML-shaped rows only (no markdown pipe tables
 *     exist); `thead`/`tbody`/`tfoot` flatten to their rows; `<th>` marks its
 *     row as header; `colspan`/`rowspan`/`bgcolor`/`class`/`style`/`border` are
 *     presentation, dropped.
 *   - `<center>` (50 pairs, rules formula callouts) → its content as ordinary
 *     blocks (a paragraph) — layout tag, same posture as row/column.
 *   - `<date value="…"/>` (245) → plain text of the value.
 *   - `<sup>` → superscript mark; `<b>`/`<B>` (1 pair) → bold mark; `<span
 *     class=…>` (2 pairs) → transparent inline wrapper, flattened
 *     (report-counted).
 *   - `<br/>` → literal "\n" inside the surrounding text run (foundryHtml's
 *     `<br>` idiom); it does NOT open a markdown line (a `- ` after `<br/>`
 *     stays prose).
 *   - `<t>` (2) and `<a href…>` (2, unclosed + broken `<%END>` template debris
 *     around them) are KNOWN upstream junk — the token is dropped with a report
 *     count and the surrounding text flows on. (A tag name outside the censused
 *     vocabulary still hard-fails — the junk set is closed, not a wildcard.)
 *
 * Narrow leniencies (browser-style error recovery, each quantified against the
 * real corpus and report-counted — anything NOT on this list hard-fails):
 *   - malformed non-tag `<…` (13 occurrences: `<**Failure**`, `<hr /**>`,
 *     `</ br>`, `<br / `-with-no-close, `</i_,`, gibberish `<<`/`<…`) → the `<`
 *     is literal text; scanning resumes right after it.
 *   - stray close tag with no matching open (`</li>`/`</ul>` in 2 docs whose
 *     list opener was lost upstream) → skipped; a bare `<li>` outside any list
 *     starts an implicit unordered list (same 2 docs).
 *   - `<td>`/`<th>` while a cell is open → implicit cell close (3 docs);
 *     `<td>`/`<th>` directly inside `<table>` → implicit `<tr>` (4 docs, the
 *     rules "random events" tables whose `<tr>` opens were lost).
 *   - a known block tag unclosed at end of input → implicit close (1 doc:
 *     hazard-307's `<ol>`), mirroring foundryHtml's Engulf leniency.
 *   - unbalanced `**`/`_` emphasis at paragraph end (the ~155 partial cases) →
 *     the dangling toggle stays applied to the trailing text, report-counted.
 *
 * Link handling (D29-7): `[display](href)` markdown links go through
 * `ctx.resolveLink` — internal (`/Traits.aspx?ID=170`-style), absolute external
 * (paizo.com product pages), and bare-domain hrefs alike; href and display are
 * entity-decoded first, and a display that itself contains link markdown (the
 * 154 double-wrapped `[[divine](…)](…)` upstream slips) is flattened to its
 * innermost text (report-counted). Whole-wrap emphasis on a display
 * (`[_name_](…)`, 23k uses) is stripped — the marker chars are markup, not name.
 */

// ---------------------------------------------------------------------------
// errors
// ---------------------------------------------------------------------------

/** Anything the discovered grammar can't account for: an unknown tag/entity, a
 * close tag that matches no open scope and isn't a censused stray, text where
 * only table structure may appear, etc. `source`/`start`/`end` carry the exact
 * span (post-CRLF-normalization offsets) so callers report doc id + snippet —
 * same shape as `EnricherGrammarError`/`FoundryHtmlError`. */
export class AonMarkupError extends Error {
  readonly source: string;
  readonly start: number;
  readonly end: number;

  constructor(source: string, start: number, end: number, message: string) {
    super(message);
    this.name = "AonMarkupError";
    // Plain field assignment (strip-only Node TS — see EnricherGrammarError).
    this.source = source;
    this.start = start;
    this.end = end;
  }
}

// ---------------------------------------------------------------------------
// context (pinned contract — the link table engineer codes against this)
// ---------------------------------------------------------------------------

export interface AonParseCtx {
  /** Resolves an AoN markdown link (href + display text) to the inline node to
   * place (crossref / brokenRef / plain text). Injectable; tests use a stub.
   * Absolute external hrefs also go through this. */
  resolveLink: (href: string, display: string) => InlineNode;
  report: (cls: string, detail: string) => void;
}

// ---------------------------------------------------------------------------
// tokenizer
// ---------------------------------------------------------------------------

interface TagToken {
  name: string;
  attrs: Record<string, string>;
}

type Token =
  | { type: "open"; tag: TagToken; start: number }
  | { type: "close"; name: string; start: number }
  | { type: "void"; tag: TagToken; start: number }
  | { type: "text"; text: string; start: number };

/** Tags that never carry content in this corpus — treated as void whether or
 * not the source wrote the self-closing slash (census: all are `/>`-closed). */
const VOID_TAGS = new Set(["br", "image", "actions", "trait", "date", "document"]);

/** The complete censused tag vocabulary. A parsed tag whose name is not here is
 * a hard fail (the drift tripwire) — a future AoN re-snapshot that grows the
 * grammar must be triaged here before the pipeline runs again. */
const KNOWN_TAGS = new Set([
  ...VOID_TAGS,
  "title",
  "h2",
  "traits",
  "row",
  "column",
  "aside",
  "spoilers",
  "center",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "td",
  "th",
  "ul",
  "ol",
  "li",
  "sup",
  "span",
  "b",
  "t",
  "a",
]);

/** Censused upstream junk whose token is dropped (content flows on) — see the
 * file-level notes. Closed set; NOT a fallback for unknown names. */
const JUNK_TAGS = new Set(["t", "a"]);

const NAME_RE = /^[a-zA-Z][a-zA-Z0-9-]*/;
const ATTR_RE = /^\s+([a-zA-Z][a-zA-Z0-9_:-]*)\s*=\s*"([^"]*)"/;

/** Strict tag-body parse: `name (attr="value")* /?`. Returns null when the
 * slice between `<` and `>` isn't a well-formed tag (→ literal-`<` leniency).
 * Attrs may span newlines (real `<document>` tags do). */
function parseTagBody(
  body: string,
): { name: string; attrs: Record<string, string>; closing: boolean; selfClosing: boolean } | null {
  let rest = body;
  let closing = false;
  if (rest.startsWith("/")) {
    closing = true;
    rest = rest.slice(1);
  }
  const nameMatch = NAME_RE.exec(rest);
  if (!nameMatch) return null;
  const name = nameMatch[0].toLowerCase();
  rest = rest.slice(nameMatch[0].length);
  const attrs: Record<string, string> = {};
  for (;;) {
    const m = ATTR_RE.exec(rest);
    if (!m) break;
    const key = m[1];
    const value = m[2];
    if (key !== undefined && value !== undefined) attrs[key.toLowerCase()] = value;
    rest = rest.slice(m[0].length);
  }
  rest = rest.trim();
  let selfClosing = false;
  if (rest === "/") {
    selfClosing = true;
    rest = "";
  }
  if (rest !== "") return null; // leftover junk → not a tag
  if (closing && (selfClosing || Object.keys(attrs).length > 0)) return null;
  return { name, attrs, closing, selfClosing };
}

function tokenize(md: string, ctx: AonParseCtx): Token[] {
  const tokens: Token[] = [];
  let textStart = 0;
  let textBuf = "";
  const flushText = (): void => {
    if (textBuf.length > 0) {
      tokens.push({ type: "text", text: textBuf, start: textStart });
      textBuf = "";
    }
  };
  let i = 0;
  const n = md.length;
  while (i < n) {
    const lt = md.indexOf("<", i);
    if (lt === -1) {
      textBuf += md.slice(i);
      break;
    }
    textBuf += md.slice(i, lt);
    const gt = md.indexOf(">", lt);
    const body = gt === -1 ? null : parseTagBody(md.slice(lt + 1, gt));
    if (gt === -1 || body === null) {
      // Malformed-`<` leniency (13 real occurrences, see file-level notes).
      ctx.report("malformedTagLiteral", md.slice(lt, Math.min(lt + 30, n)));
      textBuf += "<";
      i = lt + 1;
      continue;
    }
    flushText();
    if (body.closing) {
      tokens.push({ type: "close", name: body.name, start: lt });
    } else if (body.selfClosing || VOID_TAGS.has(body.name)) {
      tokens.push({ type: "void", tag: { name: body.name, attrs: body.attrs }, start: lt });
    } else {
      tokens.push({ type: "open", tag: { name: body.name, attrs: body.attrs }, start: lt });
    }
    i = gt + 1;
    textStart = i;
  }
  flushText();
  return tokens;
}

class TokenCursor {
  private readonly tokens: readonly Token[];
  private pos = 0;
  constructor(tokens: readonly Token[]) {
    this.tokens = tokens;
  }
  peek(): Token | undefined {
    return this.tokens[this.pos];
  }
  next(): Token | undefined {
    const t = this.tokens[this.pos];
    this.pos++;
    return t;
  }
}

// ---------------------------------------------------------------------------
// entities (census: only &amp;/&lt;/&gt; occur; numeric forms accepted for
// robustness; an unknown NAMED entity hard-fails — drift tripwire)
// ---------------------------------------------------------------------------

const NAMED_ENTITIES: ReadonlyMap<string, string> = new Map([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
  ["nbsp", " "],
]);

const ENTITY_RE = /&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g;

export function decodeAonEntities(text: string): string {
  return text.replace(ENTITY_RE, (whole, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
    }
    if (body.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(body.slice(1), 10));
    }
    const mapped = NAMED_ENTITIES.get(body);
    if (mapped === undefined) {
      throw new AonMarkupError(whole, 0, whole.length, `unmapped entity "&${body};"`);
    }
    return mapped;
  });
}

// ---------------------------------------------------------------------------
// flow segments — the intermediate between tag structure and markdown structure
// ---------------------------------------------------------------------------

/** Text between tags carries markdown (lines/links/emphasis); inline tags
 * become opaque node segments; `<br/>` is a hard break that must NOT create a
 * markdown line boundary. */
type Seg =
  | { kind: "text"; text: string }
  | { kind: "node"; node: InlineNode }
  | { kind: "hardbreak" };

const NO_MARKS: TextMarks = { bold: false, italic: false, superscript: false };

type Mark = "bold" | "italic" | "superscript";

function applyMark(nodes: readonly InlineNode[], mark: Mark): InlineNode[] {
  return nodes.map((n) => (n.kind === "text" ? { ...n, marks: { ...n.marks, [mark]: true } } : n));
}

// ---------------------------------------------------------------------------
// inline markdown parser (links / ** / _ / entities) over a run of segments
// ---------------------------------------------------------------------------

interface LinkMatch {
  display: string;
  href: string;
  end: number; // index just past the closing ')'
}

/** Depth-aware `[…](…)` match at `openIdx`; falls back to first-`]` when the
 * depth-aware close isn't followed by `(` (handles the `[non-[elf](…)` stray-
 * bracket display). Returns null when no link shape starts here. */
function matchLink(text: string, openIdx: number): LinkMatch | null {
  const tryFrom = (closeIdx: number): LinkMatch | null => {
    if (text[closeIdx + 1] !== "(") return null;
    const parenClose = text.indexOf(")", closeIdx + 2);
    if (parenClose === -1) return null;
    return {
      display: text.slice(openIdx + 1, closeIdx),
      href: text.slice(closeIdx + 2, parenClose),
      end: parenClose + 1,
    };
  };
  // depth-aware
  let depth = 1;
  for (let i = openIdx + 1; i < text.length; i++) {
    const c = text[i];
    if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) {
        const m = tryFrom(i);
        if (m) return m;
        break;
      }
    } else if (c === "\n") break; // links never span markdown lines in this corpus
  }
  // first-`]` fallback
  const firstClose = text.indexOf("]", openIdx + 1);
  if (firstClose === -1) return null;
  return tryFrom(firstClose);
}

const INNER_LINK_RE = /\[([^\]]*)\]\(([^)]*)\)/g;

/** Flattens a link DISPLAY string: inner link markdown reduced to its text
 * (report-counted by the caller), whole-wrap `**`/`_` emphasis stripped,
 * entities decoded, whitespace collapsed. */
function flattenDisplay(display: string): { text: string; hadInnerLink: boolean } {
  let hadInnerLink = false;
  INNER_LINK_RE.lastIndex = 0;
  let text = display.replace(INNER_LINK_RE, (_whole, inner: string) => {
    hadInnerLink = true;
    return inner;
  });
  text = decodeAonEntities(text).replace(/\s+/g, " ").trim();
  for (;;) {
    if (text.startsWith("**") && text.endsWith("**") && text.length >= 4) {
      text = text.slice(2, -2).trim();
      continue;
    }
    if (text.startsWith("_") && text.endsWith("_") && text.length >= 2) {
      text = text.slice(1, -1).trim();
      continue;
    }
    break;
  }
  return { text, hadInnerLink };
}

/** Parses one paragraph's (or heading's / list item's) segments into inline
 * nodes: markdown links via `ctx.resolveLink`, `**`/`_` toggles as marks on
 * text nodes (marks never retro-apply to non-text inline nodes — same
 * documented drop as foundryHtml's `applyMark`), entities decoded. */
function parseInlineSegs(segs: readonly Seg[], ctx: AonParseCtx): InlineNode[] {
  const out: InlineNode[] = [];
  let bold = false;
  let italic = false;
  let buf = "";
  let bufMarks: TextMarks = NO_MARKS;

  const marksNow = (): TextMarks => ({ bold, italic, superscript: false });
  const flush = (): void => {
    if (buf.length > 0) {
      out.push({ kind: "text", content: decodeAonEntities(buf), marks: bufMarks });
      buf = "";
    }
  };
  const append = (s: string): void => {
    const m = marksNow();
    if (buf.length > 0 && (m.bold !== bufMarks.bold || m.italic !== bufMarks.italic)) flush();
    bufMarks = m;
    buf += s;
  };

  for (const seg of segs) {
    if (seg.kind === "node") {
      flush();
      out.push(seg.node);
      continue;
    }
    if (seg.kind === "hardbreak") {
      append("\n");
      continue;
    }
    const text = seg.text;
    let i = 0;
    while (i < text.length) {
      const c = text[i];
      if (c === "[") {
        const link = matchLink(text, i);
        if (link) {
          const { text: display, hadInnerLink } = flattenDisplay(link.display);
          if (hadInnerLink) ctx.report("nestedLinkDisplayFlattened", link.display);
          flush();
          out.push(ctx.resolveLink(decodeAonEntities(link.href), display));
          i = link.end;
          continue;
        }
        append("[");
        i++;
        continue;
      }
      if (c === "*" && text[i + 1] === "*") {
        flush();
        bold = !bold;
        i += 2;
        continue;
      }
      if (c === "_") {
        flush();
        italic = !italic;
        i++;
        continue;
      }
      append(c ?? "");
      i++;
    }
  }
  flush();
  if (bold || italic) {
    ctx.report("unbalancedEmphasis", segsPreview(segs));
  }
  return out;
}

function segsPreview(segs: readonly Seg[]): string {
  let s = "";
  for (const seg of segs) {
    if (seg.kind === "text") s += seg.text;
    if (s.length > 60) break;
  }
  return s.slice(0, 60);
}

// ---------------------------------------------------------------------------
// flow → markdown blocks (paragraph / heading / divider / dash list)
// ---------------------------------------------------------------------------

type Line = Seg[];

function splitLines(segs: readonly Seg[]): Line[] {
  const lines: Line[] = [];
  let cur: Line = [];
  for (const seg of segs) {
    if (seg.kind !== "text") {
      cur.push(seg);
      continue;
    }
    const parts = seg.text.split("\n");
    for (let p = 0; p < parts.length; p++) {
      const part = parts[p] ?? "";
      if (p > 0) {
        lines.push(cur);
        cur = [];
      }
      if (part.length > 0) cur.push({ kind: "text", text: part });
    }
  }
  lines.push(cur);
  return lines;
}

function lineIsBlank(line: Line): boolean {
  return line.every((seg) => seg.kind === "text" && seg.text.trim() === "");
}

function lineLeadText(line: Line): string {
  const first = line[0];
  return first !== undefined && first.kind === "text" ? first.text : "";
}

function lineIsDivider(line: Line): boolean {
  if (line.length !== 1) return false;
  const only = line[0];
  return only !== undefined && only.kind === "text" && /^\s*-{3,}\s*$/.test(only.text);
}

const HEADING_LINE_RE = /^(#{2,3})\s/;
const LIST_LINE_RE = /^-\s/;

/** Trims whitespace-only text segs off both ends of a line and collapses a
 * line sequence into one seg run with single-space joins (markdown soft
 * breaks). */
function joinLines(lines: readonly Line[]): Seg[] {
  const segs: Seg[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) segs.push({ kind: "text", text: " " });
    segs.push(...(lines[i] ?? []));
  }
  return segs;
}

function inlineIsMeaningful(nodes: readonly InlineNode[]): boolean {
  return nodes.some((n) => !(n.kind === "text" && n.content.trim() === ""));
}

/** The markdown-structure pass: groups a flow's lines into paragraph / heading
 * / divider / dash-list blocks and inline-parses each. */
function parseFlowBlocks(segs: readonly Seg[], ctx: AonParseCtx): BlockNode[] {
  const out: BlockNode[] = [];
  const lines = splitLines(segs);
  let paraLines: Line[] = [];

  const flushPara = (): void => {
    if (paraLines.length === 0) return;
    const inline = parseInlineSegs(joinLines(paraLines), ctx);
    paraLines = [];
    if (inlineIsMeaningful(inline)) out.push({ kind: "paragraph", children: inline });
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? [];
    if (lineIsBlank(line)) {
      flushPara();
      i++;
      continue;
    }
    if (lineIsDivider(line)) {
      flushPara();
      out.push({ kind: "divider" });
      i++;
      continue;
    }
    const lead = lineLeadText(line);
    const headingMatch = HEADING_LINE_RE.exec(lead);
    if (headingMatch) {
      flushPara();
      const marker = headingMatch[1] ?? "##";
      const rest: Line = [{ kind: "text", text: lead.slice(headingMatch[0].length) }];
      rest.push(...line.slice(1));
      const children = parseInlineSegs(rest, ctx).filter(
        (n) => !(n.kind === "text" && n.content.trim() === ""),
      );
      out.push({ kind: "heading", level: marker.length, children });
      i++;
      continue;
    }
    if (LIST_LINE_RE.test(lead)) {
      flushPara();
      const items: CodexNode[][] = [];
      while (i < lines.length) {
        const itemLine = lines[i] ?? [];
        const itemLead = lineLeadText(itemLine);
        if (!LIST_LINE_RE.test(itemLead)) break;
        const itemLines: Line[] = [
          [{ kind: "text", text: itemLead.slice(2) }, ...itemLine.slice(1)],
        ];
        i++;
        // Lazy continuation: plain lines join the item (real shape — spell
        // lists wrap onto the next line) until a blank / new item / heading /
        // divider.
        while (i < lines.length) {
          const cont = lines[i] ?? [];
          if (lineIsBlank(cont) || lineIsDivider(cont)) break;
          const contLead = lineLeadText(cont);
          if (LIST_LINE_RE.test(contLead) || HEADING_LINE_RE.test(contLead)) break;
          itemLines.push(cont);
          i++;
        }
        items.push(parseInlineSegs(joinLines(itemLines), ctx));
      }
      out.push({ kind: "list", ordered: false, items });
      continue;
    }
    paraLines.push(line);
    i++;
  }
  flushPara();
  return out;
}

// ---------------------------------------------------------------------------
// the tag-structure parser
// ---------------------------------------------------------------------------

interface SequenceOptions {
  /** Close-tag names that end this sequence (NOT consumed). */
  stopAt: ReadonlySet<string>;
  /** Open/void-tag names that end this sequence WITHOUT being consumed —
   * table-cell recovery (`<td>` while a cell is open). */
  stopAtOpen?: ReadonlySet<string>;
  /** Enclosing open-tag names: an unexpected close naming one of these ends
   * the sequence defensively (the owner consumes it); any other KNOWN close is
   * a censused stray → skipped + report; an unknown close hard-fails. */
  scopes: ReadonlySet<string>;
}

const EMPTY_SET: ReadonlySet<string> = new Set();

function withScope(scopes: ReadonlySet<string>, name: string): ReadonlySet<string> {
  const next = new Set(scopes);
  next.add(name);
  return next;
}

function fail(tok: Token | undefined, message: string): never {
  const start = tok?.start ?? 0;
  throw new AonMarkupError("", start, start, message);
}

// ---------------------------------------------------------------------------
// P10 (D29-91/D29-93): `<row>` statRow candidacy + boundary trim
// ---------------------------------------------------------------------------

/** Bumped once on EVERY `row`/`column`/`center` open, at the moment `parseSequence`
 * recognizes the tag — including the outermost one itself. A row samples this
 * counter right after its OWN bump (so its own opening never counts against it),
 * recurses into its children, then compares: any wrapper opened anywhere inside
 * that recursion (at any depth — the counter is shared across the whole call
 * stack) bumps the counter again, so a post-recursion mismatch means "some
 * wrapper opened inside my scope" — the D29-91 candidacy condition (a). This is
 * the "per-row-invocation counter sampled around the recursive `parseSequence`
 * call" the census's instrumented-recorder prototype proved out. Module-scope is
 * safe: `parseAonMarkdown` is fully synchronous (no `await` inside), so two
 * top-level parses can never interleave even when driven concurrently (e.g.
 * `Promise.all` over many docs) — only the delta across one call's own
 * synchronous recursion is ever read. */
let wrapperOpenSeq = 0;

/** Drops boundary TEXT nodes that trim to fully empty, then `trimStart`s the
 * (new) first node's content and `trimEnd`s the (new) last node's content when
 * they're text — D29-91's cell-boundary trim (census: "AC 32 " trailing
 * whitespace). Non-text boundary nodes are never dropped (no "trim to empty"
 * concept applies to them). A single surviving node gets both trimStart AND
 * trimEnd applied (equivalent to a plain `.trim()`) since the same index is read
 * again after the first mutation. */
function trimCellBoundary(children: readonly InlineNode[]): InlineNode[] {
  let start = 0;
  let end = children.length;
  while (start < end) {
    const node = children[start];
    if (node !== undefined && node.kind === "text" && node.content.trim() === "") {
      start++;
      continue;
    }
    break;
  }
  while (end > start) {
    const node = children[end - 1];
    if (node !== undefined && node.kind === "text" && node.content.trim() === "") {
      end--;
      continue;
    }
    break;
  }
  const result = children.slice(start, end);
  if (result.length === 0) return result;
  const first = result[0];
  if (first !== undefined && first.kind === "text") {
    result[0] = { ...first, content: first.content.trimStart() };
  }
  const lastIdx = result.length - 1;
  const last = result[lastIdx];
  if (last !== undefined && last.kind === "text") {
    result[lastIdx] = { ...last, content: last.content.trimEnd() };
  }
  return result;
}

/** D29-91 condition (b)+(c): every parsed child is a `paragraph`, boundary-
 * trimmed into a `statRow` cell. Returns `undefined` when any child isn't a
 * paragraph (a candidate row never has a non-paragraph child by construction —
 * a wrapper containing one would already have failed condition (a) — but this
 * stays a real check, not an assumption) or when `children` is empty (an empty
 * row keeps flattening to nothing, D29-91). Doesn't itself check the `>= 2`
 * cell-count gate — the caller decides collapse vs. single-cell-kept vs. plain
 * flatten from the returned array's length. */
function collectStatRowCells(children: readonly BlockNode[]): InlineNode[][] | undefined {
  if (children.length === 0) return undefined;
  const cells: InlineNode[][] = [];
  for (const child of children) {
    if (child.kind !== "paragraph") return undefined;
    cells.push(trimCellBoundary(child.children));
  }
  return cells;
}

/**
 * The recursive workhorse: walks tokens producing blocks; text/inline-tag runs
 * buffer as flow segments and become markdown blocks at each block boundary.
 * Returns fully block-shaped output (loose inline wraps into paragraphs via
 * the flow pass).
 */
function parseSequence(cursor: TokenCursor, ctx: AonParseCtx, opts: SequenceOptions): BlockNode[] {
  const out: BlockNode[] = [];
  let flow: Seg[] = [];

  const flushFlow = (): void => {
    if (flow.length === 0) return;
    out.push(...parseFlowBlocks(flow, ctx));
    flow = [];
  };

  for (;;) {
    const tok = cursor.peek();
    if (tok === undefined) {
      flushFlow();
      return out;
    }
    if (tok.type === "close") {
      if (opts.stopAt.has(tok.name)) {
        flushFlow();
        return out;
      }
      if (opts.scopes.has(tok.name)) {
        // Owned further up the recursion — end defensively, owner consumes.
        flushFlow();
        return out;
      }
      if (KNOWN_TAGS.has(tok.name)) {
        // Censused stray close (list openers lost upstream, `</span>` after a
        // dropped junk open, ...) — skip it, keep the content.
        ctx.report("strayCloseIgnored", tok.name);
        cursor.next();
        continue;
      }
      fail(tok, `unknown close tag </${tok.name}>`);
    }
    if (tok.type === "open" && opts.stopAtOpen?.has(tok.tag.name) === true) {
      flushFlow();
      return out;
    }
    cursor.next();

    if (tok.type === "text") {
      flow.push({ kind: "text", text: tok.text });
      continue;
    }

    if (tok.type === "void") {
      handleVoidTag(tok.tag, flow, ctx, tok);
      continue;
    }

    // tok.type === "open"
    const name = tok.tag.name;
    if (!KNOWN_TAGS.has(name)) fail(tok, `unknown tag <${name}>`);
    if (JUNK_TAGS.has(name)) {
      ctx.report("junkTagDropped", name);
      continue;
    }
    switch (name) {
      case "sup":
      case "b": {
        const inner = parseInlineSpan(cursor, ctx, new Set([name]), opts.scopes);
        consumeClose(cursor, ctx, new Set([name]));
        flow.push(
          ...applyMark(inner, name === "sup" ? "superscript" : "bold").map(
            (node): Seg => ({ kind: "node", node }),
          ),
        );
        continue;
      }
      case "span": {
        ctx.report("spanFlattened", tok.tag.attrs["class"] ?? "");
        const inner = parseInlineSpan(cursor, ctx, new Set(["span"]), opts.scopes);
        consumeClose(cursor, ctx, new Set(["span"]));
        flow.push(...inner.map((node): Seg => ({ kind: "node", node })));
        continue;
      }
      case "title":
      case "h2": {
        flushFlow();
        if (name === "h2") ctx.report("h2TitleSynonym", tok.tag.attrs["class"] ?? "");
        const level = name === "h2" ? 2 : Number(tok.tag.attrs["level"] ?? "2");
        if (!Number.isInteger(level) || level < 1) {
          fail(tok, `<title> with non-integer level "${tok.tag.attrs["level"] ?? ""}"`);
        }
        // 2 of the 3 real <h2> opens are closed by </title> — accept either.
        const stop = new Set(["title", "h2"]);
        const children = parseInlineSpan(cursor, ctx, stop, opts.scopes);
        consumeClose(cursor, ctx, stop);
        const right = tok.tag.attrs["right"];
        out.push({
          kind: "heading",
          level,
          children,
          ...(right !== undefined && right !== "" ? { meta: right } : {}),
        });
        continue;
      }
      case "traits": {
        flushFlow();
        skipUntilClose(cursor, ctx, "traits");
        ctx.report("traitsBlockDropped", "");
        continue;
      }
      case "aside":
      case "spoilers": {
        flushFlow();
        const children = parseSequence(cursor, ctx, {
          stopAt: new Set([name]),
          scopes: withScope(opts.scopes, name),
        });
        consumeClose(cursor, ctx, new Set([name]));
        out.push({ kind: "aside", children });
        continue;
      }
      case "row": {
        // P10 (D29-91/D29-93): a candidate collapses to `statRow`; everything
        // else still flattens to sequential blocks exactly like `<column>`/
        // `<center>` (D29-2 verbatim posture, amended only for the candidate
        // case). See `collectStatRowCells`/`wrapperOpenSeq`'s own doc comments
        // for the candidacy mechanics.
        flushFlow();
        wrapperOpenSeq++;
        const preChildWrapperSeq = wrapperOpenSeq;
        const children = parseSequence(cursor, ctx, {
          stopAt: new Set([name]),
          scopes: withScope(opts.scopes, name),
        });
        consumeClose(cursor, ctx, new Set([name]));
        const hasNestedWrapper = wrapperOpenSeq !== preChildWrapperSeq;
        const cells = hasNestedWrapper ? undefined : collectStatRowCells(children);
        if (cells !== undefined && cells.length >= 2) {
          ctx.report("statRowCollapsed", String(cells.length));
          out.push({ kind: "statRow", cells });
        } else {
          if (cells !== undefined && cells.length === 1) {
            ctx.report("statRowSingleCellKept", "");
          }
          out.push(...children);
        }
        continue;
      }
      case "column":
      case "center": {
        // Layout wrappers — flatten to sequential blocks (D29-2). Still bump
        // `wrapperOpenSeq` (an enclosing `<row>`'s candidacy check must see a
        // nested column/center the same as a nested row).
        flushFlow();
        wrapperOpenSeq++;
        const children = parseSequence(cursor, ctx, {
          stopAt: new Set([name]),
          scopes: withScope(opts.scopes, name),
        });
        consumeClose(cursor, ctx, new Set([name]));
        out.push(...children);
        continue;
      }
      case "ul":
      case "ol": {
        flushFlow();
        const items = parseListItems(cursor, ctx, name, opts.scopes);
        out.push({ kind: "list", ordered: name === "ol", items });
        continue;
      }
      case "li": {
        // Implicit list: a bare <li> outside any list (2 real docs whose
        // opener was lost upstream) — collect sibling items.
        flushFlow();
        ctx.report("implicitListRecovered", "");
        const items: CodexNode[][] = [];
        items.push(parseListItemContent(cursor, ctx, opts.scopes));
        for (;;) {
          const next = cursor.peek();
          if (next === undefined) break;
          if (next.type === "text" && next.text.trim() === "") {
            cursor.next();
            continue;
          }
          if (next.type === "open" && next.tag.name === "li") {
            cursor.next();
            items.push(parseListItemContent(cursor, ctx, opts.scopes));
            continue;
          }
          if (next.type === "close" && (next.name === "ul" || next.name === "ol")) {
            cursor.next(); // the orphaned closer
          }
          break;
        }
        out.push({ kind: "list", ordered: false, items });
        continue;
      }
      case "table": {
        flushFlow();
        out.push(parseTable(cursor, ctx, opts.scopes));
        continue;
      }
      default:
        // Structural table parts outside a table, etc.
        fail(tok, `unexpected <${name}> in flow context`);
    }
  }
}

function handleVoidTag(tag: TagToken, flow: Seg[], ctx: AonParseCtx, tok: Token): void {
  switch (tag.name) {
    case "br":
      flow.push({ kind: "hardbreak" });
      return;
    case "image":
      ctx.report("imageDropped", tag.attrs["src"] ?? "");
      return;
    case "actions": {
      const cost = (tag.attrs["string"] ?? "").trim();
      if (cost === "") {
        ctx.report("emptyActionsGlyphDropped", "");
        return;
      }
      flow.push({ kind: "node", node: { kind: "actionGlyph", cost } });
      return;
    }
    case "date": {
      const value = tag.attrs["value"] ?? "";
      if (value !== "") {
        flow.push({ kind: "node", node: { kind: "text", content: value, marks: NO_MARKS } });
      }
      return;
    }
    case "trait": {
      // Standalone pill outside a <traits> wrapper (24 real uses, sidebar
      // statblocks) — label text isn't in any facet field, so inline it.
      const label = tag.attrs["label"] ?? "";
      ctx.report("standaloneTraitInlined", label);
      for (const node of parseInlineSegs([{ kind: "text", text: label }], ctx)) {
        flow.push({ kind: "node", node });
      }
      return;
    }
    case "document": {
      const target = tag.attrs["id"] ?? "";
      if (target === "") fail(tok, "<document> without id");
      const override = tag.attrs["override-title-right"];
      if (override !== undefined) ctx.report("embedOverrideTitleRightDropped", override);
      flow.push({ kind: "node", node: { kind: "embed", target, resolved: false } });
      return;
    }
    default:
      fail(tok, `unknown void tag <${tag.name}/>`);
  }
}

/** Collects inline-only content until one of `stopNames` closes — used for
 * `<title>`/`<sup>`/`<b>`/`<span>` bodies, which never contain block tags in
 * this corpus (a block tag here is a hard fail). Newlines inside collapse to
 * soft spaces via the flow pass. */
function parseInlineSpan(
  cursor: TokenCursor,
  ctx: AonParseCtx,
  stopNames: ReadonlySet<string>,
  scopes: ReadonlySet<string>,
): InlineNode[] {
  const flow: Seg[] = [];
  for (;;) {
    const tok = cursor.peek();
    if (tok === undefined) break; // implicit close at EOF (reported by consumeClose)
    if (tok.type === "close" && (stopNames.has(tok.name) || scopes.has(tok.name))) break;
    cursor.next();
    if (tok.type === "text") {
      flow.push({ kind: "text", text: tok.text });
      continue;
    }
    if (tok.type === "void") {
      handleVoidTag(tok.tag, flow, ctx, tok);
      continue;
    }
    if (tok.type === "open" && (tok.tag.name === "sup" || tok.tag.name === "b")) {
      const inner = parseInlineSpan(cursor, ctx, new Set([tok.tag.name]), scopes);
      consumeClose(cursor, ctx, new Set([tok.tag.name]));
      flow.push(
        ...applyMark(inner, tok.tag.name === "sup" ? "superscript" : "bold").map(
          (node): Seg => ({ kind: "node", node }),
        ),
      );
      continue;
    }
    if (tok.type === "open" && tok.tag.name === "h2") {
      // 1 real doc (creature-4271) nests `<H2 Class="Title">…</H2>` INSIDE a
      // `<title>` — the heading markup is redundant chrome there; flatten it.
      ctx.report("nestedH2Flattened", "");
      const inner = parseInlineSpan(cursor, ctx, new Set(["h2", "title"]), scopes);
      consumeClose(cursor, ctx, new Set(["h2", "title"]));
      flow.push(...inner.map((node): Seg => ({ kind: "node", node })));
      continue;
    }
    if (tok.type === "close" && KNOWN_TAGS.has(tok.name)) {
      ctx.report("strayCloseIgnored", tok.name);
      continue;
    }
    fail(tok, `unexpected ${tok.type === "open" ? `<${tok.tag.name}>` : "token"} in inline span`);
  }
  // One implicit line: newlines are soft breaks here.
  const oneLine: Seg[] = flow.map((s) =>
    s.kind === "text" ? { kind: "text", text: s.text.replace(/\n/g, " ") } : s,
  );
  return parseInlineSegs(oneLine, ctx).filter(
    (n) => !(n.kind === "text" && n.content.trim() === ""),
  );
}

function consumeClose(cursor: TokenCursor, ctx: AonParseCtx, names: ReadonlySet<string>): void {
  const tok = cursor.peek();
  if (tok === undefined) {
    // Implicit close at end of input (1 real doc — hazard-307's <ol>).
    ctx.report("unclosedTagAtEof", [...names].join("|"));
    return;
  }
  if (tok.type === "close" && names.has(tok.name)) {
    cursor.next();
    return;
  }
  // A close owned by an outer scope reached us (missing inner close) — leave
  // it for the owner.
  ctx.report("implicitCloseBeforeOuter", JSON.stringify([...names]));
}

function skipUntilClose(cursor: TokenCursor, ctx: AonParseCtx, name: string): void {
  for (;;) {
    const tok = cursor.next();
    if (tok === undefined) {
      ctx.report("unclosedTagAtEof", name);
      return;
    }
    if (tok.type === "close" && tok.name === name) return;
  }
}

function parseListItemContent(
  cursor: TokenCursor,
  ctx: AonParseCtx,
  scopes: ReadonlySet<string>,
): CodexNode[] {
  const content = parseSequence(cursor, ctx, {
    stopAt: new Set(["li"]),
    stopAtOpen: new Set(["li"]),
    scopes: withScope(scopes, "li"),
  });
  const next = cursor.peek();
  if (next !== undefined && next.type === "close" && next.name === "li") cursor.next();
  // Simple items (the overwhelming case) unwrap to a bare inline run — the
  // nodes.test.ts fixture convention for list items.
  const only = content[0];
  if (content.length === 1 && only !== undefined && only.kind === "paragraph") {
    return only.children;
  }
  return content;
}

function parseListItems(
  cursor: TokenCursor,
  ctx: AonParseCtx,
  listName: string,
  scopes: ReadonlySet<string>,
): CodexNode[][] {
  const items: CodexNode[][] = [];
  const innerScopes = withScope(scopes, listName);
  for (;;) {
    const tok = cursor.peek();
    if (tok === undefined) {
      ctx.report("unclosedTagAtEof", listName);
      return items;
    }
    if (tok.type === "close" && tok.name === listName) {
      cursor.next();
      return items;
    }
    if (tok.type === "text" && tok.text.trim() === "") {
      cursor.next();
      continue;
    }
    if (tok.type === "open" && tok.tag.name === "li") {
      cursor.next();
      items.push(parseListItemContent(cursor, ctx, innerScopes));
      continue;
    }
    fail(tok, `expected <li> inside <${listName}>`);
  }
}

// ---------------------------------------------------------------------------
// tables (HTML-shaped; census: thead/tbody/tfoot wrappers, th headers, no
// caption/colgroup, colspan/rowspan/bgcolor presentation attrs dropped)
// ---------------------------------------------------------------------------

const CELL_STOP_OPENS: ReadonlySet<string> = new Set(["td", "th", "tr"]);

function parseCell(
  cursor: TokenCursor,
  ctx: AonParseCtx,
  cellName: string,
  scopes: ReadonlySet<string>,
): CodexNode[] {
  const content = parseSequence(cursor, ctx, {
    stopAt: new Set([cellName === "td" ? "td" : "th"]),
    stopAtOpen: CELL_STOP_OPENS,
    scopes: withScope(scopes, cellName),
  });
  const next = cursor.peek();
  if (next !== undefined && next.type === "close" && next.name === cellName) {
    cursor.next();
  } else {
    // Implicit cell close: `<td>…<td>` with the close lost upstream (3 docs).
    ctx.report("implicitCellClose", cellName);
  }
  const only = content[0];
  if (content.length === 1 && only !== undefined && only.kind === "paragraph") {
    return only.children;
  }
  return content;
}

function parseTableRow(
  cursor: TokenCursor,
  ctx: AonParseCtx,
  scopes: ReadonlySet<string>,
  implicit: boolean,
): TableRow {
  if (!implicit) cursor.next(); // consume <tr>
  const rowScopes = withScope(scopes, "tr");
  const cells: CodexNode[][] = [];
  let header = false;
  for (;;) {
    const tok = cursor.peek();
    if (tok === undefined) {
      ctx.report("unclosedTagAtEof", "tr");
      return { header, cells };
    }
    if (tok.type === "close" && tok.name === "tr") {
      cursor.next();
      return { header, cells };
    }
    if (tok.type === "close" && scopes.has(tok.name)) {
      // Missing </tr> before the wrapper/table close — implicit row end.
      ctx.report("implicitRowClose", tok.name);
      return { header, cells };
    }
    if (tok.type === "text") {
      if (tok.text.trim() === "") {
        cursor.next();
        continue;
      }
      // 4 real docs (the sloughstone equipment family) carry stray markup
      // debris between cells — a `</td>` misplaced inside a bold marker
      // leaves a bare `**` at row level. Dropped, report-counted; tags here
      // still hard-fail below.
      ctx.report("textInsideTableRowDropped", tok.text.trim().slice(0, 30));
      cursor.next();
      continue;
    }
    if (tok.type === "open" && (tok.tag.name === "td" || tok.tag.name === "th")) {
      const cellName = tok.tag.name;
      if (cellName === "th") header = true;
      cursor.next();
      cells.push(parseCell(cursor, ctx, cellName, rowScopes));
      continue;
    }
    if (tok.type === "open" && tok.tag.name === "tr") {
      // Missing </tr> before the next row open (1 real doc, spell-2133) —
      // implicit row end; the table loop starts the new row.
      ctx.report("implicitRowClose", "tr-open");
      return { header, cells };
    }
    if (tok.type === "close" && (tok.name === "td" || tok.name === "th")) {
      // Transposed closes (`…</tr></td>` in rules-2219) leave a stray cell
      // close after its row already ended — skip it.
      ctx.report("strayCloseIgnored", tok.name);
      cursor.next();
      continue;
    }
    fail(tok, "unexpected token inside <tr>");
  }
}

function parseRowsUntil(
  cursor: TokenCursor,
  ctx: AonParseCtx,
  wrapperName: string,
  scopes: ReadonlySet<string>,
): TableRow[] {
  const rows: TableRow[] = [];
  const innerScopes = withScope(scopes, wrapperName);
  for (;;) {
    const tok = cursor.peek();
    if (tok === undefined) {
      ctx.report("unclosedTagAtEof", wrapperName);
      return rows;
    }
    if (tok.type === "close" && tok.name === wrapperName) {
      cursor.next();
      return rows;
    }
    if (tok.type === "text" && tok.text.trim() === "") {
      cursor.next();
      continue;
    }
    if (tok.type === "open" && tok.tag.name === "tr") {
      rows.push(parseTableRow(cursor, ctx, innerScopes, false));
      continue;
    }
    if (tok.type === "open" && (tok.tag.name === "td" || tok.tag.name === "th")) {
      // Implicit <tr>: the row opens were lost upstream (4 real rules docs).
      ctx.report("implicitTableRow", wrapperName);
      rows.push(parseTableRow(cursor, ctx, innerScopes, true));
      continue;
    }
    fail(tok, `unexpected token inside <${wrapperName}>`);
  }
}

function parseTable(cursor: TokenCursor, ctx: AonParseCtx, scopes: ReadonlySet<string>): BlockNode {
  const rows: TableRow[] = [];
  const tableScopes = withScope(scopes, "table");
  for (;;) {
    const tok = cursor.peek();
    if (tok === undefined) {
      ctx.report("unclosedTagAtEof", "table");
      return { kind: "table", rows };
    }
    if (tok.type === "close" && tok.name === "table") {
      cursor.next();
      return { kind: "table", rows };
    }
    if (tok.type === "text" && tok.text.trim() === "") {
      cursor.next();
      continue;
    }
    if (
      tok.type === "open" &&
      (tok.tag.name === "thead" || tok.tag.name === "tbody" || tok.tag.name === "tfoot")
    ) {
      const wrapper = tok.tag.name;
      cursor.next();
      rows.push(...parseRowsUntil(cursor, ctx, wrapper, tableScopes));
      continue;
    }
    if (tok.type === "open" && tok.tag.name === "tr") {
      rows.push(parseTableRow(cursor, ctx, tableScopes, false));
      continue;
    }
    if (tok.type === "open" && (tok.tag.name === "td" || tok.tag.name === "th")) {
      ctx.report("implicitTableRow", "table");
      rows.push(parseTableRow(cursor, ctx, tableScopes, true));
      continue;
    }
    if (tok.type === "close" && (tok.name === "tr" || tok.name === "td" || tok.name === "th")) {
      // Doubled/transposed closes (`</tr></tr>`, `</tr></td>`) — skip.
      ctx.report("strayCloseIgnored", tok.name);
      cursor.next();
      continue;
    }
    fail(tok, "unexpected token inside <table>");
  }
}

// ---------------------------------------------------------------------------
// entry point
// ---------------------------------------------------------------------------

/**
 * Parses one AoN doc's `markdown` into `BlockNode[]` (D29-2's renderer
 * contract). CRLF is normalized to LF FIRST (D29-7). Loose inline content
 * always wraps into paragraphs, so the return is fully block-shaped. Throws
 * `AonMarkupError` on anything outside the discovered grammar.
 */
export function parseAonMarkdown(markdown: string, ctx: AonParseCtx): BlockNode[] {
  const normalized = markdown.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  try {
    const tokens = tokenize(normalized, ctx);
    const cursor = new TokenCursor(tokens);
    return parseSequence(cursor, ctx, { stopAt: EMPTY_SET, scopes: EMPTY_SET });
  } catch (e) {
    if (e instanceof AonMarkupError && e.source === "") {
      throw new AonMarkupError(normalized, e.start, e.end, e.message);
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// D29-62 (R3, P6): the structural masthead strip
// ---------------------------------------------------------------------------

/** One collected masthead line: `label` = the bold lead text (trimmed),
 * `value` = the rest of that paragraph's inline children. */
export interface MastheadPair {
  label: string;
  value: InlineNode[];
}

export interface MastheadStripResult {
  /** `body` with the masthead's H1 title + every collected bold-label line
   * (Source included) + its own trailing divider (when one immediately
   * follows) removed — everything else untouched, in order. */
  body: BlockNode[];
  /** Every collected pair whose label isn't "Source" (already rendered via
   * `Citation`, D29-24) — absent, never `[]`, when the masthead run
   * collected zero non-"Source" pairs. */
  mastheadExtra?: MastheadPair[];
}

/** Whole-row-or-nothing check (D29-92): a leading statRow unwraps into masthead
 * pairs only when EVERY cell qualifies as a masthead line (cell[0] is a `text`
 * node with `marks.bold === true`, same test a bold-first paragraph gets below).
 * Returns `undefined` the moment any cell doesn't qualify — the caller stops
 * BEFORE the row entirely rather than partially consume it (measured 0
 * real occurrences; still report-counted as a drift tripwire). */
function statRowAsMastheadPairs(cells: readonly InlineNode[][]): MastheadPair[] | undefined {
  const pairs: MastheadPair[] = [];
  for (const cell of cells) {
    const lead = cell[0];
    if (lead === undefined || lead.kind !== "text" || !lead.marks.bold) return undefined;
    pairs.push({ label: lead.content.trim(), value: cell.slice(1) });
  }
  return pairs;
}

/**
 * D29-62: strips the AoN masthead's bold-label lines out of `body` and
 * returns the leftover pairs as `mastheadExtra` — a general STRUCTURAL walk
 * (no category name, no per-field enumeration, no divider dependency),
 * verified against real samples spanning spell/feat/equipment/weapon/armor/
 * shield/ritual/ancestry:
 *
 *   1. `body[0]` a level-1 heading (the AoN masthead's own title, duplicating
 *      `entity.name`) is dropped.
 *   2. Walk forward while the current node is EITHER a `paragraph` whose
 *      FIRST child is a `text` node with `marks.bold === true` (a masthead
 *      line: `label` = the bold text's own content, trimmed; `value` = every
 *      other child) OR — P10, D29-92 — a `statRow` every one of whose cells
 *      qualifies the same way (`statRowAsMastheadPairs`; a statRow with even
 *      one non-qualifying cell stops the walk BEFORE it, whole-row-or-nothing,
 *      report-counted). Stop at the first node that matches neither (a
 *      `divider`, a plain prose paragraph whose first child isn't bold, a
 *      heading, a list, ...).
 *   3. If the node immediately after the collected run is a `divider`, drop
 *      it too (the masthead's own closing rule). If no divider follows (the
 *      real `ancestry/human` case — an H1 + a bare "Source" paragraph,
 *      straight into prose), stop cleanly — nothing extra is consumed, so
 *      the body's own prose survives intact.
 *
 * Pure except for the optional `report` sink (P10 addition, used only for the
 * statRow partial-consumption drift tripwire above — every OTHER path here is
 * still a total, side-effect-free walk): an entity with no masthead shape at
 * all (most `rules`/`lore` docs, per R3's own scope) simply collects zero
 * pairs and loses nothing but a possible leading H1.
 */
export function stripMasthead(
  body: readonly BlockNode[],
  report?: (cls: string, detail: string) => void,
): MastheadStripResult {
  let rest = body;
  const first = rest[0];
  if (first !== undefined && first.kind === "heading" && first.level === 1) {
    rest = rest.slice(1);
  }

  const pairs: MastheadPair[] = [];
  let i = 0;
  for (; i < rest.length; i++) {
    const node = rest[i];
    if (node === undefined) break;
    if (node.kind === "statRow") {
      const rowPairs = statRowAsMastheadPairs(node.cells);
      if (rowPairs === undefined) {
        report?.("mastheadStatRowPartial", `cells=${node.cells.length}`);
        break;
      }
      pairs.push(...rowPairs);
      continue;
    }
    if (node.kind !== "paragraph") break;
    const lead = node.children[0];
    if (lead === undefined || lead.kind !== "text" || !lead.marks.bold) break;
    pairs.push({ label: lead.content.trim(), value: node.children.slice(1) });
  }

  let remaining = rest.slice(i);
  if (remaining[0]?.kind === "divider") remaining = remaining.slice(1);

  const mastheadExtra = pairs.filter((p) => p.label !== "Source");
  return {
    body: remaining as BlockNode[],
    ...(mastheadExtra.length > 0 ? { mastheadExtra } : {}),
  };
}
