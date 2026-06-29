# astra task runner. Two concerns:
#   - the Docker substrate (deploy/): Dagster + SigNoz + the strider services.
#   - the host edge: the SHARED reverse proxy at /ruby/data/reverse-proxy (a custom
#     `caddy` binary w/ the cloudflare-dns plugin — the stock /usr/bin/caddy lacks
#     it) whose Caddyfile `import`s this repo's sites.caddyfile. The caddy recipes
#     reload/validate it, sourcing the ACME-DNS token from SOPS (never committed).

reverse_proxy_dir := "/ruby/data/reverse-proxy"
sops_age_key := "deploy/sops/age.key"
sops_file := "deploy/sops/secrets.enc.yaml"

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
    cd deploy && docker compose up -d --build

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
    mkdir -p "$dest"
    shopt -s nullglob
    synced=0
    for f in "$src"/*.zip; do
      base=$(basename "$f")
      final="$dest/$base"
      [ -e "$final" ] && continue            # already synced — skip (no re-download)
      cp "$f" "$final.partial" && mv "$final.partial" "$final"  # atomic: sensor sees only complete .zip
      echo "craig-sync: synced $base"
      synced=$((synced + 1))
    done
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
    bun libs/ts/vellum-lang/scripts/validate-corpus.ts --dir apps/akasha-backend/content
    echo "heartwood-apply: regenerating the akasha snapshot…"
    OTEL_SDK_DISABLED=true uv run akasha-snapshot
    git add apps/akasha-backend/content apps/akasha-backend/snapshot/akasha-snapshot.json \
            ontology/ontology-entity/entity.kdl "apps/heartwood-backend/proposals/{{date}}/review.kdl"
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
# needs bunx/uv on PATH, which the systemd user service lacks); CI still lints on push.
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
    cp deploy/systemd/linguist-commit.service deploy/systemd/linguist-commit.timer "$unit_dir/"
    systemctl --user daemon-reload
    systemctl --user enable --now linguist-commit.timer
    echo "installed. timer schedule:"; systemctl --user list-timers linguist-commit.timer --no-pager

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
    docker volume create astra-mouthpiece-audio >/dev/null
    docker run --rm \
      -v astra-mouthpiece-audio:/audio \
      -v "{{mouthpiece_audio_src}}":/hist:ro \
      -v "{{mouthpiece_episodes}}":/live:ro \
      alpine sh -c '
        set -e
        for f in /hist/*.episode.mp3; do [ -e "$f" ] || continue; cp "$f" "/audio/$(basename "$f" .episode.mp3).mp3"; done
        find /live -name "*.episode.mp3" -exec sh -c "cp \"\$1\" \"/audio/\$(basename \"\$1\" .episode.mp3).mp3\"" _ {} \;
        n=$(ls -1 /audio/*.mp3 2>/dev/null | wc -l); echo "seeded $n episode(s) into astra-mouthpiece-audio"; ls -1 /audio'

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
    docker volume create astra-akasha-audio >/dev/null
    docker run --rm \
      -v astra-akasha-audio:/audio \
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
        n=$(ls -1 /audio/*.mp3 2>/dev/null | wc -l); echo "seeded $n session(s) into astra-akasha-audio"'

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
