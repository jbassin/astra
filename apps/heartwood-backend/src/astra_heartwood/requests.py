"""The Dagster ↔ host request protocol (0036 D36-2) and the host runner (D36-3).

Dagster's ``session_wiki`` asset cannot run the agent (the dagster-code image has no node
for the vellum validator, no git, no push key, no docker — 0036 D3), so it files
``<requests-path>/<date>.request.json`` and waits. The host ``heartwood-request`` unit runs
``drain_requests``, which runs the unchanged ``just heartwood-agent <date>`` per pending
request and writes ``<date>.result.json``. Both sides import this module; nothing here
imports Dagster.

Every write is ``.tmp`` → ``os.replace`` and readers glob only the final names, so a half-
written file is never read. Logs go to ``logs/`` (a subdirectory, so they don't trigger the
directory path unit).
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

from astra_linguist.chronicle import date_key
from astra_observe import get_logger
from pydantic import BaseModel, ConfigDict, Field

from .agent import ledger
from .agent.validate import find_node
from .agent.workspace import ARTIFACTS_ROOT

log = get_logger("astra.heartwood.requests")

SCHEMA = 1
REQUEST_SUFFIX = ".request.json"
RESULT_SUFFIX = ".result.json"
BACKFILL_LOCK = ARTIFACTS_ROOT / "backfill.lock"

#: The ``heartwood-agent`` recipe's exit codes (justfile header), plus the runner's own.
EXIT_MEANINGS: dict[int, str] = {
    0: "ok",
    1: "run failed",
    2: "incomplete (iteration cap)",
    3: "publish conflict",
    4: "refused",
    6: "dirty corpus/ledger/registry or not on main",
    7: "validate/snapshot/seed failed",
    8: "commit/rebase/push failed",
    9: "redeploy failed or skipped",
    10: "publish lock timeout, nothing written",
    64: "bad flag",
    -1: "preflight: missing tool",
    -2: "runner error",
}
_RETRY = "fix the cause, then re-materialize session_wiki (or run `just heartwood-agent {date}`)"
_PUSH = (
    "already committed and in the ledger — run `just _heartwood-push-deploy`; do NOT "
    "re-materialize (it would report already-published)"
)
_NEXT_STEP: dict[int, str] = {
    7: _RETRY + "; the log has the corpus restore command",
    8: _PUSH,
    9: _PUSH,
}

Outcome = Literal["published", "already-published", "failed"]


def meaning(code: int) -> str:
    return EXIT_MEANINGS.get(code, "unexpected exit")


def next_step(code: int, date: str) -> str:
    return _NEXT_STEP.get(code, _RETRY).format(date=date)


class Request(BaseModel):
    schema_: int = Field(default=SCHEMA, alias="schema")
    request_id: str
    date: str
    requested_at: str
    dagster_run_id: str | None = None

    model_config = ConfigDict(populate_by_name=True)


class Result(BaseModel):
    schema_: int = Field(default=SCHEMA, alias="schema")
    request_id: str
    date: str
    outcome: Outcome
    exit_code: int
    meaning: str
    run_dir: str | None = None
    run_id: str | None = None
    status: str | None = None
    cost_usd: float | None = None
    counts: dict[str, Any] | None = None
    commit: str | None = None
    log: str | None = None
    started_at: str
    finished_at: str

    model_config = ConfigDict(populate_by_name=True)


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def _atomic_write(path: Path, text: str) -> None:
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, path)


def request_path(root: Path, date: str) -> Path:
    return root / f"{date}{REQUEST_SUFFIX}"


def result_path(root: Path, date: str) -> Path:
    return root / f"{date}{RESULT_SUFFIX}"


def file_request(root: Path, date: str, *, dagster_run_id: str | None = None) -> Request:
    """Replace any old result for ``date``, then write a fresh request (new id)."""
    root.mkdir(parents=True, exist_ok=True)
    result_path(root, date).unlink(missing_ok=True)
    req = Request(
        request_id=uuid.uuid4().hex, date=date, requested_at=_now(), dagster_run_id=dagster_run_id
    )
    _atomic_write(request_path(root, date), req.model_dump_json(indent=2, by_alias=True))
    return req


def read_result(root: Path, date: str, request_id: str) -> Result | None:
    """The result for this exact request, or None while it is still pending."""
    path = result_path(root, date)
    if not path.is_file():
        return None
    result = Result.model_validate_json(path.read_text(encoding="utf-8"))
    return result if result.request_id == request_id else None


def write_result(root: Path, result: Result) -> None:
    _atomic_write(result_path(root, result.date), result.model_dump_json(indent=2, by_alias=True))


def pending(root: Path) -> list[Request]:
    """Requests without a matching result, oldest session date first."""
    out: list[Request] = []
    for path in root.glob(f"*{REQUEST_SUFFIX}"):
        req = Request.model_validate_json(path.read_text(encoding="utf-8"))
        res = result_path(root, req.date)
        if res.is_file():
            done = Result.model_validate_json(res.read_text(encoding="utf-8"))
            if done.request_id == req.request_id:
                continue
        out.append(req)
    return sorted(out, key=lambda r: date_key(r.date))


# ── host runner ──
#: ``(argv, env, log_path) -> exit code`` — the test seam for running the recipe.
CommandRunner = Callable[[list[str], dict[str, str], Path], int]


def _which(name: str, env_var: str | None, *fallbacks: Path) -> str | None:
    explicit = os.environ.get(env_var) if env_var else None
    if explicit and Path(explicit).is_file():
        return explicit
    found = shutil.which(name)
    if found:
        return found
    return next((str(p) for p in fallbacks if p.is_file()), None)


def resolve_tools() -> dict[str, str | None]:
    """Every binary ``just heartwood-agent`` needs, resolved the way a login shell would
    find them (the systemd user manager's PATH has none of node/deno/uv/just)."""
    home = Path.home()
    try:
        node: str | None = find_node()
    except FileNotFoundError:
        node = None
    return {
        "node": node,
        "deno": _which("deno", "DENO", home / ".deno" / "bin" / "deno"),
        "git": _which("git", None),
        "docker": _which("docker", None),
        "uv": _which("uv", "UV", home / ".local" / "bin" / "uv"),
        "just": _which("just", "JUST", home / ".cargo" / "bin" / "just"),
    }


def child_env(tools: dict[str, str | None], base: dict[str, str] | None = None) -> dict[str, str]:
    """``base`` (default: this process's env) with every tool's directory prepended to PATH."""
    env = dict(os.environ if base is None else base)
    dirs: list[str] = []
    for path in tools.values():
        if path:
            d = str(Path(path).parent)
            if d not in dirs:
                dirs.append(d)
    env["PATH"] = os.pathsep.join([*dirs, env.get("PATH", "")])
    return env


def run_command(argv: list[str], env: dict[str, str], log_path: Path) -> int:
    """Run ``argv`` with stdout+stderr appended to ``log_path``; return its exit code."""
    with log_path.open("a", encoding="utf-8") as fh:
        return subprocess.run(
            argv, env=env, stdout=fh, stderr=subprocess.STDOUT, check=False
        ).returncode


_RUN_DIR = re.compile(r"^RUN_DIR=(.+)$", re.MULTILINE)
_COMMIT = re.compile(r"^heartwood-agent: committed (\S+)", re.MULTILINE)


def _from_log(text: str) -> tuple[Path | None, str | None]:
    runs = _RUN_DIR.findall(text)
    commits = _COMMIT.findall(text)
    return (Path(runs[-1].strip()) if runs else None, commits[-1] if commits else None)


def _summary(run_dir: Path | None) -> dict[str, Any]:
    if run_dir is None:
        return {}
    try:
        return ledger.read_summary(run_dir)
    except (FileNotFoundError, ValueError):
        return {}


@dataclass
class DrainReport:
    results: list[Result] = field(default_factory=list)
    stopped_for_backfill: bool = False


def drain_requests(
    root: Path,
    *,
    runner: CommandRunner = run_command,
    tools: dict[str, str | None] | None = None,
    ledger_path: Path = ledger.LEDGER_PATH,
    backfill_lock: Path = BACKFILL_LOCK,
) -> DrainReport:
    """Process every pending request, oldest first, re-scanning until none is left (D36-3)."""
    report = DrainReport()
    logs = root / "logs"
    logs.mkdir(parents=True, exist_ok=True)
    tools = tools if tools is not None else resolve_tools()
    missing = sorted(name for name, path in tools.items() if not path)
    if missing:
        for req in pending(root):
            now = _now()
            res = Result(
                request_id=req.request_id,
                date=req.date,
                outcome="failed",
                exit_code=-1,
                meaning=f"{meaning(-1)}: {', '.join(missing)}",
                started_at=now,
                finished_at=now,
            )
            write_result(root, res)
            report.results.append(res)
        log.error("heartwood runner preflight failed — missing %s", ", ".join(missing))
        return report
    log.info("preflight ok: %s", " ".join(f"{k}={v}" for k, v in tools.items()))
    env = child_env(tools)
    while True:
        queue = pending(root)
        if not queue:
            return report
        for req in queue:
            if backfill_lock.exists():
                log.info("heartwood backfill holds %s — leaving requests pending", backfill_lock)
                report.stopped_for_backfill = True
                return report
            report.results.append(_handle(root, req, runner, tools, env, logs, ledger_path))


def _handle(
    root: Path,
    req: Request,
    runner: CommandRunner,
    tools: dict[str, str | None],
    env: dict[str, str],
    logs: Path,
    ledger_path: Path,
) -> Result:
    started = _now()
    log_path = logs / f"{req.date}.{req.request_id}.log"
    try:
        if ledger.is_published(req.date, ledger_path):
            res = Result(
                request_id=req.request_id,
                date=req.date,
                outcome="already-published",
                exit_code=0,
                meaning="already published — nothing run (revert first to redo it)",
                started_at=started,
                finished_at=_now(),
            )
            log.info("heartwood %s already published — skipped", req.date)
        else:
            code = runner([str(tools["just"]), "heartwood-agent", req.date], env, log_path)
            run_dir, commit = _from_log(log_path.read_text(encoding="utf-8", errors="replace"))
            s = _summary(run_dir)
            res = Result(
                request_id=req.request_id,
                date=req.date,
                outcome="published" if code == 0 else "failed",
                exit_code=code,
                meaning=meaning(code),
                run_dir=str(run_dir) if run_dir else None,
                run_id=s.get("run_id"),
                status=s.get("status"),
                cost_usd=s.get("cost_usd"),
                counts=s.get("counts"),
                commit=commit,
                log=str(log_path),
                started_at=started,
                finished_at=_now(),
            )
            log.info("heartwood %s → exit %d (%s)", req.date, code, meaning(code))
    except Exception as exc:  # one bad request must not strand the rest
        log.exception("heartwood runner error on %s", req.date)
        res = Result(
            request_id=req.request_id,
            date=req.date,
            outcome="failed",
            exit_code=-2,
            meaning=f"{meaning(-2)}: {type(exc).__name__}: {exc}",
            log=str(log_path),
            started_at=started,
            finished_at=_now(),
        )
    write_result(root, res)
    return res
