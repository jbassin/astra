"""The astra-data publish chain: linguist-commit, the clone push, mouthpiece-publish and the
two audio seeds (moved from the justfile, 0037 ops-1a; same steps, argv and exit codes).

Every git call runs in the astra-data clone (``git -C <config data.content-root>``), never in
the code repo. The git-publish flock (``<data root>/locks/git-publish.lock``) allows one git
publisher at a time (0036 D36-5): linguist-commit holds it for its whole run, the heartwood
commands from publish-sync through push and redeploy. ``astra_data_push`` never takes it
itself: its callers hold it, and a second flock on a fresh descriptor would deadlock.

``linguist-commit`` steps, under the git-publish lock:

1. commit the linguist datasets (``commit --only`` with the exact changed file list, so
   anything else staged in the clone stays staged and out of the commit);
2. ``mouthpiece-publish`` regenerates the episode catalog snapshot in the clone; commit it if
   it changed (a publish failure is reported and does not stop the push);
3. ``astra_data_push``: fetch; rebase onto origin/main if it moved (``--autostash``); push
   (also retries an earlier failed push);
4. seed audio and redeploy akasha-frontend / mouthpiece-frontend for what changed: this
   run's commits, or any difference between HEAD and the data_sha the frontend was last
   deployed with (``<data root>/deploy/history.jsonl``). ``deploy.sh --skip-failed`` exits 11
   without building when this exact code and data already failed, so a broken build is not
   rebuilt and re-paged every run.

deploy.sh bakes the clone's committed HEAD, so a failed push still redeploys; the command
then exits 1 (the unit's OnFailure pages) and the next run retries the push.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path

from .context import Ctx, Fail, deploy

#: The seven config keys linguist-commit reads, in order.
LINGUIST_KEYS = (
    "data.content-root",
    "data.linguist-transcripts",
    "data.linguist-data",
    "data.linguist-timeline",
    "data.mouthpiece-snapshot",
    "data.akasha-content",
    "data.akasha-snapshot",
)

# The seed containers' scripts. Fixed strings: the only variable (the host audio dir, for the
# summary line) arrives as the positional parameter $1, never spliced into the script.
MOUTHPIECE_SEED_SH = (
    "set -e\n"
    'find /live -name "*.episode.mp3" -exec sh -c '
    '"cp \\"\\$1\\" \\"/audio/\\$(basename \\"\\$1\\" .episode.mp3).mp3\\"" _ {} \\;\n'
    'n=$(ls -1 /audio/*.mp3 2>/dev/null | wc -l); echo "seeded $n episode(s) into $1"; '
    "ls -1 /audio\n"
)
AKASHA_SEED_SH = (
    "set -e\n"
    'for d in /live/*/; do f="${d}audio.mp3"; [ -e "$f" ] || continue; '
    'cp "$f" "/audio/$(basename "$d").mp3"; done\n'
    'n=$(ls -1 /audio/*.mp3 2>/dev/null | wc -l); echo "seeded $n session(s) into $1"\n'
)


def git_c(repo: str) -> list[str]:
    return ["git", "-C", repo]


# --- astra-data push -----------------------------------------------------------------------


def astra_data_push(ctx: Ctx) -> int:
    """Publish the astra-data clone: fetch; rebase local commits onto origin/main if it moved
    (the repo is bot-written data, so rebasing is safe; ``--autostash`` carries uncommitted
    pipeline writes across); push main if it is ahead. A failed rebase is aborted at once, so
    the clone is never left mid-rebase. Exit 8 = fetch, rebase or push failed; the local
    commits stay and the next caller retries. The caller holds the git-publish lock."""
    (repo,) = ctx.config("data.content-root")
    git = git_c(repo)
    if not Path(repo, ".git").is_dir():
        ctx.err(f"astra-data: the clone {repo} is missing")
        return 8
    if ctx.output([*git, "rev-parse", "--abbrev-ref", "HEAD"]) != "main":
        ctx.err(f"astra-data: {repo} is not on main — not pushing")
        return 8
    if ctx.run([*git, "fetch", "-q", "origin"]) != 0:
        ctx.err(f"astra-data: fetch FAILED in {repo}")
        return 8
    if ctx.run([*git, "merge-base", "--is-ancestor", "origin/main", "HEAD"]) == 0:
        pass
    elif ctx.run([*git, "rebase", "-q", "--autostash", "origin/main"]) != 0:
        if ctx.run([*git, "rebase", "--abort"]) != 0:
            ctx.err(f"astra-data: rebase --abort failed too — inspect {repo}")
        ctx.err(
            f"astra-data: rebase onto origin/main FAILED in {repo} (aborted; local commits "
            f"kept) — resolve by hand: git -C {repo} pull --rebase"
        )
        return 8
    else:
        ctx.out("astra-data: rebased onto origin/main")
    if ctx.output([*git, "rev-list", "origin/main..HEAD"]):
        if ctx.run([*git, "push", "-q", "origin", "main"]) != 0:
            ctx.err(f"astra-data: push FAILED from {repo}")
            return 8
        ctx.out(f"astra-data: pushed {ctx.output([*git, 'rev-parse', '--short', 'HEAD'])}")
    else:
        ctx.out("astra-data: nothing to push")
    return 0


# --- mouthpiece publish + the audio seeds ----------------------------------------------------


def mouthpiece_publish(ctx: Ctx, flags: list[str]) -> int:
    """Regenerate the mouthpiece episode catalog snapshot in the astra-data clone from the
    live corpus. Writes only; linguist-commit commits it. The publisher refuses a missing
    episodes dir or a catalog that shrinks; ``--allow-shrink`` publishes a removal."""
    return ctx.run(ctx.uv_run("python", "-m", "astra_mouthpiece.publish", *flags))


def _mkdir_p(ctx: Ctx, path: str) -> bool:
    """``mkdir -p`` under ``set -e``: on failure report it; the seed then exits 1."""
    try:
        Path(path).mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        ctx.err(f"mkdir: cannot create directory '{path}': {exc.strerror}")
        return False
    return True


def mouthpiece_seed(ctx: Ctx) -> int:
    """Copy each live ``<date>/<id>.episode.mp3`` to ``<data root>/audio/mouthpiece/<id>.mp3``
    (served at /audio/<id>.mp3), through a throwaway alpine container. Idempotent."""
    audio = f"{ctx.data_root}/audio/mouthpiece"
    if not _mkdir_p(ctx, audio):
        return 1
    return ctx.run(
        [
            "docker", "run", "--rm",
            "-v", f"{audio}:/audio",
            "-v", f"{ctx.mouthpiece_episodes}:/live:ro",
            "alpine", "sh", "-c", MOUTHPIECE_SEED_SH, "sh", audio,
        ]
    )  # fmt: skip


def akasha_seed(ctx: Ctx) -> int:
    """Copy scribe's ``<date>/audio.mp3`` to ``<data root>/audio/akasha/<date>.mp3`` (served at
    /audio/<date>.mp3), overwriting, through a throwaway alpine container. Idempotent."""
    audio = f"{ctx.data_root}/audio/akasha"
    if not _mkdir_p(ctx, audio):
        return 1
    return ctx.run(
        [
            "docker", "run", "--rm",
            "-v", f"{audio}:/audio",
            "-v", f"{ctx.akasha_audio_live}:/live:ro",
            "alpine", "sh", "-c", AKASHA_SEED_SH, "sh", audio,
        ]
    )  # fmt: skip


# --- linguist-commit -------------------------------------------------------------------------


def _jq_raw(value: object) -> str:
    """How ``jq -r`` prints a value."""
    if isinstance(value, str):
        return value
    return json.dumps(value)


def deployed_data_sha(history: Path, service: str) -> str:
    """The astra-data sha ``service`` was last deployed with, from deploy.sh's history.jsonl:
    the last ``deploy`` attempt with result ok/unhealthy, a non-empty data_sha, and services
    "all" or a list naming ``service``. "" when there is none or the file is unreadable.

    The same selection as the jq pipeline it replaced, including jq's quirks: lines that are
    not JSON objects are skipped, a missing data_sha prints as "null", and a line whose
    ``services`` can't be iterated is skipped (jq reports the error and goes on)."""
    try:
        text = history.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""
    last = ""
    for line in text.split("\n"):
        try:
            obj = json.loads(line)
        except ValueError:
            continue
        if not isinstance(obj, dict):
            continue
        if obj.get("mode") != "deploy" or obj.get("result") not in ("ok", "unhealthy"):
            continue
        if obj.get("data_sha") == "":
            continue
        services = obj.get("services")
        if services == "all":
            hit = True
        elif isinstance(services, list):
            hit = service in services
        elif isinstance(services, dict):
            hit = service in services.values()
        else:
            continue
        if hit:
            last = _jq_raw(obj.get("data_sha"))
    return last


def linguist_commit(ctx: Ctx) -> int:
    """Commit and push the pipeline's new output in the astra-data clone, then redeploy the
    frontends that bake it (module docstring). Exit 1 = lock busy, setup refused, push failed
    or a redeploy failed; a git step that fails outright exits with git's code."""
    gp = ctx.lock("git-publish")
    if not gp.acquire():
        ctx.err("linguist-commit: git-publish lock busy for 30 min — skipping this run")
        return 1
    try:
        return _linguist_commit_locked(ctx)
    finally:
        gp.release()


def _linguist_commit_locked(ctx: Ctx) -> int:
    try:
        cpaths = ctx.config(*LINGUIST_KEYS)
    except Exception as exc:  # noqa: BLE001 -- any config failure means the same refusal
        ctx.err(f"linguist-commit: could not read data paths from config ({exc})")
        return 1
    repo = cpaths[0]
    lpaths = cpaths[1:4]
    mp_snapshot = f"{cpaths[4]}/episodes-index.json"
    # What akasha-frontend bakes (its build COPYs these from the astra-data context).
    akasha_baked = [cpaths[2], cpaths[3], cpaths[5], cpaths[6]]
    git = git_c(repo)
    if not Path(repo, ".git").is_dir():
        ctx.err(f"linguist-commit: the astra-data clone {repo} is missing")
        return 1
    if ctx.output([*git, "rev-parse", "--abbrev-ref", "HEAD"]) != "main":
        ctx.err(f"linguist-commit: refusing — {repo} is not on main")
        return 1

    changed = _commit_linguist(ctx, git, lpaths)  # (1)
    mp_changed = _commit_snapshot(ctx, git, mp_snapshot)  # (2)
    push_rc = ctx.sub(astra_data_push, ctx)  # (3) whatever the clone has that origin lacks

    # (4) Redeploy what changed.
    history = ctx.data_root / "deploy" / "history.jsonl"

    def stale(service: str, paths: list[str]) -> bool:
        d = deployed_data_sha(history, service)
        quiet = [*git, "diff", "--quiet", d, "HEAD", "--", *paths]
        return bool(d) and ctx.run(quiet, stderr_null=True) != 0

    ok = True
    if changed or stale("akasha-frontend", akasha_baked):
        ctx.out(
            "linguist-commit: akasha content changed — seeding audio + rebuilding + "
            "redeploying akasha-frontend"
        )
        ok &= _seed_and_redeploy(ctx, akasha_seed, "akasha-seed", "akasha-frontend")
    if mp_changed or stale("mouthpiece-frontend", [mp_snapshot]):
        ctx.out(
            "linguist-commit: mouthpiece snapshot changed — seeding audio + redeploying "
            "mouthpiece-frontend"
        )
        ok &= _seed_and_redeploy(ctx, mouthpiece_seed, "mouthpiece-seed", "mouthpiece-frontend")
    if push_rc != 0:
        ctx.err(
            f"linguist-commit: astra-data push FAILED (exit {push_rc}) — committed locally; "
            "the next run retries"
        )
        return 1
    return 0 if ok else 1


def _commit_linguist(ctx: Ctx, git: list[str], lpaths: list[str]) -> str:
    """(1) Commit ONLY our own paths; returns the changed file list ("" = nothing new).
    ``--only`` takes the exact changed file list (not the dirs): a dir pathspec with no file
    left in HEAD or the index errors."""
    ctx.check([*git, "add", *lpaths])
    if ctx.run([*git, "diff", "--cached", "--quiet", "--", *lpaths]) == 0:
        return ""
    names = [*git, "diff", "--cached", "--name-only", "--no-renames"]
    changed = ctx.capture([*names, "--", *lpaths])
    n = sum(1 for line in changed.split("\n") if line)
    if n == 0:
        raise Fail(1)  # `n=$(... | grep -c .)` exits 1 on no match under set -e
    nul_list = ctx.capture_bytes([*names, "-z", "--", *lpaths])
    ctx.check(
        [
            *git, "commit", "--no-verify", "-q", "--only",
            "--pathspec-from-file=-", "--pathspec-file-nul",
            "-m", f"chore(content): add {n} linguist transcript/data file(s)",
            "-m", "Pipeline-generated source-of-record, committed by the linguist-commit timer.",
        ],
        stdin_data=nul_list,
    )  # fmt: skip
    ctx.out(f"linguist-commit: committed {n} file(s)")
    return changed


def _commit_snapshot(ctx: Ctx, git: list[str], mp_snapshot: str) -> bool:
    """(2) Refresh + commit the mouthpiece snapshot; True when it changed. Non-fatal: a
    publish hiccup must not stop the push."""
    if ctx.sub(mouthpiece_publish, ctx, []) != 0:
        ctx.err("linguist-commit: mouthpiece-publish FAILED (snapshot not refreshed this run)")
        return False
    ctx.check([*git, "add", mp_snapshot])
    if ctx.run([*git, "diff", "--cached", "--quiet", "--", mp_snapshot]) == 0:
        return False
    ctx.check(
        [
            *git, "commit", "--no-verify", "-q", "--only",
            "-m", "chore(content): refresh the mouthpiece episode catalog",
            "-m", "Regenerated from the live corpus by the linguist-commit timer.",
            "--", mp_snapshot,
        ]
    )  # fmt: skip
    ctx.out("linguist-commit: committed the mouthpiece snapshot")
    return True


def _seed_and_redeploy(ctx: Ctx, seed: Callable[[Ctx], int], seed_name: str, service: str) -> bool:
    """Seed the audio (a failure is reported, not fatal), then ``deploy.sh --skip-failed``.
    False only when the redeploy really failed (exit 11 = already failed here, no page)."""
    if ctx.sub(seed, ctx) != 0:
        ctx.err(f"linguist-commit: {seed_name} FAILED (rerun: just {seed_name})")
    rc = ctx.sub(deploy, ctx, "--skip-failed", service)
    if rc == 0:
        ctx.out(f"linguist-commit: {service} redeployed")
    elif rc == 11:
        ctx.err(
            f"linguist-commit: {service} not rebuilt — it already failed at this code and "
            f"data (just deploy {service} retries)"
        )
    else:
        ctx.err(
            f"linguist-commit: {service} redeploy FAILED (exit {rc}; rerun: just deploy {service})"
        )
        return False
    return True
