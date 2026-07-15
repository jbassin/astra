# Færrin — Liturgy of the Iridite: Design Token & Component Spec
### Source-of-truth extraction from 36 reference pages (`/home/jbassin/style-ref/ref-01.png`…`ref-36.png`)
### Target: re-skinning **codex** (PF2e reference site — statblocks, faceted browse, rules tree, search)

All hex values are careful visual estimates from the scanned pages (this is a print book — there is no
literal source file), calibrated against repeated appearances across the 36 refs. Treat them as a strong
starting palette to fine-tune against real browser rendering, not laser-measured swatches.

---

## 1. Palette (light theme)

### Core surface & ink

| Token | Hex | Usage |
|---|---|---|
| `--color-page-bg` | `#EEE7D8` | Parchment page background base (warm off-white, slightly yellowed) |
| `--color-page-bg-alt` | `#E9E1CE` | Slightly deeper parchment tone for gutters/vignette shadow |
| `--color-page-vignette` | `#00000014` (black @ 8%) | Radial vignette darkening at page edges (soft, not a hard border) |
| `--color-ink` | `#231F1A` | Primary body text (warm near-black, not pure `#000`) |
| `--color-ink-soft` | `#4A4238` | De-emphasized/secondary text, table body text |
| `--color-ink-caption` | `#FFFFFF` (over dark art) | Captions printed directly over painted art plates |

The parchment isn't flat — every page reads as a very subtle warm mottled/fibrous texture with a gentle
vignette darkening toward the outer margins (heavier at top/bottom corners), never a hard vignette ring.
There's no visible grain/noise at a "paper photo" level; it's closer to a soft gradient + extremely low-
frequency blotch variation than a scanned-paper photograph.

### Headings & structure

| Token | Hex | Usage |
|---|---|---|
| `--color-heading-maroon` | `#7A2E2C` | Chapter titles ("THE GODS"), H2/H3 section heads, footer chapter breadcrumb, TOC titles |
| `--color-heading-maroon-dark` | `#5E211F` | Deepest shade seen in dense chapter-title lockups (shadow/depth on display type) |
| `--color-gold-rule` | `#B99B5D` | Thin horizontal rules under headings, TOC dot-leaders, footer flourishes |
| `--color-gold-frame` | `#C2A46D` | Double-line art-plate frame stroke, chapter-opener corner ornaments |
| `--color-gold-frame-dark` | `#8C7038` | Inner hairline / shadow side of the double-line gold frame (gives it dimension) |

### Callout boxes (two distinct families — see §3)

| Token | Hex | Usage |
|---|---|---|
| `--color-callout-tan-bg` | `#E7D6B3` | "In-world artifact" callout background (ads, transcripts, letters, news clippings) |
| `--color-callout-tan-border` | `#3A2E22` | Dark brown-black bracket/rule ornament top+bottom of tan callouts |
| `--color-callout-blue-bg` | `#DCE7EC` | "Rules/lore aside" callout background (game-mechanical or worldbuilding sidebars) |
| `--color-callout-blue-dot` | `#8FB4C9` | Small circular corner-accent dots on the blue callout border |

Note for the caller: the tan box does **not** use a solid dark maroon title bar — the title is bold
maroon/near-black small-caps text sitting directly on the tan field, bracketed by a thin double-rule with
small inward-pointing chevron ornaments top and bottom (see §3 geometry). If a solid title bar is wanted
for the web adaptation (cleaner as a component), `--color-heading-maroon` on `--color-callout-tan-bg` is
the right pairing, but it would be a *new* invention, not a ported print element.

### Trait pills (PF2e-convention category coloring — confirmed via org/feat/spell trait rows)

Færrin color-codes pill *category*, not individual trait identity — same convention as real PF2e where
rarity/alignment/tradition each get their own hue:

| Token | Hex (fill) | Border | Observed on |
|---|---|---|---|
| `--pill-patron-bg` (purple) | `#552C63` | `#C9A227` thin gold | `HOST`, `JUDGE`, `WATCHER`, `HEIR`, `PULSE` (deity/patron affiliation), `CHORAL` (Harmony trait) |
| `--pill-oxblood-bg` (maroon) | `#5E2027` | `#C9A227` thin gold | `RELIGIOUS`, `CONCENTRATE`, `EMOTION`, `MENTAL`, `ARCHETYPE`, `DEDICATION`, `FORTUNE` |
| `--pill-umber-bg` (brown/tan) | `#4E3A26` | `#B99B5D` thin gold | `MARTIAL`, `MERCANTILE`, `CANTRIP`, `MANIPULATE`, `MYTHIC` |
| `--pill-amber-bg` (rarity) | `#A85C1E` | `#C9A227` thin gold | `UNCOMMON` (rarity trait — matches PF2e's real uncommon-orange convention) |
| `--pill-text` | `#F3E9D2` | — | Text/label color on every pill (warm off-white, not pure white) |

Practical read for codex: this maps cleanly onto existing PF2e trait-category buckets — **rarity** →
amber, **tradition/alignment/patron-like** → purple, **general/other** → umber-brown, and a maroon bucket
for a specific "mental/emotion/concentrate-adjacent" cluster the book seems to reserve for
concentration/mental effects and archetype-dedication mechanics. Recommend mapping codex's real PF2e
trait taxonomy (rarity / alignment / damage-type / school-ish groups) onto these four buckets rather than
inventing a 5th+ color.

### Footer / misc

| Token | Hex | Usage |
|---|---|---|
| `--color-footer-ink` | `#7A2E2C` (same as heading maroon) | "CHAPTER N \| TITLE" breadcrumb + page number |
| `--color-drop-cap` | `#B99B5D` | Illuminated drop-cap initial letter + its small flourish glyph |
| `--color-link` (proposed, web-only) | `#7A2E2C` | See §4 |
| `--color-link-hover` (proposed) | `#B99B5D` underline | See §4 |

---

## 2. Typography

Every display/heading face in the book is set in **true small caps** (full caps with the first letter
slightly larger, or lowercase run through a small-caps feature) — never `text-transform: uppercase` on a
regular-weight font. This is load-bearing for the "print sourcebook" feel and should be replicated with
real OpenType small-caps features (`font-variant-caps: small-caps` / `font-feature-settings: "smcp"`),
falling back to a genuinely-designed small-caps cut where the free font ships one (EB Garamond, Cormorant
all ship real small-caps glyphs — much better than faux-scaled caps).

### (a) Display/heading face — "SACRED COSMOLOGY", "THE IRIDESCENT HOST", chapter titles

Flared-serif small-caps display type with noticeable thick/thin stroke contrast and a slightly
calligraphic, almost engraved quality (visible on "CONTENTS", "THE GODS", "HOLY GEOGRAPHY", "THE ORGS",
"BLESSED PHILOSOPHY", "THE OPTIONS", and every deity/country/org H2 like "THE IRIDESCENT HOST").

1. **Cinzel** (Google Fonts, OFL) — closest match for the large chapter-title lockups; all-caps display
   serif with the same flared, engraved-medallion feel. Weights: 600/700 (Cinzel only ships a few weights
   — 400/500/600/700/800/900 — use 600 for H2, 700–800 for H1 chapter titles).
2. **Cormorant SC** (Google Fonts, OFL) — better stroke-contrast match for the *smaller* small-caps
   headings (H2/H3 section heads, deity names) where Cinzel starts to look too heavy/geometric.
3. **Marcellus** (Google Fonts, OFL) — a fallback if Cinzel reads too "Roman monument" for smaller sizes;
   softer, more humanist small-caps serif.

Recommended split: **Cinzel 700** for H1 chapter titles only (rare, big, ceremonial), **Cormorant SC
600** for H2/H3 (deity names, "Devotee Benefits", country names) — this mirrors how the book itself
visibly steps down in stroke-weight/ornamentation between chapter titles and section heads.

### (b) Body serif — justified prose, old-style feel

Classic old-style book serif: moderate contrast, humanist proportions, comfortable at long-form
paragraph sizes, real italics (used constantly for flavor text/emphasis — see the Rhædon inaugural
speech, the Anari Thesrim debrief).

1. **EB Garamond** (Google Fonts, OFL) — best overall match; also gives real small-caps + old-style
   figures via OpenType, letting the drop-cap lead-in ("HE COUNTLESS WORLDS...") be built with genuine
   small-caps rather than faked. Weights: 400 regular, 400 italic, 600 semibold (bold labels in
   statblocks/backgrounds), 700 (rare emphasis).
2. **Crimson Pro** (Google Fonts, OFL) — slightly higher x-height, reads a touch more "modern paperback"
   than EB Garamond; good backup if EB Garamond's default metrics feel too tight for web body copy.
3. **Spectral** (Google Fonts, OFL) — heavier, more contemporary old-style; use only if the site wants a
   slightly less "1980s AD&D" and more "contemporary indie TTRPG" body feel.

Recommend **EB Garamond** for body — it's the only one of the three with proper small-caps AND
old-style-figure OpenType features, both of which the print book uses constantly (small-caps lead-ins,
old-style numerals in page folios/costs).

### (c) Caption face — art-plate captions ("A TRAVELLER PRAYS FACING AN AURORA...")

Small-caps, printed white directly over painted art, with a rounder/friendlier, slightly hand-set
quality than the display face — less engraved-monument, more storybook. Distinctly *not* a hard geometric
sans; it has serif-like flare at a small size but reads soft/rounded overall.

1. **Special Elite** is too typewriter/mono — reject. Better candidates:
2. **Alegreya SC** (Google Fonts, OFL) — a humanist small-caps serif with warmer, rounder terminals than
   Cinzel/Cormorant; the closest free match to the caption tone at small sizes over art.
3. **IM Fell English SC** (Google Fonts, OFL) — hand-set historical small caps; slightly more antique/
   worn than the book's captions but very close in spirit if a rougher period feel is wanted.
4. **Patrick Hand SC** (Google Fonts, OFL) — leans further "hand style" per the brief's own wording; use
   if the caption should read more casual/annotation-like than book-typeset.

Recommend **Alegreya SC 500**, white text with a subtle dark drop-shadow/outline (the book's captions
always sit on unpredictable art backgrounds and rely on a soft dark halo for legibility — replicate with
`text-shadow: 0 1px 3px rgba(0,0,0,.8)` rather than a hard stroke).

### (d) Statblock/feat header face — "LAMENT OF THE NUMB", "LISTENER DEDICATION", "COG IN THE MACHINE"

Bold condensed **sans-serif** in caps — a hard pivot away from the serif book voice, exactly like real
Pathfinder 2e's own statblock typesetting (which uses a proprietary condensed grotesque). This is the
single clearest "mechanical vs. narrative" typographic signal in the whole book: prose = serif, crunch =
condensed sans.

1. **Oswald** (Google Fonts, OFL) — condensed grotesque, bold weight, the closest free stand-in for
   PF2e's real statblock face. Use 600/700.
2. **Overpass** (Google Fonts, OFL) — humanist, slightly wider than Oswald; genuinely used in Paizo's own
   digital tooling typography, so it's an on-brand choice if the goal is "reads like official PF2e digital
   UI" rather than pure print-facsimile.
3. **Big Shoulders Display/Text** (Google Fonts, OFL, variable) — good backup, more characterful/
   idiosyncratic condensed cuts if Oswald reads too generic at small statblock sizes.

Recommend **Oswald 700** for the statblock name row (left) and the right-aligned type/level label, with
**Oswald 500** for the "BACKGROUND"/"FEAT 1"/"RESONANCE 1" right-side tag — same family, one weight step
down, matching the book's own subtle weight differential between name and tag.

### (e) Drop caps

3–4 line-height versal initial in `--color-drop-cap` gold/tan, paired with a small decorative flourish
glyph (a thin branching/leaf-like linework mark) sitting just outside the letter's left edge. The
initial's first word (sometimes first few words) continues in small caps at body size before the prose
reverts to normal case — e.g. "THE COUNTLESS WORLDS ACROSS THE ASTRA share little in common...".

Build as: the drop-cap glyph itself in **Cinzel** or **Cormorant SC** (whichever is chosen for display) at
huge size, `float: left`, gold color, with the small-caps lead-in achieved via EB Garamond's real
small-caps feature on the first ~3–6 words of the paragraph — not a separate font.

---

## 3. Component inventory

### 3.1 Section heading + gold rule
- H1 (chapter title): centered, `Cinzel 700`, maroon, ~48–64px, with **"CHAPTER N"** in a smaller serif
  small-caps line above it (own thin gold rule flanked by small diamond/flourish glyphs on either side —
  visible on every chapter opener), and a full-width thin gold rule below the whole lockup capped with a
  small centered ornamental swash (a stylized double-loop/scroll glyph, not a straight line-end).
- H2 (section head, e.g. "The First Hierophant", "Devotee Benefits", "Iconoclasm"): left-aligned,
  `Cormorant SC 600`, maroon, ~22–26px. **Sometimes** carries a thin gold rule directly beneath spanning
  the column width — this rule appears specifically before list-like/benefit content (Devotee Benefits,
  Enlightenment) and is typically absent on pure-prose section starts (deity/country/org name headers).
  Recommendation for web: apply the rule consistently under every H2 for visual regularity — the print
  inconsistency reads as print-production variance, not an intentional signal worth preserving.
- H3 (rare, deeper nesting): same family, ~18–20px, no rule.

### 3.2 Tan "in-world artifact" callout box
Background `--color-callout-tan-bg`. Bold small-caps (or bold serif) title sits directly on the tan
field — **no solid title bar**. The box is bracketed top and bottom by a thin double-hairline rule with a
small inward-pointing chevron/arrow ornament at both ends (reads like `◄▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬►` — two short
angled strokes flaring outward from each rule-end, evoking a torn parchment/ribbon-scroll edge). No
visible corner cutouts on this box type — the "notch" is on the horizontal rule caps, not the box corners.
Used exclusively for narrative/flavor "found documents": in-world ads, transcripts, news excerpts, radio
transcripts, letters, speeches, shanties. Body copy inside is body-serif, frequently italic for quoted
dialogue.

### 3.3 Blue "rules/lore aside" callout box
Background `--color-callout-blue-bg`, a soft cool blue-gray, no title bar treatment — title (if present)
is bold black-ink text at the top of the box, body serif below. Border is a single thin blue-gray
hairline rule with a small filled circular dot ornament at each of the four corners (not a chevron). Used
for worldbuilding asides and light mechanical clarifications (e.g. "Directionality on the Infinite
Horizon", "Mixed Blessings", "Inhabitants of the Veinlands") — i.e., "helpful context," lower-stakes than
the tan box's in-world-artifact conceit.

### 3.4 Gold double-line art frame with cut corners
Every full-bleed or plate-style illustration is bordered by a **double gold rule** (an outer heavier line
+ a thin inset line with a small gap between them) that has a **notched/cut corner geometry**: each of the
four corners is not a sharp 90° miter but a concave scalloped cutaway — as if the corner of the frame were
clipped and re-curved inward, producing a small pointed inward "tooth" shape at each corner rather than a
rounded or square corner. This recurs identically on every single art plate across all 36 refs (portraits,
landscapes, cosmology spreads) — it is the single most consistent structural motif in the book and should
become codex's canonical "figure/illustration frame" component (e.g., wrapping entity artwork, hero
images, or rules-page diagrams).

### 3.5 Statblock/feat header row
```
LAMENT OF THE NUMB ◈                                        RESONANCE 1
──────────────────────────────────────────────────────────────────────
[CHORAL] [CONCENTRATE] [EMOTION] [MENTAL]
Traditions divine, occult
Harmonies Voidsong
Prose description...
```
- Name (left) + type/level tag (right), both `Oswald`, full-width thin hairline rule beneath the whole
  row (not just under the name).
- A small diamond/lozenge glyph (◈) after names that are actions/abilities — matches PF2e's action-icon
  convention exactly, just re-skinned.
- Trait pill row immediately below the rule, pills per §1 color table, small rounded-rectangle chips with
  thin gold border, ~4–6px horizontal gap.
- Bold-label stat lines follow: **Traditions** / **Harmonies** / **Range** / **Prerequisites** — label in
  bold body-serif (same face as prose, not the condensed sans), value in regular weight, same line.
- Same exact row grammar for backgrounds ("COG IN THE MACHINE ⟷ BACKGROUND") and feats ("LISTENER
  DEDICATION ⟷ FEAT 1") — this is one reusable component, not three different ones.

### 3.6 Org/entity trait pill row (standalone, no statblock)
Seen directly under org/faction H2 headings ("The Iridescent Church" → `[HOST] [RELIGIOUS]`) — same pill
component as 3.5 but appearing solo under a prose H2, not inside a full mechanical block. Confirms pills
are a general-purpose "tagging" component in this design language, not statblock-exclusive — directly
useful for codex entity pages that want a lightweight category tag without a full trait block (e.g., org/
deity/location wiki-style entries alongside true statblocks).

### 3.7 Two-column justified body with paragraph-indent
Body text is fully justified, two columns per page, **no space between paragraphs** — new paragraphs are
marked by a first-line indent only (classic book-typesetting convention, not the web-blog convention of
paragraph spacing with no indent). Hyphenation is used to keep justified rag reasonable.

### 3.8 Italic flavor-text convention
Italics (body serif italic) mark: in-world quoted speech/dialogue inside tan callouts, epigraph-style
lead lines, and definitional/aside emphasis in running prose (e.g. "*raiment*", "*Midnight Sun*",
"*slip*"). Not bold — italic is the sole emphasis mechanism in flowing prose; bold is reserved for
statblock/background labels only. This is a clean, portable rule for codex: **bold = mechanical label,
italic = narrative/defined-term emphasis**, never mixed.

### 3.9 Chapter footer
Small-caps maroon "CHAPTER N | SECTION TITLE" breadcrumb + bold maroon page number, both baseline-aligned
at the bottom of the text column. Mirrors by page side: verso (even/left) pages put the page number first
(outer-left), then the breadcrumb; recto (odd/right) pages reverse the order so the number sits at the
outer-right edge. A small gold ornamental flourish (a thin curled scroll/hook glyph) sits in the outermost
bottom corner of the page, independent of the text — this is a page-level decoration, not part of the
footer text block.

### 3.10 Table styling (confirmed via the "Country Descriptions" table)
Header row: bold black-ink label cells on the plain parchment background (no fill), thin gold rule
directly under the header row only (no other horizontal or vertical rules). Body rows: zebra-striped with
a very light cool blue-gray tint on alternating rows (the same hue family as the blue callout box, at much
lower opacity) against the plain parchment on the others — no cell borders at all, generous vertical
padding, left column bold, right column regular weight. This is a clean, directly-portable pattern for
codex's browse/list tables.

### 3.11 Table of contents (ref-02)
Dot-leader rules (`....................`) connecting entry titles to page numbers, indentation encodes
hierarchy (chapter → section → sub-section, three levels observed), chapter-level entries in maroon
small-caps serif (larger), section/sub-section entries in plain black-ink body serif (smaller, unstyled
weight) — i.e., only the top TOC tier gets the display treatment; deeper levels are typographically quiet.

---

## 4. Print → web adaptation recommendations

### Keep (these ARE the brand voice)
- Parchment background + soft vignette (CSS gradient — radial-gradient darkening at edges, plus a
  very-low-amplitude, very-low-frequency noise texture via a tiled SVG `<feTurbulence>` filter at ~3–5%
  opacity; do **not** use a photographic paper-texture bitmap — it reads heavier/dirtier than this book's
  crisp digital-painting aesthetic actually is).
- Maroon headings + gold rules, true small-caps typography.
- The gold double-line notched-corner art frame — this should wrap every entity portrait/hero image on
  codex statblock pages.
- Trait pill color-coding by category (purple/maroon/umber/amber) — maps directly onto PF2e's existing
  trait taxonomy, near-zero translation cost.
- Tan/blue two-family callout boxes — tan for "flavor/lore quote," blue for "mechanical clarification."
  Codex already conceptually has this split (flavor text vs. rules text on statblocks); just give it two
  visually distinct boxes instead of one.
- Bold-label statblock stat lines, condensed-sans statblock header row with right-aligned type tag +
  action diamond glyph — port near-verbatim, it's already PF2e-native.
- Footer chapter breadcrumb pattern (repurpose as a persistent "you are here" trail on rules-tree/entity
  pages instead of a literal page-number footer — see Drop below).
- Italic-for-emphasis / bold-for-mechanical-label discipline.

### Drop (print-only artifacts with no honest web equivalent)
- Literal page numbers and verso/recto mirroring — the web has no "page," so retire the footer's number
  and instead repurpose its *position and typographic treatment* for a breadcrumb trail component (already
  precedented by the P4 rules-tree trail work in this repo).
- Two-column justified body text on screens below ~900px — justify + hyphenate reads badly on narrow
  viewports and fights responsive reflow; keep single-column ragged-right body text on mobile, and only
  consider two-column justified prose on very wide desktop viewports for long-form lore/rules pages, never
  for statblocks or list views.
- Fake page-edge/deckled-paper bevel effects — the book's own art frames and vignette are subtle; don't
  add a literal "torn paper" or drop-shadow page silhouette, it reads as kitsch rather than as this book's
  restrained painterly aesthetic.
- The exact tan-box chevron-rule ornament as literal ASCII/unicode glyphs — recreate it as a lightweight
  inline SVG top/bottom rule so it scales cleanly instead of relying on font glyph coverage.

### Spacing scale (proposed, consistent with the book's generous but not loose rhythm)
`4 / 8 / 12 / 16 / 24 / 32 / 48 / 64` px base scale. Callout box internal padding ≈ 24px; gap between
trait pills ≈ 6px; gap between statblock stat-lines ≈ 4px (tight, label-first density like the source);
section-to-section vertical rhythm ≈ 48–64px (the book's sections breathe more than its statblock rows do
— preserve that density *contrast*, it's part of why the statblocks read as "crunch" against "prose").

### Link / hover / focus treatment (in-voice, web-only invention — not printed in the source)
- Default link: `--color-heading-maroon` text, no underline at rest (matches how the book treats bolded
  inline terms — color alone carries the signal).
- Hover: underline appears in `--color-gold-rule`, 1–2px offset below text (echoes the gold-rule-under-
  heading motif at interaction scale) — `text-decoration-color` trick, not a background change.
- Visited (if used at all, e.g. rules-tree breadcrumbs): drop to `--color-ink-soft` maroon tint so already-
  read rules pages recede slightly, similar to how prose text is lower-contrast than headings.
- Focus-visible: a 2px `--color-gold-frame` outline with 2px offset — echoes the gold double-line frame
  motif rather than a generic browser-blue focus ring, keeping keyboard-nav in-voice.

### Faceted list / data-dense view (5e.tools-style split column) in this language
- Row hover: a hairline top/bottom rule in `--color-gold-rule` at ~40% opacity fades in, plus a very
  subtle `--color-callout-blue-bg`-tinted row wash (same family as the table zebra tint) — never a bold
  background swap, the book's own table styling is already this restrained.
- Selected/active row: solid `--color-callout-blue-bg` background (full opacity) + a 2–3px left-edge bar
  in `--color-heading-maroon` — a "bookmark ribbon" reference sitting flush against the row, distinct
  enough from hover without introducing a new color family.
- Row separators: hairline rules only (`--color-gold-rule` at low opacity), never heavy borders — mirrors
  §3.10's table convention of "rule under header, tint for zebra, no vertical rules anywhere."
- Trait/rarity pills inline in list rows: reuse the exact §1 pill component at a slightly smaller scale
  (e.g. 11px vs. 13px) — this is one of the strongest opportunities to make the list view feel like the
  same object family as the statblock page, since PF2e list rows already show 2–4 trait chips per row.
- Type/level column: set in the condensed-sans statblock face (Oswald) even inside the list view, right-
  aligned per row — carries the "crunch" voice into the browse experience the same way it distinguishes
  statblock headers from prose.

---

## 5. Per-image index

| Ref | Content |
|---|---|
| ref-01 | Cover — night cityscape + airships, "FÆRRIN / LITURGY OF THE IRIDITE" title lockup, tagline "Per Aspera, Ad Astra" |
| ref-02 | Table of Contents (3-level dot-leader hierarchy) + full-bleed art plate (Aurellion, the holy sword) |
| ref-03 | Chapter-opener spread: "SACRED COSMOLOGY" chapter title over a Godhome cloud-portal painting |
| ref-04 | Ch.1 "The Planet" — body text + drop cap + tan callout ("The Mundane Færrish") + starfield/planet art plate |
| ref-05 | Ch.1 cont'd — "Enlightenment" section, portrait art plate (Aurelia I), tan callout ("Hierophants") |
| ref-06 | Ch.2 lead-in — "The Infinite Horizon" section, blue callout ("Directionality on the Infinite Horizon"), tan callout ("Uses of the Other Færrins"), wide planetary-chain art plate |
| ref-07 | Ch.2 "The Gods" chapter opener — Divine Raiment / Celestial Presence sections, blue callout ("Mixed Blessings"), aurora art plate |
| ref-08 | Deity statblock-style spread: The Iridescent Host / The Eternal Pulse, first appearance of Devotee Benefits bold-label block, wide nebula art plate |
| ref-09 | Deity spread: The Compelled / The Heir of the Plague, eclipse art plate |
| ref-10 | Deity spread: The Watcher with 1000 Eyes / The Judge of Ages, priest portrait art plate |
| ref-11 | Inner Gods / Godly Interplay prose spread, blue-hour mountain/rings art plate |
| ref-12 | Chapter-opener: "HOLY GEOGRAPHY" title over a winged cathedral-mountain painting |
| ref-13 | Ch.3 "The Countries" — intro prose + **Country Descriptions table** (zebra rows, gold header rule), blue callout ("Other Lands"), city art plate |
| ref-14 | Calaria country page — tan callout ("Calarian Exceptionalism"), rain-lit city street art plate |
| ref-15 | Brithwyn country page — tan callout (in-world ad, "Chorath Engineering"), tower art plate |
| ref-16 | Fenrith country page — blue callout ("Inhabitants of the Veinlands"), tan callout (shipping manifest), coastal domes art plate |
| ref-17 | Velthara country page — tan callout (news excerpt), desert strider-city art plate |
| ref-18 | Austrene country page — tan callout (chat-log transcript), observatory cliff art plate |
| ref-19 | Istria country page — tan callout (expedition debrief), walking-city/strider art plate |
| ref-20 | Tormeré country page — tan callout (news transcript), vineyard/fazenda art plate |
| ref-21 | Rhædon country page — tan callout (inauguration speech), desert palace art plate |
| ref-22 | Lorandris country page — tan callout (sea shanty lyrics), shipyard art plate |
| ref-23 | Chapter-opener: "THE ORGS" title + tan callout (autobiography excerpt), rainy neon-district art plate |
| ref-24 | The Iridescent Church — **first trait-pill row** (`HOST` `RELIGIOUS`), blue callout ("The Dissident Church of Brithwyn"), abstract painterly art plate |
| ref-25 | The Scale (`JUDGE` `RELIGIOUS`) / Belvedere (`WATCHER` `RELIGIOUS`) org spread, orrery art plate |
| ref-26 | The Children of the Heir (`HEIR` `RELIGIOUS`) / Pale Lantern Society (`PULSE` `RELIGIOUS`), cubist-style character art plate |
| ref-27 | Protectorate / Sable and Suns / The RunGunners (all `MARTIAL` pill), armored-figure art plate |
| ref-28 | Prime Meridian / Concordia (both `MERCANTILE` pill), radiant-figure art plate |
| ref-29 | Other Orgs directory (Martial + Mercantile category lists), airframe-in-firestorm art plate |
| ref-30 | Chapter-opener: "BLESSED PHILOSOPHY" title over a symbolic sword/eye religious icon painting |
| ref-31 | Ch.5 "The Harmonies" — Voidsong narrative lead-in + "Iconoclasm" section, mountain-lake art plate |
| ref-32 | Listener archetype — first full **feat statblock** ("LISTENER DEDICATION — FEAT 1"), blue callout ("Attunement"), first cantrip block ("RESONATE — RESONANCE CANTRIP 1"), painterly character art plate |
| ref-33 | "LAMENT OF THE NUMB — RESONANCE 1" resonance-spell statblock (full pill row: `CHORAL` `CONCENTRATE` `EMOTION` `MENTAL`), Resonance Spells rules prose, dark ritual art plate |
| ref-34 | Chapter-opener: "THE OPTIONS" — campaign ruleset prose (Free Archetype, ABP, Mythic), "RECOUP LUCK" mythic action statblock (`UNCOMMON` `FORTUNE` `MYTHIC` pills), Menagerie city art plate |
| ref-35 | **Færric Backgrounds** — "COG IN THE MACHINE — BACKGROUND" statblock-style header, dancer/fire-summoning art plate |
| ref-36 | Backgrounds cont'd — Illegal Entrepreneur / Pro Rowdy / Chosen by God / Veteran Driver ("NAME — BACKGROUND" header repeated ×4), Iconoclast portrait art plate |

---

*Compiled for astra's `codex` re-skin. Cross-reference `apps/codex` (flat PF2e reference site, port
10374) and the existing gothic design system (`libs/ts/gothic`) when implementing — this is a **second,
separate** visual language from gothic's dark mechanical-mode aesthetic; do not merge the two token sets.*
