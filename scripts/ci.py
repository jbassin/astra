"""Local CI (`just ci`): the steps `.github/workflows/ci.yml` would run for this change, at once.

Each CI job runs the `just` recipe of the same name, so this reads the job list and the path
filters from ci.yml itself and can never disagree with it. Three things keep a run short:

- Path filter. A job that ci.yml guards with `needs.changes.outputs.<filter>` runs only when a
  changed file matches that filter. The changed files are everything that differs from the
  merge base with `--base` (committed, staged, unstaged and untracked). GitHub applies the
  same filter to the pull request, and `ci-ok` there still gates the merge.
- Parallel steps. The selected steps start together; a step named in `_AFTER` waits for the
  step that writes the files it reads.
- Pass record. A run records the steps that passed for the exact working tree (a git tree
  hash that includes uncommitted and untracked files) in `<git dir>/ci-pass.json`. A later
  run on the same tree skips them, so the pre-push hook does not repeat a `just ci` that just
  passed. The steps in `_RANGE_STEPS` read the commit range, not the tree, so they always run.

Each step's output goes to `<git dir>/ci-logs/<step>.log`; a failed step's log is also
printed in full after the last step ends.

    uv run python scripts/ci.py              # the steps this change needs
    uv run python scripts/ci.py --all        # every step, ignoring the filter and the record
    uv run python scripts/ci.py --list       # print the selection and run nothing
    uv run python scripts/ci.py --jobs 1     # one step at a time
    uv run python scripts/ci.py --base REF   # compare against REF instead of origin/main
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
WORKFLOW = ROOT / ".github" / "workflows" / "ci.yml"

# Jobs in ci.yml that are plumbing, not a `just` recipe.
_NOT_STEPS = {"changes", "ci-ok"}
# These check base..HEAD (the commit messages and the added lines), so the tree alone does not
# say whether they passed, and they take the range as arguments.
_RANGE_STEPS = ("commitlint", "no-decision-ids")
# codex-e2e builds codex into the same dist/ directory ts-build writes.
_AFTER = {"codex-e2e": "ts-build"}

_FILTER_IN_IF = re.compile(r"needs\.changes\.outputs\.(\w+)\s*==\s*'true'")


@dataclass(frozen=True)
class Workflow:
    """ci.yml's steps in file order, each with the path filter that guards it (None: always)."""

    steps: dict[str, str | None]
    filters: dict[str, list[str]]


def load_workflow(path: Path = WORKFLOW) -> Workflow:
    doc = yaml.safe_load(path.read_text(encoding="utf-8"))
    jobs = doc["jobs"]
    filter_step = next(s for s in jobs["changes"]["steps"] if s.get("id") == "filter")
    filters = yaml.safe_load(filter_step["with"]["filters"])
    steps: dict[str, str | None] = {}
    for name, job in jobs.items():
        if name in _NOT_STEPS:
            continue
        match = _FILTER_IN_IF.search(str(job.get("if", "")))
        steps[name] = match.group(1) if match else None
        if match and match.group(1) not in filters:
            raise ValueError(f"ci.yml job {name} uses the unknown path filter {match.group(1)}")
    return Workflow(steps=steps, filters=filters)


def glob_to_regex(pattern: str) -> re.Pattern[str]:
    """The part of picomatch's syntax ci.yml's filters use, with dotfiles matched (`dot: true`).

    `**/` is any number of directories (none included), a trailing `/**` is everything
    beneath, `*` stays inside one path segment and `{a,b}` is an alternation.
    """
    out: list[str] = []
    i = 0
    while i < len(pattern):
        if pattern.startswith("**/", i):
            out.append("(?:.*/)?")
            i += 3
        elif pattern.startswith("/**", i) and i + 3 == len(pattern):
            out.append("(?:/.*)?")
            i += 3
        elif pattern.startswith("**", i):
            out.append(".*")
            i += 2
        elif pattern[i] == "*":
            out.append("[^/]*")
            i += 1
        elif pattern[i] == "{":
            end = pattern.index("}", i)
            alternatives = pattern[i + 1 : end].split(",")
            out.append("(?:" + "|".join(re.escape(a) for a in alternatives) + ")")
            i = end + 1
        else:
            out.append(re.escape(pattern[i]))
            i += 1
    return re.compile("".join(out))


def matched_filters(filters: dict[str, list[str]], changed: list[str]) -> set[str]:
    hit: set[str] = set()
    for name, patterns in filters.items():
        regexes = [glob_to_regex(p) for p in patterns]
        if any(r.fullmatch(f) for r in regexes for f in changed):
            hit.add(name)
    return hit


def _git(*args: str, env: dict[str, str] | None = None) -> str:
    done = subprocess.run(
        ["git", *args], cwd=ROOT, env=env, capture_output=True, text=True, check=True
    )
    return done.stdout


def changed_files(base: str) -> list[str] | None:
    """Every path that differs from the merge base with `base`; None when there is no base."""
    try:
        merge_base = _git("merge-base", base, "HEAD").strip()
    except subprocess.CalledProcessError:
        return None
    tracked = _git("diff", "--name-only", "-z", merge_base)
    untracked = _git("ls-files", "--others", "--exclude-standard", "-z")
    return sorted({f for f in (tracked + untracked).split("\0") if f})


def tree_key() -> str:
    """The git tree hash of the working tree as it is now, uncommitted and untracked included.

    Staged into a throwaway copy of the index, so the real index is never touched.
    """
    index = Path(_git("rev-parse", "--absolute-git-dir").strip()) / "index"
    with tempfile.TemporaryDirectory() as tmp:
        scratch = Path(tmp) / "index"
        if index.exists():
            shutil.copy(index, scratch)
        env = {**os.environ, "GIT_INDEX_FILE": str(scratch)}
        _git("add", "--all", env=env)
        return _git("write-tree", env=env).strip()


def read_passed(record: Path, key: str) -> set[str]:
    """The steps the record says passed for this tree; none when it is for another tree."""
    try:
        data = json.loads(record.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return set()
    if not isinstance(data, dict) or data.get("tree") != key:
        return set()
    return {s for s in data.get("passed", []) if isinstance(s, str)}


@dataclass
class Selection:
    run: list[str]
    filtered: list[str] = field(default_factory=list)  # no changed file matches their filter
    recorded: list[str] = field(default_factory=list)  # already passed on this exact tree


def select(
    workflow: Workflow, changed: list[str] | None, passed: set[str], *, everything: bool
) -> Selection:
    if everything or changed is None:
        return Selection(run=list(workflow.steps))
    hit = matched_filters(workflow.filters, changed)
    selection = Selection(run=[])
    for step, guard in workflow.steps.items():
        if guard is not None and guard not in hit:
            selection.filtered.append(step)
        elif step in passed and step not in _RANGE_STEPS:
            selection.recorded.append(step)
        else:
            selection.run.append(step)
    return selection


@dataclass(frozen=True)
class Result:
    step: str
    ok: bool
    seconds: float
    log: Path


def _run_step(step: str, args: list[str], log: Path, wait_for: threading.Event | None) -> Result:
    if wait_for is not None:
        wait_for.wait()
    started = time.monotonic()
    with log.open("wb") as out:
        done = subprocess.run(
            ["just", "-f", str(ROOT / "justfile"), step, *args],
            cwd=ROOT,
            stdin=subprocess.DEVNULL,
            stdout=out,
            stderr=subprocess.STDOUT,
            check=False,
        )
    return Result(step, done.returncode == 0, time.monotonic() - started, log)


def run_steps(steps: list[str], base: str, log_dir: Path, jobs: int) -> list[Result]:
    """Run the steps, at most `jobs` at once, printing one line as each one ends."""
    log_dir.mkdir(parents=True, exist_ok=True)
    finished = {step: threading.Event() for step in steps}
    width = max(len(s) for s in steps)

    def one(step: str) -> Result:
        args = [base, "HEAD"] if step in _RANGE_STEPS else []
        result = _run_step(step, args, log_dir / f"{step}.log", finished.get(_AFTER.get(step, "")))
        finished[step].set()
        mark = "ok  " if result.ok else "FAIL"
        print(f"{mark} {step:<{width}} {result.seconds:6.1f}s", file=sys.stderr, flush=True)
        return result

    # A step that waits for another must not hold a worker the other one needs.
    ordered = sorted(steps, key=lambda s: s in _AFTER)
    with ThreadPoolExecutor(max_workers=jobs) as pool:
        return list(pool.map(one, ordered))


def _report(selection: Selection, changed: list[str] | None, total: int) -> None:
    scope = "no base to compare with" if changed is None else f"{len(changed)} changed files"
    print(f"ci: running {len(selection.run)} of {total} steps ({scope})", file=sys.stderr)
    if selection.filtered:
        print(f"ci: no matching change: {', '.join(selection.filtered)}", file=sys.stderr)
    if selection.recorded:
        print(f"ci: passed on this tree: {', '.join(selection.recorded)}", file=sys.stderr)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=(__doc__ or "").split("\n\n")[0])
    parser.add_argument("--all", action="store_true", help="run every step")
    parser.add_argument("--list", action="store_true", help="print the selection; run nothing")
    parser.add_argument("--base", default="origin/main", help="the ref to compare against")
    parser.add_argument("--jobs", type=int, default=0, help="steps at once (default: all)")
    opts = parser.parse_args(argv)

    workflow = load_workflow()
    git_dir = Path(_git("rev-parse", "--absolute-git-dir").strip())
    record = git_dir / "ci-pass.json"
    key = tree_key()
    passed = read_passed(record, key)
    changed = changed_files(opts.base)
    selection = select(workflow, changed, passed, everything=opts.all)
    _report(selection, changed, len(workflow.steps))
    if opts.list:
        print("\n".join(selection.run))
        return 0

    started = time.monotonic()
    jobs = opts.jobs if opts.jobs > 0 else len(selection.run)
    results = run_steps(selection.run, opts.base, git_dir / "ci-logs", jobs)
    elapsed = time.monotonic() - started

    # Record only a tree that stayed the same for the whole run: an edit made while the steps
    # ran was checked by some of them and not by others.
    if tree_key() == key:
        passed |= {r.step for r in results if r.ok}
        passed -= {r.step for r in results if not r.ok}
        record.write_text(json.dumps({"tree": key, "passed": sorted(passed)}), encoding="utf-8")

    failed = [r for r in results if not r.ok]
    for result in failed:
        print(f"\n== just {result.step} ({result.log})", file=sys.stderr)
        sys.stderr.write(result.log.read_text(encoding="utf-8", errors="replace"))
    if failed:
        print(f"\nci: FAILED: {','.join(r.step for r in failed)}", file=sys.stderr)
        return 1
    print(f"\nci: all {len(results)} steps passed in {elapsed:.0f}s", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
