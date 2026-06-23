# astra task runner. Two concerns:
#   - the Docker substrate (deploy/): Dagster + SigNoz + the strider services.
#   - the host edge: the SHARED reverse proxy at /ruby/data/reverse-proxy (a custom
#     `caddy` binary w/ the cloudflare-dns plugin — the stock /usr/bin/caddy lacks
#     it) whose Caddyfile `import`s this repo's sites.caddyfile. The caddy recipes
#     reload/validate it, sourcing the ACME-DNS token from SOPS (never committed).

reverse_proxy_dir := "/ruby/data/reverse-proxy"
sops_age_key := "deploy/sops/age.key"
sops_file := "deploy/sops/secrets.enc.yaml"

# Source of the rendered podcast episodes for the mouthpiece-frontend audio seed
# (faerrin's caster out/). Override with MOUTHPIECE_AUDIO_SRC for another host.
mouthpiece_audio_src := env_var_or_default("MOUTHPIECE_AUDIO_SRC", "/ruby/data/experiments/faerrin/pkg/caster/out")

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

# Seed the mouthpiece-frontend audio volume from faerrin's rendered episodes (D2 — a
# MANUAL step; the live pipeline→audio path is the deferred follow-up). Flattens
# `<id>.episode.mp3` → `<id>.mp3` into the astra-mouthpiece-audio volume (created by
# `up`), served same-origin at /audio/<id>.mp3. Re-run to refresh; idempotent.
mouthpiece-seed:
    #!/usr/bin/env bash
    set -euo pipefail
    docker volume create astra-mouthpiece-audio >/dev/null
    docker run --rm \
      -v astra-mouthpiece-audio:/audio \
      -v "{{mouthpiece_audio_src}}":/src:ro \
      alpine sh -c 'set -e; n=0; for f in /src/*.episode.mp3; do b=$(basename "$f" .episode.mp3); cp "$f" "/audio/$b.mp3"; n=$((n+1)); done; echo "seeded $n episode(s) into astra-mouthpiece-audio"; ls -1 /audio'

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
