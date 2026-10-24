# The two tools `just infra-check` (deploy/tests/infra-check.sh) can't take from a stock image.
# Build context: deploy/tests (nothing is copied from it).
#
# Target `caddy`: the edge's Caddy, rebuilt. The same release and caddy-dns/cloudflare revision as
# the custom binary the shared reverse proxy runs (`caddy build-info` on that binary: v2.7.6,
# cloudflare v0.0.0-20231220181002-8789126791ed). The stock image can't adapt sites.caddyfile:
# it lacks the `dns cloudflare` module. Bump both pins when the edge binary changes.
FROM caddy:2.7.6-builder AS caddy-build
RUN xcaddy build v2.7.6 \
      --with github.com/caddy-dns/cloudflare@v0.0.0-20231220181002-8789126791ed

FROM caddy:2.7.6 AS caddy
COPY --from=caddy-build /usr/bin/caddy /usr/bin/caddy

# Target `systemd`: systemd-analyze, so `verify` runs the same offline in CI and on any host
# (the host's systemd is 249; GitHub's runner differs). systemd itself never runs here.
FROM debian:12.15-slim AS systemd
# The image tag pins the Debian point release; the archive keeps only the newest systemd 252
# build, so an exact package pin would break on the next stable update.
# hadolint ignore=DL3008
RUN apt-get update \
    && apt-get install -y --no-install-recommends systemd \
    && rm -rf /var/lib/apt/lists/*
