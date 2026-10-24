"""deploy.sh's dry-run path against a scratch origin, deploy checkout and data root.

Covers what runs before any build: the staged origin/main tooling (step 2a), the rollback
pin, the lenient history.jsonl reads, --skip-failed and the in-flight Dagster run guard
(step 1b, against a fake GraphQL API and a fake `docker`). No Docker, sops or uv is needed.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import threading
from collections.abc import Iterator
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

DEPLOY_DIR = Path(__file__).resolve().parents[1]
MARKER = "log 'origin/main tooling is running'"


def _git(cwd: Path, *args: str) -> str:
    return subprocess.run(
        ["git", "-c", "user.name=t", "-c", "user.email=t@t", *args],
        cwd=cwd,
        check=True,
        capture_output=True,
        text=True,
        env=_env(),
    ).stdout.strip()


def _env(**extra: str) -> dict[str, str]:
    env = {
        k: v
        for k, v in os.environ.items()
        if not k.startswith("GIT_") and not k.startswith("ASTRA_")
    }
    return {**env, **extra}


@dataclass
class Rig:
    deploy_root: Path
    data_root: Path
    old: str
    main: str
    #: Holds the fake `docker` the guard falls back to (exit 1 = no Docker, unless a test
    #: writes another one).
    bin_dir: Path
    #: The Dagster GraphQL URL deploy.sh asks; a closed port unless a test serves one.
    graphql_url: str = "http://127.0.0.1:9/graphql"

    @property
    def history(self) -> Path:
        return self.data_root / "deploy" / "history.jsonl"

    def run(self, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [str(self.deploy_root / "deploy" / "deploy.sh"), *args],
            check=False,
            capture_output=True,
            text=True,
            env=_env(
                ASTRA_DEPLOY_ROOT=str(self.deploy_root),
                ASTRA_DATA_ROOT=str(self.data_root),
                ASTRA_CONTENT_ROOT=str(self.data_root / "astra-data"),
                DAGSTER_GRAPHQL_URL=self.graphql_url,
                ASTRA_GUARD_DOCKER=str(self.bin_dir / "docker"),
            ),
        )

    def last_record(self) -> dict[str, object]:
        return json.loads(self.history.read_text().splitlines()[-1])


@pytest.fixture
def rig(tmp_path: Path) -> Rig:
    """origin: `old` = today's deploy tooling, `main` = the same plus a log marker after
    step 2b's heading. The deploy checkout is detached at `old` (as after a rollback)."""
    if not shutil.which("jq") or not shutil.which("flock"):
        pytest.skip("needs jq and flock")
    src = tmp_path / "src"
    (src / "deploy").mkdir(parents=True)
    for f in ("deploy.sh", "wait-healthy.sh"):
        shutil.copy2(DEPLOY_DIR / f, src / "deploy" / f)
    _git(src, "init", "-q", "-b", "main")
    _git(src, "add", "-A")
    _git(src, "commit", "-qm", "old")
    old = _git(src, "rev-parse", "HEAD")
    script = src / "deploy" / "deploy.sh"
    text = script.read_text()
    assert "# 2b. The target.\n" in text
    script.write_text(text.replace("# 2b. The target.\n", f"# 2b. The target.\n{MARKER}\n"))
    _git(src, "commit", "-qam", "main")
    main = _git(src, "rev-parse", "HEAD")
    deploy_root = tmp_path / "deploy-root"
    _git(tmp_path, "clone", "-q", str(src), str(deploy_root))
    _git(deploy_root, "checkout", "-q", "--detach", old)
    data_root = tmp_path / "data"
    (data_root / "deploy").mkdir(parents=True)
    releases = data_root / "codex" / "data" / "releases"
    (releases / CODEX_RELEASE / "corpus").mkdir(parents=True)
    (releases / "current").symlink_to(CODEX_RELEASE)
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    _fake_docker(bin_dir, "exit 1")
    return Rig(deploy_root, data_root, old, main, bin_dir)


def _fake_docker(bin_dir: Path, body: str) -> None:
    docker = bin_dir / "docker"
    docker.write_text(f"#!/usr/bin/env bash\n{body}\n")
    docker.chmod(0o755)


CODEX_RELEASE = "0123456789abcdef"


@pytest.mark.parametrize("args", [("codex",), (), ("menhir", "codex"), ("--restart", "codex")])
def test_refuses_codex_without_a_current_release(rig: Rig, args: tuple[str, ...]) -> None:
    current = rig.data_root / "codex" / "data" / "releases" / "current"
    current.unlink()
    dry = () if args[:1] == ("--restart",) else ("--dry-run",)
    r = rig.run(*dry, *args)
    assert r.returncode == 12, r.stderr
    assert "codex-migrate-releases" in r.stderr
    # A dangling link (the release dir is gone) is refused the same way.
    current.symlink_to("fedcba9876543210")
    assert rig.run(*dry, *args).returncode == 12


def test_deploys_other_services_without_a_codex_release(rig: Rig) -> None:
    (rig.data_root / "codex" / "data" / "releases" / "current").unlink()
    r = rig.run("--dry-run", "menhir")
    assert r.returncode == 0, r.stderr


def test_runs_origin_main_tooling_from_an_old_checkout(rig: Rig) -> None:
    r = rig.run("--dry-run", "codex")
    assert r.returncode == 0, r.stderr
    assert "origin/main tooling is running" in r.stderr
    staged = rig.data_root / "deploy" / "bin" / "deploy.sh"
    assert MARKER in staged.read_text()
    assert (rig.data_root / "deploy" / "bin" / "wait-healthy.sh").exists()
    assert f"target {rig.main}" in r.stderr
    # One history line per run, written by the staged copy.
    assert len(rig.history.read_text().splitlines()) == 1


def test_a_corrupt_history_line_is_skipped_and_the_pin_is_followed(rig: Rig) -> None:
    pinned = {"mode": "deploy", "sha": rig.old, "data_sha": "", "pinned": True}
    rig.history.write_text(
        json.dumps({**pinned, "services": "all", "result": "ok", "exit": 0})
        + '\n{not json, a torn write\n42\n["not an object"]\n'
        + json.dumps({**pinned, "services": ["codex"], "result": "failed", "exit": 7})
        + "\n"
    )
    r = rig.run("--dry-run", "codex")
    assert r.returncode == 0, r.stderr
    assert f"pinned at {rig.old[:12]}" in r.stderr
    assert f"target {rig.old}" in r.stderr
    assert rig.last_record()["pinned"] is True
    # An explicit --sha origin/main clears the pin.
    r = rig.run("--dry-run", "--sha", "origin/main", "codex")
    assert r.returncode == 0, r.stderr
    assert f"target {rig.main}" in r.stderr
    assert rig.last_record()["pinned"] is False


@pytest.mark.parametrize(("exit_code", "want"), [(7, 11), (10, 11), (3, 0)])
def test_skip_failed_skips_only_a_failed_build_at_the_same_target(
    rig: Rig, exit_code: int, want: int
) -> None:
    rig.history.write_text(
        json.dumps(
            {
                "mode": "deploy",
                "sha": rig.main,
                "data_sha": "",
                "services": ["codex"],
                "result": "failed",
                "exit": exit_code,
            }
        )
        + "\n"
    )
    r = rig.run("--dry-run", "--skip-failed", "codex")
    assert r.returncode == want, r.stderr
    if want == 11:
        assert "already failed" in r.stderr
        assert rig.last_record()["result"] == "skipped"
        # A skip does not mask the failure: the next run still skips.
        assert rig.run("--dry-run", "--skip-failed", "codex").returncode == 11
    # Other services, or no --skip-failed, still deploy.
    assert rig.run("--dry-run", "--skip-failed", "menhir").returncode == 0
    assert rig.run("--dry-run", "codex").returncode == 0


# --- step 1b: no Dagster redeploy while a run is in flight ---------------------------------


class _GraphQL(BaseHTTPRequestHandler):
    answer: bytes = b""
    queries: list[str] = []

    def do_POST(self) -> None:
        length = int(self.headers["Content-Length"])
        type(self).queries.append(json.loads(self.rfile.read(length))["query"])
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(type(self).answer)

    def log_message(self, format: str, *args: object) -> None:
        pass


@pytest.fixture
def graphql(rig: Rig) -> Iterator[type[_GraphQL]]:
    """A fake Dagster GraphQL API on a free port; set ``answer`` to what it returns."""
    handler: type[_GraphQL] = type("Handler", (_GraphQL,), {"answer": b"", "queries": []})
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    rig.graphql_url = f"http://127.0.0.1:{server.server_address[1]}/graphql"
    yield handler
    server.shutdown()
    server.server_close()


def _runs(*runs: tuple[str, str, str]) -> bytes:
    results = [{"runId": r, "jobName": j, "status": s} for r, j, s in runs]
    answer = {"data": {"runsOrError": {"__typename": "Runs", "results": results}}}
    return json.dumps(answer).encode()


DAGSTER_SCOPES = [
    ("dagster-code",),
    ("dagster-code", "dagster-daemon", "dagster-webserver"),
    ("menhir", "dagster-postgres"),
    (),
]


@pytest.mark.parametrize("args", DAGSTER_SCOPES)
def test_refuses_a_dagster_redeploy_while_a_run_is_in_flight(
    rig: Rig, graphql: type[_GraphQL], args: tuple[str, ...]
) -> None:
    graphql.answer = _runs(("abc123", "__ASSET_JOB", "STARTED"))
    r = rig.run("--dry-run", *args)
    assert r.returncode == 13, r.stderr
    assert "abc123 __ASSET_JOB STARTED" in r.stderr
    assert "--force" in r.stderr
    assert rig.last_record()["exit"] == 13
    # QUEUED is not in flight: the new daemon launches it.
    assert "QUEUED" not in graphql.queries[0]
    assert "STARTED" in graphql.queries[0]
    # --force skips the check.
    r = rig.run("--dry-run", "--force", *args)
    assert r.returncode == 0, r.stderr
    assert "--force: not checking" in r.stderr


def test_restart_is_guarded_too(rig: Rig, graphql: type[_GraphQL]) -> None:
    graphql.answer = _runs(("abc123", "__ASSET_JOB", "STARTING"))
    r = rig.run("--restart", "dagster-code")
    assert r.returncode == 13, r.stderr


def test_deploys_dagster_with_no_run_in_flight(rig: Rig, graphql: type[_GraphQL]) -> None:
    graphql.answer = _runs()
    r = rig.run("--dry-run", "dagster-code", "dagster-daemon", "dagster-webserver")
    assert r.returncode == 0, r.stderr
    assert graphql.queries


def test_other_services_never_ask_dagster(rig: Rig, graphql: type[_GraphQL]) -> None:
    graphql.answer = _runs(("abc123", "__ASSET_JOB", "STARTED"))
    r = rig.run("--dry-run", "menhir", "codex")
    assert r.returncode == 0, r.stderr
    assert graphql.queries == []


def test_refuses_when_the_api_answers_with_an_error(rig: Rig, graphql: type[_GraphQL]) -> None:
    graphql.answer = json.dumps({"errors": [{"message": "boom"}]}).encode()
    r = rig.run("--dry-run", "dagster-code")
    assert r.returncode == 13, r.stderr
    assert "could not read" in r.stderr


_CONTAINER = 'case "$1" in ps) echo c0ffee ;; inspect) echo "abc123 __ASSET_JOB container" ;; esac'


def test_without_the_api_counts_run_containers(rig: Rig) -> None:
    # The webserver is down (closed port), but a run container is up.
    _fake_docker(rig.bin_dir, _CONTAINER)
    r = rig.run("--dry-run", "dagster-code")
    assert r.returncode == 13, r.stderr
    assert "relying on the run containers" in r.stderr
    assert "abc123 __ASSET_JOB container" in r.stderr
    # No run container: the deploy goes ahead.
    _fake_docker(rig.bin_dir, "exit 0")
    assert rig.run("--dry-run", "dagster-code").returncode == 0


def test_without_api_or_docker_it_warns_and_deploys(rig: Rig) -> None:
    r = rig.run("--dry-run", "dagster-code")
    assert r.returncode == 0, r.stderr
    assert "could not ask Dagster" in r.stderr


def test_a_container_outliving_its_canceled_run_blocks(rig: Rig, graphql: type[_GraphQL]) -> None:
    """A UI-terminated run is CANCELED after 180 s while its container keeps running: the API
    lists nothing, the container still counts."""
    graphql.answer = _runs()
    _fake_docker(rig.bin_dir, _CONTAINER)
    r = rig.run("--dry-run", "dagster-code")
    assert r.returncode == 13, r.stderr
    assert "abc123 __ASSET_JOB container" in r.stderr


def test_a_run_both_sources_report_is_listed_once(rig: Rig, graphql: type[_GraphQL]) -> None:
    graphql.answer = _runs(("abc123", "__ASSET_JOB", "STARTED"))
    _fake_docker(rig.bin_dir, _CONTAINER)
    r = rig.run("--dry-run", "dagster-code")
    assert r.returncode == 13, r.stderr
    assert "abc123 __ASSET_JOB STARTED" in r.stderr
    assert "abc123 __ASSET_JOB container" not in r.stderr
    assert "while 1 Dagster run(s)" in r.stderr


def test_the_api_alone_is_enough_without_docker(rig: Rig, graphql: type[_GraphQL]) -> None:
    graphql.answer = _runs()
    r = rig.run("--dry-run", "dagster-code")
    assert r.returncode == 0, r.stderr
    assert "could not list the Dagster run containers" in r.stderr
