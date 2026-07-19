# Codex → Tailwind + shadcn/ui — feasibility exploration (2026-07-19)

**Status:** EXPLORATION — no decision taken. Staff-engineer assessment of migrating codex's
hand-rolled parchment CSS to Tailwind v4 + shadcn/ui while keeping the palette. Not a scope doc
for a round; if adopted, a P14-style scope/spec round would follow.

**Provenance:** stakeholder question ("if we wanted to move away from our hand-rolled css and to
use tailwind and shadcn, is that feasible / what would it take — not byte-perfect"). Clarified:
gothic was dropped in P4.5 for its *styling coupling*, not as a judgment against Tailwind the
technology.

Three parallel exploration agents surveyed (1) the CSS/component surface, (2) the styling-coupled
test/guard surface, (3) the repo's Tailwind/shadcn context. Facts below verified against the repo
at `c65132b`.

---

## 1. Verdict

**Feasible, moderate effort — roughly a P4.5-scale round (4–5 slices).** The favorable and
unfavorable facts:

**Favorable:**
- The hand-rolled surface is small: **2,925 LOC across two files** (`globals.css` 2,822 +
  `tokens.css` 103). No CSS modules, no CSS-in-JS, no `@layer` — one global sheet, `codex-*`
  classnames as string literals in TSX.
- The palette is **already a complete token system** (`src/styles/tokens.css`, the P4.5 "Liturgy
  of the Iridite" vars with documented provenance in
  `2026-07-14-codex-0029-p45-style-tokens.md`). Tailwind v4 is CSS-first: the tokens map ~1:1
  into an `@theme` block (`--color-void`, `--color-ink`, `--font-body`… become `bg-void`,
  `text-ink`, `font-body` utilities). **The palette carries over verbatim — this is the easy part.**
- The repo is uniformly on **Tailwind v4 (`^4.3.2`)**; codex is the *only* frontend without it.
  The P4.5 removal (`4831fec`) was clean at one seam: vite plugin + 2 deps. Re-adding is the
  reverse diff.
- shadcn is vendored source you own and re-token — it satisfies the actual P4.5 objection
  (don't be tied to someone else's styling) in a way gothic didn't.

**Unfavorable / the real costs:**
- **The behavioral machinery is welded to native elements + pinned by tests.** Native `<dialog>`
  showModal sheet, `<details>` zero-JS disclosures, the hover-bridge popover (200 ms grace +
  `pointer-events` bridge + SSR-HTML cloning), the virtualized table (24.00 px row pin,
  `calc(Nch + 1rem)` fixed-layout columns), matchMedia tier at 56.0625rem. Radix (shadcn's
  engine) has its own focus/Esc/portal opinions that would fight the pinned behaviors.
- **Test coupling is heavy:** 27 test files / 217 `codex-*` class references; ssrSmoke alone has
  65 literal class/markup pins; 7 byte-exact full-HTML entity goldens; `globals.test.ts` regex-pins
  literal CSS rules in `globals.css`; two CI Playwright guards pin pixels (24 px row height,
  cell-fit) and 43 interaction checks (j/k, Esc sequencing, tier-cross, sheet-vs-pane).
- shadcn's dep families are all net-new to the workspace (radix, cva, clsx, tailwind-merge,
  cmdk, lucide — zero present today; only `@floating-ui/dom` 1.7.6 exists).
- The strict oxlint gate (`no-explicit-any`, jsx-a11y at error, `--deny-warnings`) will flag
  vendored shadcn source → needs a per-path `overrides` block (13+ precedents exist in
  `.oxlintrc.json`) or hand-cleanup of vendored files.

---

## 2. The load-bearing strategy calls

### 2a. Keep `codex-*` classnames as identity hooks; Tailwind carries styling
The single highest-leverage decision. If migrated markup keeps its semantic `codex-*` class
*alongside* utilities (`<tr class="codex-listing-row flex h-6 …">`), then:
- ssrSmoke's 65 pins, the Playwright guards' selectors, the popover's clone/re-show machinery,
  and most of the 217 test references **survive untouched**;
- the 7 entity goldens change (utilities appear in the HTML) but regen via the sanctioned
  `regen-goldens.ts` + hand-review flow — a known, bounded operation;
- `globals.test.ts` (pins literal CSS text) is the one suite that must be rewritten to assert
  *computed* behavior instead of CSS source text.

Without this, every restyle slice cascades into test archaeology. With it, test churn is mostly
goldens-regen + the CSS-content gate.

### 2b. shadcn selectively — chrome yes, machinery no
Map of what shadcn should and should not replace:

| Surface | shadcn fit | Call |
|---|---|---|
| `Button`, `Input`, `ErrorChip` | Button, Input | **Adopt** — trivial, re-tokened to parchment |
| Facet checkboxes (native + accent-color) | Checkbox (Radix) | Adopt or keep native — low stakes either way |
| Header nav dropdowns (hover-intent 120 ms) | DropdownMenu / NavigationMenu | **Adopt with care** — hover-intent behavior must be re-proven |
| Narrow-tier filter sheet (native `<dialog>`) | Sheet (Radix Dialog) | **Do NOT swap initially.** Radix's focus trap + Esc handling collides with the pinned Esc sequencing (OptionSearch collapses first, second Esc closes), the j/k-inert-while-focus-in-pane rule, and the `stopImmediatePropagation` finding under `hydrateRoot(document)`. Keep native `<dialog>`, restyle with utilities. Revisit later as its own slice if desired. |
| Hover-preview Popover (grace timer + hover bridge + SSR clone) | HoverCard | **Keep bespoke** — the clone-target mechanism and B1 interlock have no shadcn equivalent; restyle only |
| Virtualized listing table | Table (just styled `<table>`) | **Keep machinery** (TanStack Virtual + ch-calc columndefs); restyle cells with utilities; 24 px pin must hold |
| `<details>` disclosures (rules sidebar, sources "Other", class rail) | Accordion/Collapsible | **Keep native** — they're deliberately zero-JS at the mobile breakpoint; Radix versions are JS-driven (regression) and `::details-content` handling stays |
| Omnibar (Ctrl+K, 180 ms debounce) | Command (cmdk) | **Optional/deferred** — cmdk is a genuinely good fit for a command-palette omnibar, but the current one works and is pinned; treat as a product decision, not part of the migration |
| TraitPill, actionGlyph, EditionIcon, statblock grammar, callouts | — | Domain components, no shadcn analog; restyle only |

Net: shadcn earns its keep on generic chrome + **future surfaces** (every new gate-H follow-up
gets Dialog/Tabs/Tooltip/Select for free, parchment-themed); the P8–P13 behavioral machinery
stays native under utility styling.

### 2c. Preflight reconciliation is a real slice-zero task
Tailwind's Preflight (v4, layered `@layer base`) differs from codex's bespoke reset. Two traps:
- The pixel guards (24.00 px row pitch — already a known 23.94 px live-vs-token gap story from
  P9 — and cell-fit) will catch any metric drift from reset changes; expect to re-tune
  line-height/font-size resets on the table rows.
- **Cascade direction during incremental migration:** `globals.css` is currently *unlayered*;
  Tailwind v4 utilities live in `@layer utilities`. Unlayered CSS beats layered, so surviving
  `globals.css` rules will **override** newly-applied utilities on the same elements. The
  migration must delete/neutralize old rules per surface as it converts them (or progressively
  wrap remaining legacy CSS in a low layer). This is the inverse of the P4.5 gotcha (the
  unlayered reset outranking gothic's layers) — same mechanism, now working against us.

### 2d. What remains handwritten (and that's fine)
An honest end-state keeps a slim bespoke sheet (~300–500 lines) for the exotica: notched
clip-path card corners, the 6-region scrollbar theming, `::details-content` animation,
`content-visibility` on /rules and /sources, the hover-bridge pointer-events rules, print-ish
statblock grammar. Forcing these into arbitrary-value utilities is churn without benefit.

---

## 3. Sketch of the migration shape (if adopted)

- **S1 — plumbing + theme + preflight:** re-add `@tailwindcss/vite` + deps (reverse of
  `4831fec`); new `app.css` with `@import "tailwindcss"` + `@theme` generated from `tokens.css`
  (names preserved); preflight reconciliation; both pixel guards green with `globals.css` still
  loaded (coexistence proven). oxlint override block for `components/ui/`.
- **S2 — shadcn init + chrome primitives:** vendor Button/Input/Checkbox/DropdownMenu (+
  Tooltip/Tabs for future use); re-token to parchment; replace `src/ui/` call sites; `cx.ts` →
  clsx+tailwind-merge (or keep `cx`, low stakes); goldens regen #1.
- **S3 — surface-by-surface utility conversion:** masthead/nav/landing → entity page/statblock →
  browse table/facet panel/sheet → rules/sources/search. Delete converted `globals.css` sections
  per surface (the cascade rule, §2c). Goldens regen per slice; drift + interaction guards are
  the safety net.
- **S4 — sweep:** `globals.test.ts` rewritten to computed-style assertions; residual bespoke
  sheet consolidated; ssrSmoke/interaction/pixel/golden gates all green; weights recorded
  (Tailwind v4 output should be comparable or smaller than 2.8k-line globals.css, but record it);
  README + memory.

Deploy is render-only (`just up`), the cheapest class of codex deploy (~33 s window, P13
precedent). Corpus/search untouched by definition.

**Explicitly out:** visual byte-parity (stakeholder-sanctioned "not byte-perfect"); swapping the
native `<dialog>`/`<details>` machinery for Radix; cmdk omnibar; any touch of the other 9
frontends.

---

## 4. The repo-wide angle (recorded, not scoped)

The other 9 frontends are all **gothic + Tailwind v4** already. If the long-term intent is
shadcn as the house component layer, the natural home is a shared vendored primitive set that
gothic (or a successor lib) re-exports — codex would then be the *second* consumer, not a fork.
That's a separate, larger conversation; nothing in the codex-only migration forecloses it
(shadcn components are per-app vendored source by design).

## 5. Open questions for the stakeholder (before any spec)

1. **Motivation check:** what's the primary driver — repo consistency, faster future UI work,
   or dissatisfaction with the current CSS's maintainability? (Shapes how much of §2b's
   "optional" column gets pulled in. If none of these is felt strongly, the status quo is
   healthy: small, owned, heavily test-pinned.)
2. Codex-only, or is this a probe toward the repo-wide/gothic question (§4)?
3. Timing vs gate H: doing this *before* the consolidated P2–P13 review means the review runs
   against restyled markup; after is cleaner (review the product, then re-platform the styling).
4. Appetite for the deferred items (Radix sheet swap, cmdk omnibar) as follow-on rounds?
