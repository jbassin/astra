"""The seams every ops command runs through: subprocesses, flocks, confirmation and config.

Every child process starts from an argument list (``subprocess`` without a shell), so no
argument is ever re-parsed by a shell. Every command reaches the outside world only through
``Ctx``: the ``Runner`` (subprocesses), ``Ctx.lock`` (flocks), ``Ctx.confirm`` and
``Ctx.config``. The tests swap the runner for a recorder and assert the exact sequence of argv
lists and lock steps a command takes.

Exit-code semantics mirror the bash recipes these commands replaced (``set -euo pipefail``):

- ``Ctx.check`` / ``Ctx.capture`` stop the command with the child's exit code when it fails,
  as ``set -e`` did for a plain command or a ``var="$(cmd)"`` assignment.
- ``Ctx.run`` / ``Ctx.output`` never stop it; the caller tests the code, as ``if cmd``,
  ``cmd || ...`` and ``[ "$(cmd)" = x ]`` did.
- ``Fail(code)`` is ``exit code``. ``Ctx.sub`` runs a former sub-recipe in-process and turns
  its ``Fail`` back into a return code, as calling ``just <sub-recipe>`` did.
"""

from __future__ import annotations

import contextlib
import fcntl
import os
import shutil
import signal
import subprocess
import sys
import time
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import IO, Literal

# Imported up front, not lazily: a deploy may re-sync the venv while linguist-commit runs.
from astra_ontology_config import load as load_config

#: Seconds a command waits for a busy flock (`flock -w 1800` in the bash recipes).
LOCK_TIMEOUT_S = 1800.0

#: Exit code for a live command run without a terminal and without ``--yes``.
EXIT_NOT_CONFIRMED_UNATTENDED = 64
#: Exit code when a person answers anything but y at the prompt (just's own [confirm] code).
EXIT_DECLINED = 1

Out = Literal["inherit", "capture", "null", "file", "tee"]


class Fail(Exception):
    """Stop the command with this exit code."""

    def __init__(self, code: int) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class Done:
    """One finished child: its exit code and, for ``capture``, its stdout bytes."""

    returncode: int = 0
    stdout: bytes = b""


#: Seconds an interrupted child gets to exit after SIGINT before it is killed.
INTERRUPT_GRACE_S = 30.0


def _start_failed(argv: Sequence[str], exc: OSError) -> Done:
    """A child that could not start, reported the way bash reports it: a message on stderr
    and exit 127 (not found) or 126 (found but not runnable)."""
    name = argv[0] if argv else "?"
    _flush()
    print(f"{name}: {exc.strerror or exc}", file=sys.stderr, flush=True)  # noqa: T201 -- command-line output
    return Done(127 if isinstance(exc, FileNotFoundError) else 126)


def _interrupted(proc: subprocess.Popen[bytes]) -> None:
    """Ctrl-C: like bash, let the child finish handling SIGINT (a VCS child drops its index
    lock, deploy.sh records its outcome) instead of killing it. Forward SIGINT (a terminal
    already sends it to the whole group; a signal sent to us alone does not reach the child),
    wait up to INTERRUPT_GRACE_S, and only then kill."""
    if proc.poll() is None:
        with contextlib.suppress(ProcessLookupError):
            proc.send_signal(signal.SIGINT)
    try:
        proc.wait(timeout=INTERRUPT_GRACE_S)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()


class Runner:
    """Starts child processes from argument lists; the real one. Tests use a recorder."""

    def run(
        self,
        argv: Sequence[str],
        *,
        env: Mapping[str, str] | None = None,
        out: Out = "inherit",
        out_path: Path | None = None,
        stderr_null: bool = False,
        stdin_data: bytes | None = None,
    ) -> Done:
        """Run ``argv`` to completion. ``out`` routes stdout: to ours, captured, discarded,
        into ``out_path`` (``> file``) or both ours and ``out_path`` (``| tee file``).

        A child that cannot start (missing or not executable) or an output file that cannot
        be opened is a failed step with bash's exit code, never an exception, so the
        caller's ``|| ...`` handling runs as it did in bash."""
        _flush()
        child_env = None if env is None else {**os.environ, **env}
        stderr = subprocess.DEVNULL if stderr_null else None
        if out == "tee":
            if stdin_data is not None:
                raise ValueError("out='tee' takes no stdin_data")
            return self._tee(argv, child_env, out_path, stderr)
        sink: IO[bytes] | int | None
        fh: IO[bytes] | None = None
        if out == "capture":
            sink = subprocess.PIPE
        elif out == "null":
            sink = subprocess.DEVNULL
        elif out == "file":
            if out_path is None:
                raise ValueError("out='file' needs out_path")
            try:
                fh = out_path.open("wb")
            except OSError as exc:  # bash: `cmd > file` fails with 1 when the file can't open
                print(f"{out_path}: {exc.strerror}", file=sys.stderr, flush=True)  # noqa: T201 -- command-line output
                return Done(1)
            sink = fh
        else:
            sink = None
        try:
            try:
                proc = subprocess.Popen(
                    list(argv),
                    env=child_env,
                    stdout=sink,
                    stderr=stderr,
                    stdin=subprocess.PIPE if stdin_data is not None else None,
                )
            except OSError as exc:
                return _start_failed(argv, exc)
            with proc:
                try:
                    stdout, _ = proc.communicate(stdin_data)
                except KeyboardInterrupt:
                    _interrupted(proc)
                    raise
            return Done(proc.returncode, stdout or b"")
        finally:
            if fh is not None:
                fh.close()

    def _tee(
        self,
        argv: Sequence[str],
        env: Mapping[str, str] | None,
        out_path: Path | None,
        stderr: int | None,
    ) -> Done:
        """``cmd | tee file`` under pipefail: stream each line to our stdout and the file;
        the exit code is the child's."""
        if out_path is None:
            raise ValueError("out='tee' needs out_path")
        stdout = sys.stdout.buffer
        try:
            proc = subprocess.Popen(list(argv), env=env, stdout=subprocess.PIPE, stderr=stderr)
        except OSError as exc:
            out_path.write_bytes(b"")
            return _start_failed(argv, exc)
        with out_path.open("wb") as fh, proc:
            if proc.stdout is None:  # stdout=PIPE always sets it
                raise RuntimeError("no stdout pipe")
            try:
                for line in proc.stdout:
                    stdout.write(line)
                    stdout.flush()
                    fh.write(line)
                return Done(proc.wait())
            except KeyboardInterrupt:
                _interrupted(proc)
                raise

    def note(self, event: tuple[str, ...]) -> None:
        """A lock step; the recorder logs it in the call sequence, the real runner ignores it."""


def _flush() -> None:
    sys.stdout.flush()
    sys.stderr.flush()


class Lock:
    """A flock(2) on ``path``: the same kernel lock `flock(1)` takes in deploy.sh and in
    the remaining bash recipes, so both sides exclude each other. ``open`` truncates like
    bash's ``exec 9>file``. Children never inherit the descriptor (close_fds), so
    ``release`` really frees it, as ``exec 9>&-`` did."""

    def __init__(self, ctx: Ctx, name: str, path: Path, *, shared: bool) -> None:
        self._ctx = ctx
        self.name = name
        self.path = path
        self.shared = shared
        self._fh: IO[str] | None = None

    @property
    def held(self) -> bool:
        return self._fh is not None

    def acquire(self) -> bool:
        """Wait up to ``ctx.lock_timeout`` seconds; False (holding nothing) on timeout."""
        mode = "sh" if self.shared else "ex"
        self._ctx.runner.note(("lock", self.name, mode))
        self.path.parent.mkdir(parents=True, exist_ok=True)
        fh = self.path.open("w")
        op = (fcntl.LOCK_SH if self.shared else fcntl.LOCK_EX) | fcntl.LOCK_NB
        deadline = time.monotonic() + self._ctx.lock_timeout
        while True:
            try:
                fcntl.flock(fh.fileno(), op)
            except BlockingIOError:
                if time.monotonic() >= deadline:
                    fh.close()
                    self._ctx.runner.note(("lock-busy", self.name))
                    return False
                time.sleep(0.2)
                continue
            self._fh = fh
            return True

    def release(self) -> None:
        if self._fh is not None:
            self._ctx.runner.note(("unlock", self.name))
            self._fh.close()
            self._fh = None


def _default_config_reader(keys: Sequence[str]) -> list[str]:
    """``python -m astra_ontology_config <keys>``, in-process: the same load and lookup."""
    cfg = load_config()
    values: list[str] = []
    for key in keys:
        value: object = cfg
        for part in key.replace("-", "_").split("."):
            value = getattr(value, part)
        values.append(str(value))
    return values


def _ask(question: str) -> str:
    """The prompt goes to stderr (stdout may be piped); the answer is one stdin line."""
    sys.stderr.write(question)
    sys.stderr.flush()
    line = sys.stdin.readline()
    if not line:
        raise EOFError
    return line


def _isatty() -> bool:
    try:
        return os.isatty(sys.stdin.fileno())
    except (OSError, ValueError):
        return False


@dataclass
class Ctx:
    """Everything a command reads from its surroundings.

    The paths default exactly as the justfile's variables do (same env var, same default);
    the just wrappers pass the justfile's values explicitly.
    """

    repo_root: Path
    data_root: Path
    uv_bin: str
    mouthpiece_episodes: Path
    akasha_audio_live: Path
    home: Path = field(default_factory=Path.home)
    runner: Runner = field(default_factory=Runner)
    config_reader: Callable[[Sequence[str]], list[str]] = _default_config_reader
    which: Callable[[str], str | None] = shutil.which
    stdin_isatty: Callable[[], bool] = _isatty
    prompt: Callable[[str], str] = _ask
    lock_timeout: float = LOCK_TIMEOUT_S

    # --- paths derived from the data root (the justfile's git_publish_lock etc.) ---

    @property
    def git_publish_lock(self) -> Path:
        return self.data_root / "locks" / "git-publish.lock"

    @property
    def host_tooling_lock(self) -> Path:
        return self.data_root / "locks" / "host-tooling.lock"

    def lock(self, name: Literal["git-publish", "host-tooling"], *, shared: bool = False) -> Lock:
        path = self.git_publish_lock if name == "git-publish" else self.host_tooling_lock
        return Lock(self, name, path, shared=shared)

    # --- output ---

    @staticmethod
    def out(msg: str) -> None:
        print(msg, flush=True)  # noqa: T201 -- command-line output

    @staticmethod
    def err(msg: str) -> None:
        print(msg, file=sys.stderr, flush=True)  # noqa: T201 -- command-line output

    # --- subprocesses ---

    def run(
        self,
        argv: Sequence[str],
        *,
        env: Mapping[str, str] | None = None,
        out: Out = "inherit",
        out_path: Path | None = None,
        stderr_null: bool = False,
        stdin_data: bytes | None = None,
    ) -> int:
        """Run; return the exit code (the caller decides what a failure means)."""
        done = self.runner.run(
            argv,
            env=env,
            out=out,
            out_path=out_path,
            stderr_null=stderr_null,
            stdin_data=stdin_data,
        )
        return done.returncode

    def check(
        self,
        argv: Sequence[str],
        *,
        env: Mapping[str, str] | None = None,
        stdin_data: bytes | None = None,
    ) -> None:
        """Run; a failure stops the command with the child's code (``set -e``)."""
        rc = self.run(argv, env=env, stdin_data=stdin_data)
        if rc != 0:
            raise Fail(rc)

    def output(self, argv: Sequence[str], *, stderr_null: bool = False) -> str:
        """Stdout minus trailing newlines, whatever the exit code (``"$(cmd)"`` in a test)."""
        done = self.runner.run(argv, out="capture", stderr_null=stderr_null)
        return done.stdout.decode("utf-8", "surrogateescape").rstrip("\n")

    def capture(self, argv: Sequence[str]) -> str:
        """Stdout minus trailing newlines; a failure stops the command (``v="$(cmd)"``)."""
        return self.capture_bytes(argv).decode("utf-8", "surrogateescape").rstrip("\n")

    def capture_bytes(self, argv: Sequence[str]) -> bytes:
        done = self.runner.run(argv, out="capture")
        if done.returncode != 0:
            raise Fail(done.returncode)
        return done.stdout

    def uv_run(self, *args: str) -> list[str]:
        """The argv of ``{{uv_bin}} run --frozen --no-sync <args>`` (the deploy checkout's venv,
        never re-synced or relocked: deploy.sh's locked sync is the only one there)."""
        return [self.uv_bin, "run", "--frozen", "--no-sync", *args]

    @staticmethod
    def sub(fn: Callable[..., int], *args: object) -> int:
        """Run a former sub-recipe in-process; its ``Fail`` becomes its return code."""
        try:
            return fn(*args)
        except Fail as exc:
            return exc.code

    # --- config ---

    def config(self, *keys: str) -> list[str]:
        return self.config_reader(keys)

    # --- confirmation ---

    def confirm(self, command: str, what: str, *, yes: bool) -> None:
        """Ask before a paid, live or destructive step, like just's ``[confirm]``.

        ``--yes`` skips the question (the systemd units and the request runner pass it).
        Without it a terminal gets the question and only y/yes proceeds (else exit 1); with
        no terminal the command refuses (exit 64) instead of hanging or guessing.
        """
        if yes:
            return
        if not self.stdin_isatty():
            self.err(
                f"{command}: refusing — {what} No terminal to confirm on: pass --yes to run "
                "it unattended."
            )
            raise Fail(EXIT_NOT_CONFIRMED_UNATTENDED)
        try:
            answer = self.prompt(f"{command}: {what} Type y to continue: ")
        except EOFError:
            answer = ""
        if answer.strip().lower() not in {"y", "yes"}:
            self.err(f"{command}: not confirmed — nothing done")
            raise Fail(EXIT_DECLINED)

    # --- environment ---

    def prepend_path(self, directory: Path) -> None:
        """``export PATH="<dir>:$PATH"`` for this process and every child."""
        os.environ["PATH"] = f"{directory}:{os.environ.get('PATH', '')}"


def deploy_argv(ctx: Ctx, *args: str) -> tuple[list[str], dict[str, str]]:
    """``just deploy <args>``: deploy.sh from this checkout with the justfile's data root."""
    return [str(ctx.repo_root / "deploy" / "deploy.sh"), *args], {
        "ASTRA_DATA_ROOT": str(ctx.data_root)
    }


def deploy(ctx: Ctx, *args: str) -> int:
    argv, env = deploy_argv(ctx, *args)
    return ctx.run(argv, env=env)
