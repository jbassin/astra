---
name: gothic-frontend-design-polish
description: 2026-06-24 design-polish pass on gothic + the frontends; the unlayered-CSS-reset gotcha that silently zeroed all rendered-vellum padding
metadata:
  type: project
---

A critical design pass over how **gothic** renders content + the four public frontends
(live-captured with Playwright + cached Chromium against `*.iridi.cc`). Full audit +
per-finding root causes: `thoughts/shared/research/2026-06-24-gothic-frontend-design-audit-thoughts.md`.
Shipped in 6 CI-green slices (`e3f7581` gothic → `1c7e507` akasha content).

**THE load-bearing gotcha (`F0`, cross-cutting):** every frontend's `*{margin:0;padding:0}`
CSS reset was **unlayered**, so it outranked gothic's `@layer components` content styles
and silently **zeroed every rendered-vellum margin/padding** — paragraph spacing, list
indents, trait-pill padding, code-block padding. This made gothic content look cramped
on *akasha, strider factions, and the vellum editor preview* (anywhere `DocumentView`
renders). **Fix: wrap the reset in `@layer base`.** Done in akasha/strider/vellum-frontend
(mouthpiece renders no gothic-content, so it's unaffected). **Always layer a frontend's
reset** — now documented in `apps/strider/README.md` (the template doc) alongside "cap the
reading measure at ~42rem/68ch". **Why:** gothic styles content via `@layer components`;
anything unlayered beats it.

**What changed:**
- **gothic** (`theme.css`, benefits all): styled the bare `<pre>`/`<code>`/`<blockquote>`
  mdastToReact emits (were unstyled browser defaults); `.gothic-card` fill `bg-panel`→
  `bg-elevated` (was ~invisible on void); trait/frontmatter pills got real padding; emoji
  font fallbacks. **Changing gothic drifts the vellum-render VR goldens** — regenerate with
  `bun --filter @astra/vellum-render visual-regression:update` in the pinned
  `oven/bun:1.3.14` container (reuse host chromium-1228 via `-v ~/.cache/ms-playwright:/ms-playwright`
  + `bunx playwright install-deps chromium`), then commit the 4 changed PNGs.
- **akasha**: layered reset; reading measure cap (~42rem) + larger prose; centered 404
  (was unstyled, corner); mobile content-first (left nav was burying the article); tag
  index calmed + chips roomier; dropped the meaningless repeated date in listings; graph
  shows "No connections to show." instead of an empty canvas; softer search highlight.
- **strider**: faction dossier headings tuned for the card (member names in faction color),
  layered reset, removed dead `.member*` CSS (pre-vellum leftovers).
- **orator**: compact centered sign-in card (was full-width empty panel).
- **akasha content**: fixed the Tormeré Situation Room transcript (mis-fenced `:::fields`
  inside `:::handout` → one handout with `**Speaker:**` prose).

**`:::deity` construct (follow-up, 2026-06-24, `14ed961`+`99573a6`):** added a divine
stat-block kind to vellum-lang — the survey found ~7 Divinity pages hand-authoring an
identical two-`:::fields` PF2e deity template. Made `deity` a `DOCUMENT_KIND`, so it
inherits BOTH brace forms free: canonical `:::deity[Name]{category="Outer God"}` and the
VSS surface `@deity "Name" { … }` (VSS `KINDS` derives from `DOCUMENT_KINDS`). gothic
`DeityCard` renders it (title + DEITY tag + `{category}` eyebrow; body `Term :: value`
field-lines run-in PF2e-style — a small-caps label inline with its value, NOT a
two-column grid: the grid's per-section column-width mismatch + label↔value gap read
badly; the deity owns its fields, no nested `:::fields`; a `##`/`###` heading splits
sections, e.g. `### Devotee Benefits`). The 7 deity pages are authored in the VSS brace
surface (`@deity "Name" { … }` + `| category:`), the heavily-preferred form; a
`.gitattributes` maps `*.vellum`→Markdown for GitHub highlighting.

**VSS now covers the whole corpus** (`d1c6b73`+`1751aee`): closed two VSS gaps so
**every** construct has a brace form — the block **title is optional** (`@handout
{ … }` → bare `:::handout`), and **`@fields`/`@timeline`** lower to `:::fields`/
`:::timeline` (no title/attrs). Editor `/fields`+`/timeline` snippets + `@`-highlighting
updated; MARKDOWN.md §5 documents them. **The entire akasha content tree is now VSS —
zero `:::` directive openers remain.** compileVss lowers everything back to canonical
so renders are byte-identical (the VR fixtures stay canonical `:::`, so goldens are
untouched). When adding a construct, give it a VSS brace form too — the colon surface
is no longer authored by hand. Exported `parseFieldItems` as the
DeityCard seam. Migrated the 7 deity pages + fixed Hierophant's Harrow Decks (same
fence-spill bug as Tormeré). Added a `deity-mechanical` VR fixture (regen'd golden; the
7 existing goldens stayed byte-identical). **Adding a new `:::kind` = add to
`DOCUMENT_KINDS` + `DEFAULT_MODE_BY_KIND`, a `case` in DocumentView's `Block` switch, a
gothic card, a `/snippet`, a MARKDOWN.md row, and a VR fixture.** Pattern to copy for any
future repeated-`:::fields` template.

**Verify a frontend visually:** `bun run dev` (akasha/strider/vellum-frontend) or `vite build`
+ serve `dist/` (orator — its SPA falls to the anon view when `/api/v1/me` 404s), then
Playwright-screenshot. **Open/optional:** a first-class dialogue/transcript vellum construct
(so authors don't hand-bold speakers) — a vellum-lang + spec change, deliberately NOT done
ad-hoc. See [[verify-before-acting]], [[no-silent-scope-cuts]], [[vellum-frontend-0013-gotchas]].
