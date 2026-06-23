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
    git add apps/linguist/transcripts apps/linguist/data
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
    # If this run committed akasha content (it reads apps/linguist/{transcripts,data} at build),
    # rebuild + redeploy the wiki so the new sessions actually appear. akasha bakes content at
    # build time and needs no secrets, so a plain targeted compose up suffices; a failed build
    # leaves the running container untouched (no downtime). NOTE: mouthpiece-frontend is NOT
    # handled here yet — its live-pipeline catalog/audio integration is still deferred (the
    # pipeline writes date-keyed episode dirs the index builder can't discover).
    if printf '%s\n' "$changed" | grep -qE '^apps/linguist/(transcripts|data)/'; then
      echo "linguist-commit: akasha content changed — rebuilding + redeploying akasha-frontend"
      if (cd deploy && docker compose up -d --build akasha-frontend); then
        echo "linguist-commit: akasha-frontend redeployed"
      else
        echo "linguist-commit: akasha-frontend redeploy FAILED (rerun: just up, or compose up --build akasha-frontend)" >&2
      fi
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
    MOUTHPIECE_AUDIO_SRC="{{mouthpiece_audio_src}}" uv run python -m astra_mouthpiece.migrate

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
