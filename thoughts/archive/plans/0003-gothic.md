# Astra Sub-plan 0003 — gothic (UI framework)

**Status:** Plan (pre-implementation). **Phase:** 2 (shared content + UI). **Parent:** [`0000-astra-migration-roadmap.md`](./0000-astra-migration-roadmap.md).
**Date:** 2026-06-19. **Decisions in force:** TanStack/React everywhere; identity colors ← ontology-being (I5), gothic owns the framework palette; gothic renders the vellum-lang AST (0004 exit gate).
**Depends-on:** Phase 1 (ontology-being for identity colors), `0004` vellum-lang (the AST it renders). **Blocks:** every frontend (`0011`–`0014`) + vellum-frontend.

> Goal: grow faerrin's `gothic` (a pure-CSS skin) into astra's **UI framework** — design tokens + a
> React component library + **the vellum AST→React renderer** — consumed by every TanStack frontend in
> the amber/teal 40k-gothic visual language.

---

## 1. Current state (faerrin `gothic` + vellum's renderer)

- **gothic** (`pkg/gothic`): 3 CSS files + 5 fonts, **zero React/components**. Tokens (research §2.7):
  void palette (`--bg-void/panel/elevated/hover`), ink, **`--accent` phosphor-teal** + **`--accent-amber`**,
  rules, motion easings/durations, and the **diegetic substrate** (`--parchment*`, `--wax`, `--gold-leaf`,
  `--redaction`). Fonts: Caslon Antique + ITC Serif Gothic (bundled, absolute `/fonts/` URLs); IBM Plex
  Mono referenced but **not** bundled. Consumed today by strider + vellum (CSS only).
- **vellum's renderer** (`pkg/vellum/src/render/`): `mdastToReact.tsx` (total AST→React, `ErrorChip` on
  bad nodes) + `components/` (`Statblock`, `Handout`, `GenericBlock`, `DocumentView` — the
  `[data-vellum-export]` boundary) + `glyphs/actions.tsx` (PF2e action glyphs as **inline SVG**, *not* an
  icon font — icon fonts blank out in PNG export). Two theme modes: **mechanical** (teal dataslate) /
  **diegetic** (amber parchment, drop-cap, grime).

## 2. Target (astra gothic = the UI framework)

A `libs/ts/gothic` package (bun/TS, React) providing four layers:

1. **Tokens as a Tailwind preset** (J1) — expose gothic's ~20 tokens (colors, fonts, spacing, easings) as a
   **`gothic/tailwind-preset`** that consuming frontends extend; the underlying CSS vars stay the runtime
   source. Bundle IBM Plex Mono (`@fontsource`). gothic owns the **framework palette**; **per-player/host
   identity colors come from ontology-being** (I5) — applied as **runtime CSS vars** (Tailwind is static),
   referenced via arbitrary values (`text-[var(--player-color)]`), not preset tokens.
2. **Primitives** — typography (the document-title scale), panels/cards, **columns/grid** (for vellum
   columns + general layout), buttons/inputs (for the vellum editor + orator library UI).
3. **The vellum renderer** (absorbed from `pkg/vellum/src/render/`) — `mdastToReact` + the block
   components + **the new full-vellum constructs** (`:::fields`, `:::timeline`, `[[crossref]]` from 0004)
   + the PF2e action glyphs + the mechanical/diegetic theme axis. **Consumes the vellum-lang AST** (0004);
   `[data-vellum-export]` boundary preserved for vellum-frontend's render service.
4. **Storybook** (or Ladle — J5) — the component dev/preview env + the visual-regression surface.

## 3. What lives where (the seams)

- **gothic owns:** framework palette + tokens, primitives, the vellum renderer (AST→React), action glyphs,
  the theme axis.
- **ontology-being owns:** per-player/host identity color **values** (I5); gothic's identity-colored
  components (transcript speakers, dice viz) read them.
- **vellum-lang owns:** the parser/AST (0004); gothic renders it but never parses.
- **akasha-frontend / vellum-frontend / etc. own:** page composition; they import gothic primitives +
  the renderer.

## 4. Open decisions

| # | Decision | Options | Recommendation |
|---|---|---|---|
| J1 | Styling approach | CSS Modules vs CSS-in-JS vs Tailwind+preset | **DECIDED: Tailwind + token preset** — gothic ships a Tailwind preset exposing its tokens; frontends extend it; components styled with utilities (compiles to static CSS — render-service-safe). Identity colors stay runtime CSS vars. |
| J2 | Vellum renderer home | in gothic (with the components) vs a separate render lib | **In gothic** (per 0004 exit gate) — the renderer *is* gothic-styled components; one home. |
| J3 | Component-library scope | full design system vs grow-as-consumed | **DECIDED: grow-as-consumed** — ship only the primitives + renderer the frontends use; grow on demand. |
| J4 | Token format | CSS-vars only vs typed-TS export | **Folds into J1** — the Tailwind preset *is* the typed token mirror; CSS vars stay the runtime source (esp. dynamic identity colors). |
| J5 | Component dev env | Storybook vs Ladle/Histoire | **Storybook** (familiar, broad) unless build speed bites, then Ladle. |

## 5. Work items

1. **Scaffold** `libs/ts/gothic` (bun; React; **Tailwind preset** — J1; Storybook — J5).
2. **Tailwind preset + tokens**: port the CSS vars + fonts into a `gothic/tailwind-preset`; bundle IBM Plex
   Mono. Identity colors stay **runtime CSS vars** sourced from `libs/ts/ontology` (I5) — not preset tokens.
3. **Primitives**: typography, panels/cards, columns/grid, buttons/inputs — only what 0011–0014 + vellum
   need (J3).
4. **Vellum renderer**: lift `mdastToReact` + `Statblock`/`Handout`/`GenericBlock`/`DocumentView` +
   action glyphs; **add the full-vellum constructs** (`:::fields`, `:::timeline`, `[[crossref]]`) + their
   components; preserve the mechanical/diegetic theme axis + `[data-vellum-export]`.
5. **Storybook**: stories for every primitive + each vellum AST node (the 0004 exit-gate "gothic renders
   that AST" smoke).
6. **Visual regression**: port vellum's golden-image approach (the PNG render parity) into gothic's CI
   (the visual-regression job from Phase 0 / `0000` CI).

## 6. Exit criteria

- [ ] `libs/ts/gothic` exports tokens + primitives + the vellum renderer; strider/vellum-frontend build
      against it (the `workspace:*` import pattern from faerrin strider).
- [ ] The renderer renders **every** vellum-lang AST node (incl. the 4 new constructs) in Storybook —
      satisfying 0004's "gothic renders that AST" exit gate.
- [ ] Identity-colored components read per-player colors from **ontology-being**, not hardcoded tokens (I5).
- [ ] mechanical/diegetic themes both render; `[data-vellum-export]` boundary intact for the render service.
- [ ] Visual-regression goldens pass in the pinned CI container.

## 7. Risks

1. **Scope creep** (J3) — "comprehensive UI framework" can balloon. Anchor to what 0011–0014 + vellum
   actually consume; grow on demand.
2. **Renderer + parser coupling** — gothic (renderer) depends on vellum-lang's AST shape (0004); a vellum
   AST change ripples here. The 0004 conformance corpus + gothic Storybook stories together pin the contract.
3. **PNG export fidelity** — action glyphs **must** stay inline SVG (icon fonts blank in export); keep
   the diegetic grime deterministic (seeded) so goldens are stable. Tailwind → static CSS (render-safe),
   but the render page must include gothic's compiled stylesheet + the bundled fonts.
4. **Identity-color seam** (I5) — identity colors are **runtime CSS vars** from ontology-being (Tailwind
   can't statically encode per-player values); set them per page/speaker and fall back visibly on a
   missing color (don't crash).
5. **Font/asset paths** — gothic serves fonts via absolute `/fonts/` URLs (faerrin gotcha); each consuming
   frontend must copy the binaries to its `public/fonts/` (strider's pattern).

## 8. Hand-off

Every frontend **extends gothic's Tailwind preset** in its own `tailwind.config` and imports gothic:
akasha-frontend renders the vellum corpus via gothic's renderer + reads identity colors (transcripts,
dice dashboard); mouthpiece-frontend + orator-web + strider + weal-overlay use the primitives;
vellum-frontend uses the renderer + the `[data-vellum-export]` boundary for its Playwright render service.
