# smart-exporter: tiny privileged sidecar that periodically runs smartctl and
# drops smartmon.prom into the shared textfile dir for node-exporter to serve
# (node-exporter itself stays unprivileged — it never touches /dev).
FROM alpine:3.22@sha256:49340b346798875b5592e5d420241f2f9cfba5f47e62ebb1446a1b34734e898f
# DL3018: the alpine:3.22 tag fixes the release; its repository keeps only each package's
# newest build, so an exact apk pin breaks on the next security update.
# hadolint ignore=DL3018
RUN apk add --no-cache bash jq smartmontools
COPY smartmon.sh /usr/local/bin/smartmon.sh
RUN chmod +x /usr/local/bin/smartmon.sh
ENTRYPOINT ["/usr/local/bin/smartmon.sh"]
