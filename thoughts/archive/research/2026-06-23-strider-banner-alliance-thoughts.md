---
date: 2026-06-23
subsystem: strider (0014)
status: scoped — implementing
---

# strider — banner/alliance layer change (scope)

A new kind of layer change: **multiple factions ally and combine their land under one
banner.** New product feature (verified absent in both astra strider *and* faerrin's
`pkg/strider` — the `Change` union is identical in both and has no alliance concept), so
this is net-new, not a port.

## Locked decisions (user, 2026-06-23)

1. **Visual: one solid banner color**, but the data model **retains each hex's underlying
   constituent faction** so hover/detail/legend can say "comprising A, B, C". Inner seams
   between member-origin hexes dissolve; one outer border around the bloc.
2. **Banner is a new named entity** — `{ slug, name, color, symbol?, members[] }`, distinct
   from any member faction (not "one member absorbs the rest").
3. **Reversible** — `banner-form` + `banner-dissolve`, mirroring `skein-connect` /
   `skein-disconnect`.

## Model

Two new `Change` ops (in `src/domain/lib/regions.ts`):

```ts
| { op: "banner-form"; slug; name; color; symbol?; members: string[] }
| { op: "banner-dissolve"; slug }
```

**Fold (`foldBanners`)** walks layers chronologically → the **active** banner set.
Validation (throw-on-invalid, like `foldSkein`): `banner-form` slug not already active;
`members.length >= 2`; a faction in **at most one** active banner; `banner-dissolve` must
target an active banner.

**Assignment (`computeBannerAssignments`, hexUtils)** runs *after*
`computeEffectiveAssignments`: any hex whose effective owner faction ∈ an active banner's
`members` is pulled into that banner's group (painted the single banner color), recording
the constituent faction per hex. Membership is **dynamic** — a hex a member gains *after*
forming still joins the banner ("their land is combined"). Because absorption is computed
from the *active* banner set only, **dissolve just drops the banner and members repaint
themselves** — reversibility needs no snapshot bookkeeping.

Combined paint borders: feed `[...remainingPerFaction, ...bannerHexGroups]` through the
existing `computeAssignmentBorders` — banner hexes are one entity, so inner seams dissolve
into one outer border for free.

## Decisions resolved without asking

- Banner detail surface reuses the faction **Modal** (banner name/color + "comprising …"
  member list).
- Editor picks members by **clicking member territory** (consistent with `claim` hex
  selection); name/slug/color/symbol inputs alongside.

## Slices (each CI-green + committed)

1. Core model + fold + `computeBannerAssignments` + unit tests.
2. build-content parse/validate + emit `CURRENT_BANNERS`/banner hex groups/borders + a seed
   `banner-*` layer.
3. Render (pixi solid-color bloc + outer border, hover banner+constituent, click → Modal).
4. `banner-form` timeline flip animation (parallel to `factionFlips`).
5. Editor `banner` kind: `banner-form` / `banner-dissolve` modes + reducer/handlers/
   serialize/save/preview.
