#!/bin/bash
# SMART -> Prometheus textfile collector. Every $SMARTMON_INTERVAL seconds,
# scan all disks and write $SMARTMON_OUT/smartmon.prom (atomic tmp+mv; the
# textfile collector also exports the file's mtime, so staleness is visible
# as node_textfile_mtime_seconds going flat).
#
# Emitted (per disk, labeled disk="sda"/"nvme0"/...):
#   smartmon_device_info{model,serial} 1
#   smartmon_smart_status_passed        0/1  <- the "is it dying" headline
#   smartmon_temperature_celsius
#   smartmon_power_on_hours
#   smartmon_attr_raw_value{name,id}    every ATA attribute raw value
#                                       (reallocated/pending sectors etc.)
#   smartmon_nvme_<field>               every numeric NVMe health-log field
#                                       (percentage_used, media_errors, ...)
set -u
OUT_DIR=${SMARTMON_OUT:-/textfile}
INTERVAL=${SMARTMON_INTERVAL:-300}

collect() {
  local tmp="$OUT_DIR/.smartmon.prom.tmp" dev disk json
  : > "$tmp"
  for dev in $(smartctl -j --scan 2>/dev/null | jq -r '.devices[].name'); do
    disk=${dev##*/}
    json=$(smartctl -j -a "$dev" 2>/dev/null)
    [ -n "$json" ] || continue
    jq -r --arg disk "$disk" '
      [
        "smartmon_device_info{disk=\"\($disk)\",model=\"\(.model_name // "unknown")\",serial=\"\(.serial_number // "unknown")\"} 1",
        (select(.smart_status.passed != null)
          | "smartmon_smart_status_passed{disk=\"\($disk)\"} \(if .smart_status.passed then 1 else 0 end)"),
        (select(.temperature.current != null)
          | "smartmon_temperature_celsius{disk=\"\($disk)\"} \(.temperature.current)"),
        (select(.power_on_time.hours != null)
          | "smartmon_power_on_hours{disk=\"\($disk)\"} \(.power_on_time.hours)"),
        ((.ata_smart_attributes.table // [])[]
          | "smartmon_attr_raw_value{disk=\"\($disk)\",name=\"\(.name)\",id=\"\(.id)\"} \(.raw.value)"),
        ((.nvme_smart_health_information_log // {}) | to_entries[]
          | select(.value | type == "number")
          | "smartmon_nvme_\(.key){disk=\"\($disk)\"} \(.value)")
      ] | .[]
    ' <<<"$json" >> "$tmp" 2>/dev/null || true
  done
  mv "$tmp" "$OUT_DIR/smartmon.prom"
}

while true; do
  collect
  sleep "$INTERVAL"
done
