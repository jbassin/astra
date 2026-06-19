# Astra Sub-plan 0011 — akasha-frontend (the wiki site)

**Status:** Plan (pre-implementation). **Phase:** 5 (frontends). **Parent:** [`0000-astra-migration-roadmap.md`](./0000-astra-migration-roadmap.md).
**Date:** 2026-06-19. **Decisions in force:** Astro+Solid→**TanStack/React**; consume akasha **build-time snapshot** (D); lift `slug.ts`+`site.ts` (E1, graph in TS at build); transcripts rendered here (D4); identity colors ← ontology-being (I5); gothic Tailwind preset (J1); strider is the template.
**Depends-on:** `0003` gothic (renderer + primitives), `0004` vellum-lang (AST), `0006` linguist (transcript data), `0007` akasha-backend (snapshot), Phase 1 (ontology). **Biggest frontend rewrite.**

> Goal: rewrite faerrin's `aether` (Astro 5 SSG + 8 Solid islands) as astra's **akasha-frontend**
> (TanStack Start static prerender + React), rendering the akasha vellum corpus via gothic, with **URLs
> preserved** byte-for-byte. Also the home of **transcript rendering** (D4) and **weal roll insights**.

---

## 1. Current state (faerrin `aether`)

- **Astro 5 SSG**, MPA; 8 Solid islands: `Darkmode`, `Explorer`, `Graph` (pixi+d3 force sim),
  `Popover`, `ReaderMode`, `Search` (Pagefind), `TranscriptPlayer`, `DiceDashboard`.
- **Content:** an Astro collection over `../content/wiki`; the **remark chain** (directive → callouts →
  wikilinks → transcript) renders Obsidian markdown.
- **Build-time index** (`site.ts`): backlinks, folder-index, breadcrumbs, tags, Explorer tree, git
  dates — all via the **Quartz-faithful `slug.ts`**.
- **Routes:** `[...slug].astro` (content/folder/alias), `tags/[...tag].astro`, `index.xml` (RSS),
  `sitemap.xml`, `static/contentIndex.json` (graph data), `404`.
- **Search:** `astro-pagefind` indexes built HTML; the `Search` island lazy-loads `/pagefind/pagefind.js`.
- ⚠ 763-file byte-identical constraint (faerrin live-site) — **dissolves in astra**, but **URL slugs
  must match** (inbound links/bookmarks).

## 2. Target (astra akasha-frontend)

TanStack Start **static prerender** → `dist/`, **strider as the template** (build-time content →
generated modules → route loaders → prerender). Consumes the **akasha snapshot** (corpus + metadata
edges, D); renders vellum via **gothic's renderer** (not remark). gothic Tailwind preset; identity
colors from ontology-being.

## 3. The rewrite, area by area

### 3.1 Content rendering (remark chain → gothic vellum renderer)
The Obsidian-markdown remark chain is **replaced** by gothic's **vellum AST→React renderer** (0003/0004):
- **Prose/headings/lists/GFM** → vellum prose nodes.
- **`[[crossref]]`** → resolved links (akasha's edge list, 0007) — internal links + Popover previews.
- **Callouts** (`> [!quote]`/`> [!tip]`, ~25 pages) → mapped to vellum **`:::handout`/`:::edict`** by the
  **0007 converter** (no new construct); akasha-frontend just renders the handout/edict cards.
- **`:::fields` / `:::timeline`** (the 9 deity + the timeline) → gothic field-list / timeline components.

### 3.2 Routes (Astro → TanStack)
Port every route to TanStack routes + loaders + the prerender page list: content pages, folder-listing
pages, alias redirects, `tags/$tag`, plus `index.xml` (RSS), `sitemap.xml`,
`static/contentIndex.json` (graph data), `404`. The page list comes from the snapshot.

### 3.3 Graph/slug (lift `slug.ts` + `site.ts` verbatim — E1)
Lift both **verbatim** (TS, build-time) and compute from the snapshot: slugs (**URL parity**),
outgoing-link edges, the **backlink** index, folder-index pages, breadcrumbs, tags (hierarchical), the
Explorer tree, and git dates (now baked into frontmatter by 0007). This is the byte-faithful Quartz
logic — do not re-derive.

### 3.4 Solid islands → React (8)
- **Easy:** `Darkmode`, `Popover`, `ReaderMode`.
- **Explorer** — recursive folder tree from `buildExplorerTree` (signals → `useState`/refs).
- **Graph** — pixi + d3 force sim over `contentIndex.json`; imperative, held in refs (→ `useEffect`). M2.
- **Search** — Pagefind lazy-load (`import("/pagefind/pagefind.js")`); framework-agnostic (M1).
- **TranscriptPlayer** — ⚠ the hard one: a **progressive-enhancement DOM-attach** island (the inline
  comment warns against reactive rewrites); port carefully (attach in `useEffect`, don't re-render the
  1.2–1.4 MB transcript markup).
- **DiceDashboard** — **deferred** (M3); not in v1 (the weal roll-insights viz lands in a later iteration).

### 3.5 Transcripts (rendered HERE now — D4)
The `export`-step work that moved out of linguist (0006 §6): take linguist's structured transcript data
→ render transcript pages (the line/audio markup), **auto-link** proper nouns against the **akasha
corpus** (the link graph), and drive the **TranscriptPlayer**. Audio is the external `static-audio` URL.

### 3.6 Weal roll insights (`DiceDashboard`) — DEFERRED (M3)
**Not in akasha-frontend v1.** A later iteration ports the existing **dice-data-webui-plan**
(`thoughts/aether/plans/0001`): ECharts viz + CSV/Parquet via a **snapshot-export** of weal's Postgres
roll history (NOT live SSE), excluding the 47M-row junk. v1 ships wiki pages + transcripts + search + graph.

### 3.7 Search (Pagefind)
Re-integrate Pagefind as a **post-build CLI step** over the prerendered `dist/` HTML; the Search island's
lazy-load pattern carries over (M1).

## 4. Open decisions

| # | Decision | Options | Recommendation |
|---|---|---|---|
| M1 | Search | Pagefind vs snapshot index vs drop | **DECIDED: Pagefind** — post-build CLI over prerendered HTML; the island's lazy-load carries over. |
| M2 | Graph viz | port vs drop | **DECIDED: port** the pixi+d3 force-graph (client-only ref/useEffect, strider's pixi pattern). |
| M3 | DiceDashboard scope | full now vs minimal/defer | **DECIDED: defer** — akasha wiki pages + transcripts + search + graph ship first; the dice dashboard (dice-data-webui-plan) is a later iteration. |
| M4 | Callouts | (resolved) → 0007 converter maps `> [!quote]/[!tip]` to `:::handout/:::edict` | **No new construct** — render as handout/edict cards. |

## 5. Work items

1. **Scaffold** `apps/akasha-frontend` (TanStack Start + Vite + React, **strider template**; gothic
   Tailwind preset; OTel). Build to `dist/`.
2. **Build-time content + graph**: a `build-content` step that reads the akasha snapshot, **lifts
   `slug.ts`+`site.ts`** (URLs/backlinks/folder-index/breadcrumbs/tags/Explorer), emits typed generated
   modules (strider's pattern).
3. **Routes + loaders**: content/folder/alias/`tags/$tag` + RSS/sitemap/contentIndex/404; prerender list
   from the snapshot.
4. **Vellum rendering**: render via gothic's renderer; crossref links + Popover; verify handout/edict
   (callouts), fields, timeline.
5. **Islands → React** (7 for v1): Darkmode/Popover/ReaderMode; Explorer; Graph (M2); Search (M1);
   **TranscriptPlayer** (careful DOM-attach). **DiceDashboard deferred (M3).**
6. **Transcripts** (D4): render from linguist data + auto-link against the akasha corpus + the player.
7. **Search** (M1): Pagefind post-build over `dist/`.
8. **URL parity check**: diff the produced slug set against faerrin's (the cutover gate).

## 6. Exit criteria

- [ ] Builds to `dist/`; **URL slugs match faerrin** (a diff of the slug set is clean — bookmarks/inbound
      links survive).
- [ ] Every akasha page renders via gothic (prose, crossref links, handout/edict, `:::fields`,
      `:::timeline`); backlinks/folder-index/breadcrumbs/tags/Explorer match `site.ts` semantics.
- [ ] All 8 islands work in React; TranscriptPlayer plays a transcript without re-rendering the markup.
- [ ] Transcript pages render from linguist data with auto-linked proper nouns (D4).
- [ ] Pagefind search works over the built site. (Dice dashboard deferred — M3.)
- [ ] Identity colors (speakers, dice) come from ontology-being (I5).

## 7. Risks

1. **URL parity** — the single hard invariant; `slug.ts` lifts verbatim, and the slug-set diff is the gate.
   Any divergence breaks inbound links.
2. **TranscriptPlayer port** — the progressive-enhancement DOM-attach pattern is fragile; a naive reactive
   React rewrite re-renders 1.2–1.4 MB of markup. Attach imperatively in `useEffect`; port the warning.
3. **Remark→vellum rendering gaps** — anything the old remark chain did that the vellum renderer doesn't
   (callouts handled via handout/edict; verify no other markdown feature is silently dropped — the wiki is
   otherwise clean: no embeds/highlights/comments/inline-tags).
4. **Pagefind on TanStack** (M1) — Astro-coupled today; the post-build CLI + lazy-load is unproven on the
   TanStack build; spike it early.
5. **Graph/Pixi in React** (M2) — pixi must stay client-only (`<ClientOnly>`-style), like strider; SSR/prerender
   must not touch WebGL.

## 8. Hand-off

akasha-frontend is the akasha **read surface**: it consumes the snapshot + linguist transcripts + weal roll
history, and is served static from `dist/` by Caddy. It's the culmination of the content pipeline
(vellum-lang → akasha → here) and the home of transcripts + dice insights.
