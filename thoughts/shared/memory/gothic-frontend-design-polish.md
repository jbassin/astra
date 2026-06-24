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

**Verify a frontend visually:** `bun run dev` (akasha/strider/vellum-frontend) or `vite build`
+ serve `dist/` (orator — its SPA falls to the anon view when `/api/v1/me` 404s), then
Playwright-screenshot. **Open/optional:** a first-class dialogue/transcript vellum construct
(so authors don't hand-bold speakers) — a vellum-lang + spec change, deliberately NOT done
ad-hoc. See [[verify-before-acting]], [[no-silent-scope-cuts]], [[vellum-frontend-0013-gotchas]].
