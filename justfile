# astra task runner. Two concerns:
#   - the Docker substrate (deploy/): Dagster + SigNoz + the strider services.
#   - the host edge: the SHARED reverse proxy at /ruby/data/reverse-proxy (a custom
#     `caddy` binary w/ the cloudflare-dns plugin — the stock /usr/bin/caddy lacks
#     it) whose Caddyfile `import`s this repo's sites.caddyfile. The caddy recipes
#     reload/validate it, sourcing the ACME-DNS token from SOPS (never committed).

reverse_proxy_dir := "/ruby/data/reverse-proxy"
sops_age_key := "deploy/sops/age.key"
sops_file := "deploy/sops/secrets.enc.yaml"

# Single bind-mount root for runtime state that used to live in named Docker volumes
# (audio + Postgres). Gitignored (/artifacts/). The containers run as 1000:1000, so the
# source dirs must exist + be host-owned BEFORE `up` (Docker auto-creates a missing bind
# source as root). `artifacts-init` (run from `up`) creates the tree; override with ARTIFACTS.
artifacts := env_var_or_default("ARTIFACTS", "/ruby/data/experiments/astra/artifacts")

# Source of the HISTORICAL podcast episodes for the mouthpiece-frontend audio seed
# (faerrin's caster out/ — the pre-astra back-catalog). Override with MOUTHPIECE_AUDIO_SRC.
mouthpiece_audio_src := env_var_or_default("MOUTHPIECE_AUDIO_SRC", "/ruby/data/experiments/faerrin/pkg/caster/out")

# astra's own episodes corpus (the live Dagster pipeline's renders + migrated catalog).
# Mirrors config.kdl mouthpiece.episodes-path; override with MOUTHPIECE_EPISODES.
mouthpiece_episodes := env_var_or_default("MOUTHPIECE_EPISODES", "/ruby/data/experiments/astra/apps/mouthpiece-backend/episodes")

# Sources for the akasha-frontend session-audio seed (the combined Craig recordings the
# transcript pages play, served same-origin at /audio/<date>.mp3). HIST = faerrin's
# frozen back-catalog (~31 GB, the old static-audio.iridi.cc store); LIVE = astra
# scribe's saved dir (mirrors config.kdl scribe ingest-saved-dir, the scribe→linguist
# handoff). Both are `<date>/audio.mp3`; live wins for any date in both. Override with
# AKASHA_AUDIO_HIST / AKASHA_AUDIO_LIVE.
akasha_audio_hist := env_var_or_default("AKASHA_AUDIO_HIST", "/ruby/data/experiments/faerrin/pkg/wretch/data/saved")
akasha_audio_live := env_var_or_default("AKASHA_AUDIO_LIVE", "/ruby/data/experiments/astra/apps/scribe/data/saved")

# uv binary (absolute — the linguist-commit systemd user timer has a minimal PATH without
# uv, same reason the service hardcodes just's path). Override with UV_BIN on another host.
uv_bin := env_var_or_default("UV_BIN", "/home/jbassin/.local/bin/uv")

# --- Docker substrate (deploy/) ---

# Bring the stack up (Dagster + SigNoz + the services). --build so local code changes
# take effect (cached layers keep it fast when nothing changed). Secrets are decrypted
# from SOPS on the host and injected as env (roadmap Decision E): each service's compose
# `environment:` passes the UPPER_CASED keys it needs, and @astra/config's env-override
# path (`process.env[KEY.toUpperCase()]` wins) resolves them in-container — so no
# sops/age-key/secrets file is ever baked into an image. Run on a host with the age key.
up:
    #!/usr/bin/env bash
    set -euo pipefail
    export SOPS_AGE_KEY_FILE="{{sops_age_key}}"
    # Decrypt once on the host; export each secret as KEY upper-cased (the env-override
    # name config checks first). The host shell holds the secrets only for this process;
    # compose scopes each container to the keys its `environment:` block references.
    secrets="$(sops -d --output-type dotenv "{{sops_file}}")"
    while IFS='=' read -r k v; do
      [ -n "$k" ] || continue
      export "${k^^}=$v"
    done <<< "$secrets"
    just artifacts-init
    cd deploy && docker compose up -d --build

# Create the gitignored bind-mount source tree as the host user (uid 1000) BEFORE `up`.
# Docker would otherwise create a missing bind source as root — re-introducing the exact
# root-owned-writes problem this whole setup fixes. The audio dirs are host-owned (the
# frontends read them ro / orator writes them as 1000); the Postgres PGDATA subdirs are
# left to the one-time migration / the postgres entrypoint to own as uid 70 (0700), so we
# only create the `postgres/` parent here, not the per-DB dirs.
artifacts-init:
    #!/usr/bin/env bash
    set -euo pipefail
    mkdir -p "{{artifacts}}"/audio/{akasha,mouthpiece,orator} "{{artifacts}}"/postgres "{{artifacts}}"/portal-oauth

# Stop the stack; keep volumes (ClickHouse / Postgres / SigNoz data persist).
down:
    cd deploy && docker compose down

# Stop AND drop volumes — a fresh SigNoz needs re-onboarding on the next `up`.
down-volumes:
    cd deploy && docker compose down -v

# Bridge new Craig recordings from the Drive fuse mount → scribe's LOCAL incoming dir.
# Docker can't bind-mount the google-drive-ocamlfuse mount (not in the daemon's
# namespace), so the host copies new zips down; the craig_drop_sensor (watching the
# local dir) then runs the pipeline. Idempotent: skips zips already synced, copies via
# a `.partial` + atomic rename so the sensor never sees a half-downloaded file. Run on
# a 5-min systemd user timer (`just craig-timer-install`).
craig_drop_dir := env_var_or_default("CRAIG_DROP_DIR", "/ruby/data/home/drive/Craig")
craig-sync:
    #!/usr/bin/env bash
    set -euo pipefail
    src="{{craig_drop_dir}}"
    dest="/ruby/data/experiments/astra/apps/scribe/incoming"
    probe_timeout="${CRAIG_SYNC_PROBE_TIMEOUT:-20}"   # listing the mount is near-instant
    copy_timeout="${CRAIG_SYNC_COPY_TIMEOUT:-900}"    # a real ~1 GB recording: minutes over Drive

    # Watchdog: bound EVERY access to the google-drive-ocamlfuse mount WITHOUT ever
    # `wait`-ing on it. A process blocked on a wedged FUSE mount sits in uninterruptible
    # D state, so `timeout`/SIGTERM/SIGKILL can't reap it and would hang us too (proven:
    # a hung mount once stalled this oneshot in `activating` for hours, so the timer never
    # re-armed and the whole pipeline silently stalled at the front door). Instead we run
    # the access in the background and poll with `kill -0` (which never touches the mount);
    # on timeout we abandon the child (it clears harmlessly once the mount recovers) and
    # return non-zero, so the oneshot FAILS — a `failed` unit is visible/alertable and lets
    # craig-sync.timer compute its next trigger, whereas a hung `activating` unit can't.
    run_bounded() {
      local limit="$1"; shift
      "$@" & local pid=$! waited=0
      while kill -0 "$pid" 2>/dev/null; do
        if [ "$waited" -ge "$limit" ]; then
          kill -KILL "$pid" 2>/dev/null || true   # best-effort; D-state ignores it, fine
          return 124
        fi
        sleep 1; waited=$((waited + 1))
      done
      wait "$pid"   # child already exited on its own — surface its real status
    }

    mkdir -p "$dest"   # local disk — safe, never the FUSE mount

    # Enumerate the mount through the watchdog (the bare glob readdir is itself a mount
    # access that can wedge), capturing the listing to a local temp file.
    listing="$(mktemp)"
    trap 'rm -f "$listing"' EXIT
    if ! run_bounded "$probe_timeout" \
        bash -c 'shopt -s nullglob; for f in "$1"/*.zip; do printf "%s\n" "$f"; done' _ "$src" \
        >"$listing"; then
      echo "craig-sync: ERROR — Drive mount '$src' unresponsive (>${probe_timeout}s); failing so the unit is visible/alertable." >&2
      exit 1
    fi

    synced=0
    while IFS= read -r f; do
      [ -n "$f" ] || continue
      base="$(basename "$f")"
      final="$dest/$base"
      [ -e "$final" ] && continue            # already synced — skip (no re-download)
      if ! run_bounded "$copy_timeout" cp "$f" "$final.partial"; then
        rm -f "$final.partial" 2>/dev/null || true   # drop the partial so a later run retries cleanly
        echo "craig-sync: ERROR — copy of $base timed out (>${copy_timeout}s, mount stalled); failing." >&2
        exit 1
      fi
      mv "$final.partial" "$final"           # atomic: sensor sees only complete .zip
      echo "craig-sync: synced $base"
      synced=$((synced + 1))
    done <"$listing"
    echo "craig-sync: $synced new, $(ls "$dest"/*.zip 2>/dev/null | wc -l) total in incoming"

# Install + start the systemd USER timer that runs `craig-sync` every 5 min. One-time
# setup; copies the committed units (deploy/systemd/) → ~/.config/systemd/user/ and
# enables the timer. Needs lingering (`loginctl enable-linger $USER`) to run without an
# active login — already on for this deploy.
craig-timer-install:
    #!/usr/bin/env bash
    set -euo pipefail
    unit_dir="$HOME/.config/systemd/user"
    mkdir -p "$unit_dir"
    cp deploy/systemd/craig-sync.service deploy/systemd/craig-sync.timer "$unit_dir/"
    systemctl --user daemon-reload
    systemctl --user enable --now craig-sync.timer
    echo "installed. timer schedule:"; systemctl --user list-timers craig-sync.timer --no-pager

# Commit + push new linguist transcripts/data (the pipeline's tracked source-of-record).
# heartwood Phase-4 write-back (P4.1): apply ONE approved change-set to the akasha corpus.
# The public review surface only stages decisions in proposals/<date>/review.kdl (a narrow
# rw bind-mount); this host-side recipe is the only place the corpus is written, the snapshot
# regenerated, and akasha redeployed — kept off the no-auth public app deliberately. Steps:
# write approved pages + registry-adds (astra-heartwood-apply) → validate the corpus (catches
# a bad write before commit) → regen the snapshot → path-scoped commit + fetch/rebase (the
# linguist-commit timer moves origin/main) + push → rebuild akasha so the edits go live.
# `just heartwood-apply 2025-8-28`.  (Dry run: `uv run astra-heartwood-apply <date> --dry-run`.)
heartwood-apply date:
    #!/usr/bin/env bash
    set -euo pipefail
    cd /ruby/data/experiments/astra
    echo "heartwood-apply {{date}}: writing approved pages + registry adds…"
    OTEL_SDK_DISABLED=true uv run astra-heartwood-apply {{date}}
    echo "heartwood-apply: validating the corpus…"
    node --import ./libs/ts/site-kit/src/nodeTsResolve.mjs \
      libs/ts/vellum-lang/scripts/validate-corpus.ts --dir apps/akasha-backend/content
    echo "heartwood-apply: regenerating the akasha snapshot…"
    OTEL_SDK_DISABLED=true uv run akasha-snapshot
    # The whole proposals/<date> dir, not just review.kdl: the facts-only rework made the
    # proposal .vellum bodies HUMAN-edited (the editor saves them to disk) — leaving them
    # unstaged aborts the rebase below with "cannot rebase: You have unstaged changes".
    git add apps/akasha-backend/content apps/akasha-backend/snapshot/akasha-snapshot.json \
            ontology/ontology-entity/entity.kdl "apps/heartwood-backend/proposals/{{date}}"
    if git diff --cached --quiet; then
      echo "heartwood-apply: nothing approved/changed for {{date}} — done."
      exit 0
    fi
    # Path-scoped, machine-generated/human-approved content (all biome-excluded) → --no-verify.
    git commit --no-verify -q \
      -m "feat(akasha): heartwood write-back {{date}}" \
      -m "Approved heartwood change-set applied via just heartwood-apply (P4.1)."
    git fetch -q origin
    if ! git rebase -q origin/main; then
      echo "heartwood-apply: rebase conflict against origin/main — resolve, then push + redeploy manually" >&2
      exit 1
    fi
    git push -q origin main && echo "heartwood-apply: committed + pushed"
    echo "heartwood-apply: rebuilding akasha-frontend so the edits go live…"
    if (cd deploy && docker compose up -d --build akasha-frontend); then
      echo "heartwood-apply: akasha-frontend redeployed — edits live"
    else
      echo "heartwood-apply: akasha redeploy FAILED (rerun: cd deploy && docker compose up -d --build akasha-frontend)" >&2
      exit 1
    fi

# The Dagster run workers write apps/linguist/{transcripts,data} to the host via bind mounts,
# but the containers have no .git — so this host-side recipe is what tracks them. gitignore
# already excludes *.candidates.json and the large scribe/mouthpiece binaries, so a plain
# `add` of those two dirs stages exactly the right files. No-ops cleanly when nothing's new.
# Uses --no-verify: the commit is data-only (the biome/ruff pre-commit gate is irrelevant and
# needs pnpm/uv on PATH, which the systemd user service lacks); CI still lints on push.
linguist-commit:
    #!/usr/bin/env bash
    set -euo pipefail
    cd /ruby/data/experiments/astra
    git add apps/linguist/transcripts apps/linguist/data apps/linguist/timeline
    changed=""
    if ! git diff --cached --quiet; then
      changed=$(git diff --cached --name-only)
      n=$(printf '%s\n' "$changed" | grep -c .)
      git commit --no-verify -q \
        -m "chore(linguist): auto-commit ${n} new transcript/data file(s)" \
        -m "Pipeline-generated source-of-record, committed by the linguist-commit timer."
      echo "linguist-commit: committed ${n} file(s)"
    fi
    # Push if local main is ahead of origin — also retries a prior run whose push failed.
    if [ -n "$(git rev-list origin/main..HEAD 2>/dev/null || true)" ]; then
      if git push -q origin main; then echo "linguist-commit: pushed"; else
        echo "linguist-commit: push FAILED (will retry next run)" >&2; exit 1; fi
    else
      echo "linguist-commit: nothing to push"
    fi
    # If this run committed akasha content (it reads apps/linguist/{transcripts,data,timeline} at build),
    # rebuild + redeploy the wiki so the new sessions actually appear. akasha bakes content at
    # build time and needs no secrets, so a plain targeted compose up suffices; a failed build
    # leaves the running container untouched (no downtime).
    if printf '%s\n' "$changed" | grep -qE '^apps/linguist/(transcripts|data|timeline)/'; then
      echo "linguist-commit: akasha content changed — seeding audio + rebuilding + redeploying akasha-frontend"
      # The new session's combined recording is already on disk (scribe wrote it before
      # linguist produced the transcript); land it in the audio volume before redeploy so
      # the transcript page's /audio/<date>.mp3 resolves. Incremental → cheap (see akasha-seed).
      {{just_executable()}} akasha-seed || echo "linguist-commit: akasha-seed FAILED (rerun: just akasha-seed)" >&2
      if (cd deploy && docker compose up -d --build akasha-frontend); then
        echo "linguist-commit: akasha-frontend redeployed"
      else
        echo "linguist-commit: akasha-frontend redeploy FAILED (rerun: just up, or compose up --build akasha-frontend)" >&2
      fi
    fi
    # Mouthpiece phase: unlike akasha (build-time content read), mouthpiece-frontend reads a
    # COMMITTED snapshot, so regenerate it from the live corpus (the pipeline writes new
    # episodes under episodes_path). Idempotent + deterministic → a no-op until a new episode
    # lands. A separate commit (own message); on change, seed the audio volume + redeploy the
    # frontend. Non-fatal: a publish/redeploy hiccup must not fail the linguist push above.
    if {{just_executable()}} mouthpiece-publish; then
      git add apps/mouthpiece-backend/snapshot/episodes-index.json
      if ! git diff --cached --quiet; then
        git commit --no-verify -q \
          -m "chore(mouthpiece): auto-publish episode catalog snapshot" \
          -m "Regenerated from the live corpus by the linguist-commit timer."
        if git push -q origin main; then echo "linguist-commit: mouthpiece snapshot pushed"; else
          echo "linguist-commit: mouthpiece snapshot push FAILED (will retry next run)" >&2; fi
        echo "linguist-commit: mouthpiece snapshot changed — seeding audio + redeploying frontend"
        {{just_executable()}} mouthpiece-seed || echo "linguist-commit: mouthpiece-seed FAILED (rerun: just mouthpiece-seed)" >&2
        if (cd deploy && docker compose up -d --build mouthpiece-frontend); then
          echo "linguist-commit: mouthpiece-frontend redeployed"
        else
          echo "linguist-commit: mouthpiece-frontend redeploy FAILED (rerun: compose up --build mouthpiece-frontend)" >&2
        fi
      fi
    else
      echo "linguist-commit: mouthpiece-publish FAILED (snapshot not refreshed this run)" >&2
    fi

# Install + start the systemd USER timer that runs `linguist-commit` every 15 min. One-time
# setup (mirrors craig-timer-install); needs lingering for the user. The timer pushes to
# origin/main, so the user's git identity + a non-interactive SSH push key must be available
# to the systemd user session (same key the user pushes with).
linguist-commit-timer-install:
    #!/usr/bin/env bash
    set -euo pipefail
    unit_dir="$HOME/.config/systemd/user"
    mkdir -p "$unit_dir"
    cp deploy/systemd/linguist-commit.service deploy/systemd/linguist-commit.timer \
       deploy/systemd/linguist-commit.path "$unit_dir/"
    systemctl --user daemon-reload
    systemctl --user enable --now linguist-commit.timer
    # Event-driven publish: fires linguist-commit the moment session_episode writes the
    # .last-rendered sentinel; the timer above stays on as the fallback sweep.
    systemctl --user enable --now linguist-commit.path
    echo "installed. timer schedule:"; systemctl --user list-timers linguist-commit.timer --no-pager
    echo "path unit:"; systemctl --user is-active linguist-commit.path

# Install the stack-wide Discord alerting (idempotent; re-run after editing any unit).
# Three pieces: (1) the templated OnFailure handler astra-alert@.service — Class C, pages
# when a monitored unit FAILS; (2) the astra-watchdog.{service,timer} — Class B liveness
# (Drive FUSE mount + pipeline timers armed), every 15 min, debounced; (3) RE-copies the
# craig-sync + linguist-commit services that now carry `OnFailure=astra-alert@%n.service`.
# alert-notify.sh stays in the repo — the units ExecStart its absolute path (no copy). The
# webhook is decrypted from SOPS at runtime (Class A — SigNoz's own Discord channel/rules —
# lives in SigNoz, not here). Needs lingering for the user (already on for this deploy).
alert-install:
    #!/usr/bin/env bash
    set -euo pipefail
    cd /ruby/data/experiments/astra
    chmod +x deploy/systemd/alert-notify.sh
    unit_dir="$HOME/.config/systemd/user"
    mkdir -p "$unit_dir"
    # New alerting units + the two edited monitored services (install copies verbatim).
    cp deploy/systemd/astra-alert@.service \
       deploy/systemd/astra-watchdog.service deploy/systemd/astra-watchdog.timer \
       deploy/systemd/craig-sync.service deploy/systemd/linguist-commit.service "$unit_dir/"
    systemctl --user daemon-reload
    systemctl --user enable --now astra-watchdog.timer
    echo "installed. watchdog schedule:"; systemctl --user list-timers astra-watchdog.timer --no-pager
    echo "smoke-test a Discord page with: deploy/systemd/alert-notify.sh test"
    echo "one-time root step for vanished-mount auto-remediation: just alert-sudoers-install"

# One-time ROOT step: install the NOPASSWD sudoers drop-in that lets the watchdog
# force-restart gdrive.service when the Drive mount VANISHES (daemon alive but mount
# detached — Restart=always can't fire). Validates with visudo before installing so a
# bad file can never lock sudo. Prompts for your password (system-scope install).
alert-sudoers-install:
    #!/usr/bin/env bash
    set -euo pipefail
    cd /ruby/data/experiments/astra
    src=deploy/systemd/sudoers.d/astra-gdrive
    sudo visudo -cf "$src"                       # syntax-check BEFORE touching /etc
    sudo install -o root -g root -m 0440 "$src" /etc/sudoers.d/astra-gdrive
    echo "installed /etc/sudoers.d/astra-gdrive; verifying passwordless restart is allowed:"
    sudo -n /usr/bin/systemctl restart gdrive.service && echo "OK — watchdog can now self-heal a vanished mount"

# Migrate faerrin's historical episode CATALOG (script + digest) into astra's
# episodes corpus (step 2 — catalog union), so episodes_index + the snapshot include
# the back-catalog alongside live pipeline renders. Idempotent; live renders win for
# any date both produced; audio is separate (`mouthpiece-seed`). Source override:
# MOUTHPIECE_AUDIO_SRC (same store the audio seed uses → catalog + audio stay aligned).
mouthpiece-migrate-history:
    MOUTHPIECE_AUDIO_SRC="{{mouthpiece_audio_src}}" {{uv_bin}} run python -m astra_mouthpiece.migrate

# Regenerate the committed mouthpiece snapshot (apps/mouthpiece-backend/snapshot/
# episodes-index.json) from the live corpus — the frontend's single committed build
# input (step 4/5). Ensures the historical back-catalog is present (idempotent migrate),
# then rebuilds the catalog over the full corpus (migrated ∪ live renders). Deterministic,
# so a no-op when nothing new landed. Run on the HOST (needs uv + ffprobe + the repo; the
# dagster container can't reach the committed snapshot/ dir). Pairs with `mouthpiece-seed`
# (audio) + a frontend redeploy — all three are wired into the linguist-commit timer.
mouthpiece-publish:
    #!/usr/bin/env bash
    set -euo pipefail
    cd /ruby/data/experiments/astra
    MOUTHPIECE_AUDIO_SRC="{{mouthpiece_audio_src}}" {{uv_bin}} run python -m astra_mouthpiece.migrate
    {{uv_bin}} run python -m astra_mouthpiece.publish

# Seed the mouthpiece-frontend audio volume (D2). Flattens `<id>.episode.mp3` →
# `<id>.mp3` into the astra-mouthpiece-audio volume (created by `up`), served
# same-origin at /audio/<id>.mp3. Two sources, in order: the faerrin historical
# back-catalog (flat) first, then astra's own live pipeline renders (nested
# `<date>/<id>.episode.mp3`) which OVERWRITE for any date both produced (live wins —
# matches the catalog dedup). Re-run to refresh; idempotent.
mouthpiece-seed:
    #!/usr/bin/env bash
    set -euo pipefail
    mkdir -p "{{artifacts}}"/audio/mouthpiece
    # The faerrin historical back-catalog was decommissioned 2026-07-04; its mp3s already
    # live in the persistent {{artifacts}}/audio/mouthpiece volume from earlier seeds. Only
    # mount /hist if the source still exists — otherwise Docker would recreate the deleted
    # path as an empty root-owned dir. Live renders are seeded regardless.
    hist_mount=()
    if [ -d "{{mouthpiece_audio_src}}" ]; then hist_mount=(-v "{{mouthpiece_audio_src}}":/hist:ro); fi
    docker run --rm \
      -v "{{artifacts}}"/audio/mouthpiece:/audio \
      "${hist_mount[@]}" \
      -v "{{mouthpiece_episodes}}":/live:ro \
      alpine sh -c '
        set -e
        for f in /hist/*.episode.mp3; do [ -e "$f" ] || continue; cp "$f" "/audio/$(basename "$f" .episode.mp3).mp3"; done
        find /live -name "*.episode.mp3" -exec sh -c "cp \"\$1\" \"/audio/\$(basename \"\$1\" .episode.mp3).mp3\"" _ {} \;
        n=$(ls -1 /audio/*.mp3 2>/dev/null | wc -l); echo "seeded $n episode(s) into {{artifacts}}/audio/mouthpiece"; ls -1 /audio'

# Seed the akasha-frontend session-audio volume (the combined Craig recordings the
# transcript pages play, served same-origin at /audio/<date>.mp3 — replaces faerrin's
# static-audio.iridi.cc). Flattens `<date>/audio.mp3` → `<date>.mp3` from two sources:
# HIST (faerrin's frozen back-catalog) is INCREMENTAL — only copied when absent, so the
# one-time seed isn't re-copied on every timer redeploy; LIVE (astra scribe's saved dir)
# is always overwritten (small, grows with new sessions, and live wins for any date in
# both). HIST is scanned at ANY depth (faerrin mislocated a few recent sessions under a
# nested `saved/saved/<date>/` — the reason faerrin's own static-audio 404s them); the
# session date is the parent dir of each audio.mp3, guarded to YYYY-M-D so stray files
# can't seed junk. Re-run to refresh; idempotent + cheap in steady state.
akasha-seed:
    #!/usr/bin/env bash
    set -euo pipefail
    mkdir -p "{{artifacts}}"/audio/akasha
    docker run --rm \
      -v "{{artifacts}}"/audio/akasha:/audio \
      -v "{{akasha_audio_hist}}":/hist:ro \
      -v "{{akasha_audio_live}}":/live:ro \
      alpine sh -c '
        set -e
        find /hist -name audio.mp3 | while IFS= read -r f; do
          date=$(basename "$(dirname "$f")")
          echo "$date" | grep -qE "^[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}$" || continue
          dest="/audio/${date}.mp3"; [ -e "$dest" ] || cp "$f" "$dest"
        done
        for d in /live/*/; do f="${d}audio.mp3"; [ -e "$f" ] || continue; cp "$f" "/audio/$(basename "$d").mp3"; done
        n=$(ls -1 /audio/*.mp3 2>/dev/null | wc -l); echo "seeded $n session(s) into {{artifacts}}/audio/akasha"'

# One-time: copy the orator music library out of the old named volume into the new
# artifacts/ bind dir (orator-audio is runtime-ingested, NOT re-seedable). Run with the
# orator-backend container stopped. chowns to 1000 so the now-1000 orator-backend writes
# there. Safe to drop the old volume once verified.
orator-audio-migrate:
    #!/usr/bin/env bash
    set -euo pipefail
    mkdir -p "{{artifacts}}"/audio/orator
    docker run --rm \
      -v astra-orator-audio:/from:ro \
      -v "{{artifacts}}"/audio/orator:/to \
      alpine sh -c 'cp -a /from/. /to/ && chown -R 1000:1000 /to && echo "migrated orator audio -> {{artifacts}}/audio/orator"'

# One-time: copy a Postgres data dir out of its old named volume into the new artifacts/
# bind dir, preserving uid-70/0700 so the postgres entrypoint accepts PGDATA. Run with the
# DB container STOPPED. Usage: `just pg-migrate dagster` (or weal / orator).
pg-migrate name:
    #!/usr/bin/env bash
    set -euo pipefail
    mkdir -p "{{artifacts}}"/postgres
    docker run --rm \
      -v astra-{{name}}-pg:/from:ro \
      -v "{{artifacts}}"/postgres:/parent \
      alpine sh -c '
        set -e
        rm -rf /parent/{{name}}; mkdir /parent/{{name}}
        cp -a /from/. /parent/{{name}}/
        chown -R 70:70 /parent/{{name}}; chmod 700 /parent/{{name}}
        echo "migrated astra-{{name}}-pg -> {{artifacts}}/postgres/{{name}}"'

# --- portal (0023) ---

# Bundle the Foundry module (tsdown -> apps/portal/module/dist/main.js). dist/ is
# gitignored; S6 packages module.json + dist/ into portal.zip during the server's
# Docker build (D11 — install-by-Manifest-URL, no host file-drop in steady state).
portal-module-build:
    pnpm --filter @astra/portal-module build

# The live "Faerrin" Foundry stack's data dir (a SEPARATE Compose project/stack,
# apps-network, same host — verified via `docker inspect foundry_faerrin` --format
# '{{json .Mounts}}': the container's rw bind mount is Source
# /emerald/data/apps/apps/foundry_faerrin/data -> Destination /data, and Foundry
# stores installed modules under Data/modules/<module-id>/ inside that). Override
# with FOUNDRY_DATA_DIR if the host layout ever changes.
foundry_faerrin_data := env_var_or_default("FOUNDRY_DATA_DIR", "/emerald/data/apps/apps/foundry_faerrin/data")

# File-drop FALLBACK install (D11's primary path is Manifest URL —
# https://portal.iridi.cc/module/module.json, which Foundry fetches itself with no
# host step at all). Builds the module locally, then copies module.json + dist/
# straight into the live Foundry data dir's modules/portal/ — no restart needed,
# Foundry re-reads module.json on next world launch / module refresh. Idempotent
# (mkdir -p + overwrite-copy); does NOT touch the foundry_faerrin container itself,
# only its host-side bind-mount source directory.
portal-module-install: portal-module-build
    #!/usr/bin/env bash
    set -euo pipefail
    dest="{{foundry_faerrin_data}}/Data/modules/portal"
    mkdir -p "$dest/dist"
    cp apps/portal/module/module.json "$dest/module.json"
    cp apps/portal/module/dist/main.js "$dest/dist/main.js"
    echo "installed portal module -> $dest (restart/refresh Foundry to pick it up)"

# --- codex (0029) ---

# Refresh the codex corpus (D29-4): re-fetch both snapshots, re-transform, print
# the report summary. A deliberate, diffable event, never implicit in a build —
# refuses to run if the git index is dirty under apps/codex (the
# corpus-manifest.json diff must be reviewable alone, the linguist-commit-timer
# lesson applied here too). Re-downloads ~259 MB (AoN) + the Foundry sparse
# clone; not cheap, don't run casually.
codex-refresh:
    #!/usr/bin/env bash
    set -euo pipefail
    cd /ruby/data/experiments/astra
    if [ -n "$(git status --porcelain -- apps/codex)" ]; then
      echo "codex-refresh: apps/codex has uncommitted changes — commit or stash first" >&2
      echo "(the corpus-manifest.json diff from this refresh must be reviewable alone):" >&2
      git status --porcelain -- apps/codex >&2
      exit 1
    fi
    echo "codex-refresh: fetching Foundry snapshot..."
    pnpm --filter @astra/codex fetch:foundry
    echo "codex-refresh: fetching AoN snapshot..."
    pnpm --filter @astra/codex fetch:aon
    echo "codex-refresh: running the transform..."
    pnpm --filter @astra/codex transform
    echo ""
    echo "codex-refresh: building the search index..."
    just codex-search-index
    echo ""
    # D30-41: regenerate the assay spell-power artifact against the fresh corpus
    # (the container restart below is also what flushes assayFs's per-process
    # cache). Guarded: a checkout without the assay env still refreshes codex.
    echo "codex-refresh: regenerating the assay artifact (D30-41)..."
    if uv run assay export-codex; then
      mkdir -p apps/codex/data/assay
      cp apps/assay/out/spell-power.json apps/codex/data/assay/spell-power.json
      echo "codex-refresh: assay artifact regenerated + placed."
    else
      echo "codex-refresh: assay export failed or unavailable — keeping the previous artifact." >&2
    fi
    echo ""
    echo "codex-refresh: done. report.md summary:"
    head -n 40 apps/codex/data/corpus/report.md
    echo ""
    # D29-57: corpusFs.ts caches the corpus per category per-process, so a running
    # container keeps serving stale categories after a host-side refresh until it
    # restarts — a restart is the cheap, deterministic flush (the Pagefind
    # staticMount needs no restart, it's per-request fail-soft). Guarded so a fresh
    # host / no-docker / not-yet-deployed environment never fails this recipe.
    echo "codex-refresh: checking for a running astra-codex container (D29-57)..."
    if command -v docker >/dev/null 2>&1 && [ -n "$(docker ps -q -f name='^astra-codex$' 2>/dev/null || true)" ]; then
      echo "codex-refresh: astra-codex is running — restarting to flush corpus caches..."
      (cd deploy && docker compose restart codex)
    else
      echo "codex-refresh: astra-codex not running (or docker unavailable) — skipping restart."
    fi

# Build the codex Pagefind search index (D29-34) from the current corpus at
# apps/codex/data/corpus/ into apps/codex/data/search/pagefind/, served at
# /pagefind/ via server.ts's staticMount. HOST-ONLY — the native Pagefind
# indexer peaks at ~3.8 GB RSS during writeFiles over the full 46k-entity
# corpus (measured) — this must NEVER run in CI, a Docker build, or `vite
# build`; it's a deliberate, standalone, host-run step, same posture as
# codex-refresh (which calls this after the transform). The server picks up
# a freshly-built index with no restart (StaticMount fails soft per-request).
codex-search-index:
    pnpm --filter @astra/codex search:build

# --- Host edge (shared reverse proxy) ---

# The decrypted CF token, exported as {$CF_API_TOKEN} for the caddyfile adapter.
cf_token := "CF_API_TOKEN=\"$(SOPS_AGE_KEY_FILE=" + sops_age_key + " sops -d --extract '[\"cloudflare_key\"]' " + sops_file + ")\""

# Reload the shared reverse proxy with astra's sites (CF token from SOPS, substituted at adapt time — never on disk).
caddy-reload:
    {{cf_token}} {{reverse_proxy_dir}}/caddy reload --config {{reverse_proxy_dir}}/Caddyfile --adapter caddyfile

# Validate the merged edge (main Caddyfile imports astra's sites) — so parent
# snippets like local_only resolve. Adapt-only; no provisioning.
caddy-validate:
    {{cf_token}} {{reverse_proxy_dir}}/caddy validate --config {{reverse_proxy_dir}}/Caddyfile --adapter caddyfile

# Tail the edge logs (mirrors the reverse-proxy justfile's `logs`).
caddy-logs:
    journalctl -fu caddy.service
