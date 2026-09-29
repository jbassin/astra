# smart-exporter: tiny privileged sidecar that periodically runs smartctl and
# drops smartmon.prom into the shared textfile dir for node-exporter to serve
# (node-exporter itself stays unprivileged — it never touches /dev).
FROM alpine:3.22
RUN apk add --no-cache bash jq smartmontools
COPY smartmon.sh /usr/local/bin/smartmon.sh
RUN chmod +x /usr/local/bin/smartmon.sh
ENTRYPOINT ["/usr/local/bin/smartmon.sh"]
