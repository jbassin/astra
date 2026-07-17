# Codex vs 5e.tools — spell-browse form & UX compare (2026-07-16)

**Subjects:** `https://5e.tools/spells.html` vs `https://codex.iridi.cc/spell` (post-P7 deploy,
edition icons live).

**Method:** Playwright Chromium, desktop 1600×900 + mobile 390×844 (touch, DPR 2). The public
5e.tools is Cloudflare-challenged and this host's DNS filter blocks the challenge domain
(`brunhild.challenges.cloudflare.com` NXDOMAIN → data XHRs 403), so the 5e.tools side was captured
from a local serve of the official source tree (`5etools-mirror-3/5etools-src`, shallow clone @
v2.x, `python3 -m http.server`) — byte-identical UI, no CF. Screenshots + DOM extraction in
`scratchpad/uxcmp/` (session-local; key frames described inline).

---

## 1. The one-sentence read

Both pages are the same archetype — **left list + right detail pane, filter layer on top** — but
they sit at opposite poles of the density/composure axis: 5e.tools is a **data terminal**
(7-column sortable table, 100+ source pills, a modal filter console with 15 sections, CSV export,
dice-roller links, j/k keys), while codex is a **typeset reference book** (prose-first rows, a
small curated facet drawer, one accent per row, generous whitespace). 5e.tools optimizes
*operator throughput*; codex optimizes *reading calm*. Each has features the other genuinely
lacks.

## 2. Headers / global nav

| | 5e.tools | codex |
|---|---|---|
| Masthead | Blue banner, page title "Spells." + **inline usage hint** ("Search by name on the left… Press j/k to navigate") | Parchment strip, wordmark `CODEX` only |
| Top nav | 8 items, **role-keyed**: Home · Rules ▾ · Player ▾ · Dungeon Master ▾ · References ▾ · Utilities ▾ · Settings ▾ · Help | 9 items, **content-keyed**: Player ▾ · Spells ▾ · Equipment ▾ · GM ▾ · Rules(+▾ split caret) · Setting ▾ · Sources · Everything |
| Dropdown scale | References ▾ = 14 pages (Bestiary, Items, Spells…) | Player ▾ = ~30 categories (Class → Mystery); 88 categories total mapped across the menus |
| Global search | "Search everywhere…" box, always visible, right of nav | "Search the codex… (Ctrl+K)" box, always visible, right-aligned |
| Notes | Bootstrap-era visual voice; nav row doubles as the only breadcrumb | Small-caps condensed font; the split Rules link+caret is a distinct affordance (click = page, caret = menu) |

Role-keyed vs content-keyed is the interesting split: 5e.tools asks *"who are you?"* (Player/DM)
before *"what do you want?"*; codex asks only the second. Codex's flatter content taxonomy costs
menu length (a ~30-item dropdown) where 5e.tools pays with an extra hop (References → Spells).
5e.tools' header hint line is cheap, effective onboarding codex has no equivalent of.

## 3. Page architecture & the list itself

**5e.tools** renders a true **table**: Name · Level · Time · School (color-coded abbreviation w/
title tooltip) · C. (concentration ×) · Range · Source (color-coded abbr). ~28 rows fit in a
900px viewport (~32px/row). Column headers are **click-to-sort**. Above the table: the
filter-toolbar row (Filter · pin · search-in-list w/ live `550/932` count · shuffle ("pick a
random entry") · Hide · Reset) and a **source mini-pill bar** — every loaded book as a toggleable
pill (~100 pills, 8 rows deep on desktop), plus a dark-red `Reprinted` state pill.

**codex** renders **typeset rows**: name (serif, link-colored), trait pills (≤3 + `+n` overflow),
then a metadata line (Lvl · rarity · book abbreviation · edition icon). ~6–7 rows per viewport
(~90px/row) under **alphabetical section headers** (`#`, A, B, …) with a letter **jump strip** at
top (the strip prunes to letters that exist under the active filter — nice touch). Sort is a
`<select>` (Name A–Z, …), not column clicks. Count line "1,662 of 1,662 shown".

Density delta is stark: **5e.tools shows ~4.5× more rows per screen** and 3 more mechanical axes
per row (cast time, concentration, range — codex surfaces those only in the drawer facets or the
detail pane). Codex rows instead surface *traits* (which 5e.tools doesn't show at row level at
all) and read far better — 5e.tools' abbreviation soup (`Necro.`, `FRHoF`, `TftYP:AtG`) is
expert-hostile until memorized, and its tooltips don't exist on touch.

Both lists render non-virtualized full DOM (5e.tools 550 anchors; codex 1,662 `li` behind
`content-visibility` containment). Selection state: both highlight the active row (5e.tools blue
band, codex tan band + left rule).

## 4. Filtering model

**5e.tools: a filter console.** One modal ("Filter" button) holding **15 sections**: Source
(~100 book pills grouped Core/Supplements / Adventures / Other), Level, Classes (Class + Subclass
sub-groups, "Include Variants"), Components & Miscellaneous (~30 mixed mechanics toggles:
Concentration, Ritual, SRD 5.1/5.2, Legacy, **Reprinted**, "Grants Advantage"…), School, Damage
Type, Conditions Inflicted, Spell Attack, Saving Throw, Ability Check, Cast Time, **Duration as a
dual-handle range slider** (Instant → Special), Range, Area Style, Affects Creature Types. Every
section has All/Clear/None/Default + a **tri-state pill cycle** (blue=include, red=exclude) + a
per-section **AND/OR combiner** + Hide. Global bar: "Combine as AND", filter-search box (search
the filters themselves), Show All/Hide All/Reset/**Manage Defaults**. Commits on **Save/Cancel**
(explicit transaction), not live.

**codex: a facet drawer.** `FILTERS` opens a right `<dialog>` drawer with 9 sections: Level
(min/max numeric inputs), Rarity (checkbox + count), Traits (pill cloud w/ counts: Acid 10, Air
70, Concentrate 1444…), Source (checkbox + count), Edition, "Current edition" (the superseded
reveal, with explainer copy), Traditions, Cast Time, Range. Filters apply **live**; state goes
straight to the URL (`?book=APG`), the button gains a count badge `FILTERS (1)`, and an **active
pill row** (`Source: APG ×` + `Clear all`) appears above the list. Counts next to every option
are ambient (5e.tools has none — you learn the result size only from the 550/932 counter).

Contrast in philosophy:
- 5e.tools filter space is **mechanics-exhaustive** (saving throw, damage type, conditions,
  area shape — none of which codex facets) and supports **negation and per-section boolean
  logic**. It's also overwhelming, hidden behind one modal, and its state isn't in the URL
  (share requires the explicit pin/link tool).
- codex facets are **data-derived, curated, counted, URL-native, SSR-safe** — shareable and
  crawl-consistent by construction — but include-only (no exclude), AND-across/OR-within
  fixed, and thinner on mechanics.
- The **source-pill bar** is 5e.tools' most culturally-loaded control (which books are "on" is
  a per-table decision in 5e land). codex deliberately replaced its analogue (the legacy
  checkbox) with the curated superseded default + reveal — the right call for a
  single-audience reference, P4.5 R5.

## 5. Search

- **5e.tools**: two scopes — the in-list name box (live-narrows the table, count updates) and
  the omnisearch box in the header. Plus a "shuffle" random-entry button.
- **codex**: three scopes — in-list "Filter by name…", the Ctrl+K **omnibar** (grouped-by-category
  dropdown w/ level + edition icon per hit, "All results for…" footer), and the full `/search`
  page (Pagefind, with its own facet sidebar + excerpts).
- **Finding (real bug-class, already partially documented as the "heal" limitation):** omnibar
  and `/search` for `fireball` rank **9 items above the spell Fireball itself** (5 Wand of
  Smoldering Fireballs variants, 4 Fireball Runes; the spell lands #10, below the omnibar's
  8-item fold — invisible without "All results"). Root cause is the known Pagefind
  `meta.title`-has-no-ranking-weight behavior on the addCustomRecord path. On 5e.tools the same
  query filters the *name column* only, so `Fireball`, `Delayed Blast Fireball` are the only
  hits. **An exact-name-match boost (or name-prefix group pinned first in the omnibar) is the
  single highest-value search fix available.**

## 6. Detail pane

Both are master-detail with the pane on the right (codex ~55/45 split at 1600px; 5e.tools
~55/45 too).

- **5e.tools card**: parchment-tinted stat card — name + source badge w/ page number, level/school
  line, labeled stat rows (Casting Time/Range/Components/Duration), rules text with **hyperlinked
  game terms AND clickable dice expressions (`12d6`)** that roll in-page, then backref lists
  (Classes, Subclasses, Optional/Variant, Feats). Pane toolbar: **pin** (keep pane while
  browsing), **open-as-link**, book-mode toggle, kebab. Footer buttons: **Book View** (print-two-
  column reading mode + "Download as Markdown"), **Table View** (column-picker matrix + **Download
  CSV / Copy CSV to Clipboard**), Manage Content.
- **codex pane**: "OPEN FULL PAGE →" escape hatch, then the entity page proper: small-caps name +
  `SPELL 1` type tag, trait pills + edition icon + rarity, citation (book · pg. · ORC license
  badge) + "View on Archives of Nethys", the labeled facet row (Rank | Traditions | Cast | Range |
  Area | Duration), prose with crossref links (hover Popovers). Deep-link `?entry=` SSRs the pane.
- codex reads dramatically better (real typography vs bootstrap-condensed); 5e.tools *does*
  more (pin, dice, exports, backrefs). The backref block (which classes/subclasses/feats grant
  this spell) has no codex equivalent and is a genuinely useful reference feature.

## 7. Keyboard & power features

5e.tools: `j/k` row navigation (advertised in the masthead), sortable columns, random-entry
shuffle, pinned panes, CSV/Markdown export, Book View for long reading, tri-state filters,
"Manage Defaults" persistence. codex: Ctrl+K omnibar (single global binding; Escape closes),
URL-as-state everywhere. That's the whole codex power surface — deliberate minimalism, but j/k +
Enter in the split view would cost little and fit the terminal-free ethos.

## 8. Mobile (390×844)

- **5e.tools**: the same table squeezed — 7 columns at ~11px type, the ~100-pill source bar
  consumes 2.5 screens before the list starts, tooltips (school/source abbrs) don't exist on
  touch, detail card renders *below* the table (scroll down after every selection). Nav collapses
  behind "Menu". Usable, dense, hostile.
- **codex**: proper responsive re-layout — nav wraps to two rows, list goes single-column
  full-width, tap navigates to the **full entity page** (no split view; `?superseded=` context
  carried), which renders beautifully at phone width. Clearly the stronger mobile story.

## 9. State, boot, and resilience

- 5e.tools is a **client-boot SPA**: empty shell + JSON fetches; selection state is a hash
  (`#delayed%20blast%20fireball_xge`); filter state is NOT in the URL (explicit link-encode
  tool exists). Cold boot on this capture took ~8–12s to first list paint; with its data CDN
  blocked the page renders an empty shell with zero error messaging (the failure mode we hit —
  also its content model now requires "Manage Content"/"Load All Partnered Content" choices on
  first run in some states).
- codex is **SSR-first**: full HTML pre-hydration (list AND `?entry=` pane), every state a
  shareable URL, noindex headers, works with JS disabled for reading. This is a structural
  advantage, not a styling one.

## 10. What codex should steal (ranked) / consciously skip

**Steal:**
1. **Exact-name boost in omnibar + /search** (the Fireball/heal class). Even a client-side
   post-rank ("name startsWith query → pin group first") fixes the marquee embarrassment.
2. **Row-level mechanical metadata option** — Cast time + Range (the two things a player scans
   spell lists for mid-session) as a second metadata line or an optional dense mode. The
   information exists; only the row grammar hides it.
3. **Backrefs on the entity page** ("granted by: …" for spells ↔ classes/traditions) — the
   reverse-join infrastructure (attachedSidebars precedent) already exists.
4. **j/k + Enter** keyboard nav in the split view; advertise Ctrl+K somewhere visible the way
   5e.tools advertises j/k.
5. **Column/field sort beyond the select** — at least Level ↑↓ from the listing header.

**Skip (anti-patterns for codex's register):** the 15-section filter modal (drawer + counts is
better), the 100-pill source bar (superseded-default already solved this), 7-column mobile
table, abbreviation-first row grammar, filter state outside the URL, CSV export (no audience),
content-gating.

**5e.tools features noted but neutral for codex:** dice-expression rolling (portal territory,
not codex), Book View/print mode (maybe someday for /rules), random-entry shuffle, Manage
Defaults.

## 11. Spacing appendix (measured, desktop 1600×900, computed styles + getBoundingClientRect)

| Metric | 5e.tools | codex | ratio |
|---|---|---|---|
| Body type / line-height | 14px / 20px Arial (1.43) | 18px / 28.8px EB Garamond (1.6) | 1.29× / 1.44× |
| List-row type | 11.2px / 14px | 18px / 28.8px | 1.6× / 2.06× |
| Row box height | **16px** (30px when the name wraps) | **71px** (4.8px pad + 1px hairline) | **4.4×** |
| Gap between rows | 0 | 4.8px | — |
| Effective row pitch | ~16px | ~76px | **4.75×** |
| Rows per 900px viewport | ~28 | ~6–7 | ~4.5× |
| Header chrome above list | banner 41 + nav 33 + toolbar 34 + pill bar ≈ 130 → first row ≈ y 250 | header 77 + title/controls/jump strip → first row ≈ y 440 | codex spends ~1.75× more lead-in |
| Detail-pane padding | **0px** (card border sits on text) | **48px** all sides | — |
| Paragraph spacing (pane) | 5px below, 12.6px/18px type | 12px above+below, 18px/28.8px | ~2.4× |
| Content band | 649px list + **14px gap** + 463px pane = 1126px | 416px list + **65px gap** + 551px pane, main max-width 1152/pad 48 | gap 4.6× |
| Side gutters | 237 / 237 (symmetric) | 272 / 296 | ~equal |
| Background-pixel ratio (same task, list+detail selected) | **61.3%** | **83.6%** | +22pts whitespace |

Both center a ~1,100px band at 1600w with ~15% side gutters — the density difference is entirely
*inside* the band. 5e.tools' 16px pitch is UI-table rhythm (line-height IS the row); codex's 76px
pitch is book rhythm (each row is a two-line typographic unit with air). Neither is "wrong": at
16px, 550 spells scan in 20 screenfuls; at 76px codex needs ~190 — which is exactly why codex's
letter jump-strip and Ctrl+K exist, and why a "dense mode" (halving pitch to ~38px by inlining
the pill/meta line) is the one spacing lever worth considering if browse-scanning ever becomes
the primary verb.

---
*Captures: A1–A14 (5etools: initial, manage-content menu, name-search, detail, filter modal ×3,
j/k, Table View + CSV, Book View, mobile ×2, nav dropdowns ×2) · B1–B12 (codex: initial, nav
dropdown, split view, facet clip, omnibar, drawer ×3, facet-applied pills, mobile ×2, /search
ranking). Session scratchpad `uxcmp/`.*

## Post-script finding (unrelated to 5e.tools): the Rules nav caret renders UA-default chrome

The "weird arrow" next to RULES in the codex header is the D29-47/M4 **split control** — the
RULES text is a real `<a href="/rules">` and the ▾ is a SEPARATE disclosure `<button>` for the
8-category tail (a dropdown trigger can't also be a link; two tab stops, deliberate, keep it).
But the button ships with **UA default button chrome** — computed live: `border: 2px outset
black`, `background: rgb(239,239,239)`, `appearance: auto` — because `.codex-nav-caret` only
sets padding/font-size and nothing resets the native look. That gray OS push-button in the
parchment header is why it reads as a stray artifact. One-rule fix: `border: none; background:
none; appearance: none; font: inherit; color: inherit; cursor: pointer` on `.codex-nav-caret`.
(Adjacent observation for a future call: Rules is the ONLY nav item with a visible caret — the
other seven dropdowns give no affordance at all.)
