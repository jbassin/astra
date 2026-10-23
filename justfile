# astra task runner. Two concerns:
#   - the Docker substrate (deploy/): Dagster + SigNoz + the strider services.
#   - the host edge: the SHARED reverse proxy at /ruby/data/reverse-proxy (a custom
#     `caddy` binary w/ the cloudflare-dns plugin — the stock /usr/bin/caddy lacks
#     it) whose Caddyfile `import`s this repo's sites.caddyfile. The caddy recipes
#     reload/validate it, sourcing the ACME-DNS token from SOPS (never committed).

reverse_proxy_dir := "/ruby/data/reverse-proxy"
sops_age_key := "deploy/sops/age.key"
sops_file := "deploy/sops/secrets.enc.yaml"

# The one data root (0037 Phase 1 item 2c): ALL runtime state — the astra-data clone, every
# service's state dirs, audio, Postgres, the deploy record, locks — lives here, never in a
# code checkout. Mirrors config.kdl data.root (whose comment lists the layout); the same
# ASTRA_DATA_ROOT variable overrides both. The containers run as 1000:1000, so the source
# dirs must exist + be host-owned BEFORE a deploy (Docker auto-creates a missing bind source
# as root); `artifacts-init` (run by every deploy) creates them.
data_root := env_var_or_default("ASTRA_DATA_ROOT", "/ruby/data/astra-state")

# One git publisher at a time (0036 D36-5): linguist-commit and the heartwood recipes hold
# this flock while they publish. heartwood_dir mirrors config.kdl heartwood.artifacts-path
# (per-run artifacts, backfill.log and backfill.lock, which the request runner and the
# watchdog also read).
git_publish_lock := data_root + "/locks/git-publish.lock"
heartwood_dir := data_root + "/heartwood"

# The deploy checkout (0037 OPS-3): the only tree that builds production (`just deploy`) and
# the tree every host unit runs from (craig-sync, linguist-commit, heartwood-request, watchdog,
# alerting, backup; 0037 item 2c moved the last two bots here). The install recipes link those
# units from here, and deploy.sh keeps its venv + node deps in sync for them. Mirrors
# deploy.sh's ASTRA_DEPLOY_ROOT default.
deploy_root := env_var_or_default("ASTRA_DEPLOY_ROOT", "/ruby/data/astra-deploy")

# Source of the HISTORICAL podcast episodes for the mouthpiece-frontend audio seed
# (faerrin's caster out/ — the pre-astra back-catalog). Override with MOUTHPIECE_AUDIO_SRC.
mouthpiece_audio_src := env_var_or_default("MOUTHPIECE_AUDIO_SRC", "/ruby/data/experiments/faerrin/pkg/caster/out")

# astra's own episodes corpus (the live Dagster pipeline's renders + migrated catalog).
# Mirrors config.kdl mouthpiece.episodes-path; override with MOUTHPIECE_EPISODES.
mouthpiece_episodes := env_var_or_default("MOUTHPIECE_EPISODES", data_root + "/mouthpiece/episodes")

# Sources for the akasha-frontend session-audio seed (the combined Craig recordings the
# transcript pages play, served same-origin at /audio/<date>.mp3). HIST = faerrin's
# frozen back-catalog (~31 GB, the old static-audio.iridi.cc store); LIVE = astra
# scribe's saved dir (mirrors config.kdl scribe ingest-saved-dir, the scribe→linguist
# handoff). Both are `<date>/audio.mp3`; live wins for any date in both. Override with
# AKASHA_AUDIO_HIST / AKASHA_AUDIO_LIVE.
akasha_audio_hist := env_var_or_default("AKASHA_AUDIO_HIST", "/ruby/data/experiments/faerrin/pkg/wretch/data/saved")
akasha_audio_live := env_var_or_default("AKASHA_AUDIO_LIVE", data_root + "/scribe/data/saved")

# uv binary (absolute — the linguist-commit systemd user timer has a minimal PATH without
# uv, same reason the service hardcodes just's path). Override with UV_BIN on another host.
uv_bin := env_var_or_default("UV_BIN", "/home/jbassin/.local/bin/uv")

# --- Docker substrate (deploy/) ---

# Deploy production (0037 OPS-3): everything lives in deploy/deploy.sh (header = steps,
# flags, exit codes, where the live sha is recorded). Builds ONLY from the deploy checkout
# ($ASTRA_DEPLOY_ROOT, default /ruby/data/astra-deploy) at a PUSHED commit — origin/main, or
# `--sha <rev>` for a rollback — never from this working tree, so push first. Takes the
# deploy lock, injects the SOPS secrets (Decision E), labels every image with the sha.
#   just deploy                     whole stack at origin/main
#   just deploy akasha-frontend     one service (same secret injection — never use a bare
#                                   `docker compose up -d <svc>`, it starts it with no secrets)
#   just deploy --sha <rev> [svc]   a pushed older commit (rollback)
#   just deploy --dry-run [svc]     checks only; prints the compose command
#   just deploy --restart <svc>     restart without a build, under the same lock
deploy *args:
    ASTRA_DATA_ROOT="{{data_root}}" "{{justfile_directory()}}/deploy/deploy.sh" {{args}}

# Alias of `just deploy` (the old name; same args). No args = the whole stack.
up *services:
    "{{just_executable()}}" -f "{{justfile()}}" deploy {{services}}

# Create the data root's dirs as the host user (uid 1000) BEFORE a deploy
# (Docker would otherwise create a missing bind source as root — the root-owned-writes
# problem). `just deploy` does this itself; the dir list lives in deploy/deploy.sh.
artifacts-init:
    ASTRA_DATA_ROOT="{{data_root}}" "{{justfile_directory()}}/deploy/deploy.sh" --init-artifacts

# Stop the stack; keep volumes (ClickHouse / Postgres / SigNoz data persist).
down:
    cd deploy && docker compose down

# The SigNoz volumes hold the alert rules, the discord-ops channel and the users; the rules
# are also in deploy/signoz/rules/ and the nightly backup (`just backup-now` first if in
# doubt). A fresh SigNoz needs re-onboarding on the next `up`.
# Stop AND drop the SigNoz volumes (asks for confirmation first).
[confirm("down-volumes DELETES the SigNoz volumes (alert rules, notification channel, users). Type y to continue:")]
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
    cd "{{justfile_directory()}}"
    src="{{craig_drop_dir}}"
    # scribe.incoming-path from config.kdl (under data.root), through the checkout's venv
    # (deploy.sh keeps the deploy checkout's in sync). Local disk, never the FUSE mount.
    dest="$({{uv_bin}} run python -m astra_ontology_config scribe.incoming-path)"
    case "$dest" in /?*) ;; *) echo "craig-sync: ERROR — could not read scribe.incoming-path from config" >&2; exit 1 ;; esac
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

# Install + start the systemd USER timer that runs `craig-sync` every 5 min. Idempotent;
# links the units from the deploy checkout (see _unit-link) and enables the timer. Needs
# lingering (`loginctl enable-linger $USER`) to run without an active login — already on.
craig-timer-install: (_unit-link "craig-sync.service" "craig-sync.timer")
    #!/usr/bin/env bash
    set -euo pipefail
    systemctl --user enable --now craig-sync.timer
    echo "installed. timer schedule:"; systemctl --user list-timers craig-sync.timer --no-pager

# Link systemd USER units from the deploy checkout into ~/.config/systemd/user (0037 OPS-3),
# then daemon-reload. Idempotent: a unit already linked to the same file is left alone; a
# regular-file copy from the old `cp` installs (which `systemctl link` refuses to overwrite)
# or a link to another tree is removed first. Enablement symlinks point at the
# ~/.config/systemd/user path, so they keep working. The files change whenever a deploy
# checks out a new commit: re-run the matching install recipe (or daemon-reload) after a
# deploy that edits a unit.
_unit-link +units:
    #!/usr/bin/env bash
    set -euo pipefail
    unit_dir="$HOME/.config/systemd/user"
    mkdir -p "$unit_dir"
    for name in {{units}}; do
      src="{{deploy_root}}/deploy/systemd/$name"
      dst="$unit_dir/$name"
      [ -f "$src" ] || { echo "unit-link: $src missing — deploy a commit that has it first (just deploy)" >&2; exit 1; }
      if [ -L "$dst" ] && [ "$(readlink "$dst")" = "$src" ]; then continue; fi
      if [ -e "$dst" ] || [ -L "$dst" ]; then rm -f "$dst"; echo "unit-link: replaced old $dst"; fi
      systemctl --user link "$src"
    done
    systemctl --user daemon-reload

# Commit + push the pipeline's new output to the astra-data repo (0037 Phase 1 item 2), then
# redeploy the frontends that bake it. The Dagster run workers write the linguist datasets
# into the astra-data clone (config.kdl data.content-root) via bind mounts, but the
# containers have no git — so this host-side recipe is what commits them. It runs git ONLY
# against the clone (`git -C`), never against the code repo. Steps, under the git-publish
# lock: (1) commit the linguist datasets; (2) `mouthpiece-publish` regenerates the episode
# catalog snapshot (in the clone), commit it if it changed; (3) `_astra-data-push` (fetch,
# rebase onto origin/main if it moved, push — also retries an earlier failed push);
# (4) seed audio + `just deploy` akasha-frontend / mouthpiece-frontend for what changed.
# deploy.sh bakes the clone's committed HEAD, so a redeploy no longer waits for the push:
# a failed push still redeploys, then exits non-zero (OnFailure pages) and the next run
# retries it. No-ops cleanly when nothing's new. The clone's .gitignore keeps the
# *.candidates.json triage files out. --no-verify: the commit is data-only (the astra-data
# repo has no hooks today; the systemd user service has no pnpm/uv on PATH).
linguist-commit:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{justfile_directory()}}"
    just_cmd() { "{{just_executable()}}" -f "{{justfile()}}" "$@"; }
    # One git publisher at a time (0036 D36-5): heartwood-agent/-revert hold this lock while
    # they publish, commit and redeploy akasha. Held for this whole body (no sub-recipe here
    # takes the lock — a nested flock on a fresh fd would deadlock).
    mkdir -p "$(dirname "{{git_publish_lock}}")"
    exec 9>"{{git_publish_lock}}"
    flock -w 1800 9 || { echo "linguist-commit: git-publish lock busy for 30 min — skipping this run" >&2; exit 1; }
    # The astra-data clone + the datasets this recipe commits, from config.kdl (absolute
    # paths inside the clone; git accepts them as pathspecs).
    mapfile -t cpaths < <({{uv_bin}} run python -m astra_ontology_config data.content-root \
      data.linguist-transcripts data.linguist-data data.linguist-timeline data.mouthpiece-snapshot)
    if [ "${#cpaths[@]}" -ne 5 ]; then echo "linguist-commit: could not read data paths from config" >&2; exit 1; fi
    repo="${cpaths[0]}"; lpaths=("${cpaths[@]:1:3}"); mp_snapshot="${cpaths[4]}/episodes-index.json"
    dgit() { git -C "$repo" "$@"; }
    if [ ! -d "$repo/.git" ]; then echo "linguist-commit: the astra-data clone $repo is missing" >&2; exit 1; fi
    if [ "$(dgit rev-parse --abbrev-ref HEAD)" != main ]; then
      echo "linguist-commit: refusing — $repo is not on main" >&2; exit 1
    fi
    # (1) Commit ONLY our own paths (0033 §5): anything else staged in the clone (heartwood's
    # publish, a manual edit) stays staged and out of this commit. `--only` takes the exact
    # changed file list (not the dirs): a dir pathspec with no file left in HEAD/index errors.
    dgit add "${lpaths[@]}"
    changed=""
    if ! dgit diff --cached --quiet -- "${lpaths[@]}"; then
      changed=$(dgit diff --cached --name-only --no-renames -- "${lpaths[@]}")
      n=$(printf '%s\n' "$changed" | grep -c .)
      dgit diff --cached --name-only --no-renames -z -- "${lpaths[@]}" \
        | dgit commit --no-verify -q --only --pathspec-from-file=- --pathspec-file-nul \
            -m "chore(content): add ${n} linguist transcript/data file(s)" \
            -m "Pipeline-generated source-of-record, committed by the linguist-commit timer."
      echo "linguist-commit: committed ${n} file(s)"
    fi
    # (2) mouthpiece-frontend bakes the episode catalog snapshot, so regenerate it from the
    # live corpus (the pipeline writes new episodes under episodes_path). Idempotent and
    # deterministic: a no-op until a new episode lands. Non-fatal: a publish hiccup must not
    # stop the linguist push below.
    mp_changed=0
    if just_cmd mouthpiece-publish; then
      dgit add "$mp_snapshot"
      if ! dgit diff --cached --quiet -- "$mp_snapshot"; then
        dgit commit --no-verify -q --only \
          -m "chore(content): refresh the mouthpiece episode catalog" \
          -m "Regenerated from the live corpus by the linguist-commit timer." -- "$mp_snapshot"
        mp_changed=1
        echo "linguist-commit: committed the mouthpiece snapshot"
      fi
    else
      echo "linguist-commit: mouthpiece-publish FAILED (snapshot not refreshed this run)" >&2
    fi
    # (3) Push whatever the clone has that origin lacks (also retries a prior failed push).
    push_rc=0; just_cmd _astra-data-push || push_rc=$?
    # (4) Redeploy what changed. deploy.sh builds from the clone's committed HEAD, and a failed
    # build leaves the running container untouched (no downtime).
    if [ -n "$changed" ]; then
      echo "linguist-commit: akasha content changed — seeding audio + rebuilding + redeploying akasha-frontend"
      # The new session's combined recording is already on disk (scribe wrote it before
      # linguist produced the transcript); land it in the audio volume before redeploy so
      # the transcript page's /audio/<date>.mp3 resolves. Incremental → cheap (see akasha-seed).
      just_cmd akasha-seed || echo "linguist-commit: akasha-seed FAILED (rerun: just akasha-seed)" >&2
      if just_cmd deploy akasha-frontend; then
        echo "linguist-commit: akasha-frontend redeployed"
      else
        echo "linguist-commit: akasha-frontend redeploy FAILED (rerun: just deploy akasha-frontend)" >&2
      fi
    fi
    if [ "$mp_changed" = 1 ]; then
      echo "linguist-commit: mouthpiece snapshot changed — seeding audio + redeploying mouthpiece-frontend"
      just_cmd mouthpiece-seed || echo "linguist-commit: mouthpiece-seed FAILED (rerun: just mouthpiece-seed)" >&2
      if just_cmd deploy mouthpiece-frontend; then
        echo "linguist-commit: mouthpiece-frontend redeployed"
      else
        echo "linguist-commit: mouthpiece-frontend redeploy FAILED (rerun: just deploy mouthpiece-frontend)" >&2
      fi
    fi
    if [ "$push_rc" -ne 0 ]; then
      echo "linguist-commit: astra-data push FAILED (exit $push_rc) — committed locally; the next run retries" >&2
      exit 1
    fi

# Publish the astra-data clone (config.kdl data.content-root): fetch; if origin/main moved,
# rebase the clone's local commits onto it (the repo is bot-written data, so rebasing them is
# safe; --autostash carries uncommitted pipeline writes across); push main if it is ahead.
# Runs git ONLY in the clone, never in the code repo. A failed rebase is aborted at once, so
# the clone is never left mid-rebase for the next timer run; resolve by hand in the clone.
# Callers (linguist-commit, heartwood) hold the git-publish lock — never take it here (a
# nested flock on a fresh fd deadlocks). Exit 8 = fetch, rebase or push failed; the local
# commits stay and the next caller retries.
_astra-data-push:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{justfile_directory()}}"
    repo="$({{uv_bin}} run python -m astra_ontology_config data.content-root)"
    dgit() { git -C "$repo" "$@"; }
    if [ ! -d "$repo/.git" ]; then echo "astra-data: the clone $repo is missing" >&2; exit 8; fi
    if [ "$(dgit rev-parse --abbrev-ref HEAD)" != main ]; then
      echo "astra-data: $repo is not on main — not pushing" >&2; exit 8
    fi
    dgit fetch -q origin || { echo "astra-data: fetch FAILED in $repo" >&2; exit 8; }
    if dgit merge-base --is-ancestor origin/main HEAD; then
      :
    elif ! dgit rebase -q --autostash origin/main; then
      dgit rebase --abort || echo "astra-data: rebase --abort failed too — inspect $repo" >&2
      echo "astra-data: rebase onto origin/main FAILED in $repo (aborted; local commits kept) — resolve by hand: git -C $repo pull --rebase" >&2
      exit 8
    else
      echo "astra-data: rebased onto origin/main"
    fi
    if [ -n "$(dgit rev-list origin/main..HEAD)" ]; then
      dgit push -q origin main || { echo "astra-data: push FAILED from $repo" >&2; exit 8; }
      echo "astra-data: pushed $(dgit rev-parse --short HEAD)"
    else
      echo "astra-data: nothing to push"
    fi

# Install + start the systemd USER timer that runs `linguist-commit` every 15 min. Idempotent;
# links the units from the deploy checkout (see _unit-link; the service runs the recipe
# there, with the venv deploy.sh keeps in sync). Needs lingering for the user. The timer
# pushes the astra-data clone to its origin, so the user's git identity + a non-interactive
# SSH push key must be available to the systemd user session (same key the user pushes with).
linguist-commit-timer-install: (_unit-link "linguist-commit.service" "linguist-commit.timer" "linguist-commit.path")
    #!/usr/bin/env bash
    set -euo pipefail
    systemctl --user enable --now linguist-commit.timer
    # Event-driven publish: fires linguist-commit the moment session_episode writes the
    # .last-rendered sentinel; the timer above stays on as the fallback sweep.
    systemctl --user enable --now linguist-commit.path
    echo "installed. timer schedule:"; systemctl --user list-timers linguist-commit.timer --no-pager
    echo "path unit:"; systemctl --user is-active linguist-commit.path

# Install the stack-wide Discord alerting (idempotent; re-run after editing any unit).
# Three pieces: (1) the templated OnFailure handler astra-alert@.service — Class C, pages
# when a monitored unit FAILS; (2) the astra-watchdog.{service,timer} — Class B liveness
# (Drive FUSE mount + pipeline timers armed), every 15 min, debounced; (3) re-installs the
# craig-sync + linguist-commit services that carry `OnFailure=astra-alert@%n.service`.
# All of these units are LINKED from the deploy checkout (they ExecStart its scripts and
# recipes, so each deploy updates them). The webhook is decrypted from SOPS at runtime
# (Class A — SigNoz's own Discord channel/rules — lives in SigNoz, not here). Needs
# lingering for the user (already on).
alert-install: (_unit-link "astra-alert@.service" "astra-watchdog.service" "astra-watchdog.timer" "craig-sync.service" "linguist-commit.service")
    #!/usr/bin/env bash
    set -euo pipefail
    systemctl --user enable --now astra-watchdog.timer
    echo "installed. watchdog schedule:"; systemctl --user list-timers astra-watchdog.timer --no-pager
    echo "smoke-test a Discord page with: {{deploy_root}}/deploy/systemd/alert-notify.sh test"
    echo "one-time root step for vanished-mount auto-remediation: just alert-sudoers-install"

# One-time ROOT step: install the NOPASSWD sudoers drop-ins the watchdog's
# auto-remediations need — astra-gdrive (force-restart gdrive.service when the Drive
# mount VANISHES) and astra-ethtool (retrain/renegotiate a frame-corrupting NIC link).
# Validates each with visudo before installing so a bad file can never lock sudo.
# Prompts for your password (system-scope install). Verification is non-destructive
# (`sudo -n -l <cmd>` — never actually restarts the mount or blips the link).
alert-sudoers-install:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{justfile_directory()}}"
    for src in deploy/systemd/sudoers.d/astra-gdrive deploy/systemd/sudoers.d/astra-ethtool; do
      sudo visudo -cf "$src"                     # syntax-check BEFORE touching /etc
      sudo install -o root -g root -m 0440 "$src" "/etc/sudoers.d/$(basename "$src")"
      echo "installed /etc/sudoers.d/$(basename "$src")"
    done
    echo "verifying passwordless commands are allowed:"
    sudo -n -l /usr/bin/systemctl restart gdrive.service >/dev/null && echo "  OK — gdrive restart"
    sudo -n -l /usr/sbin/ethtool -r enp4s0 >/dev/null && echo "  OK — NIC retrain"
    sudo -n -l /usr/sbin/ethtool -s enp4s0 advertise 0x008 >/dev/null && echo "  OK — NIC 100FD fallback — watchdog can now self-heal the link"

# --- backups (0037 OPS-6) ---
# Nightly snapshot to the sda disk (/ruby/data/plex/data/astra-backups): pg_dump of the
# three astra databases, the irreplaceable state dirs (hardlinked against the previous
# snapshot), and the SigNoz alert rules. Keeps 14 daily + 8 weekly snapshots. Everything
# lives in deploy/systemd/astra-backup.sh (header = what, why, retention, manual restore).

# Idempotent; re-run after editing the units. The units are linked from the deploy checkout
# (the service ExecStarts its astra-backup.sh), and a failed run pages through astra-alert@
# (Class C).
# Install + enable the nightly backup timer (03:30, Persistent).
backup-install: (_unit-link "astra-backup.service" "astra-backup.timer")
    #!/usr/bin/env bash
    set -euo pipefail
    systemctl --user enable --now astra-backup.timer
    systemctl --user list-timers astra-backup.timer --no-pager

# Take one snapshot now, in the foreground (waits if the nightly run holds the lock).
backup-now:
    "{{justfile_directory()}}/deploy/systemd/astra-backup.sh" run

# Each Postgres dump goes into a throwaway --network none container and its row counts are
# compared with dump time and live; state dirs get file counts + a sha256 sample vs the
# source; rule files must parse. Read-only against the live stack.
# Prove the newest snapshot (or the named one) restores.
backup-restore-test snapshot="":
    "{{justfile_directory()}}/deploy/systemd/astra-backup.sh" restore-test {{snapshot}}

# Rules only — never the notification channel, which holds the webhook. The nightly backup
# logs a warning when the live rules drift from the committed copy.
# Re-export the live SigNoz alert rules into deploy/signoz/rules/ for git.
signoz-rules-export:
    "{{justfile_directory()}}/deploy/systemd/astra-backup.sh" export-rules "{{justfile_directory()}}/deploy/signoz/rules"

# List Cartesia voices (mouthpiece's TTS backend) so the two podcast-persona
# `cartesia-voice-id`s in being.kdl can be picked. Decrypts the key from SOPS on the host
# (never written to disk); pass a query to filter by name/description, e.g.
# `just mouthpiece-cartesia-voices "british"`. Prints id · name · gender · language · tagline.
mouthpiece-cartesia-voices q="":
    #!/usr/bin/env bash
    set -euo pipefail
    export SOPS_AGE_KEY_FILE="{{sops_age_key}}"
    key="$(sops -d --extract '["cartesia_api_key"]' "{{sops_file}}")"
    q="{{q}}"
    curl -sS -G "https://api.cartesia.ai/voices" \
      -H "Authorization: Bearer $key" -H "Cartesia-Version: 2026-08-14" \
      --data-urlencode "limit=100" --data-urlencode "language=en" ${q:+--data-urlencode "q=$q"} \
    | python3 -c 'import json,sys; d=json.load(sys.stdin); [print(f"{v[\"id\"]}  {v[\"name\"]:<28} {v.get(\"gender\",\"\"):<15} {v.get(\"language\",\"\"):<6} {v.get(\"tagline\") or v.get(\"description\",\"\")}") for v in d["data"]]; print(f"-- {len(d[\"data\"])} voices, has_more={d.get(\"has_more\")}", file=sys.stderr)'

# Migrate faerrin's historical episode CATALOG (script + digest) into astra's
# episodes corpus (step 2 — catalog union), so episodes_index + the snapshot include
# the back-catalog alongside live pipeline renders. Idempotent; live renders win for
# any date both produced; audio is separate (`mouthpiece-seed`). Source override:
# MOUTHPIECE_AUDIO_SRC (same store the audio seed uses → catalog + audio stay aligned).
mouthpiece-migrate-history:
    MOUTHPIECE_AUDIO_SRC="{{mouthpiece_audio_src}}" {{uv_bin}} run python -m astra_mouthpiece.migrate

# Regenerate the mouthpiece snapshot (config data.mouthpiece-snapshot/episodes-index.json,
# in the astra-data clone) from the live corpus — the frontend's single build input
# (step 4/5). Writes only; linguist-commit commits it to astra-data. Ensures the historical back-catalog is present (idempotent migrate),
# then rebuilds the catalog over the full corpus (migrated ∪ live renders). Deterministic,
# so a no-op when nothing new landed. Run on the HOST (needs uv + ffprobe + the repo; the
# dagster container can't reach the committed snapshot/ dir). Pairs with `mouthpiece-seed`
# (audio) + a frontend redeploy — all three are wired into the linguist-commit timer.
mouthpiece-publish:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{justfile_directory()}}"
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
    mkdir -p "{{data_root}}"/audio/mouthpiece
    # The faerrin historical back-catalog was decommissioned 2026-07-04; its mp3s already
    # live in the persistent {{data_root}}/audio/mouthpiece volume from earlier seeds. Only
    # mount /hist if the source still exists — otherwise Docker would recreate the deleted
    # path as an empty root-owned dir. Live renders are seeded regardless.
    hist_mount=()
    if [ -d "{{mouthpiece_audio_src}}" ]; then hist_mount=(-v "{{mouthpiece_audio_src}}":/hist:ro); fi
    docker run --rm \
      -v "{{data_root}}"/audio/mouthpiece:/audio \
      "${hist_mount[@]}" \
      -v "{{mouthpiece_episodes}}":/live:ro \
      alpine sh -c '
        set -e
        for f in /hist/*.episode.mp3; do [ -e "$f" ] || continue; cp "$f" "/audio/$(basename "$f" .episode.mp3).mp3"; done
        find /live -name "*.episode.mp3" -exec sh -c "cp \"\$1\" \"/audio/\$(basename \"\$1\" .episode.mp3).mp3\"" _ {} \;
        n=$(ls -1 /audio/*.mp3 2>/dev/null | wc -l); echo "seeded $n episode(s) into {{data_root}}/audio/mouthpiece"; ls -1 /audio'

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
    mkdir -p "{{data_root}}"/audio/akasha
    docker run --rm \
      -v "{{data_root}}"/audio/akasha:/audio \
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
        n=$(ls -1 /audio/*.mp3 2>/dev/null | wc -l); echo "seeded $n session(s) into {{data_root}}/audio/akasha"'

# One-time: copy the orator music library out of the old named volume into the data
# root's bind dir (orator-audio is runtime-ingested, NOT re-seedable). Run with the
# orator-backend container stopped. chowns to 1000 so the now-1000 orator-backend writes
# there. Safe to drop the old volume once verified.
orator-audio-migrate:
    #!/usr/bin/env bash
    set -euo pipefail
    mkdir -p "{{data_root}}"/audio/orator
    docker run --rm \
      -v astra-orator-audio:/from:ro \
      -v "{{data_root}}"/audio/orator:/to \
      alpine sh -c 'cp -a /from/. /to/ && chown -R 1000:1000 /to && echo "migrated orator audio -> {{data_root}}/audio/orator"'

# One-time: copy a Postgres data dir out of its old named volume into the data root's
# bind dir, preserving uid-70/0700 so the postgres entrypoint accepts PGDATA. Run with the
# DB container STOPPED. Usage: `just pg-migrate dagster` (or weal / orator).
pg-migrate name:
    #!/usr/bin/env bash
    set -euo pipefail
    mkdir -p "{{data_root}}"/postgres
    docker run --rm \
      -v astra-{{name}}-pg:/from:ro \
      -v "{{data_root}}"/postgres:/parent \
      alpine sh -c '
        set -e
        rm -rf /parent/{{name}}; mkdir /parent/{{name}}
        cp -a /from/. /parent/{{name}}/
        chown -R 70:70 /parent/{{name}}; chmod 700 /parent/{{name}}
        echo "migrated astra-{{name}}-pg -> {{data_root}}/postgres/{{name}}"'

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
    cd "{{justfile_directory()}}"
    # codex.data-path (config.kdl, under data.root): the scripts below write there via
    # @astra/config; this recipe needs it for the assay artifact and the report.
    codex_data="$({{uv_bin}} run python -m astra_ontology_config codex.data-path)"
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
      mkdir -p "$codex_data/assay"
      cp apps/assay/out/spell-power.json "$codex_data/assay/spell-power.json"
      echo "codex-refresh: assay artifact regenerated + placed."
    else
      echo "codex-refresh: assay export failed or unavailable — keeping the previous artifact." >&2
    fi
    echo ""
    echo "codex-refresh: done. report.md summary:"
    head -n 40 "$codex_data/corpus/report.md"
    echo ""
    # D29-57: corpusFs.ts caches the corpus per category per-process, so a running
    # container keeps serving stale categories after a host-side refresh until it
    # restarts — a restart is the cheap, deterministic flush (the Pagefind
    # staticMount needs no restart, it's per-request fail-soft). Guarded so a fresh
    # host / no-docker / not-yet-deployed environment never fails this recipe. The restart
    # goes through `just deploy --restart` (takes the deploy lock, logs to history.jsonl) but
    # builds nothing: the corpus is a runtime mount, not image content.
    echo "codex-refresh: checking for a running astra-codex container (D29-57)..."
    if command -v docker >/dev/null 2>&1 && [ -n "$(docker ps -q -f name='^astra-codex$' 2>/dev/null || true)" ]; then
      echo "codex-refresh: astra-codex is running — restarting to flush corpus caches..."
      "{{just_executable()}}" deploy --restart codex
    else
      echo "codex-refresh: astra-codex not running (or docker unavailable) — skipping restart."
    fi

# Build the codex Pagefind search index (D29-34) from the current corpus at
# <codex.data-path>/corpus/ into <codex.data-path>/search/pagefind/, served at
# /pagefind/ via server.ts's staticMount. HOST-ONLY — the native Pagefind
# indexer peaks at ~3.8 GB RSS during writeFiles over the full 46k-entity
# corpus (measured) — this must NEVER run in CI, a Docker build, or `vite
# build`; it's a deliberate, standalone, host-run step, same posture as
# codex-refresh (which calls this after the transform). The server picks up
# a freshly-built index with no restart (StaticMount fails soft per-request).
codex-search-index:
    pnpm --filter @astra/codex search:build

# --- weal engine (0032 D32-13) ---

# Rebuild the committed @astra/weal-engine wasm artifact from
# libs/rust/weal-engine: cargo (wasm32 release; the 8 MiB stack flag lives in
# the crate's .cargo/config.toml, target-scoped) → wasm-bindgen --target
# nodejs into libs/ts/weal-engine/gen → wasm-opt -O2 in place → re-write
# gen/package.json {"type":"commonjs"} (wasm-bindgen won't; the CJS marker is
# what lets the ESM wrapper createRequire the glue). BOTH tools are
# HARD-REQUIRED at pinned versions (committed bytes must be
# machine-independent): wasm-bindgen-cli 0.2.127 (== the crate's wasm-bindgen
# pin; `cargo install wasm-bindgen-cli --version 0.2.127 --locked`) and
# binaryen wasm-opt version 124 (GitHub release binary → ~/.local/bin).
# Deterministic: two runs → byte-identical gen/ (recorded at S5).
weal_bindgen_version := "0.2.127"
weal_wasm_opt_version := "124"
weal-engine-build:
    #!/usr/bin/env bash
    set -euo pipefail
    cd libs/rust/weal-engine
    gen="../../ts/weal-engine/gen"
    command -v wasm-bindgen >/dev/null || { echo "FATAL: wasm-bindgen not installed — cargo install wasm-bindgen-cli --version {{weal_bindgen_version}} --locked" >&2; exit 1; }
    command -v wasm-opt >/dev/null || { echo "FATAL: wasm-opt not installed — binaryen version_{{weal_wasm_opt_version}} release into ~/.local/bin" >&2; exit 1; }
    bg_v="$(wasm-bindgen --version | awk '{print $2}')"
    [ "$bg_v" = "{{weal_bindgen_version}}" ] || { echo "FATAL: wasm-bindgen $bg_v != pinned {{weal_bindgen_version}}" >&2; exit 1; }
    wo_v="$(wasm-opt --version | awk '{print $3}')"
    [ "$wo_v" = "{{weal_wasm_opt_version}}" ] || { echo "FATAL: wasm-opt $wo_v != pinned {{weal_wasm_opt_version}}" >&2; exit 1; }
    cargo build --release --target wasm32-unknown-unknown
    wasm-bindgen --target nodejs --out-dir "$gen" target/wasm32-unknown-unknown/release/weal_engine.wasm
    wasm-opt -O2 -o "$gen/weal_engine_bg.wasm" "$gen/weal_engine_bg.wasm"
    printf '{\n  "type": "commonjs"\n}\n' > "$gen/package.json"
    sha256sum "$gen"/weal_engine_bg.wasm "$gen"/weal_engine.js

# --- heartwood (0033) ---

# Warm the heartwood agent's sandbox (0033 D33-3): dspy's PythonInterpreter runs Deno +
# Pyodide, and its runner.js imports an UNPINNED `npm:pyodide` + deno.land/std, fetched into
# the Deno cache on first use (network). Run once per host, and again after a Deno-cache wipe
# or a new Pyodide release — then re-run gate C (the scripted real-Deno test). Prints the
# resolved Pyodide version for the build record. dspy calls bare `deno`, hence the PATH;
# `prepare_sandbox_env` also sets DENO_NO_PACKAGE_JSON (the repo's package.json otherwise
# hides npm:pyodide) and a real-path DENO_DIR ($HOME is a symlink; Deno's read grant must
# name the resolved cache path) — the same env every agent run uses.
heartwood-sandbox-warm:
    #!/usr/bin/env bash
    set -euo pipefail
    export PATH="$HOME/.deno/bin:$PATH"
    deno --version | head -1
    {{uv_bin}} run python -c 'from astra_heartwood.agent.run import make_interpreter as mk, sandbox_version as v; i = mk(); print("sandbox:", i.execute("print(1)").strip()); print("pyodide:", v(i)); i.shutdown()'

# Run the heartwood agent over ONE session and publish its edits to akasha with no human
# review (0033 §5) — PAID (OpenRouter LLM calls) and LIVE (pushes + redeploys akasha).
# Every git step runs in the astra-data clone (config.kdl data.content-root), which holds
# the wiki content, its snapshot, this ledger and the entity registry — never the code repo:
#   just heartwood-agent 2025-8-28              run → publish → commit → push → redeploy
#   just heartwood-agent 2025-8-28 --dry-run    run + artifacts only; prints diff + summary
#   just heartwood-agent 2025-8-28 --no-push    commit locally, no push/redeploy (backfill)
#   just heartwood-agent 2025-8-28 --dry-run --model=<id> [--sub-model=<id>]
#                                               override heartwood.model / sub-model for this
#                                               run only (model comparisons; no config edit)
# Steps: (0) refuse unless the wiki content, the ledger and the entity registry are clean
# in the clone and its HEAD is on main; (1)
# `astra-heartwood-agent run` stages + runs (artifacts under
# <heartwood.artifacts-path>/<date>/<run-id>/); (2) publish-sync applies the change-set to the live
# corpus (aborts, writing nothing, if a touched page changed live); (3) whole-corpus
# validate; (4) akasha-snapshot, then reseed entity.kdl from the new snapshot (keeps the
# registry's drift-gate test green and lets later sessions' resolve_name see these pages),
# then the unresolved-link delta (reported, not enforced); on a 3/4 failure it prints the
# exact restore command; (5) ledger-append + a path-scoped `commit --only` of content,
# snapshot, ledger and entity.kdl (body = counts + model + cost + changelog, wrapped at
# 100); (6) `_heartwood-push-deploy`: `_astra-data-push` (fetch, rebase onto origin/main
# when it moved, push), then redeploy akasha-frontend.
# Exit codes: 0 ok · 1 run failed · 2 run incomplete (iteration cap) · 3 publish conflict ·
# 4 publish refused · 6 dirty corpus/ledger/registry or not on main · 7 validate/snapshot/seed failed
# (restore printed) · 8 commit/rebase/push failed · 9 redeploy failed · 10 git-publish
# lock busy for 30 min, nothing written (0036) · 64 bad flag.
# Run + publish one session via the heartwood agent (PAID + LIVE; --dry-run / --no-push).
heartwood-agent date *flags:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{justfile_directory()}}"
    export PATH="$HOME/.deno/bin:$PATH"   # dspy launches bare `deno`
    date="{{date}}"; dry_run=0; push=1; model_flags=()
    for f in {{flags}}; do
      case "$f" in
        --dry-run) dry_run=1 ;;
        --no-push) push=0 ;;
        --model=?*) model_flags+=(--model "${f#--model=}") ;;
        --sub-model=?*) model_flags+=(--sub-model "${f#--sub-model=}") ;;
        *) echo "heartwood-agent: unknown flag '$f' (use --dry-run / --no-push / --model=<id> / --sub-model=<id>)" >&2; exit 64 ;;
      esac
    done
    hw() { "{{uv_bin}}" run astra-heartwood-agent "$@"; }
    # node for the validate step: PATH, else the newest nvm install (a systemd unit's PATH
    # has no nvm — 0036 review B1). Same order as astra_heartwood.agent.validate.find_node.
    node_bin="$(command -v node || ls -1d "$HOME"/.nvm/versions/node/v*/bin/node 2>/dev/null | sort -V | tail -n 1)"
    if [ -z "$node_bin" ]; then echo "heartwood: node not found (PATH or ~/.nvm) — nothing done" >&2; exit 1; fi
    # The astra-data clone + the wiki datasets in it, from config.kdl (absolute paths; git
    # accepts them as pathspecs). Every git call below targets the clone.
    mapfile -t dpaths < <("{{uv_bin}}" run python -m astra_ontology_config data.content-root \
      data.akasha-content data.akasha-snapshot data.heartwood-ledger data.entity-registry)
    if [ "${#dpaths[@]}" -ne 5 ]; then echo "heartwood: could not read data paths from config" >&2; exit 1; fi
    repo="${dpaths[0]}"; content="${dpaths[1]}"; snapshot="${dpaths[2]}"; ledger="${dpaths[3]}"; entity="${dpaths[4]}"
    dgit() { git -C "$repo" "$@"; }
    if [ ! -d "$repo/.git" ]; then echo "heartwood: the astra-data clone $repo is missing — nothing done" >&2; exit 6; fi
    restore="git -C $repo checkout -- $content $snapshot $entity && git -C $repo clean -fd $content"
    # (0) a dirty corpus would be staged into the run and then committed under its name.
    dirty="$(dgit status --porcelain -- "$content" "$ledger" "$entity")"
    if [ -n "$dirty" ]; then
      echo "heartwood-agent: refusing — uncommitted changes under $content / $ledger / $entity:" >&2
      printf '%s\n' "$dirty" >&2
      exit 6
    fi
    if [ "$dry_run" = 0 ] && [ "$(dgit rev-parse --abbrev-ref HEAD)" != main ]; then
      echo "heartwood-agent: refusing — $repo is not on main (publishes push origin main)" >&2
      exit 6
    fi
    tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
    cp "$snapshot/akasha-snapshot.json" "$tmp/snapshot-before.json"
    # (1) stage + run. The CLI's last stdout line is RUN_DIR=<path>.
    run_flags=("${model_flags[@]}"); if [ "$dry_run" = 1 ]; then run_flags+=(--dry-run); fi
    rc=0; hw run "$date" "${run_flags[@]}" | tee "$tmp/run.out" || rc=$?
    run_dir="$(sed -n 's/^RUN_DIR=//p' "$tmp/run.out" | tail -n 1)"
    if [ "$rc" -ne 0 ]; then
      echo "heartwood-agent: run exited $rc (1 failed / 2 incomplete) — nothing published${run_dir:+; artifacts: $run_dir}" >&2
      exit "$rc"
    fi
    if [ -z "$run_dir" ]; then echo "heartwood-agent: run printed no RUN_DIR line" >&2; exit 1; fi
    if [ "$dry_run" = 1 ]; then
      echo "heartwood-agent: dry run — nothing published."
      echo "  diff:    $run_dir/diff.patch"
      echo "  summary: $run_dir/summary.json"
      exit 0
    fi
    # One git publisher at a time (0036 D36-5): from publish-sync through push + redeploy, so
    # linguist-commit never builds akasha from unvalidated content. The agent run above stays
    # outside. The lock is released when this script exits; _heartwood-push-deploy (a child)
    # never takes it itself.
    mkdir -p "$(dirname "{{git_publish_lock}}")"
    exec 9>"{{git_publish_lock}}"
    if ! flock -w 1800 9; then
      echo "heartwood-agent: git-publish lock busy for 30 min — nothing written; re-run the date" >&2
      exit 10
    fi
    # (2) apply the change-set to the live corpus (3 = conflict, 4 = refused; nothing written).
    rc=0; hw publish-sync "$run_dir" || rc=$?
    if [ "$rc" -ne 0 ]; then
      echo "heartwood-agent: publish-sync exited $rc — the live corpus is untouched; re-run the date" >&2
      exit "$rc"
    fi
    fail_restore() {
      echo "heartwood-agent: $1 FAILED after publish-sync — $content holds the run's unvalidated edits." >&2
      echo "  inspect, then restore with:  $restore" >&2
      exit 7
    }
    # (3) whole-corpus validation, (4) snapshot, registry reseed (reads the new snapshot, so
    # it must follow it) + unresolved-link delta (reported only).
    "$node_bin" --import ./libs/ts/site-kit/src/nodeTsResolve.mjs \
      libs/ts/vellum-lang/scripts/validate-corpus.ts --dir "$content" || fail_restore "corpus validation"
    OTEL_SDK_DISABLED=true "{{uv_bin}}" run akasha-snapshot || fail_restore "akasha-snapshot"
    OTEL_SDK_DISABLED=true "{{uv_bin}}" run astra-ontology-entity-seed || fail_restore "entity registry seed"
    hw unresolved-delta "$tmp/snapshot-before.json" || echo "heartwood-agent: (unresolved-delta report failed — not fatal)" >&2
    # (5) ledger line + path-scoped commit. --only: anything else staged stays out of it.
    if dgit ls-files --error-unmatch "$ledger" >/dev/null 2>&1; then undo_ledger="git -C $repo checkout -- $ledger"
    else undo_ledger="rm -f $ledger"; fi
    fail_commit() {
      echo "heartwood-agent: $1 FAILED — published but uncommitted. Restore with:" >&2
      echo "  git -C $repo reset -q -- $content $snapshot $ledger $entity && $restore && $undo_ledger" >&2
      exit 8
    }
    hw ledger-append "$run_dir" || fail_commit "ledger-append"
    dgit add "$content" "$snapshot" "$ledger" "$entity" || fail_commit "git add"
    hw commit-message "$run_dir" >"$tmp/msg" || fail_commit "commit-message"
    dgit commit --only --no-verify -q -F "$tmp/msg" -- "$content" "$snapshot" "$ledger" "$entity" \
      || fail_commit "git commit"
    echo "heartwood-agent: committed $(dgit rev-parse --short HEAD) $(head -n 1 "$tmp/msg")"
    # (6) push + redeploy (the backfill passes --no-push and does this once at the end).
    if [ "$push" = 0 ]; then echo "heartwood-agent: --no-push — committed locally only"; exit 0; fi
    "{{just_executable()}}" -f "{{justfile()}}" _heartwood-push-deploy

# Shared tail of the heartwood recipes: `_astra-data-push` (fetch, rebase onto origin/main
# when it moved, push the astra-data clone — never the code repo), then rebuild + redeploy
# akasha-frontend via `just deploy` (which bakes the clone's committed HEAD). A failed push
# still redeploys (the commit is local and the deploy does not need it pushed), then exits 8.
# Exit 8 = rebase/push failed; 9 = redeploy failed. Rerunning this recipe retries both.
_heartwood-push-deploy:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{justfile_directory()}}"
    push_rc=0; "{{just_executable()}}" -f "{{justfile()}}" _astra-data-push || push_rc=$?
    if "{{just_executable()}}" -f "{{justfile()}}" deploy akasha-frontend; then
      echo "heartwood: akasha-frontend redeployed — edits live"
    else
      echo "heartwood: akasha redeploy FAILED (rerun: just deploy akasha-frontend)" >&2
      exit 9
    fi
    if [ "$push_rc" -ne 0 ]; then
      echo "heartwood: astra-data push FAILED — rerun: just _heartwood-push-deploy" >&2
      exit 8
    fi

# Undo ONE published heartwood session (0033 §5) — LIVE (pushes + redeploys akasha). All git
# runs in the astra-data clone (config data.content-root); its history starts at the
# snapshot commit, so a session published before astra-data existed has no commit to
# revert there (exit 4) — undo those by hand. `git revert --no-commit` of that session's commit (the latest `feat(akasha): heartwood
# agent <date>`), then agent-runs.jsonl, the snapshot and the entity registry
# (entity/entity.kdl) are restored from HEAD (all conflict on any
# non-latest revert), a `reverted` ledger line is appended, the snapshot regenerated, the
# registry reseeded from it, the corpus validated, and `revert(akasha): heartwood agent
# <date>` committed (--only), pushed, redeployed. A CONTENT conflict (a later session edited
# the same lines) aborts the revert untouched — resolve by hand. Exit codes: 4 not
# published / no commit found · 6 dirty tree or not on main · 7 snapshot/seed/validate
# failed · 8 revert/commit/push failed ·
# 9 redeploy failed.
# Undo one published heartwood session: revert commit + ledger line + push + redeploy (LIVE).
heartwood-revert date:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{justfile_directory()}}"
    export PATH="$HOME/.deno/bin:$PATH"
    date="{{date}}"
    hw() { "{{uv_bin}}" run astra-heartwood-agent "$@"; }
    # node for the validate step: PATH, else the newest nvm install (a systemd unit's PATH
    # has no nvm — 0036 review B1). Same order as astra_heartwood.agent.validate.find_node.
    node_bin="$(command -v node || ls -1d "$HOME"/.nvm/versions/node/v*/bin/node 2>/dev/null | sort -V | tail -n 1)"
    if [ -z "$node_bin" ]; then echo "heartwood: node not found (PATH or ~/.nvm) — nothing done" >&2; exit 1; fi
    # The astra-data clone + the wiki datasets in it, from config.kdl (absolute paths; git
    # accepts them as pathspecs). Every git call below targets the clone.
    mapfile -t dpaths < <("{{uv_bin}}" run python -m astra_ontology_config data.content-root \
      data.akasha-content data.akasha-snapshot data.heartwood-ledger data.entity-registry)
    if [ "${#dpaths[@]}" -ne 5 ]; then echo "heartwood: could not read data paths from config" >&2; exit 1; fi
    repo="${dpaths[0]}"; content="${dpaths[1]}"; snapshot="${dpaths[2]}"; ledger="${dpaths[3]}"; entity="${dpaths[4]}"
    dgit() { git -C "$repo" "$@"; }
    if [ ! -d "$repo/.git" ]; then echo "heartwood-revert: the astra-data clone $repo is missing" >&2; exit 6; fi
    dirty="$(dgit status --porcelain -- "$content" "$snapshot" "$ledger" "$entity")"
    if [ -n "$dirty" ]; then
      echo "heartwood-revert: refusing — uncommitted changes:" >&2; printf '%s\n' "$dirty" >&2; exit 6
    fi
    if [ "$(dgit rev-parse --abbrev-ref HEAD)" != main ]; then
      echo "heartwood-revert: refusing — $repo is not on main" >&2; exit 6
    fi
    hw ledger-revert "$date" --check || exit 4
    subject="feat(akasha): heartwood agent $date"
    commit="$(dgit log --format='%H%x09%s' -- "$ledger" \
      | awk -F'\t' -v s="$subject" '$2 == s && !found { print $1; found = 1 }')"
    if [ -z "$commit" ]; then echo "heartwood-revert: no commit titled '$subject' in $repo" >&2; exit 4; fi
    echo "heartwood-revert: reverting $(dgit log -1 --format='%h %s' "$commit")"
    undo="git -C $repo revert --abort  (if that refuses: git -C $repo reset --merge HEAD && git -C $repo clean -fd $content)"
    # One git publisher at a time (0036 D36-5): held from the revert's index changes through
    # push + redeploy.
    mkdir -p "$(dirname "{{git_publish_lock}}")"
    exec 9>"{{git_publish_lock}}"
    flock -w 1800 9 || { echo "heartwood-revert: git-publish lock busy for 30 min — nothing changed" >&2; exit 10; }
    rc=0; dgit revert --no-commit "$commit" || rc=$?
    if [ "$rc" -ne 0 ] && ! dgit rev-parse -q --verify REVERT_HEAD >/dev/null; then
      echo "heartwood-revert: git revert failed before applying anything (exit $rc)" >&2; exit 8
    fi
    # The ledger, snapshot + registry are regenerated below, so their (expected) conflicts
    # don't matter.
    dgit checkout HEAD -- "$ledger" "$snapshot" "$entity"
    unmerged="$(dgit diff --name-only --diff-filter=U)"
    if [ -n "$unmerged" ]; then
      echo "heartwood-revert: content conflicts with later edits — aborting, nothing changed:" >&2
      printf '%s\n' "$unmerged" | sed 's/^/  /' >&2
      dgit revert --abort || echo "  abort failed — run: $undo" >&2
      exit 8
    fi
    fail() { echo "heartwood-revert: $1 FAILED — restore with: $undo" >&2; exit "$2"; }
    hw ledger-revert "$date" || fail "ledger-revert" 8
    OTEL_SDK_DISABLED=true "{{uv_bin}}" run akasha-snapshot || fail "akasha-snapshot" 7
    OTEL_SDK_DISABLED=true "{{uv_bin}}" run astra-ontology-entity-seed || fail "entity registry seed" 7
    "$node_bin" --import ./libs/ts/site-kit/src/nodeTsResolve.mjs \
      libs/ts/vellum-lang/scripts/validate-corpus.ts --dir "$content" || fail "corpus validation" 7
    dgit add "$content" "$snapshot" "$ledger" "$entity" || fail "git add" 8
    dgit commit --only --no-verify -q \
      -m "revert(akasha): heartwood agent $date" -m "This reverts commit $commit." \
      -- "$content" "$snapshot" "$ledger" "$entity" || fail "git commit" 8
    echo "heartwood-revert: committed $(dgit rev-parse --short HEAD)"
    "{{just_executable()}}" -f "{{justfile()}}" _heartwood-push-deploy

# Replay every pending faerrin session oldest-first (0033 §5) — PAID + LIVE, hours long.
# Always runs DETACHED as the transient user unit `heartwood-backfill` (survives the shell;
# output → <data root>/heartwood/backfill.log; follow with `tail -f`). `from` = first date
# (inclusive); dates the ledger shows as published are skipped, so re-running resumes.
# While it runs, linguist-commit.{timer,path} are stopped (they push the astra-data clone
# whenever it is ahead, and take the git-publish lock) and <data root>/heartwood/backfill.lock tells the watchdog not to page about it. The
# loop's EXIT trap re-arms both units and removes the lock; a HARD-killed backfill (SIGKILL,
# reboot) skips the trap — then run `just heartwood-backfill-reset`. Stop it cleanly with
# `systemctl --user stop heartwood-backfill` (the trap still runs). The loop always runs the
# deploy checkout's recipes (production code at a pushed sha), whichever checkout launched it.
# Replay all pending faerrin sessions, detached + budget-capped (PAID + LIVE).
heartwood-backfill from="":
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{justfile_directory()}}"
    log="{{heartwood_dir}}/backfill.log"
    mkdir -p "{{heartwood_dir}}"
    if systemctl --user is-active --quiet heartwood-backfill.service; then
      echo "heartwood-backfill: already running — tail -f $log" >&2; exit 1
    fi
    systemctl --user reset-failed heartwood-backfill.service 2>/dev/null || true
    # The user manager's PATH lacks nvm's node and ~/.deno/bin — hand the unit ours.
    env_args=(--setenv=PATH="$HOME/.deno/bin:$PATH" --setenv=HOME="$HOME")
    if [ -n "${SSH_AUTH_SOCK:-}" ]; then env_args+=(--setenv=SSH_AUTH_SOCK="$SSH_AUTH_SOCK"); fi
    systemd-run --user --unit=heartwood-backfill --collect \
      --working-directory="{{deploy_root}}" "${env_args[@]}" \
      -p StandardOutput=append:"$log" -p StandardError=append:"$log" \
      "{{just_executable()}}" -f "{{deploy_root}}/justfile" _heartwood-backfill-loop "{{from}}"
    echo "heartwood-backfill: launched detached — tail -f $log"
    echo "  stop: systemctl --user stop heartwood-backfill   (hard-killed? just heartwood-backfill-reset)"

# The backfill's body (run by `heartwood-backfill` inside its systemd unit — not directly).
# Before each date: `budget-check` (stop when the ledger's summed cost_usd >= the config's
# heartwood backfill-budget-usd, or any ledger cost is unknown — so the last run may
# overshoot by its own cost). Each date = `heartwood-agent <date> --no-push`; any non-zero
# exit stops the loop. Stopped or done, it pushes what is committed + redeploys akasha once.
_heartwood-backfill-loop from:
    #!/usr/bin/env bash
    # No -e: every failure below is handled explicitly so the push + re-arm still happen.
    set -uo pipefail
    cd "{{justfile_directory()}}" || exit 1
    export PATH="$HOME/.deno/bin:$PATH"
    from="{{from}}"
    lock="{{heartwood_dir}}/backfill.lock"
    hw() { "{{uv_bin}}" run astra-heartwood-agent "$@"; }
    ts() { date -u +%FT%TZ; }
    rearm() {
      rm -f "$lock"
      if systemctl --user start linguist-commit.timer linguist-commit.path; then
        echo "heartwood-backfill: linguist-commit timer + path re-armed"
      else
        echo "heartwood-backfill: re-arm FAILED — run: just heartwood-backfill-reset" >&2
      fi
      # 0036: re-arm the request runner and drain anything Dagster filed meanwhile (no-block:
      # a drained request can run for an hour).
      systemctl --user start heartwood-request.timer heartwood-request.path 2>/dev/null \
        && systemctl --user start --no-block heartwood-request.service 2>/dev/null \
        || echo "heartwood-backfill: heartwood-request re-arm skipped (units not installed?)" >&2
      echo "=== heartwood backfill end $(ts)"
    }
    echo "=== heartwood backfill start $(ts) (from: ${from:-the first session})"
    mkdir -p "{{heartwood_dir}}"
    touch "$lock"            # before the stop, so the watchdog never sees a disarmed timer
    trap rearm EXIT
    trap 'exit 143' TERM INT HUP
    systemctl --user stop linguist-commit.timer linguist-commit.path \
      || { echo "heartwood-backfill: could not stop linguist-commit units" >&2; exit 1; }
    # The 0036 request runner too: stop its triggers, then wait out an in-flight run (it may
    # be publishing a date this loop would otherwise run again).
    systemctl --user stop heartwood-request.timer heartwood-request.path 2>/dev/null || true
    for svc in linguist-commit.service heartwood-request.service; do
      waited=0
      while :; do
        state="$(systemctl --user is-active "$svc")"
        case "$state" in active|activating|deactivating|reloading) ;; *) break ;; esac
        if [ "$waited" -ge 1800 ]; then
          echo "heartwood-backfill: $svc still $state after 30 min — aborting" >&2; exit 1
        fi
        echo "heartwood-backfill: waiting for $svc ($state)…"
        sleep 15; waited=$((waited + 15))
      done
    done
    sessions_args=(); if [ -n "$from" ]; then sessions_args=(--from "$from"); fi
    if ! pending="$(hw sessions "${sessions_args[@]}")"; then
      echo "heartwood-backfill: listing sessions FAILED" >&2; exit 1
    fi
    todo=(); while IFS= read -r d; do [ -n "$d" ] && todo+=("$d"); done <<<"$pending"
    echo "heartwood-backfill: ${#todo[@]} pending session(s): ${todo[*]}"
    published=0; stop=""; rerun=""
    for d in "${todo[@]}"; do
      if ! hw budget-check; then stop="budget"; rerun="$d"; break; fi
      echo "--- $(ts) $d"
      rc=0; "{{just_executable()}}" -f "{{justfile()}}" heartwood-agent "$d" --no-push || rc=$?
      if [ "$rc" -ne 0 ]; then
        stop="heartwood-agent $d exited $rc (1 failed · 2 incomplete · 3 conflict · 4 refused · 6 dirty · 7 validate/snapshot/seed · 8 commit)"
        rerun="$d"; break
      fi
      published=$((published + 1))
    done
    echo "heartwood-backfill: published $published session(s) this run"
    # Push + redeploy once if the astra-data clone has unpushed commits (never the code repo).
    repo="$("{{uv_bin}}" run python -m astra_ontology_config data.content-root)"
    if [ -n "$(git -C "$repo" rev-list origin/main..HEAD 2>/dev/null)" ]; then
      "{{just_executable()}}" -f "{{justfile()}}" _heartwood-push-deploy \
        || echo "heartwood-backfill: push/redeploy FAILED — rerun: just _heartwood-push-deploy" >&2
    fi
    if [ -n "$stop" ]; then
      echo "heartwood-backfill: STOPPED — $stop"
      echo "heartwood-backfill: resume with: just heartwood-backfill $rerun"
      exit 1
    fi
    echo "heartwood-backfill: complete"

# Recover from a HARD-killed backfill (its EXIT trap never ran): re-arm linguist-commit's
# timer + path units and remove the watchdog lock. Refuses while the backfill still runs.
# Re-arm linguist-commit + drop the watchdog lock after a hard-killed backfill.
heartwood-backfill-reset:
    #!/usr/bin/env bash
    set -euo pipefail
    if systemctl --user is-active --quiet heartwood-backfill.service; then
      echo "heartwood-backfill-reset: the backfill is still running — stop it first:" >&2
      echo "  systemctl --user stop heartwood-backfill   (its EXIT trap re-arms + unlocks)" >&2
      exit 1
    fi
    systemctl --user reset-failed heartwood-backfill.service 2>/dev/null || true
    systemctl --user start linguist-commit.timer linguist-commit.path
    rm -f "{{heartwood_dir}}/backfill.lock"
    systemctl --user start heartwood-request.timer heartwood-request.path 2>/dev/null \
      && systemctl --user start --no-block heartwood-request.service 2>/dev/null \
      || echo "heartwood-backfill-reset: heartwood-request units not installed — skipped" >&2
    echo "heartwood-backfill-reset: linguist-commit.timer $(systemctl --user is-active linguist-commit.timer), .path $(systemctl --user is-active linguist-commit.path); lock removed"

# --- heartwood in Dagster (0036) ---
# The host side of Dagster's session_wiki asset: run `just heartwood-agent <date>` for every
# pending request under heartwood.requests-path, oldest first, and write each result —
# PAID + LIVE per request (the agent run + publish). Started by heartwood-request.path
# (fires when Dagster files a request) and heartwood-request.timer (hourly fallback); safe
# to run by hand (no-op with nothing pending). The systemd user PATH lacks uv/just/node, so
# the runner resolves each tool itself (preflight) — never call bare `uv` here.
heartwood-requests:
    cd "{{justfile_directory()}}" && JUST="{{just_executable()}}" UV="{{uv_bin}}" "{{uv_bin}}" run astra-heartwood-agent drain-requests

# Links the units from the deploy checkout (see _unit-link; the service runs the recipe
# there, with the venv + node deps deploy.sh keeps in sync).
# Install + start the 0036 request runner units (idempotent; re-run after editing them).
heartwood-request-install: artifacts-init (_unit-link "heartwood-request.service" "heartwood-request.path" "heartwood-request.timer")
    #!/usr/bin/env bash
    set -euo pipefail
    systemctl --user enable --now heartwood-request.path heartwood-request.timer
    echo "path unit: $(systemctl --user is-active heartwood-request.path)"
    systemctl --user list-timers heartwood-request.timer --no-pager

# --- mouthpiece producer (0034) ---
# Warm the dspy sandbox (Deno + Pyodide) the producer runs in — idempotent; the first run
# fetches Pyodide into DENO_DIR (network), later runs are offline.
mouthpiece-sandbox-warm:
    #!/usr/bin/env bash
    set -euo pipefail
    export PATH="$HOME/.deno/bin:$PATH"
    deno --version | head -1
    {{uv_bin}} run python -c 'from astra_llm.rlm import make_interpreter as mk, sandbox_version as v; i = mk(); print("sandbox:", i.execute("print(1)").strip()); print("pyodide:", v(i)); i.shutdown()'

# The 0034 comparison for ONE session — PAID (OpenRouter: the producer RLM + one two-pass
# script per experiment-models arm, ≈ $2–3), never live: writes only under
# <data root>/mouthpiece/experiments/<date>/<run>/ (no TTS, nothing under episodes/, no commit).
#   just mouthpiece-experiment 2026-10-5
#   just mouthpiece-experiment 2026-10-5 --arm glm-5.3
#   just mouthpiece-experiment 2026-10-5 --reuse-brief /ruby/data/astra-state/mouthpiece/experiments/2026-10-5/<run>
mouthpiece-experiment date *flags: mouthpiece-sandbox-warm
    cd "{{justfile_directory()}}" && {{uv_bin}} run astra-mouthpiece-producer experiment {{date}} {{flags}}

# The prediction-roundtable special. dossier + script are PAID (OpenRouter) and write only
# under <data root>/mouthpiece/experiments/roundtable-<latest>/<run>/; render is PAID + LIVE.
#   just mouthpiece-roundtable dossier                  survey the main campaign → mystery file
#   just mouthpiece-roundtable script <run-dir>         ~45-min roundtable script from it
#   just mouthpiece-roundtable render <run-dir>         TTS + assemble into episodes/ + auto-publish
mouthpiece-roundtable *args: mouthpiece-sandbox-warm
    cd "{{justfile_directory()}}" && export PATH="$HOME/.deno/bin:$PATH" && {{uv_bin}} run astra-mouthpiece-roundtable {{args}}

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
