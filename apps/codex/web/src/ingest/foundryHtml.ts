import type { BlockNode, CodexNode, InlineNode, TableRow } from "../schema/nodes";
import { type EnricherContext, EnricherGrammarError, parseEnrichedText } from "./enrichers";

/**
 * Foundry description HTML (`system.description.value`, journal page
 * `text.content`) → `BlockNode[]` (D29-2, spec §2/§3). Hand-rolled (D29-9 — no new
 * deps; a lenient off-the-shelf parser is the wrong failure mode here): the tag
 * vocabulary is small and closed, discovered by an empirical census over the real
 * `pf2e-8.3.0` snapshot (28,636 pack docs incl. embedded Actor items, plus the 4
 * included journal entries — see the codex-0029 memory for the full counts):
 *
 *   p strong hr em td li span tr ul th tbody table thead h1-h4 ol col section
 *   blockquote div colgroup caption sup br code
 *
 * (`code` only turned up in the `criticaldeck/*.json` critical-fumble/-hit decks
 * — JournalEntry-shaped docs living outside `journals/`, swept as a bonus check
 * alongside the 4 included journal entries — not in any Item/Actor description.)
 *
 * Every tag found is handled deliberately below (mapped to a CodexNode kind, or
 * explicitly flattened/dropped with a documented reason). An UNMAPPED tag is a
 * HARD FAIL (`FoundryHtmlError`, D29-9's drift tripwire) — never silently passed
 * through or stripped. `<img>` was verified absent (0 of 28,636 docs); `<a>`
 * (real hyperlinks) likewise never occurs — Foundry only ever links via the
 * `@UUID`/`@Embed` enrichers, handled by `enrichers.ts`.
 *
 * Text content inside any element runs through `parseEnrichedText` (Module 1) —
 * this module never resolves an enricher or decodes an entity itself.
 */

export class FoundryHtmlError extends Error {
  readonly source: string;

  constructor(source: string, message: string) {
    super(message);
    this.name = "FoundryHtmlError";
    // Plain field assignment (see the matching comment on EnricherGrammarError
    // in enrichers.ts) — no TS constructor parameter properties.
    this.source = source;
  }
}

// ---------------------------------------------------------------------------
// tokenizer
// ---------------------------------------------------------------------------

interface TagToken {
  name: string;
  attrs: Record<string, string>;
}

type Token =
  | { type: "open"; tag: TagToken }
  | { type: "close"; name: string }
  | { type: "void"; tag: TagToken }
  | { type: "text"; text: string };

/** Tags with no content and no closing tag in this corpus (`<hr />`/`<hr>`,
 * `<br>`/`<br />`, `<col>`) — treated as void regardless of whether the source
 * wrote a self-closing slash. */
const VOID_TAGS = new Set(["hr", "br", "col"]);

const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*"([^"]*)"/g;

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  ATTR_RE.lastIndex = 0;
  for (let m = ATTR_RE.exec(raw); m !== null; m = ATTR_RE.exec(raw)) {
    const name = m[1];
    const value = m[2];
    if (name !== undefined && value !== undefined) attrs[name.toLowerCase()] = value;
  }
  return attrs;
}

function tokenize(html: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = html.length;
  while (i < n) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      const text = html.slice(i);
      if (text.length > 0) tokens.push({ type: "text", text });
      break;
    }
    if (lt > i) {
      tokens.push({ type: "text", text: html.slice(i, lt) });
    }
    const gt = html.indexOf(">", lt);
    if (gt === -1) {
      throw new FoundryHtmlError(html, `unterminated tag starting at index ${lt}`);
    }
    const raw = html.slice(lt + 1, gt);
    i = gt + 1;
    const closing = raw.startsWith("/");
    const selfClosing = raw.endsWith("/");
    let body = raw;
    if (closing) body = body.slice(1);
    if (selfClosing) body = body.slice(0, -1);
    body = body.trim();
    const spaceIdx = body.search(/\s/);
    const name = (spaceIdx === -1 ? body : body.slice(0, spaceIdx)).toLowerCase();
    const attrsRaw = spaceIdx === -1 ? "" : body.slice(spaceIdx + 1);
    const attrs = parseAttrs(attrsRaw);
    if (closing) {
      tokens.push({ type: "close", name });
    } else if (selfClosing || VOID_TAGS.has(name)) {
      tokens.push({ type: "void", tag: { name, attrs } });
    } else {
      tokens.push({ type: "open", tag: { name, attrs } });
    }
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// tree walker
// ---------------------------------------------------------------------------

class TokenCursor {
  private readonly tokens: readonly Token[];
  private pos = 0;
  // Plain field, not a parameter property (see the error-class comments above —
  // strip-only Node TS doesn't support the shorthand).
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

function consumeClose(cursor: TokenCursor, name: string): void {
  const tok = cursor.peek();
  if (tok === undefined) {
    // Real corpus finding: the official `PF2E.NPC.Abilities.Glossary.Engulf`
    // localize value (139 real uses across many creatures) has one `<p>` that's
    // never explicitly closed before the string ends — a genuine upstream
    // authoring typo, not an unknown-grammar drift signal. Standard HTML5
    // parsing implicitly closes an unclosed element at end-of-input; mirrored
    // here rather than hard-failing on it.
    return;
  }
  if (tok.type !== "close" || tok.name !== name) {
    throw new FoundryHtmlError("", `expected </${name}>, got ${JSON.stringify(tok)}`);
  }
  cursor.next();
}

type Mark = "bold" | "italic" | "superscript";

function applyMark(nodes: readonly InlineNode[], mark: Mark): InlineNode[] {
  return nodes.map((n) => (n.kind === "text" ? { ...n, marks: { ...n.marks, [mark]: true } } : n));
}

interface SequenceOptions {
  /** Close tags that end this sequence (NOT consumed — the caller consumes its
   * own close). */
  stopAt: ReadonlySet<string>;
  /** Whether a loose run of inline content (no block-tag wrapper) should be
   * auto-wrapped into a synthetic `paragraph`. `true` for the top-level document
   * body and for container tags whose schema field is `CodexNode[]` alongside
   * genuine block children (blockquote/aside); `false` for contexts whose schema
   * field explicitly allows bare inline arrays (list items, table cells, mark
   * wrappers) — matches the `nodes.test.ts` fixture convention. */
  wrapLooseInline: boolean;
  /** S4 emit-gate finding (real corpus, `PF2E.NPC.Abilities.Glossary.Engulf`
   * among others — 139+ real uses): a `<p>` sometimes reopens mid-string with
   * no `</p>` in between at all (not just the already-handled "unclosed at
   * end of string" case, `consumeClose`'s own EOF tolerance). Standard HTML5
   * tag-omission rules treat a `<p>` immediately followed by another `<p>` as
   * an IMPLICIT close of the first — mirrored here: when set, an OPEN token
   * matching this name ends the sequence (left UNCONSUMED, same as a real
   * `stopAt` close) instead of recursing into it as this sequence's own
   * content. Without this, the reopening `<p>` got parsed as a nested
   * `paragraph` block sitting inside the OUTER paragraph's `InlineNode[]`
   * children — a real schema violation only the emit-time zod validation
   * gate (acceptance C) caught, since no S2 unit fixture exercised this exact
   * malformed-markup shape. */
  reopenBoundaryTag?: string;
}

/**
 * The one recursive workhorse: walks tokens until a `stopAt` close tag (left
 * unconsumed) or end of input, producing block nodes for recognized block tags
 * and inline nodes (via `parseEnrichedText` for text runs) for everything else.
 */
function parseSequence(
  cursor: TokenCursor,
  ctx: EnricherContext,
  opts: SequenceOptions,
): CodexNode[] {
  const out: CodexNode[] = [];
  let inlineBuf: InlineNode[] = [];
  let textBuf = "";

  const flushText = (): void => {
    if (textBuf.length > 0) {
      inlineBuf.push(...parseEnrichedText(textBuf, ctx));
      textBuf = "";
    }
  };
  const flushInline = (): void => {
    flushText();
    if (inlineBuf.length > 0) {
      // Whitespace-only content between block tags (e.g. the "\n" between
      // `</p>` and the next `<hr />`) is insignificant, same as standard HTML
      // rendering — drop it rather than emit a spurious empty paragraph.
      const meaningful = inlineBuf.some((n) => !(n.kind === "text" && n.content.trim() === ""));
      if (meaningful) {
        if (opts.wrapLooseInline) {
          out.push({ kind: "paragraph", children: inlineBuf });
        } else {
          out.push(...inlineBuf);
        }
      }
      inlineBuf = [];
    }
  };

  for (;;) {
    const tok = cursor.peek();
    if (tok === undefined) {
      flushInline();
      return out;
    }
    if (tok.type === "close" && opts.stopAt.has(tok.name)) {
      flushInline();
      return out;
    }
    if (tok.type === "open" && tok.tag.name === opts.reopenBoundaryTag) {
      // Implicit close via reopen (see `reopenBoundaryTag`'s doc comment) —
      // left UNCONSUMED so the caller's own loop sees it as fresh content.
      flushInline();
      return out;
    }
    if (tok.type === "close") {
      // A close tag we're not tracking — end this sequence defensively so the
      // caller that owns it (further up the recursion) can consume it.
      flushInline();
      return out;
    }
    cursor.next();

    if (tok.type === "text") {
      textBuf += tok.text;
      continue;
    }

    if (tok.type === "void") {
      const name = tok.tag.name;
      if (name === "hr") {
        flushInline();
        out.push({ kind: "divider" });
        continue;
      }
      if (name === "br") {
        // Presentation-only line break (2 real uses in the whole snapshot) — no
        // BreakNode kind exists in D29-2 and the volume doesn't justify one;
        // flattened into a literal newline inside the surrounding text run.
        textBuf += "\n";
        continue;
      }
      if (name === "col") {
        // <col> never carries content (verified) — pure table-layout hint.
        continue;
      }
      throw new FoundryHtmlError("", `unmapped void tag <${name}>`);
    }

    // tok.type === "open"
    const name = tok.tag.name;
    switch (name) {
      case "strong":
      case "em":
      case "sup": {
        flushText();
        const mark: Mark = name === "strong" ? "bold" : name === "em" ? "italic" : "superscript";
        const inner = parseSequence(cursor, ctx, {
          stopAt: new Set([name]),
          wrapLooseInline: false,
        });
        consumeClose(cursor, name);
        // A bare CodexNode[] returned here is always InlineNode[] in practice —
        // strong/em/sup content never contains a block tag in this corpus — but
        // TS can't see that; non-text inline kinds (crossref/check/damage/...)
        // simply don't carry the mark (documented drop, see file-level note
        // below the switch).
        inlineBuf.push(...applyMark(inner as InlineNode[], mark));
        continue;
      }
      case "code": {
        // Monospace styling (critical-deck flavor labels like "Melee"/"Ranged")
        // — no `code`/monospace mark exists on `TextMarks` (D29-2 never asked
        // for one), so this flattens transparently, same as a non-action-glyph
        // span below.
        flushText();
        const inner = parseSequence(cursor, ctx, {
          stopAt: new Set(["code"]),
          wrapLooseInline: false,
        });
        consumeClose(cursor, "code");
        inlineBuf.push(...(inner as InlineNode[]));
        continue;
      }
      case "span": {
        flushText();
        const cls = tok.tag.attrs["class"] ?? "";
        if (cls.split(/\s+/).includes("action-glyph")) {
          const cost = collectSpanText(cursor);
          inlineBuf.push({ kind: "actionGlyph", cost });
        } else {
          // Transparent inline wrapper (`pf2e`, `title`, `tags paizo-style`,
          // `tag rarity ...`, styling-only Word-paste classes, ...) — the class
          // itself carries no CodexNode-worthy meaning; flatten to its content.
          const inner = parseSequence(cursor, ctx, {
            stopAt: new Set(["span"]),
            wrapLooseInline: false,
          });
          consumeClose(cursor, "span");
          inlineBuf.push(...(inner as InlineNode[]));
        }
        continue;
      }
      case "p": {
        flushInline();
        const children = parseSequence(cursor, ctx, {
          stopAt: new Set(["p"]),
          wrapLooseInline: false,
          reopenBoundaryTag: "p",
        });
        // Only consume a REAL `</p>` when the cursor is actually sitting on
        // one — `reopenBoundaryTag` above can also end this sequence at an
        // unconsumed peer `<p>` open (the implicit-close case, no `</p>` to
        // consume at all); `consumeClose` would wrongly throw on that token,
        // so it's only called for the ordinary explicit-close path.
        const next = cursor.peek();
        if (next !== undefined && next.type === "close" && next.name === "p")
          consumeClose(cursor, "p");
        out.push({ kind: "paragraph", children: children as InlineNode[] });
        continue;
      }
      case "div": {
        // Every real `<div>` in this corpus wraps a single line of pure inline
        // content (a copy-pasted stat-block line, e.g. `<div><strong>Perception
        // </strong> +27...</div>`) — treated as a paragraph, same as `<p>`.
        flushInline();
        const children = parseSequence(cursor, ctx, {
          stopAt: new Set(["div"]),
          wrapLooseInline: false,
        });
        consumeClose(cursor, "div");
        out.push({ kind: "paragraph", children: children as InlineNode[] });
        continue;
      }
      case "h1":
      case "h2":
      case "h3":
      case "h4": {
        flushInline();
        const level = Number(name[1]);
        const children = parseSequence(cursor, ctx, {
          stopAt: new Set([name]),
          wrapLooseInline: false,
        });
        consumeClose(cursor, name);
        out.push({ kind: "heading", level, children: children as InlineNode[] });
        continue;
      }
      case "blockquote": {
        flushInline();
        const children = parseSequence(cursor, ctx, {
          stopAt: new Set(["blockquote"]),
          wrapLooseInline: true,
        });
        consumeClose(cursor, "blockquote");
        out.push({ kind: "blockquote", children });
        continue;
      }
      case "section": {
        // `<section class="traits">`/`<section class="sample-tasks">` are boxed
        // callouts (rules asides, sample-task tables) — exactly what `aside`
        // models; not just presentation noise, so it gets a real node kind.
        flushInline();
        const children = parseSequence(cursor, ctx, {
          stopAt: new Set(["section"]),
          wrapLooseInline: true,
        });
        consumeClose(cursor, "section");
        out.push({ kind: "aside", children });
        continue;
      }
      case "ul":
      case "ol": {
        flushInline();
        const items = parseListItems(cursor, ctx, name);
        out.push({ kind: "list", ordered: name === "ol", items });
        continue;
      }
      case "table": {
        flushInline();
        out.push(parseTable(cursor, ctx));
        continue;
      }
      default:
        throw new FoundryHtmlError("", `unmapped tag <${name}>`);
    }
  }
}

/** Consumes a `<span class="action-glyph">...</span>` body — verified to always
 * be a single short plain-text token (digits, "A", "R", "F", "1 – 3", ...), never
 * nested markup or an enricher, so this reads raw text directly rather than
 * routing through `parseEnrichedText`. */
function collectSpanText(cursor: TokenCursor): string {
  let text = "";
  for (;;) {
    const tok = cursor.next();
    if (tok === undefined) {
      throw new FoundryHtmlError("", 'unterminated <span class="action-glyph">');
    }
    if (tok.type === "close" && tok.name === "span") return text.trim();
    if (tok.type === "text") {
      text += tok.text;
      continue;
    }
    throw new FoundryHtmlError(
      "",
      `unexpected nested markup inside <span class="action-glyph">: ${JSON.stringify(tok)}`,
    );
  }
}

function parseListItems(
  cursor: TokenCursor,
  ctx: EnricherContext,
  listName: string,
): CodexNode[][] {
  const items: CodexNode[][] = [];
  for (;;) {
    const tok = cursor.peek();
    if (tok === undefined) throw new FoundryHtmlError("", `unterminated <${listName}>`);
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
      const content = parseSequence(cursor, ctx, {
        stopAt: new Set(["li"]),
        wrapLooseInline: false,
      });
      consumeClose(cursor, "li");
      items.push(content);
      continue;
    }
    if (tok.type === "open" && (tok.tag.name === "ul" || tok.tag.name === "ol")) {
      // Real corpus finding (1 occurrence: pfs-season-2-bestiary/2-15/
      // barrow-quasit.json "Change Shape"): a redundant outer <ul> wraps the
      // real list directly with no <li> in between — a genuine upstream
      // authoring slip, not a new grammar shape. Collapse it by treating the
      // nested list as an implicit single item, the same leniency a browser's
      // own error recovery would produce.
      const nestedName = tok.tag.name;
      cursor.next();
      const nestedItems = parseListItems(cursor, ctx, nestedName);
      items.push([{ kind: "list", ordered: nestedName === "ol", items: nestedItems }]);
      continue;
    }
    throw new FoundryHtmlError(
      "",
      `expected <li> inside <${listName}>, got ${JSON.stringify(tok)}`,
    );
  }
}

function parseTableRow(cursor: TokenCursor, ctx: EnricherContext): TableRow {
  const open = cursor.next();
  if (open === undefined || open.type !== "open" || open.tag.name !== "tr") {
    throw new FoundryHtmlError("", `expected <tr>, got ${JSON.stringify(open)}`);
  }
  const cells: CodexNode[][] = [];
  let header = false;
  for (;;) {
    const tok = cursor.peek();
    if (tok === undefined) throw new FoundryHtmlError("", "unterminated <tr>");
    if (tok.type === "close" && tok.name === "tr") {
      cursor.next();
      break;
    }
    if (tok.type === "text" && tok.text.trim() === "") {
      cursor.next();
      continue;
    }
    if (tok.type === "open" && (tok.tag.name === "td" || tok.tag.name === "th")) {
      const cellName = tok.tag.name;
      if (cellName === "th") header = true;
      cursor.next();
      const content = parseSequence(cursor, ctx, {
        stopAt: new Set([cellName]),
        wrapLooseInline: false,
      });
      consumeClose(cursor, cellName);
      cells.push(content);
      continue;
    }
    throw new FoundryHtmlError("", `unexpected token inside <tr>: ${JSON.stringify(tok)}`);
  }
  return { header, cells };
}

function parseTableRows(
  cursor: TokenCursor,
  ctx: EnricherContext,
  wrapperName: string,
): TableRow[] {
  const rows: TableRow[] = [];
  for (;;) {
    const tok = cursor.peek();
    if (tok === undefined) throw new FoundryHtmlError("", `unterminated <${wrapperName}>`);
    if (tok.type === "close" && tok.name === wrapperName) {
      cursor.next();
      return rows;
    }
    if (tok.type === "text" && tok.text.trim() === "") {
      cursor.next();
      continue;
    }
    if (tok.type === "open" && tok.tag.name === "tr") {
      rows.push(parseTableRow(cursor, ctx));
      continue;
    }
    throw new FoundryHtmlError(
      "",
      `expected <tr> inside <${wrapperName}>, got ${JSON.stringify(tok)}`,
    );
  }
}

function parseTable(cursor: TokenCursor, ctx: EnricherContext): BlockNode {
  const rows: TableRow[] = [];
  let caption: CodexNode[] | undefined;
  for (;;) {
    const tok = cursor.peek();
    if (tok === undefined) throw new FoundryHtmlError("", "unterminated <table>");
    if (tok.type === "close" && tok.name === "table") {
      cursor.next();
      break;
    }
    if (tok.type === "text" && tok.text.trim() === "") {
      cursor.next();
      continue;
    }
    if (tok.type === "open" && (tok.tag.name === "thead" || tok.tag.name === "tbody")) {
      const wrapperName = tok.tag.name;
      cursor.next();
      rows.push(...parseTableRows(cursor, ctx, wrapperName));
      continue;
    }
    if (tok.type === "open" && tok.tag.name === "tr") {
      rows.push(parseTableRow(cursor, ctx));
      continue;
    }
    if (tok.type === "open" && tok.tag.name === "caption") {
      cursor.next();
      const content = parseSequence(cursor, ctx, {
        stopAt: new Set(["caption"]),
        wrapLooseInline: false,
      });
      consumeClose(cursor, "caption");
      caption = content;
      continue;
    }
    if (tok.type === "open" && tok.tag.name === "colgroup") {
      cursor.next();
      skipUntilClose(cursor, "colgroup");
      continue;
    }
    if (tok.type === "void" && tok.tag.name === "col") {
      cursor.next();
      continue;
    }
    throw new FoundryHtmlError("", `unexpected token inside <table>: ${JSON.stringify(tok)}`);
  }
  return { kind: "table", rows, ...(caption !== undefined ? { caption } : {}) };
}

/** `<colgroup>` and its `<col>` children never carry text content in this
 * corpus (pure column-width presentation hints) — skip the whole subtree. */
function skipUntilClose(cursor: TokenCursor, name: string): void {
  let depth = 1;
  for (;;) {
    const tok = cursor.next();
    if (tok === undefined) throw new FoundryHtmlError("", `unterminated <${name}>`);
    if ((tok.type === "open" || tok.type === "void") && tok.tag.name === name) depth++;
    if (tok.type === "close" && tok.name === name) {
      depth--;
      if (depth === 0) return;
    }
  }
}

/**
 * Parses a Foundry description/journal-page HTML fragment into `BlockNode[]`
 * (D29-2's renderer contract). Any loose inline content at the very top level
 * (no wrapping block tag) is auto-wrapped into a synthetic paragraph, so the
 * return type is always fully block-shaped.
 */
export function parseFoundryHtml(html: string, ctx: EnricherContext): BlockNode[] {
  try {
    const tokens = tokenize(html);
    const cursor = new TokenCursor(tokens);
    const nodes = parseSequence(cursor, ctx, { stopAt: new Set(), wrapLooseInline: true });
    return nodes as BlockNode[];
  } catch (e) {
    if (e instanceof FoundryHtmlError && e.source === "") {
      throw new FoundryHtmlError(html, e.message);
    }
    if (e instanceof EnricherGrammarError) throw e;
    throw e;
  }
}
