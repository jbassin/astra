---
date: 2026-06-24
subsystem: gothic + frontends (akasha / strider / mouthpiece / vellum / orator)
type: design-audit
status: in-progress
author: design pass (live-site review with browser capture)
---

# Gothic / frontend design audit — 2026-06-24

A critical design review of how **gothic** renders content and how the four public frontends present
it. Grounded in live captures of every public host (akasha / strider / mouthpiece / vellum / orator) at
desktop (1440) and mobile (390), traced back to the source CSS/components so every fix is concrete.

**Method:** Playwright + cached Chromium (1228) against the live `*.iridi.cc` hosts; pages chosen to
exercise each *content type* (prose, `:::handout`/`:::fields`/`:::timeline`, code/`<pre>`, statblock +
action glyphs + redaction, transcripts, folder/tag listings, the podcast player, the editor, the login).

## The core diagnosis

The gothic *card/diegetic* vocabulary (parchment, brass bezels, wax seals, drop-caps, redaction bars,
action glyphs) is strong — the strider faction frame, the vellum editor, and the mouthpiece player prove
the system can look excellent. The problems are almost all in the **plumbing between gothic and the
long-form reading surface**: typography never tuned for reading, three markdown primitives with *zero*
styling, near-invisible card fills, pills sized for a stat-block, and a few outright bugs (akasha 404,
empty graph panel). None of it is deep rot — it's polish deferred during the migration sprint.

**Key reframe:** the typography problem is **akasha-specific, not gothic-wide**. Mouthpiece's episode page
and orator set their own type scale + reading container and read beautifully (~70ch measure, ~18px body).
akasha is the outlier because it pipes gothic's 16px `text-base` into an unconstrained ~830px column.
**Mouthpiece's episode page is the in-repo benchmark** the akasha reading column should match. The root
cause is structural (finding N7): every frontend hand-rolls its masthead + prose container, so quality
drifted per-app instead of being inherited.

---

## Findings

Severity: **P0** (broken / actively unpleasant), **P1** (clearly degrades the experience), **P2**
(polish / structural). "Where" = which package owns the fix (gothic fixes benefit every frontend).

### P0

**F1 — Body type is small, low-contrast, and runs at a punishing measure (akasha).**
- Symptom: wiki prose is hard to read on desktop; long lines, small text.
- Root cause: `apps/akasha-frontend/src/styles/globals.css:27` sets `body { font-size: 18px }`, but the
  article content is gothic's `.gothic-content { @apply text-base }` (`libs/ts/gothic/src/theme.css:183`)
  = **16px**, because Tailwind `rem` resolves against the *root* `<html>` (never sized up). Chrome is 18px,
  prose is 16px. And the center column has **no max-width**: `#quartz-body` is `17rem | 1fr | 17rem` capped
  at `90rem` (`globals.css:82`), so the reading column is ~**52rem / ~830px** → 100+ chars per line. Some
  body copy is `--color-ink-dim` (#7a8a99) instead of `--color-ink`.
- Fix: bump `.gothic-content` base to ~`1.0625rem`/`leading-[1.65]` (gothic); cap the akasha article body
  at `max-width: ~40rem` (≈68ch); reserve `ink-dim` for metadata. **Target: match the mouthpiece episode
  page.**
- Where: gothic + akasha.

**F2 — Code / `<pre>` / `blockquote` / inline `code` are completely unstyled (gothic).**
- Symptom: the Hearts page (one big fenced code block of chat-log) renders as raw browser-default `<pre>` —
  tiny monospace, no panel, no padding, no wrap, full-bleed wall of gray. Tofu boxes (▯) where emoji/kaomoji
  glyphs aren't in the font.
- Root cause: `mdastToReact.tsx:76` emits `<pre><code>`, `:74` inline `<code>`, `:86` `<blockquote>` — and
  `theme.css` has **no rule for any of them**. IBM Plex Mono / Caslon also lack emoji coverage.
- Fix (gothic `theme.css`): add `.gothic-content pre` (bg-elevated, padding, rounded, left accent rule or
  border, `overflow-x-auto`, `white-space: pre-wrap`, mono ~0.9rem); `.gothic-content code` inline
  (subtle bg, px-1, rounded); `.gothic-content blockquote` (left amber border, padding, dim italic). Append
  an emoji fallback family to `--font-mono`/`--font-body` so kaomoji/emoji render instead of ▯ (also fixes
  the ▯ seen in strider faction bios).
- Where: gothic.

**F3 — Cards barely register against the page (gothic).**
- Symptom: `:::handout`/`:::fields` callouts look like floating rules, not contained panels (Tormeré's
  "Situation Room", the spell "Attunement" card).
- Root cause: `.gothic-card` uses `bg-panel` (#0f1318) on a `--color-void` (#090c10) page — ~6 luminance
  points apart; the box is imperceptible (`theme.css:124`).
- Fix: raise card fill to `bg-elevated` (#171c24) and/or a clearer `border-rule-bright` + soft inset shadow.
- Where: gothic.

**F4 — akasha 404 / not-found is unstyled (akasha).**
- Symptom: "404 / Either this page is private or doesn't exist / Home" rendered as raw text in the top-left
  corner; mouthpiece's 404 is properly centered with a framed button.
- Root cause: the `.route-boundary` styling (`globals.css:43`) isn't applied to akasha's notFound/error
  component.
- Fix: wrap the not-found/error component in `.route-boundary` (or equivalent centered treatment).
- Where: akasha.

### P1

**F5 — Frontmatter tags / trait pills are cramped (gothic).**
- Symptom: amber tags (PULSE/MERCANTILE on Amber Call; UNDEAD/MINDLESS/IMPERIAL in the editor) jammed
  together, text touching the pill edges.
- Root cause: `TraitPill.tsx:10` uses `px-2 py-[0.12rem]` (~2px vertical) at `text-[0.7rem]`;
  `Frontmatter.tsx:30` separates them by only `gap-[0.35rem]`.
- Fix: `~px-2.5 py-[0.2rem]`, font `~0.72rem`, frontmatter `gap-2` + a little top margin off the title rule.
- Where: gothic (akasha's separate `.tag-link` at `globals.css:255` has the same tiny padding — see F11).

**F6 — Mobile buries content under the nav tree (akasha).**
- Symptom: on mobile the entire "Looking Glass" explorer renders *above* the article — you scroll past ~25
  groups before reaching the page you opened.
- Root cause: `globals.css:719` stacks to one column and makes `.sidebar` static, but the **left** sidebar
  keeps DOM order (first); only `.right.sidebar` gets `order: 3`.
- Fix: collapse the left Explorer behind a disclosure on mobile, or `order:` content first.
- Where: akasha.

**F7 — Strider faction headers are awkward + dead CSS (strider).**
- Symptom: personnel headers ("KNOWN MEMBERS" teal h2 with full-width rule, "SILVEN GRAYSON" h3) look like a
  wiki article crammed into a diegetic card; body is large but low-contrast gray; the card floats in a sea of
  empty background.
- Root cause: since factions→vellum, personnel are in-document **h2/h3** baked through gothic-prose, but
  `FactionDetail.module.css` still carries `.member`/`.memberName`/`.memberBio` rules (lines 84–123) that are
  now **dead** (no longer matched). `.description` is `1.35rem` in `--color-ink-dim`. `.root { max-width:620px;
  margin:0 auto }` centers a short card with no vertical centering.
- Fix: scoped `.description :is(h2,h3)` tuned for the card (smaller, drop/lighten the full-width rule, tighter
  top margin); remove dead `.member*`; raise body contrast off `ink-dim`; consider vertically centering the card.
- Where: strider.

**F8 — Empty "Graph View" panel looks broken (akasha).**
- Symptom: on low/no-backlink pages (home, tags) the right sidebar shows an empty bordered box with a stray ×.
- Fix: hide graph (and backlinks) when empty, or render a deliberate placeholder.
- Where: akasha.

**F9 — orator desktop login is unbalanced (orator).**
- Symptom: the auth card stretches the full ~1900px width with prompt + button marooned top-left. (Mobile is
  fine.)
- Fix: compact, vertically-centered, max-width auth card on desktop.
- Where: orator.

**F10 — Tormeré transcript escaped its callout (content + gothic + spec).**
- Symptom: "fully isn't rendering correctly" — the handout shows only the title + first line; the rest of the
  Bev/Chuck dialogue spills below, unframed.
- Root cause: in `Geography/Tormeré/index.vellum` only the first `:::fields` is nested in `:::handout`; every
  later exchange is a **separate top-level `:::fields`** block, rendering as disconnected definition grids.
- Fix: primarily content (re-nest, or — better — a first-class dialogue/transcript construct instead of
  abusing `:::fields` as `Speaker :: line`). Spacing between consecutive `:::fields` + the F3 card-fill fix
  make even the current authoring less ugly. Worth a small spec discussion.
- Where: content + gothic (+ spec).

**F11 — Two inconsistent tag styles + a hard-to-scan Tag Index + odd copy (gothic + akasha).**
- Symptom: amber filled `TraitPill` (frontmatter) vs teal bordered `.tag-link` (the index) — two visual
  languages for "tag". The Tag Index interleaves pill → "*N mons with the tag*" → page name with a flat,
  confusing hierarchy; the "N mons with the tag" copy reads like a pluralization bug.
- Fix: unify on one chip style; give the index real grouping/hierarchy; fix the count copy.
- Where: gothic + akasha.

### P2

**F12 — Folder listings repeat a low-value date (akasha).** Every child shows the same "Jan 15, 2026" — noise.
Drop it or use a meaningful per-page date. Where: akasha.

**F13 — Search excerpts are long + amber highlight is heavy (akasha).** Result cards dump full paragraphs and
scatter solid-amber highlight blocks. Tighten excerpt length; soften the highlight. Where: akasha.

**F14 — No shared masthead / reading-container primitive (gothic + all FE) — the structural root of F1.**
Each frontend hand-rolls its header + type scale, so akasha drifted while mouthpiece shines. Extract a gothic
page-header (eyebrow/title/subtitle) + a measure-capped prose container primitive so all frontends inherit
good defaults. Pairs with F1; prevents recurrence. Where: gothic + all FE.

**F15 — Minor mobile (vellum/akasha).** Vellum editor toolbar cramped on mobile; the `:::timeline` two-column
grid gets tight at 390px. Low priority.

---

## What's already good — do not touch

- **Mouthpiece** (home grid + episode/player) — polished, consistent; the typography benchmark.
- **Vellum editor** — best showcase of the gothic vocabulary (statblock, action glyphs ▶/◇, redaction bars,
  handouts, traits all render cleanly). Carries only the shared F5 pill + F3 card-contrast nits.
- **Strider** faction frame (brass bezel/corner ticks) + the diegetic hexmap chrome — atmospheric.
- Portrait pages, the populated graph, the search modal mechanics — fine.

---

## Priority / execution order

| Pri | Finding | Where | Slice |
|---|---|---|---|
| P0 | F2 code/pre/blockquote/inline + emoji fallback | gothic | 1 |
| P0 | F3 card fill contrast | gothic | 1 |
| P0 | F5 trait-pill padding/spacing | gothic | 1 |
| P0 | F1 content base size (gothic half) | gothic | 1 |
| P0 | F1 reading measure cap + body size/contrast | akasha | 2 |
| P0 | F4 404/not-found styling | akasha | 2 |
| P1 | F6 mobile nav | akasha | 2 |
| P1 | F8 empty graph/backlinks panel | akasha | 2 |
| P1 | F11 tag unification + Tag Index + copy | gothic+akasha | 2 |
| P2 | F12 folder date noise; F13 search tighten | akasha | 2 |
| P1 | F7 faction headers + dead CSS + contrast | strider | 3 |
| P1 | F9 orator login card | orator | 4 |
| P2 | F14 shared masthead + reading-container primitive | gothic+all | 5 |
| P1 | F10 Tormeré transcript (content; consider dialogue block) | content+spec | 6 |

**Slicing:** 1 = gothic primitives (benefits every frontend); 2 = akasha shell; 3 = strider; 4 = orator;
5 = the shared primitive refactor (riskiest, last); 6 = the dialogue/transcript content+spec piece.

## Verification

- Reproduce CI per lane before pushing (`bun --filter '*' typecheck && bunx biome ci . && bun --filter '*'
  test && bun --filter '*' build`; for gothic edits, re-verify strider/akasha/mouthpiece/vellum still build).
- Visual: `vite dev` per app + Playwright screenshots of the affected pages, before/after.
- Commit each CI-green slice (Conventional Commits); push on chunk completion.

## Status log

- 2026-06-24: audit authored. Implementation starting at slice 1 (gothic primitives).
- 2026-06-24: **slices 1–5 done + pushed** (CI green incl. the vellum VR gate).
  - **F0 (discovered during verification):** every frontend's `*{margin:0;padding:0}`
    reset was UNLAYERED, outranking gothic's `@layer components` and zeroing all
    rendered-vellum padding/margins (paragraph spacing, list indents, trait-pill +
    code-block padding). This was a hidden multiplier on F1/F5. Fixed by moving the
    reset into `@layer base` in every gothic-rendering frontend (akasha, strider,
    vellum-frontend; mouthpiece renders no gothic-content). The gothic slice-1 work
    only became visible once this landed.
  - slice 1 `e3f7581` gothic: F2 (code/pre/blockquote + emoji fallback), F3 (card
    contrast), F5 (pills); VR goldens regenerated in the pinned container, 0 drift.
  - slice 2a `da5516a` akasha: F0 (reset), F1 (measure+size), F4 (404).
  - slice 2b `c95ee90` akasha: F12 (date noise), F11 (tag index + chips), F8 (graph
    empty-state), F13 (search highlight).
  - slice 3 `d3d8b98` strider: F7 (faction headings + F0 reset + dead CSS).
  - slice 4 `d889053` orator: F9 (centered auth card).
  - slice 5 vellum-frontend F0 reset + **F14 reframed**: the shared-masthead-component
    idea was rejected as over-engineering — the mastheads (mouthpiece/orator/akasha/
    vellum) are deliberately distinct. The durable, proportionate version of F14 is
    (a) fix the reset gotcha across all gothic-rendering frontends [done] and (b)
    document the two cross-cutting rules (layer your reset; cap your reading measure)
    in `apps/strider/README.md` so the next frontend inherits the lesson, not the bug.
  - slice 6 `1c7e507` akasha-content: F10 — the Tormeré transcript wrapped each turn
    in a `:::fields` block inside `:::handout`, all sharing the 3-colon fence, so the
    first inner `:::` closed the handout early and the dialogue spilled out. Fixed in
    content (every word preserved): one handout with `**Speaker:**` prose lines.
- **All 15 findings addressed.** F14 reframed (docs, not a component); the only
  deliberately-not-done item is the **optional** first-class dialogue/transcript
  vellum construct (a vellum-lang + spec change) — surfaced to the user as a future
  enhancement, not invented ad-hoc.
- **Verification:** each slice screenshot-verified on a dev server (akasha/strider/
  vellum-frontend) or the built dist (orator) + the regenerated VR goldens (gothic);
  CI reproduced locally per lane; pushed in chunks (gothic+akasha green on CI incl.
  the vellum VR gate).

### Follow-ons (same session, after the 15 findings)

- **`:::deity` construct** (`14ed961`/`99573a6`/`facf263`): a survey of heavy `:::fields`
  usage found ~7 Divinity pages hand-authoring the same PF2e deity template. Added a
  `deity` DOCUMENT_KIND (both brace forms) + a gothic `DeityCard` rendered **run-in**
  (label inline with value — the first attempt was a two-column grid that mis-aligned
  between sections + gapped badly, so it was redone). Migrated the 7 pages + fixed
  Hierophant's Harrow Decks (the Tormeré fence bug again). `deity-mechanical` VR golden.
- **Whole corpus → VSS braces** (`d1c6b73`/`1751aee`, deities `76b472c`): to author
  everything in the preferred brace surface, closed two VSS gaps — **optional block
  title** (`@handout { … }`) and **`@fields`/`@timeline`** brace forms. Swept all 21
  handouts + fields + timeline + 7 deities; **zero `:::` directive openers remain**.
  Renders byte-identical (compileVss lowers to canonical; VR fixtures stay canonical).
  `.gitattributes` maps `*.vellum`→Markdown on GitHub. All live (`just up`).
- **Still open/optional:** the first-class dialogue/transcript construct (unchanged).
