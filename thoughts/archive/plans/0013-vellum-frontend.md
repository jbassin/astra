# Astra Sub-plan 0013 — vellum-frontend (document-forge editor + render service)

**Status:** Plan (pre-implementation). **Phase:** 5 (frontends). **Parent:** [`0000-astra-migration-roadmap.md`](./0000-astra-migration-roadmap.md).
**Date:** 2026-06-19. **Decisions in force:** editor → TanStack; **render service lifts verbatim** (Compose); consumes vellum-lang (0004 parse) + gothic (0003 render); gothic Tailwind preset.
**Depends-on:** `0004` vellum-lang, `0003` gothic. **REORG** (the code mostly exists; it's split across vellum-lang/gothic + this).

> Goal: bring faerrin's `vellum` editor + Playwright render service into astra as **vellum-frontend** —
> the PF2e document forge (write vellum → see it rendered → export PNG). The parser (→vellum-lang) and
> renderer (→gothic) already moved out; this is the **editor app** + the **render service**.

---

## 1. Current state (faerrin `vellum`)

- **Editor SPA** (`src/app/`, Vite + React): CodeMirror editor + live `Preview` (renders via `src/render/`)
  + `useExport` (POSTs to `/render`) + a **multi-document manager** (`docStore.ts`, localStorage) +
  authoring polish (slash palette, template gallery, share links, seeded grime).
- **Render service** (`src/server/renderService.ts` + `scripts/render-server.ts`): a **warm Chromium**
  (one browser, per-request isolated contexts), **all egress blocked except same-origin**,
  concurrency-gated via a `Semaphore`; the render-entry page exposes `window.vellumRender(source, mode)`,
  then screenshots `[data-vellum-export]`.
- **`src/render/`** (already split in astra): `parse.ts` → **vellum-lang** (0004); `mdastToReact` +
  `components/` → **gothic** (0003).
- Golden-image **visual regression**.

## 2. Target (astra vellum-frontend)

Two pieces:
1. **The editor** (TanStack/React **rewrite** — O1): CodeMirror + live preview (parse via **vellum-lang**,
   render via **gothic**) + export + multi-doc manager + slash palette/templates/share-links. **Add the
   full-vellum constructs** (`:::fields`, `:::timeline`, `[[crossref]]` from 0004) to the palette/templates.
2. **The render service** (a **Compose service**, O2): lift `renderService.ts` + `render-server.ts`
   ~verbatim; serves the built render-entry page; warm Chromium; `[data-vellum-export]`; egress-blocked;
   semaphore. Now renders via **gothic**.

gothic Tailwind preset; OTel.

## 3. Open decisions

| # | Decision | Options | Recommendation |
|---|---|---|---|
| O1 | Editor app | TanStack rewrite vs lift Vite/React | **DECIDED: TanStack rewrite** — stack consistency (as with orator); re-port CodeMirror + the authoring polish. |
| O2 | PNG export | Playwright service vs client-side | **DECIDED: keep Playwright** — exact fidelity (fonts, gothic render, seeded grime); reuses the `[data-vellum-export]` boundary. |
| O3 | VSS authoring | keep VSS (brace structured syntax) in the editor vs canonical-only | **Keep VSS** — it's opt-in authoring sugar (`compileVss`); lift it. |

## 4. Work items

1. **Scaffold** `apps/vellum-frontend` (editor: **TanStack + React rewrite**; gothic Tailwind preset; OTel)
   + the **render service** (Compose; Bun.serve + Playwright).
2. **Editor**: CodeMirror + live preview (vellum-lang parse → gothic render) + multi-doc manager
   (docStore) + slash palette/templates/share-links; **add the new full-vellum constructs**.
3. **Export**: `useExport` → POST to the render service.
4. **Render service** (O2): lift `renderService.ts`/`render-server.ts`; render-entry page exposes
   `window.vellumRender`; warm Chromium; egress-blocked; `[data-vellum-export]`; semaphore.
5. **Visual regression**: port the golden-image approach into CI (the pinned-container visual-regression
   job from `0000`); regenerate goldens for the gothic-rendered output.

## 5. Exit criteria

- [ ] The editor renders a live preview (vellum-lang → gothic) and exports a PNG via the render service.
- [ ] The render service runs as a Compose service: warm Chromium, egress-blocked, `[data-vellum-export]`,
      concurrency-gated; survives restart.
- [ ] The full-vellum constructs (fields/timeline/crossref) are authorable (palette/templates) + render.
- [ ] VSS authoring works (compiles to canonical); multi-doc manager + share links work.
- [ ] Visual-regression goldens pass in the pinned CI container.

## 6. Risks

1. **Playwright in CI + production** (O2) — the render service needs pinned Chromium both at runtime
   (Compose) and for the visual-regression goldens (pinned container, per `0000` CI); keep them the same
   env or goldens drift.
2. **Renderer moved to gothic** — the editor's preview + the render service now both render via gothic;
   a gothic change ripples here. The 0004 conformance corpus + gothic Storybook pin the AST/render contract.
3. **Deterministic grime** — the diegetic "grime" must stay seeded so PNG exports are reproducible
   (golden stability).
4. **Editor rewrite surface** (O1, chosen) — CodeMirror integration + the authoring polish (slash palette,
   templates, share links, multi-doc) is real re-port surface; budget for it.

## 7. Hand-off

vellum-frontend is the authoring tool for vellum documents; the **render service** is also the fidelity
path others could reuse. It consumes vellum-lang + gothic; no pipeline dependency. The akasha corpus is
authored in vellum (0007) — vellum-frontend is where new vellum documents are forged.
