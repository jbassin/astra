"""host-metrics: every probe over faked children, the textfile format, and the failure rules."""

from __future__ import annotations

import json
import os
from collections.abc import Sequence
from pathlib import Path

import pytest
from astra_ops import host_metrics as hm

NOW = 1_800_000_000.0
DAY = 86400


def caddyfile(tmp: Path) -> Path:
    p = tmp / "sites.caddyfile"
    p.write_text(
        "(local_only) {\n}\n"
        "strider.iridi.cc {\n\treverse_proxy x\n}\n"
        "vellum.iridi.cc {\n}\n"
        "strider.iridi.cc {\n}\n"
        "# not.a.site {\n"
    )
    return p


INSPECT = [
    {"Name": "/astra-codex", "RestartCount": 0, "State": {"Health": {"Status": "healthy"}}},
    {"Name": "/astra-weal-bot", "RestartCount": 3, "State": {"Health": {"Status": "unhealthy"}}},
    {"Name": "/astra-dagster-daemon", "RestartCount": 0, "State": {"Status": "running"}},
]


class Children:
    """Fake ``docker`` children keyed by argv[:3]; anything else fails the test."""

    def __init__(self, *, docker_ok: bool = True, heartbeat: str | None = "SENSOR\t12.5\n") -> None:
        self.docker_ok = docker_ok
        self.heartbeat = heartbeat
        self.calls: list[list[str]] = []

    def __call__(self, argv: Sequence[str]) -> tuple[int, bytes]:
        argv = list(argv)
        self.calls.append(argv)
        if argv[:2] == ["docker", "ps"]:
            assert "label=com.docker.compose.project=astra" in argv
            return (0, b"a1\nb2\nc3\n") if self.docker_ok else (1, b"")
        if argv[:2] == ["docker", "inspect"]:
            assert argv[2:] == ["a1", "b2", "c3"]
            return 0, json.dumps(INSPECT).encode()
        if argv[:3] == ["docker", "exec", hm.DAGSTER_PG_CONTAINER]:
            assert hm.HEARTBEAT_SQL in argv
            return (0, self.heartbeat.encode()) if self.heartbeat is not None else (2, b"")
        raise AssertionError(f"unexpected child {argv}")


def certs(host: str, port: int) -> float:
    assert port == 443
    if host == "vellum.iridi.cc":
        return NOW + 13 * DAY
    raise OSError("connection refused")


def targets(tmp: Path) -> hm.Targets:
    saved = tmp / "scribe" / "saved"
    episodes = tmp / "episodes"
    files = [
        (saved / "2026-10-12", "script.json", 12),
        (saved / "2026-10-19", "script.json", 5),
        (episodes / "2026-10-19", "000.x.2026-10-19.episode.mp3", 4),
    ]
    for d, name, age in files:
        d.mkdir(parents=True)
        f = d / name
        f.write_text("x")
        os.utime(f, (NOW - age * DAY, NOW - age * DAY))
    (saved / "2026-10-26").mkdir()  # a session dir without a transcript yet does not count
    return hm.Targets(
        textfile=tmp / "textfile" / "astra.prom",
        caddyfile=caddyfile(tmp),
        datasets={
            "transcript": (saved, "*/script.json"),
            "episode": (episodes, "*/*.episode.mp3"),
            "missing": (tmp / "nope", "*"),
        },
    )


def probes(children: Children) -> hm.Probes:
    return hm.Probes(run=children, cert_not_after=certs, now=lambda: NOW)


def test_site_hosts_in_order_without_duplicates(tmp_path: Path) -> None:
    assert hm.site_hosts(caddyfile(tmp_path)) == ["strider.iridi.cc", "vellum.iridi.cc"]


def test_writes_every_metric(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    t = targets(tmp_path)
    assert hm.host_metrics(t, probes(Children())) == 0
    text = t.textfile.read_text()
    for line in [
        'astra_probe_success{probe="tls",target="strider.iridi.cc"} 0',
        'astra_probe_success{probe="tls",target="vellum.iridi.cc"} 1',
        f'astra_tls_cert_expiry_seconds{{host="vellum.iridi.cc"}} {13 * DAY}',
        'astra_probe_success{probe="docker",target="astra"} 1',
        'astra_container_unhealthy{container="astra-codex"} 0',
        'astra_container_unhealthy{container="astra-weal-bot"} 1',
        'astra_container_unhealthy{container="astra-dagster-daemon"} 0',
        'astra_container_restart_count{container="astra-weal-bot"} 3',
        'astra_dagster_daemon_heartbeat_age_seconds{daemon_type="SENSOR"} 12',
        f'astra_data_newest_age_seconds{{dataset="transcript"}} {5 * DAY}',
        f'astra_data_newest_age_seconds{{dataset="episode"}} {4 * DAY}',
        'astra_probe_success{probe="freshness",target="missing"} 0',
    ]:
        assert line in text.splitlines(), line
    assert 'host="strider.iridi.cc"' not in text  # a failed probe writes no value
    assert text.count("# TYPE astra_probe_success gauge") == 1
    assert "failed probes: tls:strider.iridi.cc, freshness:missing" in capsys.readouterr().out


def test_failed_docker_and_dagster_probes_are_reported_not_fatal(tmp_path: Path) -> None:
    t = targets(tmp_path)
    assert hm.host_metrics(t, probes(Children(docker_ok=False, heartbeat=None))) == 0
    text = t.textfile.read_text()
    assert 'astra_probe_success{probe="docker",target="astra"} 0' in text
    assert (
        'astra_probe_success{probe="dagster-heartbeat",target="astra-dagster-postgres"} 0' in text
    )
    assert "astra_container_unhealthy" not in text
    assert "astra_dagster_daemon_heartbeat_age_seconds" not in text


def test_an_empty_heartbeat_table_is_a_failed_probe(tmp_path: Path) -> None:
    t = targets(tmp_path)
    assert hm.host_metrics(t, probes(Children(heartbeat=""))) == 0
    assert 'probe="dagster-heartbeat",target="astra-dagster-postgres"} 0' in t.textfile.read_text()


def test_the_file_is_replaced_atomically_and_readable(tmp_path: Path) -> None:
    t = targets(tmp_path)
    hm.host_metrics(t, probes(Children()))
    first = t.textfile.stat().st_ino
    hm.host_metrics(t, probes(Children()))
    assert t.textfile.stat().st_ino != first  # a rename, never an in-place rewrite
    assert t.textfile.stat().st_mode & 0o777 == 0o644
    assert [p.name for p in t.textfile.parent.iterdir()] == ["astra.prom"]


def test_an_unwritable_textfile_fails_the_run(tmp_path: Path) -> None:
    t = targets(tmp_path)
    t.textfile.parent.mkdir()
    t.textfile.mkdir()  # a directory where the file should go: the rename fails
    assert hm.host_metrics(t, probes(Children())) == 1


def test_label_values_are_escaped() -> None:
    c = hm.Collected()
    c.add("astra_probe_success", 1, probe='a"b', target="c\\d")
    assert 'astra_probe_success{probe="a\\"b",target="c\\\\d"} 1' in hm.render(c)
