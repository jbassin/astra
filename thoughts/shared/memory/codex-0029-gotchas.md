---
name: codex-0029-gotchas
description: codex (0029) — public-but-noindexed PF2e reference site (codex.iridi.cc, AoN breadth × 5etools structure × gothic) — 2026-07-12 viability GREEN + scoped + P1 ingest spec FINAL (adversarially reviewed, 8 blockers folded); ▶ RESUME AT implementation S1; the verified data-source facts + join/grammar gotchas a fresh session must not re-derive
metadata:
  type: project
---

**codex (0029)** — a PF2e rules-reference site: Archives of Nethys content breadth × 5etools
data/UX structure × gothic styling, new flat TS member `apps/codex` on the strider/site-kit SSR
template (Decision I intact), **port 10374**. Publicly reachable but NOINDEXED (robots.txt +
`X-Robots-Tag` + no sitemap + not on ledger), personal-use posture, no CUP mitigations —
stakeholder decisions C-1..C-8 all in the scope doc. **Per-phase specs** (heartwood precedent):
P1 ingest+canonical corpus (L) → P2 entity pages → P3 faceted browse+search → P4 rules browser →
P5 deploy; P2+ get specced against the REAL corpus P1 produces.

**▶ RESUME AT: `octo:embrace` S1** of `thoughts/astra/specs/0029-codex-p1-ingest-spec.md`
(FINAL — D29-1..13, slices S1 scaffold+fetchers · S2 Foundry parser · S3 AoN parser · S4
join+emit+report+fixture; exit gate A–H ends in a stakeholder review of the transform report).
Docs: viability `…/research/2026-07-12-codex-0029-viability-thoughts.md` (5-agent evidence:
AoN ES probe, licensing, foundryvtt/pf2e inventory, 5etools analysis, stack fit) + scope
`…/research/2026-07-12-codex-0029-thoughts.md` (C-1..C-8 + verified repo/live facts).

**Verified data-source facts (live-probed 2026-07-12 — don't re-derive):**
- **AoN ES is live + auth-free server-side:** `https://elasticsearch.aonprd.com/aon/_search`
  (index alias `aon`), **43,686 docs**, each with full `markdown` statblock + per-field facet
  breakouts. **Origin-allowlisted** (browser fetch from our domain → 403; server/build-time →
  unrestricted). Page cap 10k; **`_id` sort rejected — `search_after` on `name.keyword` (+`url`
  tiebreak) verified working**. Random-30 avg 5,443 B/doc → ~226 MB raw. Snapshot-once posture;
  never a runtime dependency.
- **AoN `article` docs are CITATION STUBS** (~272 B teasers), NOT lore prose — the prose layer
  is `rules` (3,645 full-text section docs WITH `breadcrumbs` = the P4 tree for free) +
  `sidebar` (694 full-text). AoN has **93 categories** total.
- **foundryvtt/pf2e packs** = 28,646 docs/96 packs at pinned tag (start `pf2e-8.3.0`), plain
  committed JSON, per-doc `system.publication.{license,remaster}` — **Actors put it at
  `system.details.publication`**. The session's sparse clone lived in the scratchpad (GONE next
  session — refetch per D29-5, incl. `static/lang/*.json` AND `src/util/misc.ts`).

**THE spec-level gotchas (adversarial review, all folded into the spec — headline hooks):**
- **Shared-slug legacy/remaster pairs are the common case** (two "Heal" spells) → legacy pair
  member id/file = `<slug>@legacy`; pairing ids are ARRAYS (`remaster_id`/`legacy_id`).
- **`@Localize` majority-resolves in `re-en.json`** (106/200 keys; `en.json` only 91) — fetch
  ALL `static/lang/*.json`, merge.
- **Four inline-roll forms** (`[[/r` `[[/br` `[[/gmr` `[[/act`), not just `[[/r`; **94% of
  `@Damage` has nested brackets** → depth-aware bracket matching, never scan-to-first-`]`.
- **Creature join needs the qualifier-reorder normalization** (AoN "Adult Adamantine Dragon" vs
  Foundry "Adamantine Dragon (Adult)"): raw hit-rate ~70% vs spells 99% — normalization is
  DECIDED in D29-7, aliases only for true one-offs; Foundry 1:N spellcaster variants →
  `variantOf`.
- **Journals are a different doc shape** (one JournalEntry, `pages[]`) — pages merge-by-slug
  into Item entities as `loreBody` (else `anadi` + `anadi-2` split-brain).
- **AoN-only content has NO license field** (and the removed legacy spells — Magic Missile —
  exist ONLY in AoN) → committed book→license table (D29-13).
- `@UUID` pack segments = registered names ≠ dirs (resolve via `system.pf2e.json` map + the
  `pf2e/` path-prefix rewrite); `codex typecheck` must be BARE `tsc --noEmit` (the akasha idiom
  runs content-gen first — would red CI on a fresh clone since `data/` is gitignored).
- **Every new TS app needs a `pyproject.toml` uv-`exclude` entry** (the scope doc initially got
  this wrong; `pyproject.toml:11` says "Add each new TS app here") + the 21-sibling Dockerfile
  manifest-COPY ripple lands at S1.

Builds on [[portal-0023-gotchas]] (pf2e document model) + [[akasha-frontend-0011-gotchas]] +
[[strider-0016-gotchas]] (template) + [[config-single-source]] + [[no-silent-scope-cuts]].
