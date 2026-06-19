# Astra Sub-plan 0015 — Phase 6: Cutover (big-bang)

**Status:** Plan (pre-implementation). **Phase:** 6 (cutover). **Parent:** [`0000-astra-migration-roadmap.md`](./0000-astra-migration-roadmap.md).
**Date:** 2026-06-19. **Decisions in force:** A = **big-bang cutover** (no incremental prod parallel-run); URL parity is the hard gate; rotate the leaked webhook; audio stays external (F4).
**Depends-on:** **ALL** of Phases 0–5 green. **The final step.**

> Goal: one **rehearsed** switch from faerrin to astra. Big-bang (Decision A) means there is **no
> production safety net** — so the plan front-loads a full **staging parallel-run** against migrated
> data, gates on hard criteria, flips Caddy in one window (Q1 = **same-host** coexist), and rotates
> secrets. The rollback window is **~1 minute** (Q2 = flip-and-commit), so **the pre-flip staging
> validation IS the safety net** — it must be exhaustive; faerrin is kept **cold-archived** afterward as a
> manual backstop.

---

## 1. Preconditions (the green bar — nothing flips until ALL hold)

- [ ] CI green across all apps/libs (py: ruff+ty+pytest; ts: tsc+biome+test; build).
- [ ] **akasha URL-slug diff vs faerrin = clean** (the single hard invariant — bookmarks/inbound links).
- [ ] Full wiki corpus → **vellum, zero parse errors** (TS validator, 0007).
- [ ] **Roller parity harness green** (0009) — Rust retired only after.
- [ ] **mouthpiece tone A/B within tolerance** (0008 lint-metrics + human spot-check).
- [ ] Pipeline **e2e dry-run** (one session craig→scribe→linguist→akasha→mouthpiece) in Dagster.
- [ ] Every site builds to `dist/` + renders migrated data; every Compose service up + healthy.
- [ ] No plaintext secrets in git; SOPS decrypts at deploy.

## 2. Host / domain mapping (preserve the public domains — URL parity)

| faerrin host | faerrin | → astra | astra serve |
|---|---|---|---|
| `heart.iridi.cc` | aether/public | **akasha-frontend** | `dist/` via Caddy (URLs MUST match) |
| `caster.iridi.cc` | face/dist | **mouthpiece-frontend** | `dist/` |
| `strider.iridi.cc` | strider/dist/client | **strider** | `dist/` |
| `vellum.iridi.cc` | vellum | **vellum-frontend** + render service | `dist/` + Compose (render) |
| `lark.iridi.cc` | lark | **orator-backend** (web) | Compose service (reverse-proxied) |
| (eerie overlay host) | eerie | **weal-overlay** | Compose service |
| (internal `:10203`) | mouth axum | **weal-bot** speak API | Compose (internal only) |
| `static-audio.iridi.cc` | external | **unchanged** (F4) | external static host |
| `chart.iridi.cc` | mouth chart | **RETIRED** (K4) | — |
| `embed.iridi.cc` | (shed in faerrin) | gone | — |
| — | — | **Dagster UI / SigNoz UI** | internal/admin (not public) |

Keep the **same public subdomains** repointed to astra (preserves URLs); `heart.iridi.cc` is the
URL-parity-critical one.

## 3. Final data migration (dependency order — during the freeze)

1. **ontology** (being + config) → KDL + SOPS (0002).
2. **historical scribe** → import the 76 sessions' canonical outputs at the **linguist** level (F3) —
   **not** re-transcribed.
3. **transcripts** (linguist canonical) — line format preserved.
4. **wiki → vellum corpus** (akasha) — run the converter (0007), validate **zero parse errors**, resolve
   crossrefs, **bake faerrin git dates into frontmatter**.
5. **weal roll-history → Postgres** — **exclude the 47M-row junk** (`player_id<>6`, `base≤100`,
   `pool≤30`), **preserve `player_id`**; verify counts.
6. **orator library → Postgres** (schema + data; audio to the Compose volume).
7. **mouthpiece episodes** — migrate caster `out/` artifacts (Q3: migrate vs regenerate).

## 4. The cutover runbook (one window)

1. **Announce** the freeze window.
2. **Freeze** faerrin content/data writes (wiki, rolls, library, sessions).
3. **Final data migration** (§3, dependency order).
4. **Staging parallel-run:** bring astra fully up against migrated data; run **every §1 gate**; diff
   akasha URLs vs faerrin; run the Dagster pipeline once e2e; smoke every site + bot + overlay.
5. **Flip:** repoint Caddy hosts (§2) → astra (`dist/` + service ports); update DNS (if a new host — Q1);
   bring up all Compose services (weal-bot, orator-backend, weal-overlay, vellum render, Dagster, SigNoz,
   Caddy); **enable the Dagster schedule**.
6. **Rotate secrets** as part of the flip (NOT before): the leaked `DICE_FEED_URL` webhook + all carried
   tokens (Discord ×2, ElevenLabs, Groq, Anthropic, session, Cloudflare DNS).
7. **Live smoke:** every public host loads; weal-bot rolls + drives the overlay; orator plays audio; a
   real Craig session flows through the pipeline; SigNoz shows traces from every app.
8. **Smoke ~1 min; if clean, commit** + take faerrin out of serving (§6). Rollback only if the **flip
   itself** fails. Keep faerrin's data/box **archived (cold)** as a manual backstop.

## 5. Per-subsystem cutover checklist

- **akasha-frontend** — URL diff clean; vellum corpus renders; transcripts + search + graph work.
- **scribe/linguist/akasha/mouthpiece** — Dagster pipeline e2e on a real session; historical present (not re-derived).
- **weal-bot** — parity harness green; rolls → PG (junk excluded, `player_id` intact); overlay v1.
- **orator** — voice plays; library on PG; controller drives it; **hardware test still open** (carry as a known gap).
- **vellum-frontend** — editor + render service (Playwright) up; PNG export fidelity.
- **mouthpiece-frontend / strider** — build + render migrated data.
- **Observability** — every app emits to SigNoz (the single pane).

## 6. Rollback (Q2 = ~1-minute active window)

- **The active window is ~1 minute** (Q2): flip → smoke the live hosts → if the **flip itself** failed,
  revert Caddy → faerrin (untouched; writes were frozen, not deleted) via the documented commands.
  Otherwise **commit**.
- **All real safety is PRE-flip** — the §1 gates + the staging parallel-run + a **rehearsed** revert. With
  a 1-min window there is **no recourse for slow-surfacing issues** post-commit, so the §1 bar must be
  exhaustive.
- **Backstop:** even after committing, keep faerrin's data + box **archived/cold** (not serving) for a
  while — a manual recovery path if something surfaces later, though no longer the live fallback.
- ⚠ **One-way data:** anything created on astra after the flip won't exist in faerrin — with a 1-min
  window this delta is tiny live, but a *cold* recovery later would still lose post-flip data.

## 7. Open decisions

| # | Decision | Options | Recommendation |
|---|---|---|---|
| Q1 | Deployment topology | same host vs new host | **DECIDED: same host** — astra coexists with faerrin; Caddy repoints at the flip (no DNS change). ⚠ size the host for **both** Compose stacks during the staging parallel-run (risk §9.6). |
| Q2 | Rollback window | length of the active rollback window | **DECIDED: ~1 minute** — flip-and-commit: ~1-min smoke, then commit; rollback only if the **flip itself** fails. **All safety is pre-flip** (§1 + staging); faerrin kept **cold-archived** as a manual backstop (§6). |
| Q3 | Episodes migration | migrate caster `out/` artifacts vs regenerate in astra | **Migrate** the artifacts (don't re-spend LLM/TTS); regenerate only if the format changed. |
| Q4 | Domains | same subdomains repointed (URL parity) vs new | **Same** — `heart.iridi.cc` etc. repointed to astra; non-negotiable for URL parity. |

## 8. Exit criteria

- [ ] Every public host (`heart`/`caster`/`strider`/`vellum`/`lark` + overlay) serves astra correctly
      behind Caddy; `heart.iridi.cc` URLs match faerrin.
- [ ] The Dagster pipeline runs on schedule; bots live as Compose services; SigNoz shows all traces.
- [ ] Roll history + library migrated (junk excluded, `player_id` intact); historical sessions present.
- [ ] All secrets rotated (esp. the leaked webhook); no plaintext in git.
- [ ] Flip rehearsed + documented; ~1-min smoke clean → committed; faerrin taken out of serving but
      **cold-archived** as a backstop; `chart.iridi.cc` retired; `embed.iridi.cc` already gone.

## 9. Risks

1. **No production safety net** (big-bang) — the staging parallel-run + every §1 gate + a **rehearsed**
   rollback are mandatory, not optional. Do not flip on a partial green.
2. **URL parity** — `heart.iridi.cc` slug divergence breaks inbound links; the slug-diff gate is hard.
3. **Minimal rollback window (Q2 = ~1 min)** — **no post-commit safety net for slow-surfacing issues**;
   this loads ALL safety onto the pre-flip §1 gates + staging parallel-run, which must be exhaustive.
   Mitigation: keep faerrin **cold-archived** as a manual backstop (§6); don't flip on a partial green.
4. **Secret rotation timing** — rotate at the flip, not before (or faerrin breaks pre-cutover); the leaked
   webhook especially.
5. **Slowest lane sets the date** — big-bang can't start until *every* subsystem is green; the akasha
   (full-vellum) lane is the long pole — protect it.
6. **Resource contention** (Q1=same host) — running faerrin + astra's full Compose stack together during
   parallel-run may starve the host; size it or use a new host.

## 10. Done

When §8 holds and the rollback window closes clean, **astra is the campaign's live stack** and faerrin is
archived. This is the end of the migration program (`0000`–`0015`).
