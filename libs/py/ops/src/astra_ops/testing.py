"""Test seams for astra-ops (used by ``libs/py/ops/tests``, like ``astra_observe.testing``).

``Scripted`` plays back the exact sequence of child argv lists and lock steps a command must
take and fails on anything else; ``make_ctx`` builds a ``Ctx`` over a temp data root with every
outside-world seam faked. The step builders (``push_steps``, ``deploy_call``) are the shared
sub-sequences several commands run.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path

from astra_ops.context import Ctx, Done, Out, Runner


def _expect(ok: bool, message: str) -> None:
    if not ok:
        raise AssertionError(message)


@dataclass
class Call:
    """One expected child: its argv and what it returns.

    ``env`` / ``stdin`` / ``out`` / ``limit``, when given, are checked too (``limit`` also
    marks a ``Runner.bounded`` call). ``stdout`` is what a captured, ``> file`` or
    ``| tee file`` child printed. ``effect`` runs when the call happens (a fake child's side
    effect, e.g. writing a file)."""

    argv: list[str]
    rc: int = 0
    stdout: str | bytes = b""
    env: Mapping[str, str] | None = None
    stdin: bytes | None = None
    out: Out | None = None
    effect: Callable[[], None] | None = None
    limit: float | None = None


Step = Call | tuple[str, ...]


@dataclass
class Scripted(Runner):
    """Plays back ``steps`` in order; any other call or lock step raises AssertionError.

    ``passthrough`` names argv[0]s handed to a real ``Runner`` (and still recorded)."""

    steps: list[Step]
    passthrough: frozenset[str] = frozenset()
    seen: list[Step] = field(default_factory=list)
    real: Runner = field(default_factory=Runner)

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
        argv = list(argv)
        if argv and argv[0] in self.passthrough:
            self.seen.append(Call(argv))
            return self.real.run(
                argv,
                env=env,
                out=out,
                out_path=out_path,
                stderr_null=stderr_null,
                stdin_data=stdin_data,
            )
        _expect(bool(self.steps), f"unexpected call {argv} (script exhausted; seen {self.seen})")
        step = self.steps.pop(0)
        if not isinstance(step, Call):
            raise AssertionError(f"expected {step}, got call {argv}")  # noqa: TRY004 -- a failed expectation, not a type error
        _expect(argv == step.argv, f"argv mismatch:\n  want {step.argv}\n  got  {argv}")
        if step.env is not None:
            _expect(dict(env or {}) == dict(step.env), f"env mismatch for {argv}: {env}")
        if step.stdin is not None:
            _expect(stdin_data == step.stdin, f"stdin mismatch for {argv}: {stdin_data!r}")
        if step.out is not None:
            _expect(out == step.out, f"stdout mode mismatch for {argv}: {out}")
        self.seen.append(step)
        if step.effect is not None:
            step.effect()
        data = step.stdout.encode() if isinstance(step.stdout, str) else step.stdout
        if out in ("file", "tee"):
            if out_path is None:
                raise AssertionError(f"{argv}: out={out} without out_path")
            out_path.write_bytes(data)
        return Done(step.rc, data if out == "capture" else b"")

    def bounded(self, argv: Sequence[str], *, limit: float, out_path: Path | None = None) -> Done:
        argv = list(argv)
        _expect(bool(self.steps), f"unexpected bounded call {argv} (script exhausted)")
        step = self.steps.pop(0)
        if not isinstance(step, Call):
            raise AssertionError(f"expected {step}, got bounded call {argv}")  # noqa: TRY004 -- a failed expectation, not a type error
        _expect(argv == step.argv, f"argv mismatch:\n  want {step.argv}\n  got  {argv}")
        _expect(step.limit == limit, f"limit mismatch for {argv}: want {step.limit}, got {limit}")
        self.seen.append(step)
        if step.effect is not None:
            step.effect()
        if out_path is not None:
            data = step.stdout.encode() if isinstance(step.stdout, str) else step.stdout
            out_path.write_bytes(data)
        return Done(step.rc)

    def note(self, event: tuple[str, ...]) -> None:
        _expect(bool(self.steps), f"unexpected lock step {event} (script exhausted)")
        step = self.steps.pop(0)
        _expect(step == event, f"expected {step}, got lock step {event}")
        self.seen.append(event)

    def assert_done(self) -> None:
        _expect(not self.steps, f"never called: {self.steps}")


def make_ctx(
    tmp: Path,
    steps: list[Step],
    *,
    config: Mapping[str, str] | None = None,
    passthrough: frozenset[str] = frozenset(),
    tty: bool = False,
    answer: str = "",
    node: str | None = "/usr/bin/node",
) -> tuple[Ctx, Scripted]:
    """A ``Ctx`` over ``tmp`` (repo ``tmp/repo``, data root ``tmp/state``, deploy checkout
    ``tmp/deploy``, uv ``/uv``, just ``/just``, Drive mount ``tmp/drive``) whose runner is
    ``Scripted(steps)``, config is ``config``, and terminal answer is ``answer``. A sleep is
    the step ``("sleep", "<seconds>")``; the clock always reads ``T``."""
    runner = Scripted(list(steps), passthrough=passthrough)
    cfg = dict(config or {})

    def which(name: str) -> str | None:
        return node if name == "node" else None

    ctx = Ctx(
        repo_root=tmp / "repo",
        data_root=tmp / "state",
        uv_bin="/uv",
        mouthpiece_episodes=tmp / "state" / "mouthpiece" / "episodes",
        akasha_audio_live=tmp / "state" / "scribe" / "data" / "saved",
        deploy_root=tmp / "deploy",
        just_bin="/just",
        craig_drop_dir=tmp / "drive",
        home=tmp / "home",
        runner=runner,
        config_reader=lambda keys: [cfg[k] for k in keys],
        which=which,
        stdin_isatty=lambda: tty,
        prompt=lambda _q: answer,
        lock_timeout=0.3,
        sleep=lambda s: runner.note(("sleep", f"{s:g}")),
        now=lambda: "T",
    )
    return ctx, runner


def uv(*args: str) -> list[str]:
    """``/uv run --frozen --no-sync <args>`` (make_ctx's uv)."""
    return ["/uv", "run", "--frozen", "--no-sync", *args]


def clone(tmp: Path) -> str:
    """A stand-in astra-data clone at ``tmp/state/astra-data`` (just its ``.git`` dir)."""
    repo = tmp / "state" / "astra-data"
    (repo / ".git").mkdir(parents=True)
    return str(repo)


def push_steps(repo: str, *, ahead: bool = True, moved: bool = False) -> list[Step]:
    """`_astra-data-push`'s children for a clone on main."""
    g = ["git", "-C", repo]
    steps: list[Step] = [
        Call([*g, "rev-parse", "--abbrev-ref", "HEAD"], stdout="main\n", out="capture"),
        Call([*g, "fetch", "-q", "origin"]),
        Call([*g, "merge-base", "--is-ancestor", "origin/main", "HEAD"], rc=1 if moved else 0),
    ]
    if moved:
        steps.append(Call([*g, "rebase", "-q", "--autostash", "origin/main"]))
    steps.append(Call([*g, "rev-list", "origin/main..HEAD"], stdout="abc\n" if ahead else ""))
    if ahead:
        steps += [
            Call([*g, "push", "-q", "origin", "main"]),
            Call([*g, "rev-parse", "--short", "HEAD"], stdout="abc1234\n"),
        ]
    return steps


def deploy_call(tmp: Path, *args: str, rc: int = 0) -> Call:
    """``just deploy <args>``: make_ctx's deploy.sh with the justfile's ASTRA_DATA_ROOT."""
    return Call(
        [f"{tmp}/repo/deploy/deploy.sh", *args],
        rc=rc,
        env={"ASTRA_DATA_ROOT": f"{tmp}/state"},
    )
