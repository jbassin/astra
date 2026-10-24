"""deploy/doctor.sh's offline checks (binds, units, expiry) against scratch inputs.

The tools, host and certs checks read this machine and the network, so they are skipped here;
`just doctor` exercises them on the host.
"""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SCRIPT = REPO / "deploy" / "doctor.sh"


def _linked_units() -> list[tuple[str, str]]:
    """(group, unit) for every unit `just units-install` links; the first group wins."""
    out = []
    for line in (REPO / "deploy" / "systemd" / "units.txt").read_text().splitlines():
        words = line.split()
        if words and not words[0].startswith("#"):
            out += [(words[0], u) for u in words[1:]]
    seen: set[str] = set()
    return [(g, u) for g, u in out if not (u in seen or seen.add(u))]


def test_the_manifest_names_only_unit_files_that_exist() -> None:
    units = _linked_units()
    assert len(units) == 17
    for _, unit in units:
        assert (REPO / "deploy" / "systemd" / unit).is_file(), unit


def _run(tmp_path: Path, skip: str, **env: str) -> subprocess.CompletedProcess[str]:
    stub = tmp_path / "systemctl"
    if not stub.exists():
        stub.write_text('#!/bin/sh\necho "${DOCTOR_STUB_STATE:-enabled}"\n')
        stub.chmod(0o755)
    base = {k: v for k, v in os.environ.items() if not k.startswith(("ASTRA_", "DOCTOR_"))}
    return subprocess.run(
        [str(SCRIPT)],
        check=False,
        capture_output=True,
        text=True,
        env={
            **base,
            "DOCTOR_SKIP": skip,
            "ASTRA_DATA_ROOT": str(tmp_path / "data"),
            "ASTRA_DEPLOY_ROOT": str(tmp_path / "deploy-root"),
            "DOCTOR_UNIT_DIR": str(tmp_path / "units"),
            "DOCTOR_SYSTEMCTL": str(stub),
            **env,
        },
    )


def test_binds_reports_a_missing_data_root_source(tmp_path: Path) -> None:
    present = tmp_path / "data" / "audio"
    present.mkdir(parents=True)
    missing = tmp_path / "data" / "menhir"
    compose = {
        "services": {
            "a": {"volumes": [{"type": "bind", "source": str(present)}]},
            "b": {"volumes": [{"type": "bind", "source": str(missing)}, {"type": "volume"}]},
        }
    }
    (tmp_path / "compose.json").write_text(json.dumps(compose))
    r = _run(
        tmp_path,
        "tools,units,host,certs,expiry",
        DOCTOR_COMPOSE_JSON=str(tmp_path / "compose.json"),
    )
    assert r.returncode == 1
    assert f"[FAIL] binds: {missing} is missing" in r.stdout
    assert "just artifacts-init" in r.stdout
    assert str(present) not in r.stdout


def _install_units(tmp_path: Path) -> list[tuple[str, str]]:
    units = _linked_units()
    src = tmp_path / "deploy-root" / "deploy" / "systemd"
    src.mkdir(parents=True)
    (tmp_path / "units").mkdir()
    for _, unit in units:
        (src / unit).write_text("[Unit]\n")
        (tmp_path / "units" / unit).symlink_to(src / unit)
    return units


def test_units_pass_when_every_unit_links_into_the_deploy_checkout(tmp_path: Path) -> None:
    units = _install_units(tmp_path)
    r = _run(tmp_path, "tools,binds,host,certs,expiry")
    assert r.returncode == 0, r.stdout
    assert f"all {len(units)} linked" in r.stdout


def test_units_report_a_copy_a_foreign_link_and_a_disabled_timer(tmp_path: Path) -> None:
    units = _install_units(tmp_path)
    copy = units[0][1]
    (tmp_path / "units" / copy).unlink()
    (tmp_path / "units" / copy).write_text("[Unit]\n")
    foreign = units[1][1]
    (tmp_path / "units" / foreign).unlink()
    (tmp_path / "units" / foreign).symlink_to(tmp_path / "elsewhere")
    r = _run(tmp_path, "tools,binds,host,certs,expiry", DOCTOR_STUB_STATE="disabled")
    assert r.returncode == 1
    assert f"[FAIL] units: {copy} is a copy" in r.stdout
    assert f"[FAIL] units: {foreign} links to {tmp_path / 'elsewhere'}" in r.stdout
    assert "astra-restore-test.timer is disabled (run: just units-install backup)" in r.stdout


def test_expiry_markers(tmp_path: Path) -> None:
    f = tmp_path / "sites.caddyfile"
    f.write_text(
        "# astra-expires: 2026-10-01 scriptorium review\n"
        "# astra-expires: 2026-10-30 demo host\n"
        "# astra-expires: 2027-06-01 long-lived\n"
    )
    r = _run(
        tmp_path,
        "tools,binds,units,host,certs",
        DOCTOR_EXPIRY_FILES=str(f),
        DOCTOR_TODAY="2026-10-23",
    )
    assert r.returncode == 1
    assert "[FAIL] expiry: " in r.stdout and "expired 2026-10-01" in r.stdout
    assert "[warn] expiry: " in r.stdout and "(in 7 days)" in r.stdout
    assert "expires 2027-06-01" in r.stdout
    assert "doctor: 1 failed, 1 warning(s)" in r.stdout
