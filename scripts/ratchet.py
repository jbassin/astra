"""Debt ratchet (`just ratchet`): no debt count may rise above its committed baseline.

Counts what the lint and type gates still let through, and fails when any count is higher
than its number in scripts/ratchet_baseline.json. A count may fall: the run then passes and
asks for `just ratchet --update`, which lowers those numbers (it never raises one) so the
change that paid the debt down also locks it in. A deliberate rise is a hand edit to the
baseline file, explained in the commit message.

The measures, by key prefix (`.prod` and `.test` split a count by test files and the rest):
- `suppress.oxlint.<rule>`: rules named in `oxlint-disable*` / `eslint-disable*` comments,
  one per mention (`(all)` for a directive that names none); `suppress.oxlint-block` counts
  the block and file directives, which cover more than one line. `no-console`,
  `no-non-null-assertion` and `no-explicit-any` are errors outside tests, so their counts here
  are the production console calls, non-null assertions and explicit `any`.
- `suppress.ts-expect-error`; `suppress.noqa.<code>` and `suppress.noqa-file.<code>` (line
  and file `noqa`: `T201` is print outside a command-line entry point, `BLE001` a broad
  except, `C901` a function over complexity 15); `suppress.ty.<rule>`, `suppress.type-ignore`.
- `oxlint.<rule>`: the rules .oxlintrc.json turns off, counted by a type-aware oxlint run
  with .oxlintrc.ratchet.json (no-unsafe-type-assertion and the rest).
- `size.*`: source files over 500 and over 1,000 lines; functions over 80 lines (oxlint's
  max-lines-per-function for TS, the AST for Python) and TS functions over complexity 15.
- `errors.*`: TS catch blocks that drop the error (no throw, no log call, binding unused),
  no-op `.catch()` handlers, and Python broad excepts that neither raise, log nor use the error.
- `types.py-any`: references to `typing.Any`.
- `env.reads-outside-config`: `process.env`, `import.meta.env`, `Bun.env`, `os.environ` and
  `os.getenv` outside libs/{py,ts}/{config,observe}.
- `knip.*`: unused files, exports, exported types, dependencies, devDependencies and unlisted
  dependencies (knip.json).
- `zero.*`: held at zero with no lint rule to do it: module-scope TS metric instruments
  (use `lazyCounter`/`lazyHistogram`) and TODO/FIXME comments in Rust. The rest of the zero
  list is lint rules: TODO/FIXME (ruff FIX, oxlint no-warning-comments), `@ts-ignore`
  (oxlint ban-ts-comment), bare `except:` (ruff E722), commented-out Python (ruff ERA) and
  `unwrap()` in the weal-engine library (clippy, `just weal-engine-rust`).

The scan covers tracked files only, less generated, vendored and fixture paths (`_excluded`).
knip sees the gitignored generated content modules when they are on disk, which can only
lower its counts, so with them present the knip keys are checked for rises but never lowered.

    uv run python scripts/ratchet.py             # check against the baseline
    uv run python scripts/ratchet.py --update    # lower the baseline to the counts that fell
    uv run python scripts/ratchet.py --list KEY  # print every site a count is made of
    uv run python scripts/ratchet.py --json      # print every count

Run from anywhere: paths resolve against the repo root (this file's parent's parent).
"""

import ast
import io
import json
import re
import shlex
import subprocess
import sys
import tokenize
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASELINE = ROOT / "scripts" / "ratchet_baseline.json"
OXLINT_CONFIG = ".oxlintrc.ratchet.json"

# How many sites a failure prints per measure before pointing at `--list`.
MAX_SITES_SHOWN = 25

SCOPES = ("prod", "test")
# Always reported, at zero when nothing matches. Per-rule keys appear only when non-zero; a
# key missing from the baseline counts as zero there, so a new rule's first suppression fails.
FIXED_KEYS = (
    "suppress.oxlint-block",
    "suppress.ts-expect-error",
    "suppress.type-ignore",
    *(
        f"{measure}.{scope}"
        for measure in (
            "size.files-over-500",
            "size.files-over-1000",
            "size.ts-functions-over-80",
            "size.ts-complexity-over-15",
            "size.py-functions-over-80",
            "errors.ts-catch-drops",
            "errors.ts-promise-catch-noop",
            "errors.py-silent-broad-except",
            "types.py-any",
            "env.reads-outside-config",
        )
        for scope in SCOPES
    ),
    *(
        f"knip.{k}"
        for k in ["files", "exports", "types", "dependencies", "devDependencies", "unlisted"]
    ),
    "zero.ts-module-scope-metric",
    "zero.rust-todo-fixme",
)

Sites = dict[str, list[str]]

# --------------------------------------------------------------------------- the file set

SOURCE_LANGS = {".py": "py", ".rs": "rs", ".css": "css"} | {
    ext: "ts" for ext in (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs")
}
# Path segments that hold generated, vendored, fixture or archived files.
EXCLUDED_DIRS = set(
    [
        "node_modules",
        ".venv",
        "gen",
        "generated",
        "fixtures",
        "books",
        "thoughts",
        "homebrew",
        "public",
        "storybook-static",
        "__pycache__",
    ]
)
TS_TEST = re.compile(r"\.(test|spec)\.[cm]?[jt]sx?$|(^|/)(tests?|__tests__|e2e)/|vitest\.setup")
PY_TEST = re.compile(r"(^|/)tests?/|(^|/)test_[^/]*\.py$|_test\.py$|(^|/)conftest\.py$")
# The libraries that own env reads.
ENV_OWNERS = ("libs/py/config/", "libs/py/observe/", "libs/ts/config/", "libs/ts/observe/")


@dataclass(frozen=True)
class Source:
    path: str
    lang: str
    test: bool

    @property
    def scope(self) -> str:
        return "test" if self.test else "prod"


def _excluded(path: str) -> bool:
    if path.endswith((".gen.ts", ".d.ts")):
        return True
    parts = path.split("/")
    if any(".sdPlugin" in p for p in parts):
        return True
    for i, seg in enumerate(parts[:-1]):
        if seg in EXCLUDED_DIRS:
            return True
        # Build output and data directories, but not a `data/` module inside a source tree.
        if seg in {"dist", "data"} and "src" not in parts[:i]:
            return True
    return False


def is_test(path: str) -> bool:
    return bool((PY_TEST if path.endswith(".py") else TS_TEST).search(path))


def tracked_sources() -> list[Source]:
    out = subprocess.run(
        ["git", "-C", str(ROOT), "ls-files", "-z"], capture_output=True, check=True
    ).stdout.decode()
    sources = []
    for path in sorted(p for p in out.split("\0") if p):
        lang = SOURCE_LANGS.get(Path(path).suffix)
        if lang and not _excluded(path) and (ROOT / path).is_file():
            sources.append(Source(path, lang, is_test(path)))
    return sources


# --------------------------------------------------------------------------- C-like lexing

_SPECIAL = re.compile(r"[/\"'`{}]")
_TEMPLATE = re.compile(r"\\.|`|\$\{", re.S)
_TS_STRING = {q: re.compile(rf"{q}(?:[^{q}\\\n]|\\.)*{q}?") for q in "\"'"}
_RS_STRING = re.compile(r'"(?:[^"\\]|\\.)*"?', re.S)
_NOT_NEWLINE = re.compile(r"[^\n]")
# A `/` after one of these (or at the start) opens a regex literal, not a division.
_REGEX_AFTER = set("(,=:[!&|?{};+-*%<>~^")
_REGEX_AFTER_WORDS = set(
    [
        "return",
        "typeof",
        "case",
        "do",
        "else",
        "in",
        "of",
        "void",
        "yield",
        "await",
        "throw",
        "delete",
        "new",
    ]
)


def _blank(s: str) -> str:
    return _NOT_NEWLINE.sub(" ", s)


def _is_word(c: str) -> bool:
    return c.isalnum() or c in "_$"


class _Lexer:
    """One pass over C-like source, recording comment spans and string-content spans."""

    def __init__(self, text: str, lang: str) -> None:
        self.text = text
        self.lang = lang
        self.blanks: list[tuple[int, int]] = []
        self.comments: list[tuple[int, int]] = []
        self.depth = 0
        self.templates: list[int] = []  # the brace depth at each open `${`

    def run(self) -> None:
        i = 0
        while (m := _SPECIAL.search(self.text, i)) is not None:
            i = m.start()
            c = self.text[i]
            if c == "/":
                i = self.slash(i)
            elif c in "\"'":
                i = self.string(i)
            elif c == "`" and self.lang == "ts":
                i = self.template_body(i + 1)
            elif c == "{":
                self.depth += 1
                i += 1
            elif self.templates and self.templates[-1] == self.depth - 1:  # closes a `${`
                self.templates.pop()
                self.depth -= 1
                i = self.template_body(i + 1)
            else:
                self.depth -= 1
                i += 1

    def slash(self, i: int) -> int:
        text = self.text
        nxt = text[i + 1 : i + 2]
        if nxt == "/":
            j = text.find("\n", i)
            j = len(text) if j == -1 else j
            self.comments.append((i, j))
            return j
        if nxt == "*":
            j = _block_comment_end(text, i, nested=self.lang == "rs")
            self.comments.append((i, j))
            return j
        if self.lang == "ts" and self.regex_allowed(i) and (j := self.regex_end(i)) != -1:
            self.blanks.append((i + 1, j))
            return j + 1
        return i + 1

    def string(self, i: int) -> int:
        if self.lang == "rs" and self.text[i] == "'":  # lifetimes and char literals
            return i + 1
        pattern = _RS_STRING if self.lang == "rs" else _TS_STRING[self.text[i]]
        sm = pattern.match(self.text, i)
        end = sm.end() if sm else i + 1
        self.blanks.append((i + 1, max(i + 1, end - 1)))
        return end

    def template_body(self, start: int) -> int:
        p = start
        while True:
            m = _TEMPLATE.search(self.text, p)
            if m is None:
                self.blanks.append((start, len(self.text)))
                return len(self.text)
            if m.group() == "`":
                self.blanks.append((start, m.start()))
                return m.end()
            if m.group() == "${":
                self.blanks.append((start, m.start()))
                self.templates.append(self.depth)
                self.depth += 1
                return m.end()
            p = m.end()

    def last_code_char(self, i: int) -> int:
        """The index of the last non-space code character before `i`, skipping comments."""
        k, span = i - 1, len(self.comments) - 1
        while k >= 0:
            while span >= 0 and self.comments[span][0] > k:
                span -= 1
            if span >= 0 and k < self.comments[span][1]:
                k = self.comments[span][0] - 1
            elif self.text[k].isspace():
                k -= 1
            else:
                break
        return k

    def regex_allowed(self, i: int) -> bool:
        k = self.last_code_char(i)
        if k < 0:
            return True
        if not _is_word(self.text[k]):
            return self.text[k] in _REGEX_AFTER
        j = k
        while j >= 0 and _is_word(self.text[j]):
            j -= 1
        return self.text[j + 1 : k + 1] in _REGEX_AFTER_WORDS

    def regex_end(self, i: int) -> int:
        """The index of the closing `/` of a one-line regex literal at `i`, or -1."""
        text, j, in_class = self.text, i + 1, False
        while j < len(text) and text[j] != "\n":
            c = text[j]
            if c == "\\":
                j += 2
                continue
            if c == "[":
                in_class = True
            elif c == "]":
                in_class = False
            elif c == "/" and not in_class:
                return j
            j += 1
        return -1


def lex(text: str, lang: str) -> tuple[str, str]:
    """Split C-like source into (code, comments), each the same length as `text`.

    `code` has comments blanked and the contents of strings, template literals and regex
    literals blanked (their delimiters kept, `${}` expressions kept as code); `comments` keeps
    only the comment text. Newlines survive in both, so line numbers line up. A heuristic,
    not a parser: it only has to be deterministic and right on ordinary code.
    """
    lexer = _Lexer(text, lang)
    lexer.run()
    spans = sorted(
        [(a, b, False) for a, b in lexer.blanks] + [(a, b, True) for a, b in lexer.comments]
    )
    code: list[str] = []
    comment: list[str] = []
    pos = 0
    for a, b, is_comment in spans:
        if a < pos or a >= b:
            continue
        code.extend((text[pos:a], _blank(text[a:b])))
        comment.extend((_blank(text[pos:a]), text[a:b] if is_comment else _blank(text[a:b])))
        pos = b
    code.append(text[pos:])
    comment.append(_blank(text[pos:]))
    return "".join(code), "".join(comment)


def _block_comment_end(text: str, i: int, *, nested: bool) -> int:
    if not nested:
        j = text.find("*/", i + 2)
        return len(text) if j == -1 else j + 2
    level, j = 1, i + 2
    while j < len(text) and level:
        if text.startswith("/*", j):
            level, j = level + 1, j + 2
        elif text.startswith("*/", j):
            level, j = level - 1, j + 2
        else:
            j += 1
    return j


def _line_of(text: str, offset: int) -> int:
    return text.count("\n", 0, offset) + 1


def _match_brace(code: str, start: int) -> int:
    """The index of the `}` that closes the `{` at `start`."""
    depth = 0
    for k in range(start, len(code)):
        if code[k] == "{":
            depth += 1
        elif code[k] == "}":
            depth -= 1
            if depth == 0:
                return k
    return len(code) - 1


def _match_close(code: str, start: int) -> int:
    """The index of the bracket that closes the one open before `start`."""
    depth = 0
    for k in range(start, len(code)):
        if code[k] in "([{":
            depth += 1
        elif code[k] in ")]}":
            depth -= 1
            if depth < 0:
                return k
    return len(code) - 1


def _depths(code: str) -> list[int]:
    """The brace depth at each offset of `code`."""
    depths = []
    d = 0
    for ch in code:
        depths.append(d)
        if ch == "{":
            d += 1
        elif ch == "}":
            d -= 1
    return depths


# --------------------------------------------------------------------------- TS and Rust

DIRECTIVE = re.compile(r"\b(?:oxlint|eslint)-disable(-next-line|-line)?\b([^\n*]*)")
EXPECT_ERROR = re.compile(r"@ts-expect-error\b")
TODO = re.compile(r"\b(?:TODO|FIXME)\b")
CATCH = re.compile(r"(?<![.\w])catch\s*(?:\(([^)]*)\))?\s*\{")
PROMISE_CATCH = re.compile(r"\.catch\(\s*(?:\(\s*([\w$]*)\s*(?::\s*[\w$]+)?\s*\)|([\w$]+))\s*=>\s*")
PROMISE_CATCH_REF = re.compile(r"\.catch\(\s*([\w$.]+)\s*\)")
NOOP_BODIES = {
    "",
    "undefined",
    "null",
    "void 0",
    "false",
    "true",
    "[]",
    "{}",
    '""',
    "''",
    "0",
    "-1",
}
# Calls that count as handling an error: logging, span status, reporting, rethrow helpers.
HANDLES = re.compile(
    r"\b(console\.\w+|log(ger)?\.\w+|\w*[lL]og\w*\s*\(|recordException|setStatus|span\.\w+"
    r"|emit\w*|warn|error|report\w*|alert\w*|onError|setError|fail\w*)\s*\("
)
METRIC = re.compile(
    r"\.create(Counter|Histogram|UpDownCounter|Gauge|ObservableGauge|ObservableCounter"
    r"|ObservableUpDownCounter)\s*\("
)
TS_ENV = re.compile(r"\bprocess\.env\b|\bimport\.meta\.env\b|\bBun\.env\b")


def _rule_name(rule: str) -> str:
    """`typescript/no-explicit-any`, `@typescript-eslint/no-explicit-any` -> `no-explicit-any`."""
    return rule.rsplit("/", 1)[-1]


def directive_rules(comment: str) -> list[tuple[str, bool]]:
    """The (rule, block) pairs a comment's disable directives name; `(all)` if none."""
    found = []
    for m in DIRECTIVE.finditer(comment):
        block = m.group(1) is None
        names = m.group(2).split("--", 1)[0]
        rules = [_rule_name(r.strip()) for r in names.split(",") if r.strip()]
        found.extend((r, block) for r in rules or ["(all)"])
    return found


def catch_drops(body: str, binding: str) -> bool:
    """Whether a catch block's body (comments and strings blanked) drops the error."""
    if not body.strip():
        return True
    if re.search(r"\bthrow\b", body) or HANDLES.search(body):
        return False
    return not (binding and re.search(rf"(?<![\w$]){re.escape(binding)}(?![\w$])", body))


def promise_catch_noop(code: str, m: re.Match[str]) -> bool:
    """Whether the arrow handler a PROMISE_CATCH match opens returns a constant or nothing."""
    k = m.end()
    if k < len(code) and code[k] == "{":
        body = code[k + 1 : _match_brace(code, k)]
    else:
        body = code[k : _match_close(code, k)]
    return body.strip() in NOOP_BODIES


def scan_ts_comments(src: Source, comments: str, sites: Sites) -> None:
    for n, line in enumerate(comments.split("\n"), 1):
        if not line.strip():
            continue
        for rule, block in directive_rules(line):
            sites[f"suppress.oxlint.{rule}"].append(f"{src.path}:{n}")
            if block:
                sites["suppress.oxlint-block"].append(f"{src.path}:{n}")
        if EXPECT_ERROR.search(line):
            sites["suppress.ts-expect-error"].append(f"{src.path}:{n}")


def ts_code_hits(src: Source, code: str) -> list[tuple[str, int]]:
    """(key, offset) for each hit in TS code with comments and string contents blanked."""
    hits = []
    for m in CATCH.finditer(code):
        start = m.end() - 1
        binding = (m.group(1) or "").split(":")[0].strip()
        if catch_drops(code[start + 1 : _match_brace(code, start)], binding):
            hits.append((f"errors.ts-catch-drops.{src.scope}", m.start()))
    hits.extend(
        (f"errors.ts-promise-catch-noop.{src.scope}", m.start())
        for m in PROMISE_CATCH.finditer(code)
        if promise_catch_noop(code, m)
    )
    hits.extend(
        (f"errors.ts-promise-catch-noop.{src.scope}", m.start())
        for m in PROMISE_CATCH_REF.finditer(code)
        if re.search(r"(?i)noop|ignore|swallow", m.group(1))
    )
    if METRIC.search(code):
        depth_at = _depths(code)
        hits.extend(
            ("zero.ts-module-scope-metric", m.start())
            for m in METRIC.finditer(code)
            if depth_at[m.start()] == 0
        )
    if not src.path.startswith(ENV_OWNERS):
        hits.extend(
            (f"env.reads-outside-config.{src.scope}", m.start()) for m in TS_ENV.finditer(code)
        )
    return hits


def scan_ts(src: Source, text: str, sites: Sites) -> None:
    code, comments = lex(text, "ts")
    scan_ts_comments(src, comments, sites)
    if src.lang == "css":
        return
    for key, offset in ts_code_hits(src, code):
        sites[key].append(f"{src.path}:{_line_of(code, offset)}")


def scan_rs(src: Source, text: str, sites: Sites) -> None:
    _, comments = lex(text, "rs")
    for n, line in enumerate(comments.split("\n"), 1):
        if TODO.search(line):
            sites["zero.rust-todo-fixme"].append(f"{src.path}:{n}")


# --------------------------------------------------------------------------- Python

_CODES = r"(?::\s*([A-Z]+[0-9]+(?:[\s,]+[A-Z]+[0-9]+)*))?"
NOQA = re.compile(rf"#\s*noqa\b{_CODES}", re.I)
NOQA_FILE = re.compile(rf"#\s*(?:ruff|flake8)\s*:\s*noqa\b{_CODES}", re.I)
TY_IGNORE = re.compile(r"#\s*ty\s*:\s*ignore\b(?:\[([^\]]*)\])?")
TYPE_IGNORE = re.compile(r"#\s*type\s*:\s*ignore\b")
BROAD = {"Exception", "BaseException"}
LOG_ATTRS = set(
    [
        "exception",
        "error",
        "warning",
        "warn",
        "info",
        "debug",
        "critical",
        "log",
        "record_exception",
        "set_status",
        "add_event",
        "echo",
        "secho",
    ]
)


def _codes(group: str | None) -> list[str]:
    return re.findall(r"[A-Z]+[0-9]+", group.upper()) if group else ["(all)"]


def py_comment_sites(src: Source, text: str, sites: Sites) -> None:
    try:
        tokens = list(tokenize.generate_tokens(io.StringIO(text).readline))
    except (tokenize.TokenError, SyntaxError):
        return
    for tok in tokens:
        if tok.type != tokenize.COMMENT:
            continue
        at = f"{src.path}:{tok.start[0]}"
        if m := NOQA_FILE.search(tok.string):
            sites_for = [f"suppress.noqa-file.{code}" for code in _codes(m.group(1))]
        elif m := NOQA.search(tok.string):
            sites_for = [f"suppress.noqa.{code}" for code in _codes(m.group(1))]
        else:
            sites_for = []
        if m := TY_IGNORE.search(tok.string):
            rules = [r.strip() for r in (m.group(1) or "").split(",") if r.strip()]
            sites_for += [f"suppress.ty.{rule}" for rule in rules or ["(all)"]]
        elif TYPE_IGNORE.search(tok.string):
            sites_for.append("suppress.type-ignore")
        for key in sites_for:
            sites[key].append(at)


def _dotted(node: ast.expr) -> str:
    parts = []
    while isinstance(node, ast.Attribute):
        parts.append(node.attr)
        node = node.value
    if isinstance(node, ast.Name):
        parts.append(node.id)
    return ".".join(reversed(parts))


def _logs(call: ast.Call) -> bool:
    fn = call.func
    if isinstance(fn, ast.Attribute):
        return fn.attr in LOG_ATTRS
    return isinstance(fn, ast.Name) and fn.id in {"print", "warn"}


def silent_handler(handler: ast.ExceptHandler) -> bool:
    """A handler that neither raises, logs nor reads the exception it caught."""
    nodes = [n for st in handler.body for n in ast.walk(st)]
    if any(isinstance(n, ast.Raise) or (isinstance(n, ast.Call) and _logs(n)) for n in nodes):
        return False
    return not (
        handler.name and any(isinstance(n, ast.Name) and n.id == handler.name for n in nodes)
    )


def _broad(handler: ast.ExceptHandler) -> bool:
    if handler.type is None:
        return False
    types = handler.type.elts if isinstance(handler.type, ast.Tuple) else [handler.type]
    return any(_dotted(t).rsplit(".", 1)[-1] in BROAD for t in types)


def _env_read(node: ast.AST, imports_environ: bool) -> bool:
    if isinstance(node, ast.Attribute):
        return _dotted(node) in {"os.environ", "os.getenv"}
    return imports_environ and isinstance(node, ast.Name) and node.id in {"environ", "getenv"}


def py_hits(src: Source, tree: ast.Module) -> list[tuple[str, int]]:
    """(key, line) for each hit in a parsed Python module."""
    scope = src.scope
    env_owner = src.path.startswith(ENV_OWNERS)
    imports_environ = any(
        isinstance(n, ast.ImportFrom)
        and n.module == "os"
        and any(a.name in {"environ", "getenv"} for a in n.names)
        for n in ast.walk(tree)
    )
    hits = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if (node.end_lineno or node.lineno) - node.lineno + 1 > 80:
                hits.append((f"size.py-functions-over-80.{scope}", node.lineno))
        elif isinstance(node, ast.ExceptHandler):
            if _broad(node) and silent_handler(node):
                hits.append((f"errors.py-silent-broad-except.{scope}", node.lineno))
        elif (
            isinstance(node, ast.Name) and node.id == "Any" and isinstance(node.ctx, ast.Load)
        ) or (
            isinstance(node, ast.Attribute)
            and node.attr == "Any"
            and _dotted(node.value) in {"typing", "t"}
        ):
            hits.append((f"types.py-any.{scope}", node.lineno))
        if not env_owner and _env_read(node, imports_environ):
            hits.append((f"env.reads-outside-config.{scope}", getattr(node, "lineno", 0)))
    return hits


def scan_py(src: Source, text: str, sites: Sites) -> None:
    py_comment_sites(src, text, sites)
    try:
        tree = ast.parse(text)
    except SyntaxError:
        return
    for key, line in py_hits(src, tree):
        sites[key].append(f"{src.path}:{line}")


# --------------------------------------------------------------------------- every source


def scan_file_size(src: Source, text: str, sites: Sites) -> None:
    lines = text.count("\n") + (0 if not text or text.endswith("\n") else 1)
    for limit in (500, 1000):
        if lines > limit:
            sites[f"size.files-over-{limit}.{src.scope}"].append(f"{src.path} ({lines} lines)")


def scan_sources(sources: Iterable[Source], sites: Sites) -> None:
    for src in sources:
        text = (ROOT / src.path).read_text(encoding="utf-8", errors="replace")
        scan_file_size(src, text, sites)
        if src.lang in {"ts", "css"}:
            scan_ts(src, text, sites)
        elif src.lang == "rs":
            scan_rs(src, text, sites)
        elif src.lang == "py":
            scan_py(src, text, sites)


# --------------------------------------------------------------------------- oxlint, knip

# The oxlint rules counted under `size.*` instead of `oxlint.*`.
OXLINT_SIZE_RULES = {
    "max-lines-per-function": "size.ts-functions-over-80",
    "complexity": "size.ts-complexity-over-15",
}
KNIP_KINDS = ("exports", "types", "dependencies", "devDependencies", "unlisted")


def ratchet_rules() -> set[str]:
    """The rules .oxlintrc.ratchet.json sets on top of the gate config (JSON with comments)."""
    text = (ROOT / OXLINT_CONFIG).read_text(encoding="utf-8")
    without_comments = re.sub(r"^\s*//.*$", "", text, flags=re.M)
    return {_rule_name(r) for r in json.loads(without_comments)["rules"]}


def lint_paths() -> list[str]:
    """The paths the root package.json `lint` script hands oxlint."""
    scripts = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["scripts"]
    return [w for w in shlex.split(scripts["lint"])[1:] if not w.startswith("-")]


def _start(cmd: list[str]) -> subprocess.Popen[bytes]:
    cmd = [str(ROOT / "node_modules" / ".bin" / cmd[0]), *cmd[1:]]
    return subprocess.Popen(cmd, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def _finish(proc: subprocess.Popen[bytes], name: str) -> dict:
    out, err = proc.communicate()
    try:
        return json.loads(out)
    except json.JSONDecodeError:
        sys.stderr.write(err.decode(errors="replace"))
        msg = f"ratchet: {name} printed no JSON (exit {proc.returncode})"
        raise SystemExit(msg) from None


def oxlint_sites(report: dict, measured: set[str], sites: Sites) -> None:
    for diag in report.get("diagnostics", []):
        m = re.search(r"\(([^()]+)\)$", diag.get("code", ""))
        if not m or (rule := _rule_name(m.group(1))) not in measured:
            continue
        path = diag["filename"]
        line = diag["labels"][0]["span"]["line"] if diag.get("labels") else 0
        key = OXLINT_SIZE_RULES.get(rule, f"oxlint.{rule}")
        sites[f"{key}.{'test' if is_test(path) else 'prod'}"].append(f"{path}:{line}")


def knip_sites(report: dict, sites: Sites) -> None:
    for path in report.get("files", []):
        sites["knip.files"].append(path)
    for issue in report.get("issues", []):
        for kind in KNIP_KINDS:
            for item in issue.get(kind) or []:
                sites[f"knip.{kind}"].append(f"{issue['file']}: {item['name']}")


def generated_modules_present() -> bool:
    """Whether any gitignored generated content module is on disk (CI never has one)."""
    dirs = [*ROOT.glob("apps/*/*/src/generated"), *ROOT.glob("libs/ts/*/src/generated")]
    return any(p.name != ".gitignore" for d in dirs for p in d.iterdir())


def measure() -> Sites:
    sites: Sites = defaultdict(list)
    # oxlint and knip run in parallel with the Python scan.
    oxlint = _start(["oxlint", "-c", OXLINT_CONFIG, "--type-aware", "-f", "json", *lint_paths()])
    knip = _start(["knip", "--reporter", "json", "--no-progress", "--no-exit-code"])
    scan_sources(tracked_sources(), sites)
    oxlint_sites(_finish(oxlint, "oxlint"), ratchet_rules(), sites)
    knip_sites(_finish(knip, "knip"), sites)
    for key in FIXED_KEYS:
        sites.setdefault(key, [])
    return {key: sorted(found) for key, found in sorted(sites.items())}


# --------------------------------------------------------------------------- the ratchet


def compare(baseline: dict[str, int], counts: dict[str, int]) -> tuple[dict, dict]:
    """(rose, fell): each key -> (baseline, now). A key missing on either side is zero."""
    rose, fell = {}, {}
    for key in sorted(set(baseline) | set(counts)):
        was, now = baseline.get(key, 0), counts.get(key, 0)
        if now > was:
            rose[key] = (was, now)
        elif now < was:
            fell[key] = (was, now)
    return rose, fell


def lowered(baseline: dict[str, int], counts: dict[str, int], frozen: set[str]) -> dict[str, int]:
    """The baseline with each count that fell lowered to now. A rise or a frozen key keeps its
    number. Per-rule keys that reach zero are dropped; the fixed keys stay, at zero."""
    out = {}
    for key in sorted(set(baseline) | set(counts)):
        was, now = baseline.get(key, 0), counts.get(key, 0)
        value = was if key in frozen else min(was, now)
        if value or key in FIXED_KEYS:
            out[key] = value
    return out


def write_baseline(values: dict[str, int]) -> None:
    text = json.dumps(dict(sorted(values.items())), indent=2) + "\n"
    BASELINE.write_text(text, encoding="utf-8")


def changed_paths() -> set[str] | None:
    """The files changed since the merge base with origin/main, committed or not, and the
    untracked ones; None when git can't tell (no origin/main, a shallow clone)."""

    def git(*args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["git", "-C", str(ROOT), *args], capture_output=True, text=True, check=False
        )

    base = git("merge-base", "origin/main", "HEAD")
    if base.returncode:
        return None
    paths: set[str] = set()
    for args in (
        ("diff", "--name-only", base.stdout.strip()),
        ("ls-files", "-o", "--exclude-standard"),
    ):
        out = git(*args)
        if out.returncode:
            return None
        paths |= set(out.stdout.split())
    return paths


def _site_path(site: str) -> str:
    """`path:line`, `path: name` and `path (N lines)` -> `path`."""
    return re.split(r"[: ]", site, maxsplit=1)[0]


def print_sites(key: str, found: list[str], changed: set[str] | None) -> None:
    """The sites in files the change touches; every site when git can't tell which those are."""
    shown = found if changed is None else [s for s in found if _site_path(s) in changed]
    where = "" if changed is None else " in the files this change touches"
    print(f"    {len(shown)} of {len(found)} sites{where}:")
    for site in shown[:MAX_SITES_SHOWN]:
        print(f"      {site}")
    if len(shown) > MAX_SITES_SHOWN or len(shown) < len(found):
        print(f"      all of them: `just ratchet --list {key}`")


def report(rose: dict, fell: dict, sites: Sites, knip_frozen: bool) -> int:
    if fell:
        print(f"ratchet: {len(fell)} counts fell below the baseline:")
        for key, (was, now) in fell.items():
            kept = knip_frozen and key.startswith("knip.")
            print(f"  {key}: {was} -> {now}" + (" (generated modules on disk)" if kept else ""))
        print("Run `just ratchet --update` and commit scripts/ratchet_baseline.json to lock it in.")
    if not rose:
        print(f"ratchet: no count rose above scripts/ratchet_baseline.json ({len(sites)} measures)")
        return 0
    print(f"ratchet: FAILED: {len(rose)} counts rose above scripts/ratchet_baseline.json:")
    changed = changed_paths() or None  # on main itself nothing differs: show every site
    for key, (was, now) in rose.items():
        print(f"\n  {key}: {was} -> {now} (+{now - was})")
        print_sites(key, sites.get(key, []), changed)
    print(
        "\nRemove what the change added. A deliberate rise is a hand edit to"
        " scripts/ratchet_baseline.json, explained in the commit message."
    )
    return 1


def update(baseline: dict[str, int], counts: dict[str, int], knip_frozen: bool) -> None:
    frozen = {k for k in set(baseline) | set(counts) if knip_frozen and k.startswith("knip.")}
    new = lowered(baseline, counts, frozen)
    if new != baseline:
        write_baseline(new)
    gone = sum(1 for k in set(baseline) | set(counts) if new.get(k, 0) < baseline.get(k, 0))
    print(f"ratchet: lowered {gone} counts in scripts/ratchet_baseline.json")
    if any(new.get(k, 0) > counts.get(k, 0) for k in frozen):
        print("ratchet: left the knip counts alone: generated content modules are on disk")


def main(argv: list[str]) -> int:
    listing = len(argv) == 2 and argv[0] == "--list"
    if argv not in ([], ["--update"], ["--json"]) and not listing:
        print(__doc__, file=sys.stderr)
        return 2
    sites = measure()
    counts = {k: len(v) for k, v in sites.items()}
    if argv == ["--json"]:
        print(json.dumps(counts, indent=2))
        return 0
    if listing:
        print("\n".join(sites.get(argv[1], [])))
        return 0
    if not BASELINE.is_file():
        if argv == ["--update"]:
            write_baseline({k: v for k, v in counts.items() if v or k in FIXED_KEYS})
            print("ratchet: wrote scripts/ratchet_baseline.json")
            return 0
        print(
            "ratchet: scripts/ratchet_baseline.json is missing; `just ratchet --update` writes it"
        )
        return 2
    baseline = json.loads(BASELINE.read_text(encoding="utf-8"))
    knip_frozen = generated_modules_present()
    if argv == ["--update"]:
        update(baseline, counts, knip_frozen)
        baseline = json.loads(BASELINE.read_text(encoding="utf-8"))
    rose, fell = compare(baseline, counts)
    return report(rose, fell, sites, knip_frozen)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
