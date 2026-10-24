"""``astra-ops host-metrics``: the host facts SigNoz cannot see, as a Prometheus textfile.

The collector has no Docker receiver, no TLS probe and no view of the data root, so the
alert rules for certificates, container health, the Dagster daemon and data freshness
(``deploy/signoz/rules/astra-*.json``) read the metrics this command writes. It runs every
2 minutes from ``astra-metrics.timer`` and writes ``ops.metrics-textfile`` (config.kdl), a
file in the directory node-exporter serves with ``--collector.textfile``. node-exporter
re-serves the last file on every scrape, so the rule "astra host metrics stale" watches the
file's mtime: a dead emitter cannot look healthy.

Every probe is independent. A probe that cannot run writes ``astra_probe_success{probe,
target} 0`` and leaves its other series out; it never fails the command. The command fails
(exit 1, which pages through ``OnFailure``) only when the file cannot be written.

Metrics (every family is prefixed ``astra_``, so none collides with smartmon.prom):

- ``astra_tls_cert_expiry_seconds{host}``: seconds until the certificate the edge serves
  for each site host in ``sites.caddyfile`` expires (the same host list as ``just doctor``).
- ``astra_container_unhealthy{container}`` (0/1) and
  ``astra_container_restart_count{container}`` for every container of the ``astra`` compose
  project.
- ``astra_dagster_daemon_heartbeat_age_seconds{daemon_type}``: the age of each Dagster
  daemon's last heartbeat row (the daemons beat every 30 to 60 s).
- ``astra_data_newest_age_seconds{dataset}``: the age of the newest session transcript
  (``<scribe.data-path>/saved/*/script.json``) and episode render
  (``<mouthpiece.episodes-path>/*/*.episode.mp3``).
- ``astra_probe_success{probe,target}``: 1 when the probe ran, 0 when it could not.
"""

from __future__ import annotations

import json
import re
import socket
import ssl
import subprocess
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from pathlib import Path

#: The compose project every astra container carries (``name:`` in deploy/docker-compose.yml).
COMPOSE_PROJECT = "astra"
#: The Dagster metadata store (deploy/docker-compose.yml ``dagster-postgres``).
DAGSTER_PG_CONTAINER = "astra-dagster-postgres"
DAGSTER_PG_USER = "dagster"
DAGSTER_PG_DB = "dagster"
#: Dagster stores heartbeat timestamps as naive UTC.
HEARTBEAT_SQL = (
    "SELECT daemon_type, EXTRACT(EPOCH FROM (now() AT TIME ZONE 'utc') - timestamp) "
    "FROM daemon_heartbeats"
)
#: Seconds any one child or TLS handshake may take.
PROBE_TIMEOUT_S = 15.0
#: A site block in sites.caddyfile (the same pattern as deploy/doctor.sh check_certs).
SITE_RE = re.compile(r"^([a-z0-9.-]+\.[a-z]+) \{", re.MULTILINE)

HELP = {
    "astra_probe_success": "1 when the host probe ran, 0 when it could not.",
    "astra_tls_cert_expiry_seconds": "Seconds until the served TLS certificate expires.",
    "astra_container_unhealthy": "1 when the container's healthcheck reports unhealthy.",
    "astra_container_restart_count": "Docker's restart count for the container.",
    "astra_dagster_daemon_heartbeat_age_seconds": "Seconds since the daemon's last heartbeat.",
    "astra_data_newest_age_seconds": "Seconds since the newest file of the dataset was written.",
}


def _run(argv: Sequence[str], stdin: bytes | None = None) -> tuple[int, bytes]:
    """Run a child with a timeout; one that cannot start or times out returns 127."""
    try:
        proc = subprocess.run(
            list(argv), input=stdin, capture_output=True, timeout=PROBE_TIMEOUT_S, check=False
        )
    except (OSError, subprocess.TimeoutExpired):
        return 127, b""
    return proc.returncode, proc.stdout


def _cert_not_after(host: str, port: int) -> float:
    """``notAfter`` (epoch seconds) of the certificate ``host:port`` serves for SNI ``host``.

    The handshake does not verify the certificate, because an expired or mismatched one is
    exactly what the probe must still read. The standard library cannot decode a certificate
    it did not verify, so openssl parses it, as in deploy/doctor.sh."""
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    with (
        socket.create_connection((host, port), timeout=PROBE_TIMEOUT_S) as sock,
        ctx.wrap_socket(sock, server_hostname=host) as tls,
    ):
        der = tls.getpeercert(binary_form=True)
    if not der:
        raise OSError(f"{host}:{port} served no certificate")
    rc, out = _run(["openssl", "x509", "-inform", "DER", "-noout", "-enddate"], der)
    text = out.decode(errors="replace").strip()
    if rc != 0 or not text.startswith("notAfter="):
        raise OSError(f"openssl could not read the certificate of {host} (exit {rc})")
    return float(ssl.cert_time_to_seconds(text.removeprefix("notAfter=")))


@dataclass
class Probes:
    """The outside world, swappable in tests."""

    run: Callable[[Sequence[str]], tuple[int, bytes]] = _run
    cert_not_after: Callable[[str, int], float] = _cert_not_after
    now: Callable[[], float] = time.time


@dataclass(frozen=True)
class Sample:
    name: str
    labels: tuple[tuple[str, str], ...]
    value: float


@dataclass
class Collected:
    samples: list[Sample] = field(default_factory=list)

    def add(self, name: str, value: float, **labels: str) -> None:
        self.samples.append(Sample(name, tuple(sorted(labels.items())), value))

    def probe(self, probe: str, target: str, *, ok: bool) -> None:
        self.add("astra_probe_success", 1 if ok else 0, probe=probe, target=target)


def site_hosts(caddyfile: Path) -> list[str]:
    """The site hosts ``sites.caddyfile`` serves, in file order, without duplicates."""
    return list(dict.fromkeys(SITE_RE.findall(caddyfile.read_text(encoding="utf-8"))))


def collect_tls(out: Collected, probes: Probes, hosts: Sequence[str], port: int = 443) -> None:
    now = probes.now()
    for host in hosts:
        try:
            not_after = probes.cert_not_after(host, port)
        except (OSError, ValueError):
            out.probe("tls", host, ok=False)
            continue
        out.probe("tls", host, ok=True)
        out.add("astra_tls_cert_expiry_seconds", round(not_after - now), host=host)


def collect_containers(out: Collected, probes: Probes) -> None:
    rc, ids = probes.run(
        ["docker", "ps", "-aq", "--filter", f"label=com.docker.compose.project={COMPOSE_PROJECT}"]
    )
    if rc != 0:
        out.probe("docker", COMPOSE_PROJECT, ok=False)
        return
    names = ids.decode().split()
    if not names:
        out.probe("docker", COMPOSE_PROJECT, ok=False)
        return
    rc, raw = probes.run(["docker", "inspect", *names])
    try:
        inspected = json.loads(raw) if rc == 0 else None
    except ValueError:
        inspected = None
    if not isinstance(inspected, list):
        out.probe("docker", COMPOSE_PROJECT, ok=False)
        return
    out.probe("docker", COMPOSE_PROJECT, ok=True)
    for c in inspected:
        name = str(c.get("Name", "")).lstrip("/")
        state = c.get("State") or {}
        health = (state.get("Health") or {}).get("Status", "")
        out.add("astra_container_unhealthy", 1 if health == "unhealthy" else 0, container=name)
        out.add("astra_container_restart_count", int(c.get("RestartCount", 0)), container=name)


def collect_dagster(out: Collected, probes: Probes) -> None:
    rc, raw = probes.run(
        [
            "docker", "exec", DAGSTER_PG_CONTAINER, "psql", "-U", DAGSTER_PG_USER,
            "-d", DAGSTER_PG_DB, "-tA", "-F", "\t", "-c", HEARTBEAT_SQL,
        ]
    )  # fmt: skip
    rows = []
    for line in raw.decode(errors="replace").splitlines() if rc == 0 else []:
        daemon, _, age = line.partition("\t")
        try:
            rows.append((daemon.strip(), float(age)))
        except ValueError:
            continue
    if not rows:
        out.probe("dagster-heartbeat", DAGSTER_PG_CONTAINER, ok=False)
        return
    out.probe("dagster-heartbeat", DAGSTER_PG_CONTAINER, ok=True)
    for daemon, age in rows:
        out.add("astra_dagster_daemon_heartbeat_age_seconds", round(age), daemon_type=daemon)


def _newest_mtime(root: Path, pattern: str) -> float | None:
    newest = None
    for path in root.glob(pattern):
        try:
            mtime = path.stat().st_mtime
        except OSError:
            continue
        newest = mtime if newest is None else max(newest, mtime)
    return newest


def collect_freshness(
    out: Collected, probes: Probes, datasets: dict[str, tuple[Path, str]]
) -> None:
    now = probes.now()
    for dataset, (root, pattern) in datasets.items():
        newest = _newest_mtime(root, pattern) if root.is_dir() else None
        out.probe("freshness", dataset, ok=newest is not None)
        if newest is not None:
            out.add("astra_data_newest_age_seconds", round(now - newest), dataset=dataset)


def _escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")


def render(collected: Collected) -> str:
    """The Prometheus text exposition: one HELP/TYPE header per family, families in
    ``HELP`` order, samples in collection order."""
    lines: list[str] = []
    for name, help_text in HELP.items():
        samples = [s for s in collected.samples if s.name == name]
        if not samples:
            continue
        lines += [f"# HELP {name} {help_text}", f"# TYPE {name} gauge"]
        for s in samples:
            labels = ",".join(f'{k}="{_escape(v)}"' for k, v in s.labels)
            value = int(s.value) if float(s.value).is_integer() else s.value
            lines.append(f"{name}{{{labels}}} {value}")
    return "\n".join(lines) + "\n"


def write_atomic(path: Path, text: str) -> None:
    """Write ``text`` to ``path`` through a temp file and a rename, so node-exporter never
    serves half a file. The temp name starts with a dot: the textfile collector reads only
    ``*.prom``."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.chmod(0o644)
    tmp.replace(path)


@dataclass(frozen=True)
class Targets:
    """Where the probes look (built from config.kdl and the checkout by ``from_config``)."""

    textfile: Path
    caddyfile: Path
    datasets: dict[str, tuple[Path, str]]


def collect(targets: Targets, probes: Probes) -> Collected:
    out = Collected()
    try:
        hosts = site_hosts(targets.caddyfile)
    except OSError:
        out.probe("tls", "sites.caddyfile", ok=False)
        hosts = []
    collect_tls(out, probes, hosts)
    collect_containers(out, probes)
    collect_dagster(out, probes)
    collect_freshness(out, probes, targets.datasets)
    return out


def host_metrics(targets: Targets, probes: Probes | None = None) -> int:
    collected = collect(targets, probes or Probes())
    try:
        write_atomic(targets.textfile, render(collected))
    except OSError as exc:
        print(f"host-metrics: cannot write {targets.textfile}: {exc}", flush=True)  # noqa: T201 -- command-line output
        return 1
    failed = [
        dict(s.labels) for s in collected.samples if s.name == "astra_probe_success" and not s.value
    ]
    summary = ", ".join(f"{f['probe']}:{f['target']}" for f in failed) or "none"
    print(  # noqa: T201 -- command-line output (the journal)
        f"host-metrics: wrote {len(collected.samples)} samples to {targets.textfile}; "
        f"failed probes: {summary}",
        flush=True,
    )
    return 0
