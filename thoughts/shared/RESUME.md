# RESUME — pick up astra work here

A living handoff doc. To resume in a fresh session, the prompt can simply be:
**"Read `thoughts/shared/RESUME.md` and continue."**

Keep the **Current state** section below updated as work lands (it's the only part that goes stale —
everything else points at durable docs). Update it when you finish a slice/subsystem.

---

## Orient first (read before doing anything)

1. **`CONTRIBUTING.md`** (root) — the practical guide: dev process, exact CI commands, working-style
   rules, the gotchas catalog. Primary onboarding doc.
2. **`CLAUDE.md`** — authoritative conventions.
3. **`thoughts/astra/plans/0000-astra-migration-roadmap.md`** — phases + the decisions ledger A–I.
   Note **Decision I**: frontends are **SSR Compose services behind Caddy**, not prerendered static.
4. **`thoughts/shared/memory/MEMORY.md`** + its memories — especially the feedback memories
   **`verify-before-acting`** and **`no-silent-scope-cuts`**.

## How to work (hard rules — see the feedback memories)

- **Port faerrin; don't reinvent** — grep `/ruby/data/experiments/faerrin` FIRST for any logic and lift it.
- **Verify before acting** — check the real repo/config/source; don't assume or run on a default.
- **Build the spec's scope in full; never silently collapse/defer** to fit budget — surface the trade-off
  and ask. Only defer what the spec explicitly sanctions.
- **Commit each CI-green slice** (Conventional Commits) and **push on chunk completion**, after
  reproducing CI locally. Don't accumulate uncommitted work; don't watch the GHA run (confirm push + one
  status check).
- **Reproduce CI locally before pushing:**
  ```
  uv run ruff check && uv run ruff format --check && uv run ty check && uv run pytest
  bun --filter '*' typecheck && bunx biome ci . && bun --filter '*' test && bun --filter '*' build
  ```
  (scope to the lane/app you touched).

---

## Current state — UPDATE THIS SECTION (as of commit `7ec629b`, 2026-06-28)

> **The faerrin→astra migration is COMPLETE (see the 🎉 section below).** **A new multi-phase subsystem —
> `heartwood` (0020) — is IN FLIGHT.** **Phase 1 (ontology infra) DONE + pushed. Phase 2 (extraction engine)
> — DONE + pushed: acceptance CLOSED on the first `through-a-song-darkly` session (`2025-8-28`).** **Phase 3
> (prose proposer — the make-or-break house-voice / anti-slop gate): SCOPE + SPEC done + pushed
> (`cb86823`/`7ec629b`), adversarially hardened.** **▶ NEXT: Phase 3 IMPLEMENT — slice S1 (no code yet).**

### heartwood (0020): LLM-maintained akasha setting wiki — Phase 2 DONE; Phase 3 scope+spec DONE, IMPLEMENT next (2026-06-28)

A net-new **multi-phase** subsystem: GLM-5.2 reads play-session transcripts and maintains the akasha
**setting wiki** (the "nouns"), proposing changes for **human-gated PR-style review** at a bespoke
**`heartwood.iridi.cc`** (vellum-editor base). Umbrella `…/2026-06-27-heartwood-0020-thoughts.md` (D1–D10,
5 phases, §7 open-Qs resolved). **Phases:** (1) ontology infra ✅; (2) **extraction engine** ✅ DONE;
(3) **prose proposer (make-or-break house-voice) ← NEXT**; (4) review surface + write-back; (5) backfill/automation.

**Phase 1 — DONE** (`139db9f`…`e0458f9`): `world` field on `Campaign` + `faerrin_campaign_slugs()`; new
**`astra-lexicon`** lib (`defs.yaml→defs.kdl`, linguist refactored no-behavior-change); **`ontology-entity`**
typed registry (311 seeded) + `resolve()` (`Y'shael→Ichel`). Spec `…-phase1-registry-spec.md` BUILT.

**Phase 2 — extraction engine: DONE + pushed; acceptance CLOSED (first TSD session `2025-8-28`).**
- Scope `…/2026-06-27-heartwood-0020-phase2-extraction-thoughts.md` (`dae7561`), spec
  `thoughts/astra/specs/0020-heartwood-phase2-extraction-spec.md` (`9d768d0`). Decisions **P2.1–P2.11**
  question-free; **P2.1 REVISED the umbrella: PCs ARE wiki-eligible** (no PC special-casing).
- New app **`apps/heartwood-backend`** (pkg `astra-heartwood-backend`, module `astra_heartwood`), read-only:
  world-filter → **filter** (drop OOC/combat/play-by-play) → **extract** noun-facts → **resolve()** →
  **refine** (Stage 2.5) → committed `facts/<date>.json`. Mirrors chronicle's asset shape.
  - **S1** (`a908184`) scaffold + world filter (verified **40 ingested / 3 world-drop / 1 EXCLUDED_DATES**).
  - **S2** (`ee8ea04`) Stage-1 filter pass (windowed keep/drop, keep-when-in-doubt, dropped-span audit).
  - **S3** (`c148c47`) Stage-2 `call_structured` noun-fact extractor (grounding contract, atomic claims).
  - **S4** (`9591ac9`) resolution + emit + `session_noun_facts` Dagster asset + code-location wiring.
  - **S2.5** (`a1225fb`) **fact-refinement pass + wiki-worthiness taxonomy** (added after the first live
    run + stakeholder feedback): drops non-wiki facts by typed category (event / ability / possession /
    mechanical (gold/levels/stats) / nonsensical) and **canonicalizes resolved names** (a mislabel like
    `Y'shael` never surfaces — kept facts OR audit; deterministic safety-net backstop). `RefinedOutFact`
    records the category. EXTRACT grounding tightened (no mechanics/abilities/inventory/gold/events; no
    inferred relationships). Plus `fix(llm)` (`98ef460`, malformed tool-JSON retry — a shared-lib gap that
    crashed run 2) and `feat(lexicon)` (`8f25f60`, `Bertha Ford → Berth Four`).
- **Acceptance run + 3 infra fixes (2026-06-28, this session, `608fc63`…`e0508ad`):** acceptance was
  **relocated from the held-out 2026-6-8 to the FIRST `through-a-song-darkly` session `2025-8-28`** — process
  the campaign in chronological order so later sessions can key off the world built up earlier (stakeholder
  call). The re-run surfaced **three infra bugs**, each fixed CI-green + pushed before it completed:
  (1) **`fix(llm)` `608fc63`** — GLM occasionally returns `finish_reason=stop` with NO tool call on a forced
  tool; extended the bounded client retry (which only covered malformed JSON) to also retry this (shared lib).
  (2) **`fix(heartwood)` `a0e13ee`** — GLM-5.2 **reasoning tokens share the `max_tokens` budget**, so 8k
  truncated the exhaustive fact list even per chunk → raised `EXTRACT`/`REFINE_MAX_TOKENS` 8k→16k +
  `EXTRACT_CHUNK_WORDS` 16k→4k. (3) the artifact: **`feat(heartwood)` `e0508ad`** committed
  `apps/heartwood-backend/facts/2025-8-28.json` — **149 facts / 38 refined-out / 95 dropped**; resolution
  page-aware (**47 existing-page updates / 72 known-no-page / 25 new / 5 ambiguous**); taxonomy clean (event
  21 / nonsensical 9 / ability 4 / possession 4); no raw mislabels leaked. **Stakeholder judged §11 = good
  pass → Phase-2 acceptance CLOSED.** The stale untracked `facts/2026-6-8.json` was discarded.
- **NB — full backfill is Phase 5**, gated behind Phases 3–4 (cross-session accumulation needs Phase-4
  write-back + re-seed; backfilling extraction-only now would just be reprocessed later). The page-awareness
  the stakeholder asked about: the **registry is seeded from the akasha wiki snapshot** (`ontology-entity/
  seed.py`) so resolution already sees existing pages (resolved+page=update / resolved+no-page=new-page /
  unknown=net-new) — but heartwood's OWN per-session facts are NOT fed forward until Phase-4 write-back.
- **Known residual (Phase-4 review territory, not a Phase-2 blocker):** the `Voidheart→voidward` confident
  false-link (resolve-threshold tuning, trades against catching real garbles at ~0.86) + residual factual
  hallucinations + ~28% of facts with no `kind_hint`.

**Phase 3 — prose proposer: SCOPE + SPEC DONE + pushed; IMPLEMENT not started (2026-06-28, this session).**
- Scope `…/2026-06-28-heartwood-0020-phase3-proposer-thoughts.md` (`cb86823`), spec
  `thoughts/astra/specs/0020-heartwood-phase3-proposer-spec.md` (`7ec629b`). Extensive verified research:
  the house voice (real akasha pages), mouthpiece's anti-slop two-pass + `call_text`, page-identity/snapshot/
  render/KDL mechanics, and **the faerrin prior art — this feature FAILED TWICE there** ("voice may be
  partially unlearnable by LLMs"). Phase 2 already absorbed their #1 failure (extraction); Phase 3 ports their
  hard-won assets: `DRAFT_SYSTEM` prompt spine, the **GOOD/BAD voice calibration**, a **machine tell-lint**
  (encyclopedia-opener regex / intensifier vocab / page-type-aware), full-body-replace merge.
- **Stakeholder decisions:** **P3.1 aim for publishable pages** (pursue the make-or-break bar, eyes open) +
  **P3.2 new pages + merged rewrites** (full D3). Output = committed **KDL manifest + sibling `.vellum`** under
  `proposals/<date>/`; `call_text` draft → tell-lint → bounded revise; read-only (no writes/surface — Phase 4).
- **An independent adversarial pass hardened the spec** (verified vs the real repo + the `2025-8-28` facts):
  **P3.15 novelty gate** (skip rewrites of already-stated facts — avoids faerrin's review-burden death);
  **P3.16 match-the-target voice** (2nd-person corpus pages + spelling, not a rigid 3rd-person rule);
  **P3.17 conflict-flagging** (contradictions surfaced, not overwritten); non-prose page skip (preserve
  `@deity`/`@timeline`); item/folder-less placement flagged (no invented folder); pinned id-slug +
  broken-wikilink parsing. 5 slices (§13): S1 models/grouping/placement → S2 tell-lint → S3 draft → S4
  revise/assemble/emit/asset → S5 telemetry + acceptance on `2025-8-28`.
- **▶ RESUME AT: Phase 3 — prose proposer — IMPLEMENT (S1).** Scope + spec DONE (`cb86823` scope; spec
  `0020-heartwood-phase3-proposer-spec.md`, adversarially hardened). The make-or-break house-voice gate
  (anti-AI-slop is THE bar). Locked: P3.1 aim-for-publishable; P3.2 new pages + merged rewrites; novelty gate
  + conflict-flag + non-prose-skip + match-the-target voice (P3.15–P3.17). Drive the 5 slices (§13) with
  `octo:embrace`; acceptance on the committed `2025-8-28` facts. Builds on the committed Phase-2 facts.
- **Gotchas memory:** `[[heartwood-0020-gotchas]]`.

### chronicle (0019): automatic Show → Season → Episode campaign timeline in akasha (2026-06-27 session — DONE + LIVE)

A net-new akasha section at **`akasha.iridi.cc/chronicle`** — GLM-5.2 structures the actual-play
transcripts into Show → Season → Episode. Scope→spec→implement gates:
`thoughts/shared/research/2026-06-27-akasha-chronicle-0019-thoughts.md` +
`thoughts/astra/specs/0019-chronicle-spec.md`. Memory: [[chronicle-0019-gotchas]]. **All 7 slices +
review follow-ups built, CI-green, pushed, deployed, live-verified (Playwright).**
- **Pipeline (linguist):** `session_episode_summary` (per-session asset, GLM `call_structured` →
  Rich `EpisodeSummary`) + `campaign_timeline` (aggregate, hourly schedule, skip-when-unchanged
  `inputs_hash`) → committed `apps/linguist/timeline/{episodes/<date>.json,seasons.json}`. Season
  grouping outputs compact **boundaries** (not episode-lists) to avoid mid-JSON truncation on the
  33-ep show. **NOT the dspy judge** — plain GLM-5.2. Slices S1–S3 (`a509cba`/`390298e`/`1548120`).
- **Backfill** S4 (`85eeec0`): all **44** matched sessions summarized on the host (~$2–3, SigNoz);
  `apps/linguist/scripts/backfill_chronicle.py` (resumable).
- **Frontend** S5/S6 (`5f7c730`/`7b86c6e`): `build-content.ts` → `src/generated/chronicle.ts`;
  routes `/chronicle` (shows index) + `/chronicle/$show/{index,$episode}`; gothic `Chronicle.tsx`.
- **Deploy** S7 (`349c435`/`5e51d92`): linguist-commit timer + akasha Dockerfile both gained
  `apps/linguist/timeline`.
- **Review follow-ups (`f5ac5c9`…`b111f70`):** excluded the mislabeled session **2025-8-11** (a
  different campaign false-matched via 96× "Argyle" → `EXCLUDED_DATES`; data is now **43 episodes / 13
  seasons**, main show 32/5); **removed the force-graph** on chronicle pages (`PageLayout graph={false}`
  + `#quartz-body.no-right` 2-col); **condensed show cards** (synopsis blurb) → **nested episode detail
  page** with full beats/entities/cliffhanger/transcript link; **nested Chronicle in the Looking Glass
  Explorer** (injected subtree, `TreeNode.href`, season-nested episode slugs for auto-open/active);
  **dropped the now-redundant standalone Chronicle sidebar link**.
- **Gotcha that bit:** the **linguist-commit systemd timer fires every ~15 min** and auto-committed my
  regenerated `timeline/` data mid-session (+ auto-redeployed akasha with new data but OLD frontend) —
  after a frontend change you must commit the code + redeploy yourself; don't trust the timer's redeploy
  to have your latest code. The exclusion code reaches the live pipeline only on `docker compose build
  dagster-code` (fine — 2025-8-11 won't re-materialize).

### Animated backgrounds as an astra signature style — @astra/backdrop (2026-06-26 session — DONE + LIVE)

Made the animated abstract page background (harrow's starfield, strider's balatro) a **shared signature
style** and added one to **mouthpiece, ledger** (pixi shaders) + **akasha** (CSS). 6 commits
(`6858066`…`4232fc7`), all CI-green, deployed (targeted `docker compose build/up`), **live-verified by
Playwright/swiftshader screenshots + SigNoz 0-error SSR spans**. Memory [[backdrop-signature-style]].
- **New lib `@astra/backdrop`** (`6858066`): `ShaderBackground` (SSR-safe mounter — renders null until
  mounted so the canvas is absent from SSR HTML; dynamic-imports pixi; **ONE Application per page**) +
  `createShaderBackground` factory (the pixi-v8 full-screen-rect + Filter idiom, generalised) + a catalog
  (`starfield` harrow-verbatim, `mouthpieceResonance`, `ledgerAurora`) with gothic-palette RGB + noise GLSL
  in `shaders/common.ts` and a per-shader `uIntensity` knob. **harrow migrated onto it** (dogfood, dropped
  its local component + direct pixi dep). **strider left as-is** (balatro entangled with its faction-tint).
- **mouthpiece** (`9a07220`) + **ledger** (`01caa29`) mount `<ShaderBackground spec={…}>` in `__root`.
- **THE constraint: two live pixi Applications on one page CONFLICT** (confirmed from strider). akasha
  already runs a webgpu force-graph → it gets a **CSS-only animated nebula** (`c979545`) instead of a pixi
  shader (no 2nd WebGL context; graph untouched).
- **Tuning** (`4232fc7`): first pass rendered too faint (swiftshader under-renders + diffuse fbm) → bumped
  ledgerAurora intensity 0.8→1.5 + akasha nebula alphas. Easy to dial further (one uIntensity / the alphas).
- A **new TS lib needs NO Dockerfile ripple** (frontends `COPY libs/ts` wholesale, unlike a new app).

### ledger (0018): the astra landing page (2026-06-26 session — DONE + LIVE ON PUBLIC EDGE)

Built **ledger**, a net-new **landing page** at `ledger.iridi.cc` — one homepage with a gothic card grid
linking the five player-facing sites (strider/akasha/mouthpiece/harrow/vellum). A **backend-less SSR frontend
on the strider template** (port **10370**, `astra.ledger`), the **simplest frontend in the repo** (a sibling
of harrow, no content files, one route). 3 CI-green slices pushed + deployed + edge-reloaded + **live-verified
public** (HTTP/2 200 over TLS, all 5 cards, `astra.ledger` SSR spans in SigNoz, 0 errors). Spec
`thoughts/astra/specs/0018-ledger-spec.md`, memory [[ledger-0018-gotchas]]. User decisions: new subdomain (not
apex); player-facing links only; clean gothic grid (no pixi). Commits:
- **s1 config** (`e6aeaea`): `ledger` namespace (10370) in kdl + both schemas + tests; added a `public-origin`
  to strider's block so the link registry can read every site's URL from config.
- **s2 app** (`cab6ebe`): the app on the harrow shell — `build-content` joins a ledger-owned registry
  (title/blurb/order) to each linked site's config `public-origin` → generated `sites.ts` (**no hardcoded
  URLs**, config-single-source); the grid route + SiteCard; `sites.test.ts` parity gate + SSR smoke; uv exclude.
- **s3 deploy** (`ae8b27e`): Dockerfile + the **9-sibling manifest ripple**; Compose `ledger`@10370; Caddy
  `ledger.iridi.cc`; targeted `docker compose up -d --build ledger` (backend-less → safe); `caddy-validate` +
  `caddy-reload`. **THE edge surprise: the brand-new subdomain JUST WORKED — `*.iridi.cc` is a wildcard, so no
  manual DNS record was needed** (prior frontends needlessly deferred DNS); Caddy ACME-DNS minted a real
  Let's Encrypt cert. See [[ledger-0018-gotchas]].

### harrow: animated yellow/black starfield background (2026-06-26 session — DONE + LIVE)

Added a fixed, full-viewport animated **starfield** behind every harrow page (the user asked for "a shader
background like strider's, yellow and black like a starfield"). One commit `5f3865f`, both TS-lane gates
green locally, deployed via targeted `docker compose up -d --build harrow` + **live-verified on
`harrow.iridi.cc`** (home/gallery/spreads all 200, container healthy on :10369). Memory
`[[harrow-0017-gotchas]]` (starfield note appended).
- **Pattern = port strider's balatro page background**, NOT reinvent: reused the Pixi-v8 mounting idiom from
  `apps/strider/src/components/PixiHost/balatroBackground.ts` — a reusable `Filter` (GlProgram +
  `defaultFilterVert`) on a full-screen `Graphics` rect scaled to the renderer, driven by a `uTime` uniform
  from the app ticker, the high-DPR **`vTextureCoord` (not `gl_FragCoord`)** fix, uniform-driven palette,
  full cleanup-on-unmount. The *shader* is new (a drifting 3-layer parallax starfield: hashed star grid +
  twinkle + an fbm amber nebula haze on warm-black space), the *scaffold* is strider's.
- **Harrow is simpler than strider → self-contained component.** No `PixiContext`/`panel`/`world` (harrow has
  no on-canvas content like strider's hex map) — `StarfieldBackground.tsx` owns one `Application` + the shader
  mesh. New files under `apps/harrow/src/components/StarfieldBackground/` (`.tsx` + `starfieldBackground.ts` +
  `.module.css`). Canvas `position:fixed; inset:0; z-index:-1; pointer-events:none`.
- **SSR-safe:** pixi is **dynamically imported** inside the effect and the component mounts inside
  `<ClientOnly>` in `__root.tsx`, so nothing pixi/WebGL evaluates during SSR (the canvas is correctly ABSENT
  from SSR HTML — verified). Harrow's `body` is already transparent (only `html` paints `--color-void`), so
  the field shows through and content stays interactive + readable.
- **Deps/CI:** added `pixi.js@^8.18.1` (matching strider; no `pixi-filters` needed — core `Filter`/`GlProgram`
  only). `balatroBackground.ts` needs no biome override (the uniforms cast passes), so neither does the harrow
  port. Build code-splits the shader into its own chunk; pixi stays out of the SSR bundle. Verified visually in
  a real WebGL browser (Playwright/swiftshader) before deploy — temp playwright dep + scripts cleaned up,
  `bun.lock` net diff is just the `pixi.js` line.
- **Deploy note:** harrow is backend-less (no SOPS secrets), so a plain targeted `docker compose up -d --build
  harrow` is safe (the silent-MOCK/SOPS-env trap only bites secret-needing services). No edge change —
  `harrow.iridi.cc` already routes to :10369.

### harrow (0017) — ported the external tarot reader into astra (2026-06-26 session — DONE + LIVE ON PUBLIC EDGE)

Brought the standalone app at `/ruby/data/experiments/tarot` ("Harrow", a React 18 + Vite 5 SPA tarot deck
reader) into astra as a **backend-less SSR frontend on the strider template** — a sibling of strider. **All 6
slices built + pushed + deployed + LIVE on `harrow.iridi.cc`** (`1aa0c81`…`a2c9a5e` + edge cutover
`4b3ad33`); healthy on **10369**, `service.name=astra.harrow` SSR spans in SigNoz (0 errors). Scope `thoughts/shared/research/2026-06-26-harrow-0017-thoughts.md`,
spec `thoughts/astra/specs/0017-harrow-spec.md`, memory [[harrow-0017-gotchas]]. Decisions: full gothic
re-skin; `harrow`/`harrow.iridi.cc`; build-time generated content; client-side draw/flip; views→routes; no
backend/DB/volume; deck hues via gothic identityStyle; deck + 29-predicate-label parity gates.
- **s1 scaffold** (`1aa0c81`): `apps/harrow` from the mouthpiece/strider shell; `harrow` config namespace in
  kdl + Zod + Pydantic (port 10369); uv `exclude`; SSR smoke.
- **s2 content pipeline** (`fdf2851`): 24 `.card` + 1 `.spread` copied byte-identical → `content/`; ported
  `parseCard`/`parseSpread` into `build-content.ts` → generated `cards.ts`/`spreads.ts`; **deck parity gate**.
- **s3 domain logic** (`aabb34f`): draw/fortune/tags/predicates/decks lifted verbatim; **predicate-selection +
  fortune-template gates** (13 tests total).
- **s4 gallery + nav** (`dc72a66`): `/gallery` + masthead nav; CardRow/CardFront/Icon/CardName re-skinned to
  gothic; deck/flip/shimmer utilities into globals.css.
- **s5 interactive** (`1cdd02e`): `/` client-only draw→flip→reveal behind `<ClientOnly>`; `/spreads` +
  `/spreads/history`; FlipCard (native `<button>`), CardSpread, useCardReveal, predicate-named shimmer title.
- **s6 deploy** (`a2c9a5e`): Dockerfile (simplest — no snapshot/volume) + the 8-sibling manifest ripple;
  Compose `harrow`@10369; Caddy `harrow.iridi.cc`; `docker compose build/up` + live-verified + SigNoz spans.
- **Edge cutover** (`4b3ad33`): `harrow.iridi.cc` was a **host takeover** (the old deploy owned it → DNS
  already existed). Removed the old stanza (→`localhost:10204`) from the shared `/ruby/data/reverse-proxy/Caddyfile`
  (backed up), `just caddy-validate` + `caddy-reload`; **live-verified `https://harrow.iridi.cc`** serves the
  migrated app (all routes 200). Duplicate-site conflict avoided (parent imports astra's sites.caddyfile).
- **Leftover (open, not blocking):** the **old harrow container still runs unrouted on `localhost:10204`**
  (saffron `/emerald/data/experiments`, image `reg.iridi.cc/tarot`) — the deferred old-deploy teardown
  (stop/remove container + image + `upload.sh`). Awaiting user go-ahead.

### Longer debate episodes via chunked Pass B (2026-06-26 session — DONE + LIVE)

The GLM debate episodes were stuck ~15 min; making them longer first **hung for 46 min**. Root cause: **Pass B
(structured typeset) is the scaling bottleneck, not Pass A.** Pass A (free-text debate) is fast (~57s for 6.7k
words); Pass B trying to emit a 6k+ word transcript as ONE tool call hangs. Fixed + re-rendered 2026-6-22 as
**"Rust, Numerology, and the Sea Shanty Below"** (266 turns / ~5.6k words, **34.1 min** real ElevenLabs
`mode=dialogue`, was 15.6). Memory `[[mouthpiece-glm-debate-switch]]`. Two code commits + the render:
- **`867eee7`** `feat: chunk Pass B typesetting`: `script.py` typesets Pass A in word-bounded SEGMENTS
  (`_split_transcript` + `PASS_B_CHUNK_WORDS=2200`), concatenates turns (title from first segment); short
  transcripts stay a single call (unchanged). Plus `astra_llm.client REQUEST_TIMEOUT_S=300` per-attempt (a hang
  → fast fail; there was NO client timeout before) and a bounded length prompt + raised digest beats (~18-25 →
  produced 24). 85 mouthpiece tests (+3 chunking).
- **`4e0000f`** `feat: render the 34-min chunked debate`: snapshot durationMs/audioVersion + audio volume +
  frontend all updated; live-verified (SSR title + 266 transcript rows + audio Range 206 @ 32.78 MB). debate-v1
  preserved as `*.debate1.bak`.
- **Gotchas (in the memory):** a stuck in-container `dagster asset materialize` is **root-owned → unkillable
  from the host as uid 1000**; `docker compose restart dagster-code` clears the orphan (preserves env).
  `signal.alarm` can't interrupt a blocked C socket read (litellm `timeout=`/httpx can). The 46-min hang cost
  only **~$0.15** (hung in retry sleeps, not token-runaway). **THE auto-publish timer race:** the
  `linguist-commit` timer (15 min) runs `mouthpiece-publish` + commit + seed + redeploy on any snapshot change,
  and raced our manual re-render — it committed the new title+transcript with the STALE (pre-render) duration +
  redeployed with old audio (the `chore(mouthpiece): auto-publish` commits `2269276`/`66ab7de`). Finish the
  render, then re-publish/seed/redeploy to correct it (or disable the timer during a manual re-render).

### Re-rendered the most recent mouthpiece episode as a GLM debate (2026-06-26 session — DONE + LIVE)

End-to-end redo of the most recent session (**2026-6-22**) on the now-deployed GLM 5.2 debate pipeline →
**"The Jurisdiction of Vibes"** (59 sparring turns, two-host Bram/Maeve, **15.6 min**, real ElevenLabs v3
`mode=dialogue`). Snapshot committed+pushed (`fd48ea4`), audio reseeded, mouthpiece-frontend redeployed.
**Live-verified:** home + episode page SSR the new title, `/episodes.json[2026-6-22]`=new title, audio Range
206 (14.9 MB new render). Memory `[[mouthpiece-glm-debate-switch]]` + `[[mouthpiece-two-host-gotchas]]`.
- **HOW (load-bearing):** `episodes/` is **root-owned by the container** → the host can't write digest/script
  (PermissionError); re-render by **materializing in the dagster-code container**:
  `docker compose exec -T dagster-code sh -c 'cd /opt/dagster/app && dagster asset materialize --select <assets>
  --partition <date> -f definitions.py'`. Split for a spend gate: first `session_digest,session_script` (GLM,
  cents) → review the script → then `session_audio_clips,session_episode` (ElevenLabs, $). Back up the current
  artifacts to `*.2host.bak` IN the container first (also can't from host). The dagster-code image already has
  the GLM debate code (rebuilt via `just up` earlier this session) + `OPENROUTER_API_KEY`/ElevenLabs env.
- **Publish (host-side):** `just mouthpiece-publish` (snapshot regen) → commit+push the snapshot → `just
  mouthpiece-seed` (new mp3 overwrites in the volume) → `docker compose up -d --build mouthpiece-frontend`.
- **⚠️ Drift gotcha caught:** the committed snapshot title can **lead** the live script/audio — the snapshot
  already said "The Jurisdiction of Vibes" (from the earlier A/B publish) while the live script+audio were
  still the calm "Sandwich Yoink Bonus" (a `publish` happened without a matching render). A snapshot title
  is no proof the episode was actually rendered; check `durationMs`/`audioVersion` + the on-disk mp3.

### linguist dspy judge → GLM 5.2 (2026-06-26 session — COMPLETE + PUSHED + CI-GREEN + DEPLOYED LIVE)

Retuned the transcription-correction judge (gate J) off Anthropic haiku/sonnet onto **GLM 5.2**, matching
mouthpiece's switch — and **recompiled the artifact live** (the compiled `judge.compiled.json` is
model-specific). One commit `199e5ab`, both lanes green locally (84 py tests + 6 ts), CI in_progress at push.
Memory `[[linguist-gate-j-dspy-judge]]` (full facts) + `[[mouthpiece-glm-debate-switch]]`.
- **Models:** `surface-model-judge` + `surface-model-escalate` both `openrouter/z-ai/glm-5.2` (config.kdl +
  py/ts schemas). Since judge == escalate, the **borderline-escalation tier is now INERT** (machinery kept,
  dormant, zero runtime cost; `judge_session` only escalates when the two models differ). User chose KEEP-inert
  over removing the tier. A new `test_judge_session_no_escalation_when_models_match` locks it in.
- **Key bridge:** new `astra_llm.ensure_openrouter_env()` mirrors `ensure_anthropic_env` (resolves
  `llm.openrouter-api-key` → `OPENROUTER_API_KEY`); `optimize.py` + `judge.py`'s production path call it.
- **Retrain:** live MIPROv2-medium compile on GLM, **$7.32** spend. Held-out eval **beats the haiku baseline**
  (gold set has grown to 580 train / 144 val): confirm **P 0.915→0.936, R 0.607→0.779**, restraint 0.946→0.935,
  optimizer metric 69.4→**81.25**. Re-run any time: `uv run python -m astra_linguist.surface.optimize --live`.
- **✅ DEPLOYED LIVE via `just up`** (2026-06-26): the dagster-code image rebuilt with the GLM-judge code
  (un-cached `COPY apps/linguist` + `uv sync` rebuild of astra-linguist/llm/config), container recreated, code
  location loaded cleanly (no import errors). `OPENROUTER_API_KEY` was already on the `*dagster-env` anchor
  (mouthpiece switch), so no env change. The next `correction_candidates` materialization uses the GLM judge.
- **Follow-up sanity sweep + substrate-smoke fix (`0bbf3f0`):** audited every model string in the repo.
  **Final inventory — chat: GLM 5.2 (`openrouter/z-ai/glm-5.2`) everywhere** (mouthpiece digest/script/mega/
  session, linguist judge+escalate, substrate smoke, `astra_llm.DEFAULT_MODEL`); **ASR: `groq/whisper-large-v3`**
  (scribe); **TTS: `eleven_v3`** (mouthpiece ElevenLabs). **No claude-* / gpt / gemini call anywhere** — Anthropic
  is now vestigial (key ref + 3 `claude-*` pricing rows + `ensure_anthropic_env` retained **as a fallback, by
  request**). The sweep caught a real leftover: the substrate smoke called the GLM default model but still
  bridged the Anthropic key (`ensure_anthropic_env`) — fixed to `ensure_openrouter_env`; its offline test's
  env-override moved `ANTHROPIC_API_KEY`→`OPENROUTER_API_KEY` (verified faithfully with a failing-`sops` shim on
  PATH, per `[[mouthpiece-glm-debate-switch]]`). Manual gate, no redeploy needed.

### mouthpiece → GLM 5.2 + debate format (2026-06-26 session — COMPLETE + PUSHED + CI-GREEN + DEPLOYED LIVE)

Switched the recap podcast off Anthropic onto **GLM 5.2** (open-weight MoE, via OpenRouter) AND changed the
format from the calmer two-host recap to a **two-co-host DEBATE**. Driver: Anthropic stopped offering Fable
(US-gov restriction) + GLM 5.2 is cheaper than Haiku while benchmarking near Opus, and stakeholders wanted a
debate format anyway. Validated by a local A/B (regenerated the 2026-6-22 episode three ways) — the
debate-direction GLM output is what stakeholders approved. Five commits, both CI lanes green
(`3d8b768` is green on GHA), deployed via `just up`. Memory `[[mouthpiece-glm-debate-switch]]`.
- **`87d10dc`** config: `llm.default-model` → `openrouter/z-ai/glm-5.2` + `openrouter_api_key` secret ref
  (mirrored in both schemas + `astra_llm.DEFAULT_MODEL`; config-lib tests). (linguist judges stayed Anthropic
  at the time — **later moved to GLM 5.2 too**, see the 2026-06-26 linguist section below.)
- **`f0a4599`** the debate prompt: rewrote Pass A (`build_improv_system_prompt`) from relaxed-tavern/deadpan-foil
  to a two-position DEBATE (pushback is the rhythm, concede-then-counter); relaxed Pass B's overlap-tag rule.
  One-shot `build_script_system_prompt` left as-is (asset always runs `two_pass=True`). **Forward-only** —
  published episodes keep their scripts (per-episode hosts, `[[mouthpiece-two-host-gotchas]]`).
- **`866aacd`** deploy: `openrouter_api_key` encrypted into `deploy/sops/secrets.enc.yaml` + `OPENROUTER_API_KEY`
  added to the `*dagster-env` compose anchor (litellm reads it from env; `[[deploy-sops-injection]]`).
- **`a92794f`** GLM pricing row in `astra_llm.pricing` (so SigNoz cost isn't 0) + smoke fixup.
- **`3d8b768`** CI fix: the substrate smoke shells to `sops` when the key env-override is wrong, and **CI has
  no `sops`** → it red after the first push even though local pytest passed (I HAVE sops, which masked it).
  **THE gotcha: to reproduce the substrate-smoke CI faithfully, mask `sops` off PATH** (`[[mouthpiece-glm-debate-switch]]`).
- **Deferred (optional):** a real in-cluster end-to-end proof (materialize `session_digest`+`session_script`
  for a test partition) — the local A/B proved the model, this would prove the deployed wiring. Not done (real
  API spend + writes an episode dir).
- **NB the 3 akasha commits `7c5fa7b`/`625acd9`/`2367812`** (heart.iridi.cc → akasha-frontend; removed 20 root
  entity pages + retired cutover-parity gates; de-linked dead crossrefs) landed in a prior session that didn't
  `/save`; recorded here for completeness.

### strider map: balatro hex tint + timeline UX overhaul (2026-06-24 session — COMPLETE + PUSHED + LIVE)

Three strider product changes, each CI-green + `docker compose up -d --build strider` + live-verified on
`strider.iridi.cc`. Memory `[[strider-balatro-timeline-gotchas]]`.

- **Per-faction balatro field** (`82aa7e2`): the hex map shimmers with a faction-tinted balatro swirl —
  **one** filter over `factionHexLayer`, not per-hex. New shader **`tintFromTexture`** mode derives its 3
  palette stops per-pixel from each hex's own colour (saturation ~1.35×, low-contrast `base*0.72`…`base*1.03`,
  `uLightScale` 0.08). **THE gotcha:** a filter round-trips the layer through an offscreen texture, so the
  thin **horizontal** hex-grid strokes (flat-top hexes → horizontal top/bottom edges) drop out at certain
  zooms — fix = `filter.resolution = app.renderer.resolution` + `antialias="on"`. Grid stays readable via
  the deep-shadow stop + the unfiltered `factionBorderLayer` on top. Page background + tithe unchanged.
- **Current-first timeline + bounded play-once** (`de13a02`): the home map no longer replays the whole
  vox-log on every visit (was ~18s, grew unbounded). Now lands on the **current state**; a **play-once**
  catch-up of only the layers added since last visit (tracked in `localStorage` key `strider:vox-log-seen`,
  capped to last `MAX_PLAYBACK_LAYERS=10`, older snap in) auto-plays once; **constant dwell** (acceleration
  removed); **`⟲ REPLAY`** plays the full log on demand, **`SKIP ⏭`** jumps to now, arrows unlocked
  (stepping cancels playback).
- **Scrubber + precomputed fold snapshots** (`e052694`): dot indicator → a draggable **range slider**
  (+ `index/total`). New `domain/lib/timelineFrames.ts` `buildTimelineFrames()` derives every cursor's full
  state once (memoized on the layer set) → MapView does an **O(1) `frames[layerIndex]` lookup** instead of
  re-folding `layers.slice(0,index)` per step (was O(n²) over a replay). Flip animation reads the prev frame.

### mouthpiece → TWO hosts + a calmer script (2026-06-24 session — COMPLETE + PUSHED + LIVE)

Product change to the recap podcast (not migration): consolidated **3 hosts → 2** — **Pip rolled into
Maeve** (she keeps her Juniper voice, absorbs his needling), and the script prompts rewritten for two
voices with **far fewer interruptions**. Code `c2309df`, live snapshot `bad00bb`. Memory
`[[mouthpiece-two-host-gotchas]]`.
- **Back-compat = per-episode hosts.** `HostConfig.c`/`VoiceConfig.c` optional, `SpeakerId` keeps `"C"`;
  `episodes_index` carries each episode's OWN host block (`_read_hosts` + `SessionInput.hosts` +
  `build_index(s.hosts or hosts)`). Verified live: the 8 published episodes stay three-host (Pip intact),
  only 2026-6-22 is two-host. `being.kdl` dropped `pip` + rewrote `maeve` → regenerated
  `being.canonical.json`; faerrin prompt-fidelity tests **deleted** (deliberate divergence).
- **2026-6-22 re-rendered LIVE as two-host** "The Sandwich Yoink Bonus" (real ElevenLabs v3, 26 min):
  placed the approved script + materialized only `session_audio_clips`/`session_episode` (no Stage-3
  re-gen); published snapshot + `just up` (whole stack now on two-host code → future episodes are
  two-host); `linguist-commit.timer` re-enabled. **Two deploy traps recorded in the memory** (dagster
  runs image-baked code → rebuild needed; plain `docker compose up -d <svc>` drops SOPS env → silent
  MOCK-TTS). Backups of the old 3-host artifacts are in `episodes/2026-6-22/*.3host.bak`.

### Session audio into astra (2026-06-24 session — COMPLETE + PUSHED + LIVE)

akasha transcript audio is now served **same-origin by astra** at `akasha.iridi.cc/audio/<date>.mp3`,
replacing the surviving faerrin `static-audio.iridi.cc` — and **the whole faerrin caddyfile import was
removed** from the shared proxy (faerrin fully decommissioned at the edge). Memory
`[[akasha-session-audio-dependency]]`; scope `thoughts/shared/research/2026-06-24-akasha-session-audio-thoughts.md`.
Four CI-green slices (`9aea97d` serving seam → `976db90` build-time normalize (decision A) → `2fced17`
`just akasha-seed` + timer wiring → recipe-fix for the nested-dir gotcha):
- **D2 pattern:** `akashaFrontend.audio-dir` (3 schemas) + `createSsrServer` `staticMounts` + `akasha-audio:ro`
  volume; no edge change for serving (catch-all proxy passes `/audio/*`). **Decision A:** `transcript.ts`
  `loadTranscripts` normalizes `audio` → `/audio/<date>.mp3` (new `audioSrc`), so the 78 committed transcripts
  need no re-gen; linguist `STATIC_AUDIO_BASE`→`AUDIO_BASE="/audio"`.
- **`just akasha-seed`** (HIST faerrin incremental ∪ LIVE scribe overwrite; wired into the `linguist-commit`
  timer akasha phase). **85 sessions / ~14.4 GB** seeded (the "31 GB" was the whole back-catalog incl. `.aac`
  tracks). **Gotcha:** faerrin mislocated 4 recent sessions under nested `wretch/data/saved/saved/<date>/`
  (why faerrin's own static-audio 404'd 2026-6-8) → seed scans `audio.mp3` at any depth; astra serving
  2026-6-8 **fixes a faerrin-broken gap**.
- **Teardown:** verified all 5 faerrin blocks dead/replaced (eerie 10174 + lark 10175 not listening;
  heart/caster stale static) → removed `import …/faerrin/sites.caddyfile` from `/ruby/data/reverse-proxy/Caddyfile`
  (backed up; `caddy-validate` clean → `caddy-reload`). **Live-verified through the public edge:** akasha
  home/transcript 200, `/audio/{2025-9-11,2026-6-8}.mp3` 206 Range, `static-audio.iridi.cc` now dead. SigNoz
  still shows `astra.akasha-frontend` SSR spans. faerrin's 31 GB `wretch/data/saved` kept as backup.

### Gothic / frontend design polish (2026-06-24 session — COMPLETE + PUSHED + DEPLOYED LIVE)

A critical design pass over how **gothic** renders content + the 4 public frontends (live-captured with
Playwright, each fix screenshot-verified). Audit: `thoughts/shared/research/2026-06-24-gothic-frontend-design-audit-thoughts.md`;
memory `[[gothic-frontend-design-polish]]`. 15 findings, 6 CI-green slices (`0d39ea1` audit … `1c7e507`):
- **gothic** (`e3f7581`): style bare `pre`/`code`/`blockquote`; card fill `bg-panel`→`bg-elevated`;
  padded trait pills; emoji fallbacks. **VR goldens regenerated in the pinned container (0 drift).**
- **akasha** (`da5516a`,`c95ee90`): the **`@layer base` reset fix** (THE cross-cutting gotcha — unlayered
  reset was zeroing all gothic content padding), reading-measure cap + larger prose, centered 404,
  mobile content-first, tag-index/graph-empty/search polish, dropped noise dates.
- **strider** (`d3d8b98`): faction dossier headings (member names in faction color) + reset fix + dead CSS.
- **orator** (`d889053`): compact centered sign-in card.
- **vellum-frontend** (`a9131dd`): reset fix (editor preview) + the cross-cutting gotcha documented in
  `apps/strider/README.md`.
- **akasha content** (`1c7e507`): repaired the Tormeré Situation Room transcript (mis-fenced `:::fields`).
- **Redeployed + live-verified** (`just up`, 2026-06-24): akasha/strider/orator/vellum all healthy on
  their public hosts; Tormeré transcript, faction dossier, orator sign-in confirmed live.
- **`:::deity` construct added** (`14ed961` feat + `99573a6` content + `facf263` render): a divine
  stat-block vellum kind, from a survey of heavy `:::fields` usage. `deity` is a `DOCUMENT_KIND` so it
  gets both brace forms; gothic `DeityCard` renders it **run-in (label inline with value), NOT a
  two-column grid** (`facf263` — the grid mis-aligned between sections + gapped badly). 7 Divinity pages
  migrated + Hierophant Harrow Decks fixed (same fence bug as Tormeré); `deity-mechanical` VR
  fixture/golden. Memory `[[gothic-frontend-design-polish]]` has the "how to add a `:::kind`" recipe.
- **WHOLE corpus → VSS braces** (`d1c6b73` engine + `1751aee` content; deities `76b472c`): closed two VSS
  gaps so every construct has a brace form — **block title is optional** (`@handout { … }`) and
  **`@fields`/`@timeline`** lower to `:::fields`/`:::timeline`. Swept all 21 handouts + fields + timeline
  + 7 deities to `@…{ }`; **zero `:::` openers remain** in the content tree. compileVss lowers to identical
  canonical, so renders are byte-identical (VR fixtures stay canonical → goldens untouched). `.gitattributes`
  maps `*.vellum`→Markdown for GitHub (`76b472c`). All redeployed + live-verified (`just up`).
- **Open/optional:** a first-class dialogue/transcript vellum construct (the Tormeré/Harrow pattern) —
  still surfaced, deliberately not invented ad-hoc.

### Post-migration product work — strider (2026-06-24 session, all COMPLETE + PUSHED + DEPLOYED LIVE)

All on `astra-strider` (10360 / `strider.iridi.cc`), each rebuilt via `docker compose up -d --build strider`
and verified (healthy + local 200 + public-edge 200; the faction panel screenshot-verified).

- **Map content edits** (`1ffe9df`…`bf9bc04`): added the **Final Caliber** skein node at the centre of the
  Radiant Arms base + a skein-connect to iconoclasm's `ears-that-hear-the-truth` (new
  `symbols/final-caliber.svg`); a **tithe** event 3 s before Garrick is removed; then **removed** the
  Tri-Faction Concord + the closing strider-tithe and instead formed the **Team TBD** banner
  (iconoclasm/solari-sub-surface/radiant-arms/alkahest-freight, orange `#E8702E`) on 07-19 10:00, with
  Alkahest struck 07-20 01:02 and Solari 07-20 01:47 (bases + skein nodes; dangling edges skipped at render).
- **✅ Tithe timing fix** (`f183dab`): the wave is now a **fixed-duration** animation (`TITHE_TOTAL_MS`,
  budget-independent — fill travels center→edge over `TITHE_FILL_MS`), fade quicker (`TITHE_FADE_MS`
  720→300), and playback **dwells the full wave** after a tithe layer (`TITHE_DWELL_MS`) so it completes
  before the next layer applies (timing lives in `timeline.ts`, shared by HexMap + useTimelinePlayback).
- **✅ Layers → KDL** (`fe69136` infra + `1fdef3f`; memory `[[strider-layers-kdl]]`). `content/layers/*` are
  now flat **KDL** (op = node name, `slug` positional, `hex q r`/`member` children, `faction=#null`). Parse
  seam keeps `parseChange`+folds unchanged → regenerated `layers.ts` byte-identical (the gate);
  `@bgotink/kdl` build-time devDep; `@astra/content-build` gained `listFilesWithExtension`.
- **✅ Factions → vellum** (`8161283`; memory `[[strider-factions-vellum]]`). `content/factions/*` are now
  **`.vellum`**, one document per faction, rendered build-only via gothic `DocumentView` (no-op crossref);
  member-split/cards gone (personnel = in-document headings); `@astra/vellum-lang` build-time devDep. Plain
  prose renders in gothic mechanical-mode (teal headings). NOT byte-identical — verified visually.
- **✅ Dropped the unused layer `body` field** (`1c51229`): it was parsed/stored/round-tripped but never
  rendered — removed from the schema, `Layer` type, parser/serializer, the 2 files, docs, tests.

### Prior post-migration session — strider map (banner + tithe, COMPLETE + PUSHED + DEPLOYED LIVE)

Two **strider** map "layer changes" added on top of the finished migration, each with its own gotchas memory.

- **✅ Banner / alliance layer change** (`4873609`…`13c2032`, memory `4aa6dfa`). Multiple factions ally and
  combine their land under one **banner** — a new first-class entity `{slug,name,color,symbol?,members[]}`
  with two `Change` ops `banner-form` / `banner-dissolve` (mirroring skein-connect/disconnect; dissolve
  reverts for free). Renders by appending each active banner as a **synthetic pseudo-faction** to the
  faction list, so all the existing pixi fill/hover/click/border-dissolve/flip machinery applies untouched
  (member hexes merge into one banner-colored bloc, inner seams gone). Click → an alliance Modal listing
  constituents; `banner-form` animates as a member→banner color flip; editor `banner` kind (form/dissolve).
  Seed: the **Tri-Faction Concord**. Full facts in `[[strider-banner-alliance-gotchas]]`.
- **✅ Tithe transient event** (`62ddf4e`…`47a6538`, memories `acf4862`/`90b27a7`). A one-shot visual event
  (`{op:"tithe"}`) that **changes no persistent state** — every fold ignores it; it only fires a
  `LayerAnimation`. A wave of flipping purple/black-shader hex tiles **fills** the board center→edge, holds
  briefly (`TITHE_HOLD_MS` 160), then **fades** (`TITHE_FADE_MS` 720). The purple is a **live, animated**
  copy of the page balatro shader (uniform-driven palette, `TITHE_PALETTE`), run as a **filter on a
  container of white flipping tiles, gated by input alpha** (continuous + animated — NOT a baked/tiled
  RenderTexture). Editor `event` kind → `tithe` mode. **Load-bearing pixi v8 gotchas** (filters+masks don't
  compose; RenderTexture-in-ticker is blank; the live-filter recipe; headless-RAF capture caveat) in
  `[[strider-tithe-pixi-gotchas]]`.

---

- **✅ 0013 vellum-frontend COMPLETE — all 7 slices BUILT + PUSHED + DEPLOYED-LOCAL + VERIFIED LIVE**
  (`3835dae`(s1)…`f1171fd`(s7)). The **final** 0011–0013 frontend: faerrin's `vellum` (CodeMirror editor +
  Playwright PNG render service) → **two Compose units** — `vellum-frontend` (SSR editor, **10367**) +
  `vellum-render` (Bun+Playwright, **10368**, the **first browser-in-a-container** in astra). Scope+spec
  gates done (`ab04539`/`0dba4ef`/`5bf93b8`); D2/D4/D5 user-locked. Slices: (1) SSR scaffold + the
  `vellum-frontend`/`vellum-render` config namespaces (both schemas); (2) editor port (`ssr:false` route,
  faerrin `src/app/`→`src/domain/editor/` ~verbatim, gothic `--color-*` remap, ⇄ Syntax dropped per D5); (3)
  full-vellum `:::fields`/`:::timeline`/`[[crossref]]` authoring + the R2 SIGIL-sync gate; (4) the render
  service (warm Chromium, egress-block, Semaphore(2), caps, render span); (5) export wiring (same-origin
  `/render` + dev Vite proxy — round-trip verified); (6) deploy (Chromium Dockerfile, sibling-manifest
  ripple, two Compose units, Caddy `vellum.iridi.cc`, **faerrin's `vellum.iridi.cc` decommissioned**); (7)
  the **visual-regression gate** (goldens regenerated against astra-gothic in the pinned `oven/bun:1.3.14`
  container + a `ci.yml` job, 7 fixtures @ 0.000% drift). **Verified live:** both containers healthy,
  containerized Chromium renders a real PNG, SigNoz has spans for both services. **DNS deferred.** Full
  facts in `[[vellum-frontend-0013-gotchas]]`.
- **🔴 LIVE PIPELINE IS RUNNING + VERIFIED END-TO-END (this session, `851c1c6`…`079c045`).** The Dagster
  pipeline (craig→scribe→linguist→akasha→mouthpiece) ran its **first real end-to-end run** on two Craig
  sessions (2026-6-18, 2026-6-22) → both produced complete `episode.mp3` + transcript; the 42 migrated-seed
  transcripts were never reprocessed. Landed: cascade-sensor **backlog adoption** so sensors re-enable
  without sweeping seed (`851c1c6`); four scribe Groq/ffmpeg fixes (`3400c60`/`628bebe`/`97501e7` + the
  s16/480s chunk cap); transient-provider resilience (litellm `num_retries` `56081e6` + mouthpiece
  `RetryPolicy` `19c945c`); **config.kdl now authoritative for the scribe/mouthpiece models** (`93641e9`);
  a **host-side `linguist-commit` systemd timer** that auto-commits+pushes new transcripts AND
  auto-rebuilds+redeploys **akasha-frontend** (`96e0b96`/`079c045`); akasha cutover gates loosened for live
  growth (`ed3c561`). **akasha-frontend is live with the 2 new sessions** (HTTP 200). All in
  `[[pipeline-live-run-gotchas]]`.
  - **✅ mouthpiece-frontend LIVE-PIPELINE INTEGRATION — DONE + LIVE-VERIFIED** (`a472d54`…`7c25d2f`, this
    session, all 5 steps). The frontend now serves the **full 9-episode corpus** (7 migrated historical ∪ 2
    live), and auto-publishes as the pipeline produces more. (1) `discover_sessions` reads the id from
    `script.json` not the date-keyed dir; (2) `astra_mouthpiece.migrate` (`just mouthpiece-migrate-history`)
    seeds faerrin's flat back-catalog into id-keyed dirs, live-precedence + `_dedup_by_id`; (3) `mouthpiece-seed`
    gathers faerrin-historical then astra-live (live overwrites); (4) `astra_mouthpiece.publish` regenerates the
    committed snapshot from the live corpus (9 eps) + the gates went content-agnostic (superset-of-golden floor,
    "exactly one recap"); (5) the `linguist-commit` timer auto-publishes + redeploys mouthpiece-frontend on a new
    episode (deterministic no-op otherwise). Verified live: 10366 healthy, `/episodes.json`=9, SSR home 9 cards
    incl. live "Six Sandwiches", live episode 200 + audio Range 206. Full facts in `[[pipeline-live-run-gotchas]]`.
- **0012 mouthpiece-frontend — COMPLETE: all 6 slices BUILT + PUSHED + DEPLOYED-LOCAL + VERIFIED LIVE**
  (`032e107`(s1)…`9639bd5`(s6)). The podcast read-surface (faerrin `face` → SSR TanStack), the **third
  0011–0013 frontend** on the strider/akasha template, healthy on **10366**. Scope+spec gates done
  (`399d5cd` scope, `b223abd` spec). **D1–D3 locked; D4–D7 settled in the spec; D6 REVISED mid-build
  (user-approved): the transcript is INLINED into the manifest** so the frontend is a pure single-artifact
  consumer (the backend already owns `strip_audio_tags` + `episode_title`) — the frontend ports NO helpers.
  - **s1 (`032e107`)** `episodes_index` **backend** asset (D1) — globs `episodes_path/<id>/` → one sorted
    `episodes-index.json`; backend owns ALL shaping (id-parse + `mega.date_sort_key` sort + per-arc
    `episode_no` + arcTitle from `campaign.name` + ffprobe durationMs + audioVersion + the inlined stripped
    transcript). 2 documented refinements over face (materialized-session numbering; deterministic recap-last
    tiebreak). Wired into app `defs` + `dagster/definitions.py`. Tested over the 14 golden fixtures.
  - **s2 (`669b50d`)** scaffold from the akasha SSR shell — SLIM deps (no pixi/d3/pagefind/vellum/ontology),
    config namespace `mouthpiece-frontend` (10366) in kdl+Zod+Pydantic, **new-member Dockerfile ripple
    handled** (5 siblings).
  - **s3 (`ecbfcee`)** build-content reads the committed `apps/mouthpiece-backend/snapshot/episodes-index.json`
    (akasha-snapshot pattern + freshness-gate test) → `src/generated/{episodes,transcripts}.ts` (split) +
    `public/episodes.json` (D7 deep-links). Routes read static modules directly (not `useLoaderData`). Dotted
    `$id` losslessly (Risk 2 ✓).
  - **s4 (`887b961`)** gothic re-skin (D3) — masthead/hero/EpisodeCard grid + episode page + speaker-colored
    transcript (3 fixed hosts).
  - **s5 (`4ab82aa`)** the `Player` island (Solid→React 1:1) — MediaSession/scrubbing/localStorage; the
    live-ref fix for React's stale-closure trap; SSR-renders (no ClientOnly); icon PNGs.
  - **s6 (`9639bd5`)** deploy (D2) — `createSsrServer` `staticMounts` (Range-serving audio), `audio-dir`
    config, `mouthpiece-audio` volume + `just mouthpiece-seed`, Compose @10366 + Caddy block. **Verified
    live:** healthy; /, /episode, /episodes.json 200; `/audio/<id>.mp3` HTTP 206 Range (real 24 MB mp3);
    SigNoz `astra.mouthpiece-frontend` SSR spans.
  **Spec-sanctioned deferrals:** `mouthpiece.iridi.cc` DNS (outward-facing; Caddy block authored + validated,
  no `caddy-reload`); the live ElevenLabs pipeline→audio path (manual seed substitutes); grid summed-runtime
  (durationMs=0 in the committed snapshot — the Player's `loadedmetadata` is authoritative, D5). See
  `[[mouthpiece-frontend-0012-gotchas]]`.
- **0011 akasha-frontend BUILT (Phase 5) — ALL 9 slices DONE + PUSHED** (1–9 pushed; HEAD now `0184ed9`,
  four post-slice-9 CI-fix/docs commits: `34b92c3` 0011-COMPLETE docs, `b72ffd4`/`03f0fcd` build-content-test
  + SSR-smoke fixes, `0184ed9` CI-only-test gotchas). The wiki read-surface + the critical-path long pole — **COMPLETE**, deployed locally
  + verified live. **URL-parity cutover gate GREEN** (217 produced slugs == faerrin's contentIndex EXACTLY).
  akasha-frontend is the **second 0011–0013 SSR frontend** on the strider template. **Scope + Spec gates COMPLETE:** scope
  `thoughts/shared/research/2026-06-21-akasha-frontend-0011-thoughts.md`, spec `thoughts/astra/specs/0011-akasha-frontend-spec.md`.
  Two seams **pre-proven**: **N1** Pagefind via the NodeJS Indexing API over in-memory HTML (no prerender),
  **N3** the gothic **`resolveCrossref`** seam (`f13ed5f`). **Slice 1 (`c165b01`):** scaffolded the SSR app from
  the strider template (config namespace 10365 mirrored in both schemas, the shell + RUM seam + SSR smoke,
  placeholder content source, templated Dockerfile, uv exclude). **Slice 2 (`bff194e`):** lifted `slug.ts`
  **verbatim** + `folderIndex` + `site.ts` (input swapped to a snapshot reader, edges **consumed** per N6,
  `gitModifiedDates`/Astro `entry` dropped); generated site module from the committed `akasha-snapshot.json`.
  **THE PARITY GATE IS GREEN** — 141 snapshot slugs **byte-equal** faerrin's 141 non-Script `contentIndex` slugs.
  **Slice 3 (`67dfbd3`):** TanStack SSR **catch-all `$`** route (content / folder-listing `Foo`+`Foo/index` /
  alias) + `index` (home) + `tags/`+`tags/$` + faerrin 404; **`body[data-slug]`** from `__root` (Graph +
  TranscriptPlayer contract); **build-emit** RSS (`index.xml`), `sitemap.xml`, `/static/contentIndex.json` into
  `public/`→`dist/client` (gitignored); **alias `<meta http-equiv=refresh>` stubs via React 19 head hoisting**
  (NOT a 301 — N2). `runtimeSite.ts` reconstructs SiteData from the generated PAGES (reuses site.ts `indexDocs`);
  site.ts made **node-free** (pure basename, so client/SSR-safe) + `buildAliases` added; ported server components
  (Breadcrumbs/ArticleTitle/TagList/Backlinks/PageList + PageLayout/ContentArticle/FolderListing/TagListing);
  added `public-origin` config (both schemas). Routes verified live via the built SSR handler.
  **Slice 4 (`c58517c`):** **vellum body rendering + crossref hrefs** — **build-time**
  `renderToStaticMarkup(gothic DocumentView)` (in build-content, never the client bundle) with the **N3
  `resolveCrossref`** seam: a per-page resolver maps a `[[crossref]]` node → snapshot `edge.resolved` → `slug.ts`
  → `resolveRelative` href (dangling → placeholder). Baked to `generated/bodies.ts` (`BODIES: slug→{html,minutes}`,
  141 pages incl. folder-index bodies, ~295 KB) + injected via `dangerouslySetInnerHTML` into the slice-3
  `data-pagefind-body` article; **ContentMeta** (committer date + reading-time) wired. **gothic `theme.css @source
  "./"`** added — Tailwind v4 skips node_modules, so a DocumentView consumer shipped gothic's utility classes
  (`flex/gap-5/text-accent/decoration-dotted/…`) UNSTYLED; declaring gothic's own source fixes it for all
  consumers (strider re-verified, gothic tests green). Added `@astra/vellum-lang` dep (1-line lock delta).
  CI-green both lanes (typecheck, **33 fe tests**, build, biome; uv ruff/ty/pytest 180). Verified live:
  `:::handout`/`:::fields`/`:::timeline`/prose/GFM render with resolved crossref `<a data-crossref>` links + folder
  bodies + ContentMeta. **Resume at slice 5:** islands → React (Darkmode keep dark-only FOUC inline script,
  ReaderMode, **Popover** — attaches to the slice-4 `a[data-crossref]` links — Explorer from the generated tree;
  per-island unmount teardown, N5). Remaining 6–9: Graph(M2) → transcripts+player(D4,N7) → Pagefind(N1) →
  URL-parity gate (snapshot ∪ transcripts) + deploy. **Decisions:** SSR (I), consume snapshot edges (N6), port
  `matchCampaign` (N7), committer date (N4), DiceDashboard deferred (M3).
  **Slice 5 (`30d6e47`):** **islands → React** — ported faerrin's 4 Solid islands (Darkmode/ReaderMode/Popover/
  Explorer) + built the full **Quartz 3-column page shell** (PageLayout: left sidebar = PageTitle + Darkmode +
  ReaderMode + Explorer; center; right sidebar = SidebarImage + Backlinks moved out of center) + functional
  gothic-toned CSS. All SSR-render + hydrate; **N5 teardown** = `useEffect` cleanup. **Darkmode** is dark-only
  (gothic ships dark unconditionally) — kept for the click path + `themechange` (Graph subscribes); FOUC pre-paint
  `<html saved-theme="dark">` is an inline head script in `__root`. **Popover** binds to `a[data-crossref]` +
  `a.internal`, fetches the target's `.popover-hint`, floats via **@floating-ui/dom** (new dep), re-binds on route
  change. **Explorer** = recursive tree from generated `EXPLORER_TREE` with **SSR-safe collapse** (seed open-map
  from currentSlug only in `useState` init → first client render matches SSR; localStorage merged in a
  `useEffect`); prefix-of-current auto-open; pure state logic in `explorerState.ts` (tested). CI-green both lanes
  (biome, typecheck, **40 fe tests**, build; uv 180). Verified live: sidebars + islands render, Explorer
  auto-opens the current branch.
  **Slice 6 (`c9ab69b`):** **pixi/d3 force-graph (client-only)** — ported faerrin's Solid Graph island to
  React; the imperative pixi/d3 `renderGraph` body lifted **VERBATIM**, only the shell changed
  (onMount→useEffect, onCleanup→cleanup return, ref locals→useRef). The pure data-shaping (link/tag extract +
  depth-limited neighbourhood BFS + node/link assembly) split into **`graphData.ts`** + unit-tested (4 tests),
  mirroring slice-5's `explorerState.ts`. Mounted in PageLayout's right sidebar behind **`lazy()` +
  strider's `<ClientOnly>`** (copied to `src/components/ClientOnly/`) — NOT PixiHost/usePixi (faerrin's graph
  creates its OWN `new Application()` per local/global graph, unlike strider's shared-context HexMap). So pixi
  (getComputedStyle/WebGPU at setup) never reaches the SSR eval path (Risk 5): SSR renders only the reserved
  `.graph-slot`, the graph hydrates client-side. Reads `/static/contentIndex.json` + `body[data-slug]`;
  re-renders on `themechange`; N5 teardown destroys every pixi app + listener on unmount. **Color reality:**
  faerrin colors nodes by PAGE-STATE (current/visited/tag) via Quartz CSS vars read with getComputedStyle —
  NOT per-entity identity colors (I5 ontology-being colors are a slice-7 transcript-speaker concern). Kept
  verbatim; the Quartz var names (`--secondary/--tertiary/--gray/--light/--lightgray/--dark/--bodyFont`) are
  **shimmed to the gothic void palette as CONCRETE hex** in globals.css (a `var()` ref returns unresolved
  from getComputedStyle in some browsers → pixi can't parse it). biome override for the verbatim
  any/non-null-assert/`useIterableCallbackReturn` (tween/Set forEach callbacks) idioms. Verified live: home +
  /Anzu render 200, `.graph-slot` + `data-slug` present in SSR HTML, **no `<canvas>`/pixi server-side**. CI
  green whole repo (biome, typecheck, **44 fe tests**, build all workspaces).
  **Slice 7 (`97e0cec`):** **transcripts (D4/N7)** — reconstitute faerrin's 76 Script pages from linguist
  `data/*.json` and merge into the site graph. **`matchCampaign`** (faerrin content heuristic, adapted to the
  `@astra/ontology` Campaign shape — flat `Role[]`, `role.player` is a slug → billing re-keyed to display
  name; first campaign past threshold-15 in being order wins → `Script/<campaign>/<date>`, else Unsorted).
  **`linker.ts`** (proper-noun auto-linker, longest-first regex over wiki titles+aliases → resolved
  `<a class="internal">` on HTML-escaped text — no remark chain). **transcriptBuild** server-emits faerrin's
  remark-transcript OUTPUT shape (`audio[data-transcript]` + `.transcript-line` rows). **TranscriptPlayer**
  React-ported VERBATIM (renders null, attaches to SSR markup, never reactive — Risk 2). **Speaker colors
  (I5)** `--text<Name>` + per-speaker rules generated from ontology-being → `SPEAKER_CSS` in `__root`. **N7
  PARITY GATE GREEN: reproduces faerrin's 76 Script slugs EXACTLY (1:1).** **Architecture (load-bearing):**
  transcript bodies are ~115 MB (76 × ~1 MB) — too big for in-bundle BODIES, so code-split one lazy module
  per session + loaded server-side via a `transcriptBody` **createServerFn** (full-page nav → loader runs on
  the server; client bundle stays 2.3 MB, transcripts server-only). contentIndex now 217 (141 wiki + 76 tx) =
  faerrin's 217. CI green whole repo (biome, typecheck, **56 fe tests**, build).
  **Slice 8 (`92d551d`):** **search via Pagefind (N1)** — `scripts/build-search.ts` runs AFTER `vite build`
  (dist/client + generated modules exist) and uses Pagefind's **NodeJS Indexing API** (`createIndex` →
  `addHTMLFile({url, content})` → `writeFiles`) over **in-memory** HTML docs (no prerendered static HTML —
  Decision I): wiki bodies from `BODIES`, transcript bodies from the code-split lazy chunks; writes the full
  `/pagefind/` bundle into `dist/client/pagefind` (static-served). Build-time only (the `build` script — NOT
  typecheck/test, so the pagefind binary + 115 MB never load under vitest). `searchDoc.ts` = pure unit-tested
  doc-shape helpers. **Search.tsx** = React port of faerrin's Solid island (sidebar trigger + Ctrl/Cmd-K modal,
  lazy `import("/pagefind/pagefind.js")` via `@vite-ignore` variable path, debounced `pf.search`, result cards;
  N5 teardown), mounted in the left sidebar; gothic `.search-*` CSS. Search is empty under `vite dev` until a
  build (faerrin's caveat). Added `pagefind` devDep. CI green whole repo (biome, typecheck, **59 fe tests**,
  build). Verified live: pagefind indexed **217 pages (217 fragments)**, `/pagefind/pagefind.js` +
  `pagefind-entry.json` serve 200, the Search button SSRs.
  **Slice 9 (`99f6657`) — DONE (the last slice):** **URL-parity cutover gate + deploy.** `urlParity.test.ts`
  asserts the produced slug set (141 wiki ∪ 76 transcripts) **byte-matches faerrin's full contentIndex keys
  EXACTLY (217, no missing/extra/overlap)** — the cutover gate. Deploy: Dockerfile gained `COPY
  ontology/ontology-being` (loadBeing — else the transcript build throws); `akasha-frontend` Compose service
  (ARG APP, 10365, healthcheck, restart unless-stopped) mirroring strider; `akasha.iridi.cc` Caddy block
  (read-only, no /editor; fonts + /pagefind/ self-serve). **Deployed locally + verified live:** image builds,
  container **healthy on 10365**, serves `/` + `/Anzu` + a transcript + `/pagefind/pagefind.js` +
  `/static/contentIndex.json` + `/tags` (all 200), **restart-survives**; **telemetry confirmed via SigNoz MCP**
  — `service.name=astra.akasha-frontend` SSR spans (incl. `SSR GET /Script/Fae-and-Forest/2025-9-11`, the
  server-loaded transcript route). **Deferred (spec-sanctioned):** the public edge (`just caddy-reload` +
  `akasha.iridi.cc` DNS record — outward-facing, like strider/orator/weal-overlay). CI green whole repo (biome,
  typecheck, **61 fe tests**, build). **0011 is COMPLETE.** See `[[akasha-frontend-0011-gotchas]]`.
- **Deploy now fully healthy (this session's detours):** fixed `just up` end-to-end — the dagster image was
  stale Phase-0 (now `uv sync`s the pipeline workspace from repo root, `4ac8b94`); weal Dockerfiles needed the
  full manifest set after the new member (`33377b3`); and — load-bearing — **built the repo-wide SOPS
  secret-injection** the deploy never had (`just up` decrypts on the host + injects UPPER_CASED env; config's
  env-override resolves in-container — `20195ec`). **weal-bot is now LIVE** (real token). See
  `[[deploy-sops-injection]]`.
- **Phases 0–3 COMPLETE:** substrate + shared libs + the full pipeline (scribe → linguist →
  akasha-backend → mouthpiece-backend), all wired in `dagster/definitions.py`.
- **0010 orator BUILT (Phase 4) — all 9 slices DONE + PUSHED** (`98b5618`…`2c2fd10`; the slice-9 chain pushes
  with this docs commit). orator-backend is **deployed locally + verified live** (container healthy on
  `10363`, serves the SPA + `/api/v1/*` + fonts, survives restart) against the **migrated** library; the
  remaining manual step is the public edge (`just caddy-reload` + an `orator.iridi.cc` DNS record — outward-
  facing, like strider/weal-overlay). Scope+spec at
  `thoughts/{shared/research/2026-06-20-orator-0010-thoughts.md, astra/specs/0010-orator-spec.md}`; decisions
  **M1–M5** locked. Lifting faerrin `lark` → **orator-backend** (Bun Compose service) + merging `birdfeed` →
  **orator-controller** (Node/Elgato). Done: (1) **scaffold** both apps + M1 ontology-derived allowlist; (2)
  **Postgres library store** — lark's 9-table schema SQLite→PG + the async `LibraryStore`/`PostgresStore`
  (sync `bun:sqlite`→async Bun `SQL`) + `orator-postgres` Compose unit (10364); (3) **bot+voice+REST** —
  `@discordjs/voice` adapter + the single-session playback engine + the `/api/v1/*` router/library/playback
  routes; (4) **auth** — OAuth2-identify→signed cookie OR Bearer key, session-gated key mgmt, `lark_`→`orator_`
  rebrands; (5) **ingest** — yt-dlp+ffmpeg+R128 + SSE jobs + upload; (6) **data migrator** — lark.sqlite→PG
  (preserve ids) + audio copy (M2, runs at deploy); (7) **operator UI** (`866463c`) — lark's React SPA →
  **`@tanstack/react-router` client SPA** in `orator-backend/src/web/` (code-based router, no routeTree.gen),
  gothic-skinned (Tailwind v4 via `@tailwindcss/vite`), Vite-built to static `dist/` served by the existing
  `serveStatic`; client RUM via a new **public `/api/v1/rum-config`** route (no `createServerFn` — Start-only);
  a `gothicFontsPlugin` copies fonts → `dist/fonts/` so the static dist is self-contained; (8) **orator-controller**
  (`d14557f`) — birdfeed lifted (nav/grid/tags/svg/color pure logic + controller/Slot/plugin) with the
  **configurable origin** (M4: PI Origin field + `normalizeOrigin(settings.oratorOrigin)`; key minting stays
  server-side, plugin only consumes a pasted `orator_` key); Bearer client + 2500ms now-playing poll +
  collection→tag nav (5 named tags + "other") preserved; rollup bundles `bin/plugin.js` (not CI-gated);
  (config scrub `8157a42`) **config-single-source** — dropped the migrator/entrypoint env overrides, kdl now
  holds the real deploy values (port 10363, public-origin, new `data-dir`; mirrored in BOTH config schemas);
  (9) **deploy** (`8b937ca`) — orator-backend Dockerfile (Vite-builds the SPA; ffmpeg+yt-dlp on PATH; davey is
  a **prebuilt napi** module, no compile; all app manifests copied so `--frozen-lockfile` reconciles the shared
  lock), Compose `orator-backend`@10363 + `orator-audio` volume@`/data` (zero config env), Caddy
  `orator.iridi.cc` (self-serves fonts, SSE `flush_interval -1`). **Verified live:** image builds; `docker
  compose config` + `caddy validate` pass; the **M2 migrator RAN** (87 tracks/1 coll/5 tags/87 audio, 0
  missing, loudness preserved, `file_path`→`/data/audio`); orator-backend boots healthy, serves SPA+API+fonts,
  survives restart. Found+fixed a real PG bug en route (`2c2fd10` `listJobsByStatus` — Bun `SQL.unsafe` array
  param → `= any($1)` "malformed array literal"; expand to `in (…)`). **Deferred (spec-sanctioned):** the public
  edge (`just caddy-reload` + `orator.iridi.cc` DNS — outward-facing/manual) + live Discord run (SOPS token) +
  the physical Stream Deck hardware test. CI green both toolchains (121 backend + 36 controller tests). See
  `[[orator-0010-gotchas]]`.
- **0009 weal BUILT (Phase 4) — first bun *service*.** Scope+spec at `thoughts/{shared/research/
  2026-06-20-weal-0009-thoughts.md, astra/specs/0009-weal-spec.md}`. Six CI-green slices (`c40a026`…
  `21d1f18`; last `21d1f18` deploy-wiring is the only UNPUSHED commit): (1) **roller** hand-ported
  faithfully + the **K1 parity harness** (parse/eval-given-faces/plot/property + a serde-codec
  round-trip on the 10 real `mouth.db` `funcs` payloads — the gate); (2) **hosts** — GSR/Rex/Els/
  Whiskers flavor banks lifted into `ontology-being` `weal-host` `lines{}` (py+ts model+reader,
  canonical-JSON parity holds); GSR-only but host-swappable (K8); (3) **Postgres** store + `save_die`
  guards + dedicated `weal-postgres` Compose unit (K9); (4) **discord.js gateway** — full message
  pipeline tested dry via injected deps (acceptance D), I/O shell (gateway/speak/index) typechecked;
  (5) **weal-overlay** — eerie lifted (Bun.serve SPA+SSE, K7), v1-only schema, gothic v4 re-consume,
  client RUM; (6) **deploy** — both Dockerfiles + Compose units + overlay Caddy block (`flush_interval
  -1`). **weal-bot is LIVE** (real SOPS token). **SQLite→PG data migration DONE** (2026-06-23): 8,932 dice +
  10 funcs migrated from `mouth.db` into weal-postgres, ids/player_ids preserved, sequence reset (the 36 live
  rows were truncated first, user-approved). Only remaining nicety: webhook rotation. See
  `[[weal-0009-gotchas]]`.
- **strider (0014) COMPLETE + PUSHED + DEPLOYED LIVE.** The first `apps/*` TS frontend and the canonical
  **SSR-Compose-behind-Caddy template** for 0011–0013. All on `origin/main`. The 7 build slices (`fedd4b8`
  …`a91a72b`): build-content+data-model, pixi hexmap, MapView+routes, editor, SSR Compose deploy
  (`server.ts`/Dockerfile), server `observe`+client RUM. Then this session hardened + shipped it:
  - **Styling fix** (`abbf017`) — the scaffold never wired `@tailwindcss/vite`, so gothic's `@theme`/`@apply`
    shipped raw (black text, no panel bg); add the plugin + the missing `public/` assets.
  - **RUM lib** (`171f28d`) — browser RUM extracted to **`@astra/observe/web`** (`initRum`); frontends import
    it, the `createServerFn` config seam stays per-app.
  - **Host edge** (`e6b3878`, `9374fb4`, `a9a0bf4`, `6a0fdaf`, `15aab1a`) — root **`sites.caddyfile`** is the
    real prod edge (the compose Caddy was dropped): `strider.iridi.cc` (SSR), `otel.iridi.cc` (browser-RUM
    OTLP ingest, CORS for `*.iridi.cc`), `signoz.iridi.cc` (UI). Fonts served from gothic via Caddy (no
    vendored copies; dev middleware for parity). `/editor` + `signoz` gated **local-only**. CF token from
    SOPS via `just caddy-reload`.
  - **Editor → server fn** (`9b87a1b`) — the editor write is now a **`createServerFn`** in the one SSR
    process (the sidecar/`editor-server` is gone). This stack (react-start 1.168) has **no file server
    routes** — `createServerFn` is the server primitive (see `[[tanstack-start-skill]]`).
- **Tooling:** `just up` (rebuild+recreate the stack), `just down`, `just caddy-reload`/`caddy-validate`.
  Apply deploy/edge changes with these — `[[deploy-apply-with-just]]`.
- **Live + verified:** `astra-strider` healthy; the edge serves `/`, `/editor` (local), `/fonts/*`,
  `signoz.iridi.cc` (all 200 via the loopback edge test). **Open:** `otel.iridi.cc` needs a **DNS record**
  before browser RUM spans actually land in SigNoz (cert + reachability); the write server fn isn't itself
  IP-gated (only the `/editor` UI is — **accepted won't-fix**, `[[strider-editor-auth-accepted]]`).
- **strider HARDENING (spec 0016) — COMPLETE: all 7 slices BUILT + PUSHED + LIVE-VERIFIED** (`68fcff0`…`0aaae5f`).
  Readies strider as the *copy* template per the 2026-06-21 review
  (`thoughts/shared/research/2026-06-21-strider-template-review-thoughts.md`); spec
  `thoughts/astra/specs/0016-strider-hardening-spec.md`. **NB renumber:** drafted/committed as "0015" but
  `0015` is the reserved **cutover** plan, so the spec is **0016** (early commit messages still say 0015;
  6b onward use 0016). Done + pushed: (1) idiom/correctness — frontend `verbatimModuleSyntax:false`, router
  error/not-found boundaries, `/editor` `ssr:false`, dead-code + the misapplied `noFocusedTests` ignore;
  (2) tests — `build-content` parsers, `writeLayer` guards, an SSR render smoke (`scripts/ssrSmoke.ts` via
  `src/ssrSmoke.test.ts`, builds-if-needed) + `ssr.fetch`-exists insurance; (3a) one source of hex geometry
  (`hexCorners`/`HEX_SIZE`/`HEX_NEIGHBORS` in hexUtils; pixiScene derives); (3b) shared region paint + skein
  helpers (`mapPaint.ts`, `connKey`/`connectionEndpoints` in skeinGeometry, `strokePolyline` in pixiScene);
  (4) perf — incremental hex updates (reuse unchanged / recreate changed → flip contract intact) + reused
  hover GlowFilter (pixi-filters subpath = 0 B; rollup already tree-shakes); (5) observability — `writeLayerFn`
  traced (span+counter+log), `@astra/observe` preload flushes on SIGTERM/SIGINT, dropped dead CONTENT_HASH,
  rewrote stale layer docs to SSR/server-fn; (6a) extracted **`@astra/content-build`** (generic markdown→
  modules pipeline + `defineContentSource`/`buildContent`), strider consumes it. All CI-green locally;
  **renderer changes (3–4) visually verified in dev.** Nitro+bun migration deferred (non-nightly).
  **6b DONE + PUSHED + LIVE-VERIFIED** (`a03f06c`, `0ac2cec`): extracted **`libs/ts/site-kit`**
  (`createSsrServer`, `startRum` on `./web`, `contentWatchPlugin`/`gothicFontsPlugin`/`generateRouteTree`,
  `loadSiteConfig`); `strider { service-name; port }` in **config.kdl** mirrored in both schemas; Dockerfile
  `ARG APP`; **fonts now self-served from the container** (build copies → `dist/client/fonts`; dropped Caddy
  `gothic_fonts`). **Load-bearing:** importing a workspace TS pkg from `vite.config` needs vite
  `--configLoader runner` (added to dev/build); createServerFn stays in app source; the build stage must COPY
  `ontology/ontology-config`. Live re-verified via the edge (`:2651`, not 443). **Found a pre-existing telemetry
  gap (not a 6b regression):** containers export to `otlp-endpoint=localhost:10353` which is unreachable
  in-container (collector = `signoz-otel-collector:4318`); server-side SSR spans for strider/orator/weal never
  land — its own cross-cutting fix. See `[[strider-0016-gotchas]]`.
  **7 DONE** (`0aaae5f`): split `apps/strider/src` into a thin shell vs **`src/domain/`** (47 renames; the
  faction/hex/skein/editor domain relocated, shell = generic components/hooks + observe + router/routes) +
  `apps/strider/README.md` port recipe. biome.json lint-override globs repointed to `src/domain/`.
  **Telemetry endpoint FIXED** (`ee8f831`): OTLP → `signoz-otel-collector:4318` (in-cluster); `astra.strider`
  SSR spans now land in SigNoz (also fixes orator/weal/Dagster on redeploy). Live re-verified after both.
  **0016 is COMPLETE — no open items.** See `[[strider-0016-gotchas]]`.

### 🎉 MIGRATION COMPLETE — Phases 0–6 all done (2026-06-23)

**The faerrin → astra migration program (`0000`–`0015`) is finished. astra is the campaign's live stack.**
Phase-6 cutover (`0015`) is **COMPLETE**: every public host serves astra
(strider/akasha/mouthpiece/orator/vellum/weal-overlay/dagster `.iridi.cc` all 200, `otel` OTLP ingest
reachable); the Dagster pipeline runs live + verified e2e; the bots/services are live Compose units with
SigNoz traces; the data migrations are done (weal roll history 8,932+10, orator library, the akasha/mouthpiece
content corpora — ids/player_ids intact); faerrin's `strider.iridi.cc` + `vellum.iridi.cc` blocks
decommissioned in-repo.

**No remaining migration work.** Standing leftovers are by-design or optional, NOT blockers:
- strider editor write-endpoint auth — **accepted won't-fix** (`[[strider-editor-auth-accepted]]`).
- Nitro+bun preset migration — deferred until TanStack Start is non-nightly.
- weal webhook rotation — acknowledged nice-to-have (the user opted to skip it).

Future work is now ordinary product/ops on the live stack, not the migration. (Historical per-subsystem build
notes are retained below for reference.)
2. **0013 vellum-frontend — COMPLETE** (all 7 slices built + pushed + deployed-local + verified live; the
   editor on 10367 + the render service on 10368; containerized Chromium renders PNGs; SigNoz spans for both;
   the VR gate is green in the pinned container). **NOW FULLY LIVE on `https://vellum.iridi.cc`** (DNS set +
   `just caddy-reload` applied 2026-06-23 — `/`+`/editor` 200, `/health` ready, `POST /render` returns a real
   PNG through the public TLS edge). **No open items** — the first 0011–0013 frontend taken all the way to the
   public edge. See `[[vellum-frontend-0013-gotchas]]`.
3. **0012 mouthpiece-frontend — COMPLETE** (all 6 slices built + pushed + deployed-local + verified live on
   10366; audio Range-serves, SigNoz SSR spans). Only open item = the manual `mouthpiece.iridi.cc` DNS edge
   (outward-facing; Caddy block authored + validated). See `[[mouthpiece-frontend-0012-gotchas]]`.
3. **0011 akasha-frontend — COMPLETE (all 9 slices built + PUSHED).** Deployed locally + verified live (healthy
   on 10365, telemetry in SigNoz), URL-parity cutover gate GREEN. **Only open item = the manual public edge**
   (`just caddy-reload` + an `akasha.iridi.cc` DNS record — outward-facing, like strider/orator/weal-overlay;
   the Caddy block is authored + in `sites.caddyfile`). See `[[akasha-frontend-0011-gotchas]]`.
3. **Frontends 0012–0013** (mouthpiece-fe, vellum-fe) — the strider SSR template copy; 0011 is a second worked
   example alongside strider (esp. build-time content + the createServerFn server-only-data pattern + Pagefind).
   **READ FIRST:** `apps/strider/README.md` + `apps/akasha-frontend` (Dockerfile/compose/Caddy + build-content),
   the migration guide, `[[strider-0016-gotchas]]`, `[[akasha-frontend-0011-gotchas]]`.
3. **Phase 4 services DONE** — 0009 weal + 0010 orator both **BUILT** (deployed-local; public edge + live
   Discord run deferred on SOPS/DNS). **strider 0016 COMPLETE** — the copy-ready template.
4. **Phase 6 cutover** (plan `0015-cutover.md`) big-bang, last — needs frontends 0012–0013 first.

**Frontend gotchas (template — full list in `[[astra-migration-research]]`):** SSR (no `prerender` block);
commit `src/routeTree.gen.ts` (biome-ignored); `vite.config` is ESM and **cannot import `@astra/config`**;
**wire `@tailwindcss/vite`** + ship `public/` (favicon, symbols) or gothic styling is dead; gothic v4
`--color-*` token rename on lifted CSS + Caddy `gothic_fonts` serves the webfonts; pixi behind
`lazy()`+`<ClientOnly>`; server-side endpoints = **`createServerFn`** (no middleware — `[[tanstack-start-skill]]`);
client RUM = `@astra/observe/web`; new `apps/*` TS dir → add to `pyproject.toml` `[tool.uv.workspace]` `exclude`.

---

*Start by reading the orient docs, then pick up at the "Next" item above.*
