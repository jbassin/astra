"""Decision-ID gate (`just no-decision-ids`): no new process IDs in code, comments or test names.

Comments and test names describe the code as it is now. The history of why it got that way
lives in git and in the ADRs. So this fails when a line ADDED since the merge base with the
base ref (default `origin/main`, the range commitlint lints) cites a spec, decision, phase,
slice, gate or tech-debt finding ID, such as `D29-83`, `P9 S1`, `0037 OPS-3`, `gate C`,
`(R3, P6)`, a stage tag (`the S2 checker`), a section (`§3`), a requirement code (`R21`,
`D-7`), a lane slug (`svc-2`) or a spec slug (`codex-0029`). IDs that are already there do
not fail it, even on a line the change rewraps or moves; the per-area sweeps remove those.

Allowed everywhere: an ADR reference (`ADR 0015`), the sanctioned link to a decision that
still binds the code. Not checked: Markdown, data and content files (only source and
config files are; see `CHECKED_SUFFIXES`), the ADRs, `thoughts/`, the paydown's tracking
docs (`docs/now.md`, `docs/backlog.md`), lockfiles, and this gate and its own tests.
Finding IDs (WEAL-1, OPS-5) belong in commit messages and the plan, not in code.

A line that must keep a match that is not a process ID (a domain code that looks like one)
carries an inline exception with a reason, in the file's comment syntax:
`decision-ids: ignore[<rule>] -- <why>`.

    uv run python scripts/check_decision_ids.py [BASE [HEAD]]   # BASE "" = HEAD's commit alone
    uv run python scripts/check_decision_ids.py --diff FILE     # check a unified diff
    uv run python scripts/check_decision_ids.py --all           # count every existing match

Run from anywhere: git runs in the repo root (this file's parent's parent).
"""

import collections
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parent.parent

# git's well-known empty tree: the base for a diff of a root commit.
EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904"

# The tech-debt lanes whose finding IDs (`WEAL-1`) the paydown plan uses.
LANES = "ASY|CDX|FE|LIB|OPS|PIPE|PROC|REPO|SEC|SMELL|SVC|TEST|WEAL"
# The same lanes as lower-case slugs (`svc-2`), less `test-`: `test-1` is a common fixture name.
LANE_SLUGS = "|".join(lane for lane in LANES.lower().split("|") if lane != "test")
# One short spec-local code: a capital letter and a number (`R3`, `F12`, `S5d`).
CODE = r"[A-Z]\d{1,3}[a-z]?"

# Each rule: name -> (pattern, what it catches). The names are what an ignore comment cites.
RULES: dict[str, tuple[re.Pattern[str], str]] = {
    "decision-id": (
        re.compile(r"\bD\d{1,2}-\d+[a-z]?\b"),
        "a per-spec decision ID such as D29-83",
    ),
    "phase-slice": (
        re.compile(r"\bP\d+(?:\.\d+)?[ /-]S\d+[a-z]?\b"),
        "a phase and slice tag such as P9 S1 or P3-S1",
    ),
    "finding-id": (
        re.compile(rf"\b(?:{LANES})-\d+\b"),
        "a tech-debt finding ID such as OPS-3",
    ),
    "spec-ref": (
        re.compile(rf"\b(?:NL)?[Ss]pecs? 00\d{{2}}\b|\b00\d{{2}}[ /](?:{CODE}|[A-Z]+-\d+)\b"),
        "a spec number or a spec-qualified ID such as spec 0030, 0022 S11 or 0037 OPS-3",
    ),
    "gate-letter": (
        re.compile(r"\b[Gg]ates? [A-Z](?:/[A-Z])*\b"),
        "a spec gate letter such as gate C",
    ),
    "roadmap-decision": (
        re.compile(rf"\bDecisions? [A-Z]\d*\b|\bdecisions? {CODE}\b"),
        "a roadmap decision letter such as Decision I or decision E4",
    ),
    "code-in-parens": (
        re.compile(rf"(?<![\w.$\]])\({CODE}(?:(?:, ?| ?/ ?| ){CODE})*\)"),
        "a bare spec code in parentheses such as (R3, P6) or (F3)",
    ),
    # Not after a word, `.` or `$` (identifiers: `S3_BUCKET`, `foo.S1`), nor after `P9 `,
    # `0022 ` or `P3-` (phase-slice and spec-ref already report those), nor the AWS service.
    # A tag that is a whole string literal (`title="S1"`, a season) is a value.
    "stage-tag": (
        re.compile(
            r"(?<![\w.$\"'])(?<!\d[ /-])(?<!AWS )S\d{1,2}[a-z]?\b(?!://| ?[Bb]uckets?\b)"
            r"|(?<=[\"'])S\d{1,2}[a-z]?\b(?![\"']|://| ?[Bb]uckets?\b)"
        ),
        "a bare slice or stage tag such as S3 or the S2 checker",
    ),
    # A section of a spec or plan; a section of a Markdown doc in the repo (`MARKDOWN.md §5`)
    # still describes the code, so it passes.
    "section-ref": (
        re.compile(r"(?<!\.md )§ ?\d+(?:\.\d+)*[A-Za-z]?"),
        "a spec section reference such as §3 or §4.1",
    ),
    # R, K and D only: E1-E14 style codes are error catalogues (vellum-lang) and episode
    # numbers, F5 is a key, and other letters are tiers, grid cells and PF2e codes. A code that
    # is a whole string literal (`id="R1"`) is a value, and `deadly D8` is a die.
    "requirement-code": (
        re.compile(
            r"(?<![\w.$#\"'-])(?<![Dd]eadly )(?<![Ff]atal )[DKR]\d{1,2}[a-z]?\b(?!-)"
            r"|(?<=[\"'])[DKR]\d{1,2}[a-z]?\b(?![-\"'])"
        ),
        "a bare spec requirement or decision code such as R21, K4 or D5",
    ),
    # Not C-: `C-1` is arithmetic as often as a code.
    "dashed-code": (
        re.compile(r"\b(?:AD|D|FR|K|NFR|OQ|Q|R)-\d{1,3}[a-z]?\b"),
        "a dashed spec code such as D-7, R-16, OQ-1 or NFR-9",
    ),
    "lane-slug": (
        re.compile(rf"(?<![\w-])(?:{LANE_SLUGS}|kit|p\d{{1,2}})-\d+[a-z]?\b"),
        "a lower-case lane or slice slug such as svc-2, ops-1a, kit-1a or p3-0",
    ),
    "slice-number": (
        re.compile(r"\b[Ss]lices? \d+[a-z]?\b"),
        "a numbered plan slice such as slice 5",
    ),
    # 0010-0099 only: `spell-0001` is a fixture ID; a path or link (`gm-0027-thoughts.md`) is not.
    "spec-slug": (
        re.compile(r"\b[a-z]+-00[1-9]\d\b(?![-.\w])"),
        "a spec-numbered slug such as codex-0029 or pre-0024",
    ),
}

IGNORE = re.compile(r"decision-ids: ignore\[([a-z, -]+)\] -- \S")

# Source and config files, where comments and test names live. Markdown, data (JSON, CSV)
# and content (.vellum, transcripts) are not checked.
CHECKED_SUFFIXES = {
    ".py", ".pyi", ".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".rs",
    ".sh", ".bash", ".css", ".scss", ".html", ".toml", ".yml", ".yaml", ".kdl", ".sql",
    ".tex", ".sty", ".service", ".timer", ".caddyfile", ".dockerfile",
}  # fmt: skip
CHECKED_NAMES = {"justfile", "Dockerfile", "Caddyfile", ".gitignore", ".dockerignore"}
CHECKED_DIRS = (".githooks/",)

EXEMPT_PREFIXES = (
    "docs/adr/",  # ADRs carry the old IDs as aliases so existing references resolve.
    "thoughts/",  # Plans, research and the archive: history, not code.
    "scripts/tests/fixtures/decision_ids/",
)
EXEMPT_FILES = {
    "docs/now.md",  # The paydown's tracking docs cite its slices and findings by ID.
    "docs/backlog.md",
    "scripts/check_decision_ids.py",  # This gate and its tests spell out the patterns.
    "scripts/tests/test_check_decision_ids.py",
}


@dataclass(frozen=True)
class Violation:
    path: str
    line: int
    rule: str
    match: str
    text: str

    def __str__(self) -> str:
        return f"{self.path}:{self.line}: [{self.rule}] {self.match!r}: {self.text.strip()}"


def is_checked(path: str) -> bool:
    if path in EXEMPT_FILES or path.startswith(EXEMPT_PREFIXES):
        return False
    p = PurePosixPath(path)
    if p.name in CHECKED_NAMES or path.startswith(CHECKED_DIRS):
        return True
    return p.suffix.lower() in CHECKED_SUFFIXES or p.name.endswith(".Dockerfile")


def check_line(path: str, lineno: int, text: str) -> list[Violation]:
    ignored: set[str] = set()
    if m := IGNORE.search(text):
        ignored = {r.strip() for r in m.group(1).split(",")}
    out = []
    for rule, (pattern, _) in RULES.items():
        if rule in ignored:
            continue
        out += [Violation(path, lineno, rule, m.group(0), text) for m in pattern.finditer(text)]
    return out


HUNK = re.compile(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@")


def _diff_path(header: str) -> str | None:
    """The new-side path from a `+++ b/<path>` line; None for a deleted file."""
    target = header[4:].rstrip("\n")
    if target.startswith('"') and target.endswith('"'):
        target = target[1:-1].encode().decode("unicode_escape").encode("latin-1").decode()
    if target == "/dev/null":
        return None
    return target[2:] if target.startswith("b/") else target


# A comment marker at the start of a line, dropped when the removed lines are joined.
COMMENT_LEAD = re.compile(r"^\s*(?:#+:?|//+!?|/?\*+/?|--|;+|\"\"\"|''')?\s*")


def check_diff(diff: str) -> list[Violation]:
    """Every rule match on an added line of a unified diff (`git diff` output).

    A match the same diff also removes (anywhere in the diff, as often) is carried, not
    introduced: rewrapping a comment or moving code between files keeps the IDs it already had
    until its area's sweep. Only an ID the change adds fails. The removed lines are searched as
    one run of words, with line breaks and leading comment markers dropped, so a rewrap that
    splits `P9 S1` over two lines (leaving a bare `S1` for stage-tag) still carries it.
    """
    added: list[tuple[str, int, str]] = []
    removed_lines: list[str] = []
    path: str | None = None
    lineno = 0
    for line in diff.splitlines():
        if line.startswith("+++ "):
            path = _diff_path(line)
        elif line.startswith(("--- ", "diff --git ")):
            continue
        elif m := HUNK.match(line):
            lineno = int(m.group(1))
        elif line.startswith("+"):
            if path is not None and is_checked(path):
                added.append((path, lineno, line[1:]))
            lineno += 1
        elif line.startswith("-"):
            removed_lines.append(COMMENT_LEAD.sub("", line[1:]))
        elif line.startswith(" "):
            lineno += 1
    removed = " ".join(" ".join(removed_lines).split())
    carried: collections.Counter[tuple[str, str]] = collections.Counter()
    violations: list[Violation] = []
    for path, lineno, text in added:
        for v in check_line(path, lineno, text):
            match = " ".join(v.match.split())
            if carried[v.rule, match] < _occurrences(match, removed):
                carried[v.rule, match] += 1
            else:
                violations.append(v)
    return violations


def _occurrences(match: str, text: str) -> int:
    """How often `match` appears in `text` with no word character either side."""
    return len(re.findall(rf"(?<!\w){re.escape(match)}(?!\w)", text))


def git(*args: str) -> str:
    return subprocess.run(
        ["git", "-c", "core.quotePath=false", *args],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    ).stdout


def diff_since(base: str, head: str) -> str:
    """The diff from the merge base of `base` and `head` to `head`; `base` "" = head's commit."""
    if base:
        start = git("merge-base", base, head).strip()
    else:
        parents = git("rev-list", "--parents", "-n", "1", head).split()
        start = parents[1] if len(parents) > 1 else EMPTY_TREE
    return git("diff", "--no-color", "--no-ext-diff", "-U0", "--find-renames", start, head)


def report(violations: list[Violation], where: str) -> int:
    if not violations:
        print(f"no-decision-ids: no new process IDs in {where}")
        return 0
    for v in violations:
        print(v, file=sys.stderr)
    print(f"\nno-decision-ids: {len(violations)} new process ID(s) in {where}.", file=sys.stderr)
    for rule in sorted({v.rule for v in violations}):
        print(f"  [{rule}] {RULES[rule][1]}", file=sys.stderr)
    print(
        "Comments and test names describe the code as it is now; history lives in git and the\n"
        "ADRs. Say what the code does and why, and link an ADR (`ADR 0015`) for a decision that\n"
        "still binds it. A match that is not a process ID takes an inline exception with a\n"
        "reason: `decision-ids: ignore[<rule>] -- <why>`.",
        file=sys.stderr,
    )
    return 1


def survey() -> int:
    """Count every existing match in the checked files, per rule (for the comment sweeps)."""
    counts: collections.Counter[str] = collections.Counter()
    files: dict[str, set[str]] = collections.defaultdict(set)
    for path in git("ls-files").splitlines():
        if not is_checked(path):
            continue
        try:
            text = (ROOT / path).read_text(encoding="utf-8")
        except (UnicodeDecodeError, FileNotFoundError):
            continue
        for i, line in enumerate(text.splitlines(), 1):
            for v in check_line(path, i, line):
                counts[v.rule] += 1
                files[v.rule].add(path)
    for rule in RULES:
        print(f"{rule:18} {counts[rule]:6} matches in {len(files[rule]):4} files")
    return 0


def main(argv: list[str]) -> int:
    if argv[:1] == ["--all"]:
        return survey()
    if argv[:1] == ["--diff"] and len(argv) == 2:
        return report(check_diff(Path(argv[1]).read_text(encoding="utf-8")), argv[1])
    if len(argv) > 2 or any(a.startswith("-") for a in argv):
        print(__doc__, file=sys.stderr)
        return 2
    base = argv[0] if argv else "origin/main"
    head = argv[1] if len(argv) > 1 else "HEAD"
    where = f"{base}...{head}" if base else f"{head}'s commit"
    return report(check_diff(diff_since(base, head)), where)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
