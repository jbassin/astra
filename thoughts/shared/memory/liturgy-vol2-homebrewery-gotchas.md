---
name: liturgy-vol2-homebrewery-gotchas
description: The Liturgy Vol.2 Homebrewery book pipeline (assay export-book) + the live-render traps that cost five audit rounds — inline-block atomicity, spellList class, column-fill balance, margin-inclusive calibration
metadata:
  type: project
---

PROJECT 2026-07-31 **BUILT + LIVE-RENDER-VERIFIED in one session** (`585e754` vol1
reference · `3048db6` generator · `8dbb224`/`79affe5` pagination rounds · `239d664`
content, all pushed): **"Liturgy of the Iridite Vol.2"** — the 173-spell canonical
store ([[assay-0030-gotchas]]) rendered as a paste-ready 64-page Homebrewery-v3 spell
compendium at `apps/codex/books/liturgy_vol2/` (md → text editor, css → Style tab;
vol1 md/css committed as the idiom reference, PDFs gitignored, `**/codex/books/**`
oxfmt-ignored).

**Pipeline:** `uv run assay export-book` (`book.py`) — store HTML → vol1's
`{{ruleBlock}}` idiom (action glyphs from `time.value`, rarity→school→alpha trait
pills, `::` definition rows, Heightened postambles after the `<hr>`, ritual
primary/secondary check rows in resurrect order, leading-`**Trigger**` lift into the
definitions row) + 8 school chapters (gestalt absorbs the morph pairs; Worldweaver =
the whole seraphic capstone chapter) + Track-B authored fragments consumed fail-soft
from `content/` (frontmatter, chapter openers, summaries.json, ART-SLOTS.md).
Pagination = **measured pixels**: committed `calibration.json` (per-spell px, written
by `tools/measure-heights.mjs` driving live homebrewery.naturalcrit.com) + estimator
fallback × a fitted correction factor (~0.78 — the line model over-priced ~22%).

**⭐ THE Homebrewery render traps** (each individually necessary, each found by live
DOM forensics after models said "fits"; all pinned in the generated `<style>` block's
comments + tests):

1. **Blocks are `display: inline-block`** — atomic inline-level boxes that can NEVER
   fragment across CSS columns regardless of `break-inside`. This was the root cause
   of the stakeholder's "huge empty gaps on every page": every non-fitting block
   jumped whole to the next column/page. Fix = `display: block !important` +
   `break-inside: auto !important` (+ `-webkit-column-break-inside`,
   `page-break-inside`) on `.ruleBlock`; keep `.preamble`/`.traits` avoid so
   title+pills stay attached. Computed `break-inside: auto` alone is a red herring —
   check `display`.
2. **Never reuse the theme's `spellList` class** — the 5e PHB theme lays anything
   inside it into ~160px 4-column name-lists; a child table gets squeezed to
   min-content and towers off the page while `width:100%` "mysteriously" resolves
   against the sub-column. Theme-neutral class (`vol2SpellTable`) + `{{wide}}`.
3. **`column-fill: balance` is the default** — with splittable content the browser
   equalizes columns and spills a clipped 3rd column off the page edge while both
   real columns sit part-empty. Force `column-fill: auto` on `.page`/`.columnWrapper`.
4. **Calibration must be margin-inclusive** — child `getBoundingClientRect` sums miss
   paragraph margins (~12px each) + the block's own 10px = ~12% systematic
   under-measurement that overpacked pages. Sum child margin-boxes (fragment-safe;
   never use the block's own bbox — fragmentation inflates it).
5. Long cast times ("10 minutes") render as TEXT in the table Actions column — a
   hard `4em` pin wraps those rows; add `white-space: nowrap`. In-statblock tables
   (Eye Stalks d8) need `font-size: 0.8em` + tight padding to fit a column.
6. **Audit method:** clipboard-paste into `/new` via Playwright (chromium from
   `apps/vellum-render/node_modules`; the MCP browser lacks its Chrome) — CM6 editor
   accepts real Ctrl+V after `navigator.clipboard.writeText` (the `.cmView` handle is
   mangled); `addInitScript(localStorage.clear)` + a fresh-content marker guard
   against Homebrewery's persisted-draft serving a STALE brew (identical audit
   numbers across different inputs = that smell). Measure content-bottom AND
   text-bearing content-right per page (X-spill = the atomicity/balance failures;
   the empty footer-wrapper `<p>` in a clipped phantom column is the one benign X
   flag). `POST /api` was classifier-blocked; the paste route is client-side only —
   nothing saved to their servers.

**Review-pending residue (stakeholder):** chapter-intro creative liberties (Scale
Timekeepers + "Concord of Hours", Almonk/Djura biographies, the invented imprimatur
page, seraphic's "no record either way" ambiguity, the Gilded Wheel casino), 23
staff-trimmed table summaries, credits TODOs, 10 art slots (ART-SLOTS.md; chapter
openers deliberately reserve the right column for `chapterSidebarRight` art).
