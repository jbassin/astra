# NLSpec 0003 — gothic (UI framework + vellum renderer)

**Status:** **implemented + verified.** All acceptance gates A–H green; CI reproduced locally (py
ruff/format/ty/41 pytest; ts tsc-strict/biome/9 gothic tests/build; Storybook builds). Code-review
findings folded in (dropped the dead `@astra/ontology` dep per J3; fixed the `--player-color`→
`--identity-color` doc drift; added a `never` exhaustiveness guard on the Node switch). **Phase:** 2
(shared content + UI). **Source plan:**
[`../plans/0003-gothic.md`](../plans/0003-gothic.md). **Renders:** the `@astra/vellum-lang` AST (0004) —
[`0004-vellum-lang-spec.md`](./0004-vellum-lang-spec.md) + `libs/ts/vellum-lang/MARKDOWN.md`.
**Process:** octo:embrace, Claude team mode (persona subagents — ui-ux-designer, frontend-developer,
code-reviewer), per astra `CLAUDE.md`. **Depends-on:** Phase 1 (ontology-being I5 colors), 0004
(the AST). **Blocks:** every frontend (0011–0014) + vellum-frontend.

## Goal

Grow faerrin's `gothic` (a pure-CSS skin) into astra's **TS UI framework** — design tokens as a Tailwind
v4 theme + a grow-as-consumed React 19 primitive library + **the vellum AST→React renderer** (lifted from
faerrin + extended with the four full-vellum constructs) — consumed by every TanStack frontend in the
amber/teal 40k-gothic visual language. The renderer rendering **every** vellum-lang AST node in Storybook
is 0004's deferred exit gate (H); this spec discharges it.

## Decisions in force (J-forks, decided 2026-06-19)

| # | Decision | Choice |
|---|---|---|
| J1 / A | Styling | **Tailwind v4** (CSS-first `@theme`). gothic ships a theme CSS frontends `@import`; the ~20 gothic tokens become `@theme` entries. Identity colors stay **runtime CSS vars** (arbitrary values), never static tokens. |
| J1 / B | Renderer styling | **Rewritten to Tailwind utilities** (no `blocks.module.css`). Diegetic/grime via utilities + `data-[mode=diegetic]:` variants + runtime CSS vars. |
| J2 | Renderer home | **In gothic** (`libs/ts/gothic/src/render/`) — the renderer *is* gothic-styled components. |
| J3 | Library scope | **Grow-as-consumed** — only the primitives 0011–0014 + vellum-frontend need. |
| J5 / D | Dev env | **Storybook** (8 + Vite, React 19); the node-gallery is the exit gate. |
| C | Visual regression | **Storybook node-gallery + Storybook test-runner** as the CI smoke this phase; **PNG goldens deferred to vellum-frontend** (which owns the Playwright render service). **No** new pinned-container CI job in 0003. |

## Scope (in)

- **`libs/ts/gothic`** (`@astra/gothic`; bun/React 19) with four layers:
  1. **Tokens → Tailwind v4 theme** — port the ~20 gothic CSS vars (void palette, ink, accent teal +
     amber, rules, motion, diegetic parchment substrate) into a gothic theme CSS (`@theme`); bundle the 5
     faerrin fonts (Caslon Antique, ITC Serif Gothic) + add IBM Plex Mono (`@fontsource/ibm-plex-mono`).
     Fonts served via absolute `/fonts/` URLs (faerrin gotcha); consumers copy binaries to `public/fonts/`.
  2. **Identity-color seam (I5)** — a helper applying ontology-being colors (`Player.color`,
     `WealHost.color`, `guest_color`) as **runtime CSS vars** (`--identity-color`),
     with a visible fallback on a missing color (no crash).
  3. **Primitives (grow-as-consumed)** — typography (document-title scale), panel/card, columns/grid,
     button/input. Only what 0011–0014 + vellum-frontend consume.
  4. **The vellum renderer** — lift faerrin's `mdastToReact` + `StatCard`/`ProseCard`/`TraitPill`/
     `Redaction`/`ErrorChip`/`DocumentView` + `grimeStyle`/`seed` + the `glyphs/actions.tsx` inline-SVG
     action glyphs; restyle to Tailwind utilities; **consume `@astra/vellum-lang`'s `VellumDocument`**
     (never re-declare its types, never parse); preserve the `[data-vellum-export]` boundary + the
     `data-mode` mechanical/diegetic axis. **ADD** components for the 4 new constructs.
- **Storybook** — stories for every primitive + **each vellum AST node** (the exit gate); a CI test-runner
  smoke pass.

### The 4 NEW renderer additions (vs the faerrin renderer)

| # | AST node | New component / change |
|---|---|---|
| 1 | `Frontmatter` (`VellumDocument.frontmatter`) | a page-header (title/tags) rendered above `nodes` in `DocumentView` |
| 2 | `crossref` (inline, `{ target, alias?, heading? }`) | a `CrossRef` inline component — renders alias‖target as a link/placeholder; a new `case "crossref"` in `mdastToReact`. **Does NOT resolve targets** (akasha-backend 0007). |
| 3 | `VellumFields` (`:::fields`) | a `Fields` component (`term` + inline `value` run, `<dl>`-style); a new `case "fields"` in `DocumentView`'s `Node`. |
| 4 | `VellumTimeline` (`:::timeline`) | a `TimelineBlock` component (optional `marker` + entry `children`); a new `case "timeline"` in `Node`. |

## Scope (out)

- **Parsing** — gothic renders; `@astra/vellum-lang` parses (0004). gothic never imports a parser path.
- **Crossref resolution** (target → URL/entity, backlink graph) → **0007 akasha-backend**.
- **PNG golden visual regression + the Playwright render service** → **vellum-frontend** (owns the render
  service per 0003 §8). gothic exposes `[data-vellum-export]`; it does not host the render harness.
- **Page composition** — frontends (0011–0014, vellum-frontend) extend the theme + compose pages.
- **Identity-color *values*** — owned by ontology-being (I5); gothic only applies them as runtime vars.
- **CSS-Modules** — replaced by Tailwind utilities (J1/B).

## Locked technical decisions

| # | Decision | Choice & rationale |
|---|---|---|
| L1 | Renderer types | **Import `VellumDocument`/`VellumNode`/… from `@astra/vellum-lang`** (`workspace:*`); do not duplicate `model.ts`. The AST is the contract (0004). |
| L2 | Action glyphs | **Lift `glyphs/actions.tsx` verbatim** — inline SVG with `fill: currentColor`, never an icon font (AD-7: icon fonts blank in PNG export). |
| L3 | Grime determinism | **Lift `seed.ts` (FNV-1a) + `grimeStyle` verbatim** — deterministic per-content grime keeps future goldens stable; emitted as runtime CSS vars consumed by diegetic utilities. |
| L4 | Theme axis | mechanical/diegetic stays a **`data-mode` attribute on `[data-vellum-export]`**, driven entirely by `data-[mode=diegetic]:` Tailwind variants — structure stays theme-agnostic; the same AST renders in either skin. |
| L5 | Identity colors | **Runtime CSS vars** (`--identity-color`) set per page/speaker from ontology-being values handed in by the frontend (Tailwind can't statically encode per-player values); referenced via arbitrary values (`text-[var(--identity-color)]`); visible fallback on absence. gothic does not import `@astra/ontology` (J3). |
| L6 | crossref render | render `alias ?? target` as the visible text; carry `target`/`heading` on data-attributes for 0007 to wire; **no fetch, no resolution**. |
| L7 | Lifted-file biome | astra drops `.ts` import extensions on lift; any lifted `arr[i]!` that trips `noNonNullAssertion` gets a **scoped `biome.json` `overrides` entry** (the `vellum-lang/vss.ts` pattern), rule stays **on** for new code. |
| L8 | tsconfig JSX | add `"jsx": "react-jsx"` (gothic is astra's first JSX) + `@types/react`/`@types/react-dom`; React 19. |
| L9 | build script | lib has no bundle step (`"build": echo …`, like vellum-lang); Storybook build is separate + not part of `bun --filter '*' build`. |

## Acceptance criteria (exit gate)

| # | Criterion | How verified |
|---|---|---|
| A | uv + bun CI lanes green over the new member (the ts lane: `tsc --noEmit`, `biome ci .`, `bun test`, `bun build`; py lane unaffected) | run locally |
| B | `@astra/gothic` exports tokens (Tailwind v4 theme) + primitives + the vellum renderer; importable `workspace:*` | build/typecheck |
| C | The renderer renders **every** vellum-lang AST node — the 6 block kinds, prose, columns, **fields, timeline, crossref**, + frontmatter — in Storybook (the 0004 exit gate H) | Storybook node-gallery + test-runner |
| D | Both **mechanical** and **diegetic** themes render from the same AST via `data-mode`; `[data-vellum-export]` boundary intact | stories (both modes) |
| E | Identity-colored surface reads a per-player color from **ontology-being** as a runtime CSS var, with a visible fallback on a missing color (no crash) | story + test |
| F | Renderer **total** — malformed/unknown inline directives + misplaced containers yield an `ErrorChip`, never a throw (faerrin totality behavior preserved) | test |
| G | Action glyphs are **inline SVG** (not an icon font); grime is deterministic per content | code review + test |
| H | `bun build` green; Storybook **builds** + the test-runner passes locally; no new pinned-container CI job needed (C) | run locally |

## Risks

1. **Scope creep** (J3) — anchor primitives to what 0011–0014 + vellum-frontend actually consume; grow on demand.
2. **Renderer rewrite to utilities** (J1/B) — restyling proven CSS to utilities can drift the look; mitigated by the per-node Storybook gallery (visual eyeball) + deferring PNG goldens to vellum-frontend (no golden to churn yet). Capture diegetic/grime/drop-cap faithfully via `data-[mode=diegetic]:` variants + runtime vars.
3. **Renderer ↔ AST coupling** — gothic depends on 0004's AST shape; an AST change ripples here. The 0004 corpus + gothic's per-node stories pin the contract.
4. **Identity-color seam** (I5/L5) — values are runtime vars from ontology-being; set per page/speaker, fall back visibly.
5. **Font/asset paths** — absolute `/fonts/` URLs (faerrin gotcha); consuming frontends copy binaries to `public/fonts/`; Storybook must serve them as static.
6. **Tailwind v4 newness** — v4's CSS-first `@theme` is newer; verify the render-service-safe static-CSS output holds (no runtime JIT) so vellum-frontend's render service can include a compiled stylesheet.

## Hand-off

0003 ships `@astra/gothic` (tokens-as-theme + primitives + the vellum renderer incl. the 4 new
constructs + action glyphs + the theme axis) and the Storybook node-gallery discharging 0004's exit gate H.
**vellum-frontend** (later) builds the Playwright render service against `[data-vellum-export]` and owns the
PNG golden visual-regression job. **akasha-frontend** renders the vellum corpus via gothic's renderer +
reads identity colors. **0007 akasha-backend** resolves the `crossref` targets gothic leaves unresolved.
