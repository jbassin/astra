---
name: liturgy-vol2-latex-book
description: The Liturgy Vol.2 LaTeX/tectonic book pipeline (assay export-book) — the XeTeX traps (needspace-in-multicols, columnbreak override, silently-dropping tabularx), the art-drop workflow, and the retired Homebrewery predecessor
metadata:
  type: project
---

PROJECT 2026-07-31 **LaTeX CUTOVER BUILT + PUSHED in one session** (`28d084a` S2
emitter · `4697ad0` S3 audit · `3d35727` S4 art + retirement): the stakeholder
rejected the Homebrewery output ("wasn't happy") and redirected to **LaTeX via
tectonic** (XeTeX, `~/.cargo/bin/tectonic`, 0.17). `uv run assay export-book` →
`apps/codex/books/liturgy_vol2/liturgy_of_the_iridite_vol2.tex` + committed
65-page PDF (~20 s compile, `--no-compile` flag, SOURCE_DATE_EPOCH=0; .tex
byte-deterministic; tests tectonic-free). The **Homebrewery pipeline + its
pixel-calibration apparatus are DELETED** (md/css/calibration.json/tools at
`3d35727`; the old render-trap memory `liturgy-vol2-homebrewery-gotchas` was
deleted with it — recover both from git history if Homebrewery ever returns).

**Style:** committed `liturgy.sty` = the PHB-2024 look (parchment spread halves
by parity, Solbera remake fonts + Wolpe Pegasus/OPTIPegasus **extracted from the
PHB2024Style.css base64 embeds**, Pathfinder2eActions.ttf glyph font — no space
glyph, benign warnings; body fonts lack en-dash/minus → emitter normalizes).
Stakeholder-gated on an S1 sample round: preamble rule BELOW the title hbox
(negative-vspace strikethrough was the first defect), compact pills, **school
pill PURPLE #800080 sorted first-after-rarity**, intra-block \parskip 0.15cm,
full-width parity-flipped footer, page number nested in the hook at xshift
±0.76cm / yshift 0.66cm (three-iteration pixel tune). Spell blocks are PLAIN
FLOW + rules (not boxes) — they break across columns natively, which is the
whole win over Homebrewery. Commercial-font licensing = personal-use, flag
before distributing.

**⭐ THE XeTeX traps (each cost a live-render round):**

1. **`\needspace` is BROKEN inside multicols** — it checks \pagegoal (page),
   not the column → spurious giant column gaps (S1) and a stranded-widow page
   (S3). Struck twice. Use a **minipage keep-together** for atomic headers;
   plain `\vspace`+rules for separation.
2. **multicols balancing silently overrides `\columnbreak`** once content
   exceeds one column → the chapter-opener art column could not be reserved
   with multicols at all. Fix = **adjustwidth single-column** narrowed by
   `\openerreserve`.
3. **An unbreakable tabularx taller than a column SILENTLY DROPS rows** past
   the page edge — Eye Stalks' rays 7–8 never rendered in the pre-fix PDF (not
   just overflow: content loss). Fix = per-row `\tblrow` boxes (one tabularx
   per row, header+first-row atomic, explicit per-row \rowcolor striping —
   `\rowcolors` needs `\usepackage[table]{xcolor}` loaded once early). Label
   columns size to longest CELL capped at 7em; the prose column takes the rest.
4. **⭐ `\pageref` expanding while a fresh `\fontsize{}{}\selectfont` is active
   corrupts `\strutbox` HEIGHT for the REST OF THE COMPILE** — surfaced as
   quantized +19pt phantom-tall rows scattered through every spell-list table
   (array's \@arstrutbox height tripled on p{}/X columns). Bisection-proven
   (delete ToC → vanishes; one \tocentry-shaped call → returns); hyperref and
   colortbl both innocent (an earlier `\rowcolors`-counter "fix" changed
   nothing — measure, don't trust). No \edef workaround survives. Fix =
   resolve `\pageref` at ambient `\normalsize` inside its own group, then
   `\scalebox` the FINISHED box back up (box scaling never touches font
   machinery).

**Layout decisions (stakeholder-locked):** chapter = opener page (prose at the
narrowed measure + full-height framed art) → **spell-list table on its OWN
full-width page** (sharing the opener page slices across the art; narrowing
the table instead wrapped cells taller, +6 pages book-wide) → two-column
spells. Front matter = **cover + Contents only** (credits/Reading-This-Book/
How-to-Read deleted on stakeholder call; the fm-reading slot retired with its
page). Art-backed cover = cream shadowed title (`\livshadowline`, two offset
tikz nodes — contour pkg not a bundle certainty) + one-shot furniture
suppression (`\ifliturgysuppressfurniture`, consumed at shipout).

**Art (ALL 9 slots real, `5e69859`):** drops land in
`assets/img/processed/<school>.{png,jpg}` + `fm-cover` → export places them
fail-soft. **NO CROP is the stakeholder rule** — `\openerreserve` is DERIVED:
art ratio 0.370 × window height + 0.5cm gutter ≈ 0.457\textwidth; prose
measure ~9.65cm (needed `\tolerance=2000`+`\emergencystretch` and **staff
prose trims of 6 opener fragments** to ~400-450 words each — stakeholder
authorized the cuts, review pending). Art clips to a **1.2mm-chamfer octagon**
tucked under a true 9-patch gold frame built from vol1's actual border asset
(`frame-gold.png`; frame band sized to the ~3mm MEASURED vol1 render — the
CSS's `border-image-width: 24mm` was never honored by Homebrewery).
`preprocessed/` + `books/**/*.log` gitignored; `processed/` committed.

**Audit method (the meta-lesson):** engineer "visually verified" claims failed
THREE consecutive rounds (zero-gutter art, footer overflow, the +19pt rows) —
**the orchestrator's own render pass + pdftotext-bbox MEASUREMENT is the gate
that holds**; a PIL bottom-band ink detector sweeps for footer intrusion.
Review-pending content residue: the 6 trimmed openers, chapter-intro creative
liberties, 23 trimmed summaries ([[assay-0030-gotchas]] for the store).
