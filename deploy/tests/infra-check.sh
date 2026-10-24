#!/usr/bin/env bash
# The infra lane (`just infra-check`, CI job infra-check): static checks of the deploy artifacts,
# so compose, Caddy, shell, systemd and Dockerfile mistakes fail here instead of in a live deploy.
#
#   compose     `docker compose config -q` on deploy/docker-compose.yml (it includes SigNoz's).
#   caddy       `caddy adapt` and `caddy validate` on sites.caddyfile, imported by
#               deploy/tests/edge-stub.caddyfile (the parent's `local_only` snippet), using the
#               edge's own Caddy build (infra-check.Dockerfile target `caddy`).
#   shell       shellcheck on every tracked *.sh, *.bash and sh/bash-shebang file.
#   systemd     `systemd-analyze --user verify` on deploy/systemd's units, in a container with
#               the repo at /ruby/data/astra-deploy (the path the units run from).
#   hadolint    every tracked Dockerfile.
#   playwright  deploy/node.Dockerfile's PLAYWRIGHT_VERSION is the one version the lockfile has.
#
# Every tool is pinned: shellcheck and hadolint by image tag and digest, the other two through
# infra-check.Dockerfile (built here, so the first run takes about a minute; later runs reuse
# the cache). Needs Docker and git. Runs every check and reports all failures; exits 1 on any.
# `INFRA_CHECK_ONLY=caddy,shell` runs a subset.
set -uo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$root" || exit 1

shellcheck_image=koalaman/shellcheck:v0.11.0@sha256:61862eba1fcf09a484ebcc6feea46f1782532571a34ed51fedf90dd25f925a8d
hadolint_image=hadolint/hadolint:v2.14.0@sha256:27086352fd5e1907ea2b934eb1023f217c5ae087992eb59fde121dce9c9ff21e
tools_dockerfile=deploy/tests/infra-check.Dockerfile
caddy_image=astra-infra-check:caddy
systemd_image=astra-infra-check:systemd

# Build one infra-check.Dockerfile target (cached after the first run).
build_tool() {
  docker build -q --target "$1" -t "$2" -f "$tools_dockerfile" deploy/tests >/dev/null
}

# Run a tool image over the repo, mounted read-only at /src, with no network.
run_tool() {
  docker run --rm --network none -v "$root:/src:ro" -w /src "$@"
}

check_compose() {
  docker compose -f deploy/docker-compose.yml config -q
}

check_caddy() {
  build_tool caddy "$caddy_image" || return 1
  run_tool "$caddy_image" caddy adapt --adapter caddyfile \
    --config deploy/tests/edge-stub.caddyfile >/dev/null || return 1
  # validate logs its provisioning at info level; show that only when it fails.
  local out
  if ! out=$(run_tool "$caddy_image" caddy validate --adapter caddyfile \
    --config deploy/tests/edge-stub.caddyfile 2>&1); then
    printf '%s\n' "$out" >&2
    return 1
  fi
  echo "caddy: sites.caddyfile adapts and validates"
}

shell_scripts() {
  local f first
  while IFS= read -r -d '' f; do
    case "$f" in
      *.sh | *.bash) printf '%s\n' "$f" ;;
      *)
        [ -f "$f" ] || continue
        IFS= read -r first <"$f" || true
        if [[ "$first" =~ ^\#!.*[/\ ](ba|da)?sh([[:space:]]|$) ]]; then printf '%s\n' "$f"; fi
        ;;
    esac
  done < <(git ls-files -z)
}

check_shell() {
  local scripts
  mapfile -t scripts < <(shell_scripts)
  echo "shellcheck: ${#scripts[@]} scripts"
  run_tool "$shellcheck_image" --external-sources "${scripts[@]}"
}

check_systemd() {
  build_tool systemd "$systemd_image" || return 1
  # The units run `just` from the host user's cargo bin; a stand-in keeps verify's
  # executable check meaningful for every other ExecStart.
  # A --user manager needs a runtime dir, even offline. verify only warns about an unknown key
  # (a typo such as `OnFailre=`) and still exits 0, so any output fails the check.
  local out
  out=$(docker run --rm --network none -e XDG_RUNTIME_DIR=/run/user/0 \
    -v "$root:/ruby/data/astra-deploy:ro" "$systemd_image" \
    sh -c 'mkdir -p /run/user/0 /home/jbassin/.cargo/bin \
      && ln -s /bin/true /home/jbassin/.cargo/bin/just \
      && cd /ruby/data/astra-deploy/deploy/systemd \
      && systemd-analyze --user verify ./*.service ./*.timer ./*.path' 2>&1)
  local rc=$?
  if [ "$rc" -ne 0 ] || [ -n "$out" ]; then
    printf '%s\n' "$out" >&2
    return 1
  fi
  echo "systemd: deploy/systemd units verify clean"
}

check_hadolint() {
  local files
  mapfile -t files < <(git ls-files 'Dockerfile' '*/Dockerfile' '*.Dockerfile')
  echo "hadolint: ${files[*]}"
  run_tool "$hadolint_image" hadolint "${files[@]}"
}

check_playwright() {
  local pinned locked
  pinned=$(sed -n 's/^ARG PLAYWRIGHT_VERSION=//p' deploy/node.Dockerfile)
  locked=$(grep -oE '^  playwright@[0-9][^:(]*:' pnpm-lock.yaml | sed 's/^  playwright@//; s/:$//' | sort -u)
  if [ -z "$pinned" ] || [ "$pinned" != "$locked" ]; then
    echo "deploy/node.Dockerfile PLAYWRIGHT_VERSION=${pinned:-<missing>}, but pnpm-lock.yaml has" \
      "playwright ${locked//$'\n'/, }: set the ARG to the locked version" >&2
    return 1
  fi
  echo "playwright $pinned"
}

checks=(compose caddy shell systemd hadolint playwright)
if [ -n "${INFRA_CHECK_ONLY:-}" ]; then IFS=, read -ra checks <<<"$INFRA_CHECK_ONLY"; fi
failed=()
for c in "${checks[@]}"; do
  printf '\n-- infra-check: %s\n' "$c" >&2
  "check_$c" || failed+=("$c")
done
if [ "${#failed[@]}" -gt 0 ]; then
  printf '\ninfra-check: FAILED: %s\n' "$(IFS=,; echo "${failed[*]}")" >&2
  exit 1
fi
printf '\ninfra-check: all %d checks passed\n' "${#checks[@]}" >&2
