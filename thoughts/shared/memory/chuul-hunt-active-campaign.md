---
name: chuul-hunt-active-campaign
description: Chuul Hunt 5e one-shot is the ACTIVE (main) campaign — flip-back checklist, the weal nullary-fn engine bug, and the 2026-08-10 NIC CRC incident
metadata:
  type: project
---

**2026-08-10: `chuul-hunt` holds `main #true` in being.kdl (`4dbb6fd` + names fix
`Ni-So`/`Zulgrath`), DEPLOYED LIVE** — weal-bot bills Doomeater (Josh, monk) / Ni-So
(Jorge, barbarian) / Zulgrath (Mike, wizard), Tanner GM, edition `dnd_5e`, world
`chuul-hunt` (non-faerrin → heartwood ignores it). First-ever `main` flip; the flag is
stack-wide, not bot-only.

**⚠ FLIP BACK after the one-shot** (Through a Song, Darkly → `main #true`):
1. Edit being.kdl, regen canonical (`canonical_json(load())` → `CANONICAL_JSON_PATH`).
2. Re-pin the four flip-adjusted tests: `libs/py/ontology/tests/test_ontology.py`
   (exactly-one-main is flip-proof, keep), `apps/linguist/tests/test_chronicle.py`
   (`is_main` slug list + count 8), `apps/mouthpiece-backend/tests/test_episodes_index.py`
   (`is_main` False→True), linguist parity test pins is_main=True already (keep).
3. `just up`; **republish mouthpiece** if any episode published while flipped —
   `is_main` recomputes per index build, so TSD episodes relabel "One-Shot" until then.
   Chronicle's "Main campaign" badge moves the same way on timeline regen.
4. A session recorded while flipped gets a `0NN.chuul-hunt` transcript stem and
   "main campaign" prompt context (cosmetic; committed files never rename).

**⭐ weal-engine OPEN BUG (found live):** calling a **nullary** function whose body is
**pool-shaped** dies at eval — `let f() = 2d20kh1; f()` → `internal error: sum's
argument must be a pool` (stage:eval), while `let f(x) = 2d20kh1; f(1)` and
`let f() = d6e1; f()` work. The D32-4 auto-sum coercion misplaces on unit-arg
application. Blocks `save(:adv, || 2d20kh1)`; the shipped saves are the bare-value
form `save(:adv, 2d20kh1)` (stored canonical: `kh(pool(2, d20), 1)`) — each mention
re-rolls fresh, `adv + adv` = two independent rolls.

**2026-08-10 NIC incident (resolved same night):** enp4s0 gigabit link corrupting
frames — 20% loss to the LAN gateway, rx_crc_errors +75/s (1.5M total) — symptom
pattern = small requests fine, bulk transfers stall (docker pulls frozen mid-layer,
apt crawling, portal-headless `page.goto` timeouts while node `fetch` of the same
origin succeeded in 37 ms). Diagnosis path: cgroup→container map (the 1125%-CPU
"playwright" was **portal-headless**, not vellum-render — both bundle `/ms-playwright`),
then per-hop ping loss. **Stopgap:** `ethtool -s enp4s0 advertise 0x008` (100FD via
autoneg — never `autoneg off`, duplex-mismatch trap) ran clean; cable swapped → back
to 1000FD, 0 loss, ~510 Mbps. Gotchas: sudo needs a password+TTY here (the `!` runner
can't prompt; classifier also blocks `--privileged` docker as a root workaround);
`iridi.cc` AAAA record still points at a STALE rotated ISP v6 prefix (unfixed);
portal-headless self-healed the moment loss stopped (supervisor backoff worked as
designed).
