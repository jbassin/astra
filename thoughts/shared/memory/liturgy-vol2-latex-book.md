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
   `\openerreserve` (0.30\textwidth — tuned down from vol1's 0.42 ratio;
   planara, the longest opener, is the binding constraint).
3. **An unbreakable tabularx taller than a column SILENTLY DROPS rows** past
   the page edge — Eye Stalks' rays 7–8 never rendered in the pre-fix PDF (not
   just overflow: content loss). Fix = per-row `\tblrow` boxes (one tabularx
   per row, header+first-row atomic, explicit per-row \rowcolor striping —
   `\rowcolors` needs `\usepackage[table]{xcolor}` loaded once early).
4. **Opener art width = \openerreserve − 0.5cm** — the dashed placeholder kept
   a 0.5cm prose gutter inside the reservation; a full-reserve image touches
   the prose column (struck on the first real art drop).

**Art-drop workflow (stakeholder, in progress):** finished art →
`assets/img/processed/<school>.{png,jpg}` (**610×1650**; cover `fm-cover` at
1275×1650, `fm-reading` sidebar same as chapters) → next `export-book` places
it fail-soft (dashed placeholder otherwise; BookReport lists real vs
placeholder). 3/8 chapters done (antillurgy/chronomancy/mercuromancy).
`preprocessed/` (raw generations) + `books/**/*.log` gitignored; `processed/`
committed. Fragments were converted to a neutral dialect (`:::note` fences,
bare `\page`, ART-SLOT comments → % comments) with prose byte-preserved.

**Audit method:** pdftoppm → READ the PNGs; engineer "visually verified" claims
missed both the zero-gutter art and the footer-band overflow — **orchestrator
spot-checks of the actual renders are load-bearing**. A PIL bottom-band ink
detector (validated against the known-bad page) sweeps all 65 pages for
footer intrusion. Review-pending content residue carries over from the
Homebrewery round: chapter-intro creative liberties, 23 trimmed summaries,
credits TODOs ([[assay-0030-gotchas]] for the store itself).
