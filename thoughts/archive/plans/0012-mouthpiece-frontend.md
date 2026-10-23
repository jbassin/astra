# Astra Sub-plan 0012 — mouthpiece-frontend (podcast site)

**Status:** Plan (pre-implementation). **Phase:** 5 (frontends). **Parent:** [`0000-astra-migration-roadmap.md`](./0000-astra-migration-roadmap.md).
**Date:** 2026-06-19. **Decisions in force:** Astro+Solid→**TanStack/React**; data source = **mouthpiece-backend** artifacts; external audio (F4); gothic Tailwind preset; strider template.
**Depends-on:** `0003` gothic, `0008` mouthpiece-backend (episode artifacts). **Smaller rewrite** (1 island, 2 routes).

> Goal: rewrite faerrin's `face` (Astro 5 SSG podcast player) as astra's **mouthpiece-frontend**
> (TanStack Start prerender + React), sourcing episodes from **mouthpiece-backend** instead of caster's
> `out/`. The Solid→React port is largely mechanical; the real change is the data source.

---

## 1. Current state (faerrin `face`)

- **Astro 5 SSG**; 2 routes: `index.astro` (episode grid) + `[id].astro` (episode page).
- **One Solid island** `Player.tsx` (~290 lines): audio player with **MediaSession API**, **pointer-
  capture scrubbing**, **localStorage position** persistence.
- **Build-time data** (`episodes.ts`): scans `caster/out/` for `*.episode.mp3` + sidecars
  (`.script.json`/`.digest.json`/`.audio.json`), **imports types from `caster/src/`** (cross-package),
  sorts by the episode **id** (arc slug + date). Audio copied into `dist/audio/` via an Astro hook.

## 2. Target (astra mouthpiece-frontend)

TanStack Start **static prerender** → `dist/` (strider template). **Data source = mouthpiece-backend**
(0008): episode artifacts (`episode.mp3`, `transcript.md`, sidecars) keyed by id, discovered via a
**manifest** (N1). gothic Tailwind preset. Audio served from the **external host** (F4).

## 3. The rewrite

### 3.1 Data (caster/out → mouthpiece-backend)
Replace face's `caster/out/` scan + cross-package `caster/src` type import with a read of
mouthpiece-backend's outputs. mouthpiece-backend emits an **episodes manifest** (`episodes.json`:
id, title, date, arc, audio URL, duration, transcript ref) that mouthpiece-frontend reads at build (N1).
The **id schema** (arc slug + date) that face sorts on is preserved (mega recaps sort to arc-end).

### 3.2 Routes (Astro → TanStack)
`index` (episode grid) + `episode/$id` (episode page: player + the roundtable **transcript** — N2),
both prerendered from the manifest.

### 3.3 Player (Solid → React)
Port `Player.tsx` 1:1: `createSignal`/`onMount`/`onCleanup` → `useState`/`useEffect`/`useRef`; keep
MediaSession, pointer-capture scrubbing, localStorage position. ~290 lines, self-contained — the easiest
island port in the migration.

## 4. Open decisions

| # | Decision | Options | Recommendation |
|---|---|---|---|
| N1 | Episode discovery | manifest vs scan | **DECIDED: manifest** — mouthpiece-backend emits `episodes.json`; the frontend reads it at build (clean producer/consumer seam). |
| N2 | Transcript on the episode page | show vs audio-only | **DECIDED: show** the roundtable transcript (gothic prose) under the player. |
| N3 | Audio hosting | external host (F4) vs in-astra | **External** (F4-consistent) — mouthpiece publishes `episode.mp3` to the static host; the frontend links it. |

## 5. Work items

1. **Scaffold** `apps/mouthpiece-frontend` (TanStack Start + React, strider template; gothic Tailwind
   preset; OTel) → `dist/`.
2. **Manifest read** (N1): build-time read of mouthpiece-backend's `episodes.json`; emit typed generated
   modules (strider pattern).
3. **Routes**: `index` (grid) + `episode/$id` (player + transcript); prerender from the manifest.
4. **Player** (Solid→React): port `Player.tsx` (MediaSession, scrubbing, localStorage).
5. **Transcript view** (N2): render `transcript.md` via gothic prose under the player.

## 6. Exit criteria

- [ ] Builds to `dist/`; episode grid + episode pages render from mouthpiece-backend's manifest.
- [ ] The player plays an episode (external audio), with MediaSession + scrubbing + resume-position.
- [ ] Episodes sort by the id schema (mega recaps land at arc-end), matching face's behavior.
- [ ] The roundtable transcript shows on the episode page (N2); gothic styling throughout.

## 7. Risks

1. **Data-source contract** — the manifest is the new seam with mouthpiece-backend (0008); define
   `episodes.json` jointly so the producer/consumer agree (id, audio URL, transcript ref).
2. **MediaSession/scrubbing port** — small but fiddly (pointer capture + media events); test on mobile +
   desktop; the Solid lifecycle maps cleanly to React but verify cleanup (no leaked listeners).
3. **id-schema sort** — the arc-slug+date id drives sort + mega-recap placement; preserve it exactly.

## 8. Hand-off

mouthpiece-frontend is the podcast read surface: it consumes mouthpiece-backend's episode manifest +
artifacts, served static from `dist/` by Caddy. No pipeline dependency beyond mouthpiece-backend (0008).
