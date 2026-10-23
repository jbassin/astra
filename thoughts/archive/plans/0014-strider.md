# Astra Sub-plan 0014 — strider (hexmap journey site)

**Status:** Plan (pre-implementation). **Phase:** 5 (frontends). **Parent:** [`0000-astra-migration-roadmap.md`](./0000-astra-migration-roadmap.md).
**Date:** 2026-06-19. **Decisions in force:** TanStack/React (already on-stack); gothic Tailwind preset; **strider is the canonical frontend template**.
**Depends-on:** `0003` gothic. **REORG → near-pure LIFT** (framework + faction-map data model both lift; astra-ify only).

> Goal: bring faerrin's `strider` into astra. It is **already on the target stack** (TanStack Start +
> Vite + React + gothic) and is the **template every other frontend follows** — so the *framework* lifts
> nearly verbatim. The question is the **content**: ASTRA.md calls strider "a website chronicling the
> progression of a **journey** represented by a hexmap," which reads differently from faerrin's
> faction-territory map. **What strider *is* in astra is P1.**

---

## 1. Current state (faerrin `strider`)

- **Stack (already the astra target):** TanStack Start + Vite + React 19; file-based routing; static
  prerender → `dist/client/`; **gothic** via `workspace:*`.
- **Pattern (the template):** `scripts/build-content.ts` reads `content/{factions,layers}/*.md`
  (gray-matter + remark) → typed generated modules in `src/generated/`; a Vite plugin re-runs on change;
  route `loader`s do constant-time lookups. **No `fs`/`remark`/`gray-matter` in the client bundle.**
- **The map:** a **pixi** hex-map canvas (`src/lib/hexUtils.ts`, `HexMap/animationManager.ts`,
  `skeinGeometry.ts`), gated `<ClientOnly>` (no WebGL in SSR/prerender).
- **Data model (campaign-specific):** factions, territories, **layers**, the **skein** system, voidship
  terminal — the interactive faction-map domain.

## 2. Target (astra strider) — framework lifts, data model is P1

- **Framework / pattern / pixi hexmap rendering** → **lift** (it's the canonical template; confirm + tidy).
- **gothic** → adopt the Tailwind preset (J1); strider already consumes gothic CSS.
- **Data model / concept** → **DECIDED (P1): lift the faction-territory map as-is** — keep faerrin
  strider's factions/territories/layers/skein model unchanged; ASTRA.md's "journey on a hexmap" is a
  reword. strider is essentially a **near-pure lift** + astra-ify (gothic Tailwind preset, Compose/Caddy).

## 3. Open decisions

| # | Decision | Options | Recommendation |
|---|---|---|---|
| P1 | strider's concept / data model | lift as-is vs new journey vs evolve | **DECIDED: lift the faction-territory map as-is** — keep factions/territories/layers/skein; strider is a near-pure lift + astra-ify. |
| P2 | hexmap rendering reuse | reuse hexUtils + the pixi canvas (hex coords, render) regardless of data model vs rebuild | **Reuse the hex rendering** — the hex coordinate system + pixi canvas are concept-agnostic; only the *data layer* (what's drawn) changes with P1. |
| P3 | content source | keep strider's own `content/*.md` + build-content vs source from akasha/ontology | **strider-local content** — it's its own site with its own data; keep the build-content pattern (it IS the template). Cross-reference ontology/akasha only if the journey cites them. |

## 4. Work items (framework — independent of P1)

1. **Scaffold / lift** `apps/strider` (TanStack Start + Vite + React; gothic Tailwind preset; OTel) →
   `dist/`. Confirm it's the canonical template (the build-content → generated-modules → loader → prerender
   pattern the other frontends copy).
2. **Hex rendering** (P2): lift `hexUtils` + the pixi `HexMap` canvas (`<ClientOnly>`); concept-agnostic.
3. **build-content pattern**: lift `scripts/build-content.ts` + the Vite watch plugin.

## 5. Work items (content — P1 = lift)

4. **Data model**: **lift** the faction/territory/layer/skein model + `content/{factions,layers}/*.md` +
   the generated types (no redesign).
5. **Routes + map layer**: lift the faction-map routes + the territory/skein/voidship rendering.

## 6. Exit criteria

- [ ] Builds to `dist/` on TanStack Start; confirmed as the canonical frontend template (pattern documented
      for 0011–0013 to follow).
- [ ] The pixi hex map renders client-only (no WebGL in prerender), with gothic styling.
- [ ] The faction-map data model loads via build-content → generated modules → loaders; the map draws the
      faction territories (lifted).

## 7. Risks

1. **Lowest-risk lane** — with P1 = lift, strider is a near-pure lift; its main value is being confirmed
   + tidied as the canonical template the other frontends copy.
2. **pixi in prerender** — keep all WebGL `<ClientOnly>` (strider already does); prerender must not touch it.
3. **Template drift** — strider is the reference the other frontends copy; if its pattern changes, keep
   `0011`–`0013` aligned (they were planned against strider's current pattern).

## 8. Hand-off

strider is the **canonical frontend template** — its build-content → generated-modules → loader →
prerender pattern is what `0011`–`0013` follow. Its content is self-contained (P3); served static from
`dist/` by Caddy. The only blocker is **P1** (what astra strider *is*).
