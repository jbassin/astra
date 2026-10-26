"""The CLI's confirmation rules, the real Runner and Lock, and the callers that must pass --yes."""

from __future__ import annotations

import fcntl
import re
import sys
from pathlib import Path

import pytest
from astra_config import find_repo_root
from astra_ops import boot, cli
from astra_ops.context import Ctx, Lock, Runner
from astra_ops.testing import Call, Step, clone, make_ctx, push_steps, uv

REPO = find_repo_root()


# --- confirmation ----------------------------------------------------------------------------


def test_unattended_without_yes_refuses_64_and_runs_nothing(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    ctx, r = make_ctx(tmp_path, [], tty=False)
    ctx.deploy_root = ctx.repo_root  # past the heartwood commands' deploy-checkout guard
    for command, args in [
        ("linguist-commit", []),
        ("astra-data-push", []),
        ("mouthpiece-seed", []),
        ("akasha-seed", []),
        ("heartwood-push-deploy", []),
        ("heartwood-revert", ["d"]),
        ("heartwood-agent", ["d"]),
        ("heartwood-agent", ["d", "--dry-run"]),
        ("heartwood-agent", ["d", "--no-push"]),
        ("pipeline-terminate", ["r"]),
    ]:
        assert cli.dispatch(ctx, command, args) == 64, command
    r.assert_done()
    assert "pass --yes to run it unattended" in capsys.readouterr().err


@pytest.mark.parametrize(("answer", "rc"), [("n", 1), ("", 1), ("nope", 1)])
def test_terminal_answer_other_than_y_declines(tmp_path: Path, answer: str, rc: int) -> None:
    ctx, r = make_ctx(tmp_path, [], tty=True, answer=answer)
    assert cli.dispatch(ctx, "akasha-seed", []) == rc
    r.assert_done()


@pytest.mark.parametrize("answer", ["y", "Y", "yes\n"])
def test_terminal_y_proceeds(tmp_path: Path, answer: str) -> None:
    repo = clone(tmp_path)
    ctx, r = make_ctx(
        tmp_path, push_steps(repo), config={"data.content-root": repo}, tty=True, answer=answer
    )
    assert cli.dispatch(ctx, "astra-data-push", []) == 0
    r.assert_done()


def test_yes_skips_the_question(tmp_path: Path) -> None:
    repo = clone(tmp_path)
    ctx, r = make_ctx(tmp_path, push_steps(repo), config={"data.content-root": repo}, tty=False)
    ctx.prompt = lambda _q: pytest.fail("asked despite --yes")
    assert cli.dispatch(ctx, "astra-data-push", ["--yes"]) == 0
    r.assert_done()


def test_mouthpiece_publish_needs_no_confirmation(tmp_path: Path) -> None:
    steps: list[Step] = [Call(uv("python", "-m", "astra_mouthpiece.publish", "--allow-shrink"))]
    ctx, r = make_ctx(tmp_path, steps, tty=False)
    assert cli.dispatch(ctx, "mouthpiece-publish", ["--allow-shrink"]) == 0
    r.assert_done()


def test_bad_arguments_exit_64_before_asking(tmp_path: Path) -> None:
    ctx, r = make_ctx(tmp_path, [], tty=True, answer="y")
    ctx.prompt = lambda _q: pytest.fail("asked before the flags were checked")
    assert cli.dispatch(ctx, "linguist-commit", ["--force"]) == 64
    assert cli.dispatch(ctx, "heartwood-agent", ["d", "--bogus"]) == 64
    assert cli.dispatch(ctx, "heartwood-agent", []) == 64
    assert cli.dispatch(ctx, "heartwood-revert", ["d", "extra"]) == 64
    r.assert_done()


@pytest.mark.parametrize(
    ("command", "args"),
    [("heartwood-agent", ["2026-1-2", "--dry-run"]), ("heartwood-revert", ["2026-1-2", "--yes"])],
)
def test_heartwood_refuses_outside_the_deploy_checkout(
    tmp_path: Path, capsys: pytest.CaptureFixture[str], command: str, args: list[str]
) -> None:
    ctx, r = make_ctx(tmp_path, [], tty=True, answer="y")
    ctx.prompt = lambda _q: pytest.fail("asked before the checkout was checked")
    assert cli.dispatch(ctx, command, args) == cli.EXIT_NOT_DEPLOY_CHECKOUT
    r.assert_done()
    err = capsys.readouterr().err
    assert f"not the deploy checkout {tmp_path}/deploy" in err
    assert f"just -f {tmp_path}/deploy/justfile {command} {' '.join(args)}" in err


def test_heartwood_runs_from_the_deploy_checkout(tmp_path: Path) -> None:
    """Past the guard, the command goes on to its confirmation (declined here)."""
    ctx, r = make_ctx(tmp_path, [], tty=True, answer="n")
    ctx.deploy_root = ctx.repo_root
    assert cli.dispatch(ctx, "heartwood-revert", ["2026-1-2"]) == 1
    r.assert_done()


def test_parser_passes_flag_like_args_through() -> None:
    ns = cli.build_parser().parse_args(
        ["--data-root", "/x", "mouthpiece-publish", "--allow-shrink"]
    )
    assert (ns.data_root, ns.command, ns.args) == ("/x", "mouthpiece-publish", ["--allow-shrink"])
    ns = cli.build_parser().parse_args(["heartwood-agent", "2026-1-2", "--dry-run", "--model=x"])
    assert ns.args == ["2026-1-2", "--dry-run", "--model=x"]


def test_path_defaults_follow_the_justfile(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("MOUTHPIECE_EPISODES", raising=False)
    monkeypatch.delenv("AKASHA_AUDIO_LIVE", raising=False)
    monkeypatch.setenv("ASTRA_DATA_ROOT", "")  # env_var_or_default: empty = default
    monkeypatch.setenv("UV_BIN", "/opt/uv")
    ns = cli.build_parser().parse_args(["akasha-seed"])
    assert ns.data_root == "/ruby/data/astra-state"
    assert ns.uv == "/opt/uv"
    assert ns.mouthpiece_episodes == "/ruby/data/astra-state/mouthpiece/episodes"
    assert ns.akasha_audio == "/ruby/data/astra-state/scribe/data/saved"


# --- the real Runner and Lock ----------------------------------------------------------------


def test_runner_tee_streams_and_keeps_the_exit_code(
    tmp_path: Path, capfd: pytest.CaptureFixture[str]
) -> None:
    out = tmp_path / "run.out"
    argv = [sys.executable, "-c", "print('a'); print('RUN_DIR=/r'); raise SystemExit(2)"]
    done = Runner().run(argv, out="tee", out_path=out)
    assert done.returncode == 2
    assert out.read_text() == "a\nRUN_DIR=/r\n"
    assert capfd.readouterr().out == "a\nRUN_DIR=/r\n"


def test_runner_passes_arguments_verbatim(tmp_path: Path) -> None:
    """No shell: metacharacters arrive as one literal argument."""
    tricky = "$(touch pwned); `id` ; *"
    done = Runner().run(
        [sys.executable, "-c", "import sys; print(sys.argv[1])", tricky], out="capture"
    )
    assert done.stdout.decode().rstrip("\n") == tricky
    assert not Path("pwned").exists()


def test_runner_file_stdin_and_env(tmp_path: Path) -> None:
    out = tmp_path / "o"
    code = "import os, sys; sys.stdout.write(os.environ['X'] + sys.stdin.read())"
    Runner().run(
        [sys.executable, "-c", code], out="file", out_path=out, stdin_data=b"-in", env={"X": "x"}
    )
    assert out.read_text() == "x-in"


def test_lock_is_the_same_kernel_lock_flock1_takes(tmp_path: Path) -> None:
    ctx, _ = make_ctx(tmp_path, [])
    ctx.runner = Runner()
    path = tmp_path / "locks" / "l.lock"
    shared_a = Lock(ctx, "l", path, shared=True)
    shared_b = Lock(ctx, "l", path, shared=True)
    exclusive = Lock(ctx, "l", path, shared=False)
    assert shared_a.acquire() and shared_b.acquire()  # shared holders coexist
    assert not exclusive.acquire()  # ...and keep an exclusive one out
    shared_a.release()
    shared_b.release()
    assert exclusive.acquire()
    with path.open("w") as other, pytest.raises(BlockingIOError):
        fcntl.flock(other.fileno(), fcntl.LOCK_SH | fcntl.LOCK_NB)
    exclusive.release()


def test_ctx_lock_paths_match_the_justfile(tmp_path: Path) -> None:
    ctx, _ = make_ctx(tmp_path, [])
    assert ctx.git_publish_lock == tmp_path / "state/locks/git-publish.lock"
    assert ctx.host_tooling_lock == tmp_path / "state/locks/host-tooling.lock"
    assert isinstance(ctx, Ctx)


# --- callers ---------------------------------------------------------------------------------

WRAPPER = re.compile(r'^([a-z_-]+)(?: [^\n]*)?:\n    @\{\{ops\}\} (\S+) "\$@"$', re.MULTILINE)


def wrappers() -> dict[str, str]:
    """just recipe -> the astra-ops command its one-line wrapper runs."""
    return dict(WRAPPER.findall((REPO / "justfile").read_text()))


def confirmed_recipes() -> set[str]:
    return {r for r, c in wrappers().items() if c in cli.CONFIRMED}


#: Commands whose recipe is more than a one-line wrapper: signoz-rules-check maps astra-ops's
#: "no API key" exit 3 to 0.
NOT_ONE_LINE = {"signoz-rules-check"}


def test_every_cli_command_has_one_wrapper() -> None:
    commands = sorted(wrappers().values())
    assert commands == sorted(set(cli.COMMANDS) - NOT_ONE_LINE), commands
    assert confirmed_recipes() == {
        "linguist-commit",
        "_astra-data-push",
        "mouthpiece-seed",
        "akasha-seed",
        "heartwood-agent",
        "_heartwood-push-deploy",
        "heartwood-revert",
        "heartwood-backfill",
        "_heartwood-backfill-loop",
        "heartwood-requests",
        "pipeline-terminate",
    }


def test_every_unit_that_runs_a_confirmed_recipe_passes_yes() -> None:
    confirmed, seen = confirmed_recipes(), set()
    for unit in sorted((REPO / "deploy" / "systemd").glob("*.service")):
        for line in unit.read_text().splitlines():
            m = re.match(r"ExecStart=\S*/just (\S+)(.*)", line)
            if m and m.group(1) in confirmed:
                seen.add(m.group(1))
                assert "--yes" in m.group(2).split(), f"{unit.name}: {line}"
    assert seen == {"linguist-commit", "heartwood-requests"}


def test_unattended_callers_pass_yes() -> None:
    """The request runner; the backfill launch passes --yes to its loop (test_backfill). No
    recipe calls another confirmed recipe through just any more."""
    requests = (REPO / "apps/heartwood/py/src/astra_heartwood/requests.py").read_text()
    assert '"heartwood-agent", req.date, "--yes"]' in requests
    nested = re.compile(r'\{\{just_executable\(\)\}\}" -f "\{\{justfile\(\)\}\}" (\S+)')
    confirmed = confirmed_recipes()
    for line in (REPO / "justfile").read_text().splitlines():
        m = nested.search(line)
        assert not (m and m.group(1) in confirmed), line


def test_boot_knows_every_option_that_takes_a_value() -> None:
    """boot.py skips global options to find the data root; a new one must be listed there."""
    parser = cli.build_parser()
    valued = {
        opt
        for action in parser._actions
        if action.option_strings and action.nargs is None and action.dest != "help"
        for opt in action.option_strings
    }
    assert valued == {*boot.VALUE_OPTIONS, "--data-root"}


def test_every_unit_runs_a_recipe_that_exists() -> None:
    recipes = set(re.findall(r"^([a-z_-]+)(?: [^\n]*)?:", (REPO / "justfile").read_text(), re.M))
    ran = []
    for unit in sorted((REPO / "deploy" / "systemd").glob("*.service")):
        for line in unit.read_text().splitlines():
            m = re.match(r"ExecStart=\S*/just (\S+)", line)
            if m:
                ran.append(m.group(1))
                assert m.group(1) in recipes, f"{unit.name}: {line}"
    assert sorted(ran) == [
        "craig-sync",
        "heartwood-requests",
        "host-metrics",
        "linguist-commit",
        "smoke",
        "vellum-parity-live",
    ]
