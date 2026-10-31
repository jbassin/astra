/**
 * Build-time vellum → HTML render. Parses a `.vellum` source and renders it through
 * gothic's `DocumentView` to a static HTML string, with the `resolveCrossref` seam
 * turning `[[crossref]]` placeholders into real `<a href>` links (still carrying
 * `data-crossref-*` for the Popover island).
 *
 * BUILD-ONLY: imported solely by `scripts/build-content.ts`, never by route/runtime
 * code — so react-dom/server + gothic's renderer + vellum-lang's parser stay out of
 * the client bundle. The route just injects the baked HTML (dangerouslySetInnerHTML),
 * exactly as faerrin's SSG baked each page (gothic already renders the whole vellum
 * union — handout/edict/fields/timeline/columns/GFM — so this is ~0 renderer code).
 */

import type { CrossRefResolver, ImageResolver } from "@astra/gothic";
import { DocumentView } from "@astra/gothic";
import { parseDocument } from "@astra/vellum-lang";
import { renderToStaticMarkup } from "react-dom/server";

import { linkSection } from "./crossref";

/** `resolveImage` maps an inline image to its shipped URL (`wikiAssets.ts`); omitted, alt text. */
export function renderBody(
  source: string,
  resolveCrossref: CrossRefResolver,
  resolveImage?: ImageResolver,
): string {
  return renderToStaticMarkup(
    <DocumentView
      document={parseDocument(source)}
      resolveCrossref={resolveCrossref}
      resolveImage={resolveImage}
    />,
  );
}

/** One "On this page" entry: a prose heading or a block's title. */
export interface TocEntry {
  id: string;
  text: string;
  /** 2 for an h1/h2, 3 for an h3; a block title takes the level of the page's top headings.
   *  The rail indents entries below the page's top level. */
  level: 2 | 3;
}

/** Block kinds whose gothic header has a title but no kind label; decorateBody adds one. */
const KIND_LABELS: Record<string, string> = { handout: "Handout", edict: "Edict" };

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#x27;": "'",
  "&#39;": "'",
};

/** Reverses the escaping React applies to text and attribute values. */
function unescapeHtml(s: string): string {
  return s.replaceAll(/&(?:amp|lt|gt|quot|#x27|#39);/g, (e) => ENTITIES[e] ?? e);
}

/** A heading id from its text: lower case, letters and digits joined by hyphens. */
function slugifyId(text: string): string {
  const base = text
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}]+/gu, "-")
    .replaceAll(/^-+|-+$/g, "");
  // `ak-` ids belong to the page shell (`#ak-main`).
  return base === "" || base.startsWith("ak-") ? `section-${base}` : base;
}

const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g;
const HREF = /\shref="([^"]*)"/;
const DATA_KIND = /\sdata-kind="([^"]*)"/;
const BARE_HEADING = /^h([1-3])$/;

interface Tag {
  /** the tag as written */
  raw: string;
  close: boolean;
  /** lower-case element name */
  name: string;
  attrs: string;
}

/** The open block (`section[data-kind]`): gothic never nests one block in another. */
interface Card {
  kind: string;
  /** where its opening tag sits in the output, to add the id once the title is known */
  tagAt: number;
  title: string;
  header: "before" | "in" | "done";
  /** deity headers put the title in their first <span>; this tracks span nesting */
  spanDepth: number;
  inTitleSpan: boolean;
}

/** One pass over a rendered body; see decorateBody. */
class BodyDecorator {
  readonly out: string[] = [];
  readonly toc: TocEntry[] = [];
  private readonly blocks = new Set<TocEntry>();
  private readonly used = new Set<string>();
  private card: Card | null = null;
  private heading: { level: number; tagAt: number; text: string } | null = null;

  private readonly fromSlug: string;

  constructor(fromSlug: string) {
    this.fromSlug = fromSlug;
  }

  text(text: string): void {
    this.out.push(text);
    if (this.heading) this.heading.text += text;
    const card = this.card;
    if (card?.header === "in" && (card.kind !== "deity" || card.inTitleSpan)) card.title += text;
  }

  tag(tag: Tag): void {
    const handled = this.link(tag) || this.section(tag) || this.header(tag) || this.deitySpan(tag);
    if (!handled) {
      this.proseHeading(tag);
      this.out.push(tag.raw);
    }
  }

  /** Blocks sit at the level of the page's top headings (a page of h3s lists both flush). */
  finish(): void {
    const levels = this.toc.filter((e) => !this.blocks.has(e)).map((e) => e.level);
    const top = levels.length > 0 ? Math.min(...levels) : 2;
    for (const b of this.blocks) b.level = top === 3 ? 3 : 2;
  }

  private uniqueId(text: string): string {
    const base = slugifyId(text);
    let id = base;
    for (let n = 2; this.used.has(id); n++) id = `${base}-${n}`;
    this.used.add(id);
    return id;
  }

  private link({ raw, close, name, attrs }: Tag): boolean {
    if (close || name !== "a") return false;
    const href = HREF.exec(attrs)?.[1];
    const section = href === undefined ? null : linkSection(this.fromSlug, unescapeHtml(href));
    this.out.push(section ? `<a data-section="${section}"${attrs}>` : raw);
    return true;
  }

  private section({ raw, close, name, attrs }: Tag): boolean {
    if (name !== "section") return false;
    if (!close) {
      const kind = DATA_KIND.exec(attrs)?.[1];
      if (kind) {
        const tagAt = this.out.length;
        this.card = { kind, tagAt, title: "", header: "before", spanDepth: 0, inTitleSpan: false };
      }
    } else if (this.card) {
      const { tagAt } = this.card;
      const title = unescapeHtml(this.card.title.trim());
      if (title !== "") {
        const id = this.uniqueId(title);
        this.out[tagAt] = `<section id="${id}"${(this.out[tagAt] ?? "").slice("<section".length)}`;
        const entry: TocEntry = { id, text: title, level: 2 };
        this.blocks.add(entry);
        this.toc.push(entry);
      }
      this.card = null;
    }
    this.out.push(raw);
    return true;
  }

  private header({ raw, close, name }: Tag): boolean {
    const card = this.card;
    if (!card || name !== "header") return false;
    const label = KIND_LABELS[card.kind];
    if (!close && card.header === "before") {
      card.header = "in";
      this.out.push(raw, label ? '<span class="ak-block-title">' : "");
      return true;
    }
    if (close && card.header === "in") {
      card.header = "done";
      this.out.push(label ? `</span><span class="ak-block-kind">${label}</span>` : "", raw);
      return true;
    }
    return false;
  }

  private deitySpan({ raw, close, name }: Tag): boolean {
    const card = this.card;
    if (card?.header !== "in" || card.kind !== "deity" || name !== "span") return false;
    if (!close) {
      if (card.spanDepth === 0 && card.title === "") card.inTitleSpan = true;
      card.spanDepth++;
    } else {
      card.spanDepth--;
      if (card.spanDepth === 0) card.inTitleSpan = false;
    }
    this.out.push(raw);
    return true;
  }

  /** gothic's prose headings carry no attributes; headings inside blocks are left alone. */
  private proseHeading({ close, name, attrs }: Tag): void {
    const level = BARE_HEADING.exec(name)?.[1];
    if (!level || this.card) return;
    if (!close && attrs === "") {
      this.heading = { level: Number(level), tagAt: this.out.length, text: "" };
      return;
    }
    const heading = this.heading;
    if (!close || !heading) return;
    const title = unescapeHtml(heading.text.trim());
    if (title !== "") {
      const id = this.uniqueId(title);
      this.out[heading.tagAt] = `<h${heading.level} id="${id}">`;
      this.toc.push({ id, text: title, level: heading.level === 3 ? 3 : 2 });
    }
    this.heading = null;
  }
}

/**
 * Prepares a rendered body for the wiki page, without changing its visible text:
 * - every `<a href>` that points into a section gets `data-section="<id>"`;
 * - each top-level prose heading (h1 to h3) and each block (`section[data-kind]`) gets a
 *   stable id, and is listed in the returned contents (`toc`);
 * - a handout or edict header gets its title wrapped in `.ak-block-title` and a kind label
 *   (`.ak-block-kind`), so the block header reads "title ... Handout".
 *
 * It scans React's static markup, which is well formed, double-quotes every attribute and
 * escapes `<` and `>` inside attribute values, so a tag never contains a stray `>`.
 */
export function decorateBody(html: string, fromSlug: string): { html: string; toc: TocEntry[] } {
  const d = new BodyDecorator(fromSlug);
  let last = 0;
  for (const m of html.matchAll(TAG)) {
    d.text(html.slice(last, m.index));
    last = m.index + m[0].length;
    const [raw, close, name = "", attrs = ""] = m;
    d.tag({ raw, close: close === "/", name: name.toLowerCase(), attrs });
  }
  d.text(html.slice(last));
  d.finish();
  return { html: d.out.join(""), toc: d.toc };
}

/**
 * Approximate reading time in minutes (ports faerrin ContentMeta's `reading-time`
 * use: ~200 wpm, min 1). Computed from the raw source minus frontmatter/markup —
 * the displayed value need not match faerrin's exactly.
 */
export function readingMinutes(source: string): number {
  const text = source.replace(/^---[\s\S]*?---/, "").replaceAll(/[#>*_`[\]()!]/g, " ");
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}
