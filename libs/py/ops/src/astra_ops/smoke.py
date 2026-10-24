"""``astra-ops smoke``: fetch one real page per public site and check its content.

``astra-metrics.timer``'s host probes see a certificate and a container's own healthcheck;
neither proves the edge serves the right content. This command fetches each site over the
public edge (DNS, Caddy, TLS, the app) and checks the status, an expected content marker
and, for JSON health endpoints, the fields that mean ready. It runs every 10 minutes from
``astra-smoke.timer`` and writes ``ops.smoke-textfile`` (config.kdl), a second file in the
directory node-exporter serves, so it never races ``host-metrics`` for one file.

Metrics (one series per check in ``CHECKS``):

- ``astra_smoke_success{check,url}``: 1 when the check passed, 0 when it failed.
- ``astra_smoke_duration_seconds{check}``: how long the fetch took, redirects included
  (the timeout when it timed out).

The rule "astra smoke check failing" pages after three consecutive failed runs; "astra smoke
metrics stale" pages when the file stops changing. A failed check never fails the command;
the command fails (exit 1, which pages through ``OnFailure``) only when the file cannot be
written. Every failed check prints its reason, so the journal says what broke.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from pathlib import Path

from .host_metrics import Collected, render, write_atomic

#: Seconds one fetch (redirects included) may take.
FETCH_TIMEOUT_S = 15.0
#: Bytes read from a body; every marker sits well inside the first page of HTML.
MAX_BODY = 4 * 1024 * 1024
USER_AGENT = "astra-smoke/1 (+https://github.com/jbassin/astra)"

HELP = {
    "astra_smoke_success": "1 when the live smoke check passed, 0 when it failed.",
    "astra_smoke_duration_seconds": "Seconds the smoke check's fetch took.",
}


@dataclass(frozen=True)
class Check:
    """One fetch and what its answer must hold. Every condition must pass."""

    name: str
    url: str
    #: Substrings of the decoded body.
    contains: tuple[str, ...] = ()
    #: Keys of a JSON object body whose values must be truthy (a non-empty id, ``true``).
    json_fields: tuple[str, ...] = ()
    #: The URL after redirects must start with this (a redirect that must happen).
    final_prefix: str | None = None


#: One real page per public frontend, plus the health endpoints that report more than "up".
#: Markers are content only the right page carries, so a fallback page or an error page that
#: answers 200 still fails. Every host is a site block in sites.caddyfile (a test checks).
CHECKS: tuple[Check, ...] = (
    Check("codex-spell", "https://codex.iridi.cc/spell/fireball", contains=("Fireball",)),
    Check("codex-healthz", "https://codex.iridi.cc/healthz", json_fields=("releaseId",)),
    # The search client imports /pagefind/pagefind.js; codex redirects it to the release it
    # serves (apps/codex/web/src/server/pagefindRoute.ts). No release means a 404.
    Check(
        "codex-pagefind",
        "https://codex.iridi.cc/pagefind/pagefind.js",
        contains=("pagefind_version",),
        final_prefix="https://codex.iridi.cc/pagefind/r/",
    ),
    Check(
        "akasha-page",
        "https://akasha.iridi.cc/Geography/F%C3%A6rrin",
        contains=("Færrin — Akasha",),
    ),
    Check("mouthpiece-index", "https://mouthpiece.iridi.cc/", contains=('href="/episode/',)),
    Check(
        "strider-faction",
        "https://strider.iridi.cc/factions/ternion-heavy-industries",
        contains=("Ternion Heavy Industries",),
    ),
    Check("ledger-index", "https://ledger.iridi.cc/", contains=('href="https://akasha.iridi.cc"',)),
    Check("harrow-index", "https://harrow.iridi.cc/", contains=("Harrow",)),
    Check("vellum-health", "https://vellum.iridi.cc/health", json_fields=("ready",)),
    Check("menhir-healthz", "https://menhir.iridi.cc/healthz", contains=('"status":"ready"',)),
    Check("orator-healthz", "https://orator.iridi.cc/healthz", contains=('"status":"ready"',)),
    Check("portal-health", "https://portal.iridi.cc/health", json_fields=("ok",)),
    # weal-overlay has no health route: every unknown path falls back to the SPA's index.html,
    # so `/health` would pass on any build. The index's title is the marker instead.
    Check("weal-overlay-index", "https://weal-overlay.iridi.cc/", contains=("weal-overlay",)),
)


@dataclass(frozen=True)
class Response:
    status: int
    url: str
    body: bytes


def _fetch(url: str) -> Response:
    """GET ``url``, following redirects. An HTTP error status is a response, not a raise;
    a connection, TLS or timeout failure raises ``OSError``."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})  # noqa: S310 -- the fixed https URLs in CHECKS
    try:
        with urllib.request.urlopen(req, timeout=FETCH_TIMEOUT_S) as res:  # noqa: S310 -- the fixed https URLs in CHECKS
            return Response(res.status, res.geturl(), res.read(MAX_BODY))
    except urllib.error.HTTPError as exc:
        return Response(exc.code, exc.geturl() or url, b"")


@dataclass
class Probes:
    """The outside world, swappable in tests."""

    fetch: Callable[[str], Response] = _fetch
    clock: Callable[[], float] = time.monotonic


def evaluate(check: Check, res: Response) -> str | None:
    """Why ``res`` fails ``check``, or None when it passes."""
    if res.status != 200:
        return f"HTTP {res.status}"
    if check.final_prefix is not None and not res.url.startswith(check.final_prefix):
        return f"ended at {res.url}, not under {check.final_prefix}"
    text = res.body.decode("utf-8", errors="replace")
    for marker in check.contains:
        if marker not in text:
            return f"body lacks {marker!r}"
    if check.json_fields:
        try:
            body = json.loads(text)
        except ValueError:
            return "body is not JSON"
        if not isinstance(body, dict):
            return "body is not a JSON object"
        for key in check.json_fields:
            if not body.get(key):
                return f"JSON {key} is {body.get(key)!r}"
    return None


@dataclass
class Result:
    check: Check
    seconds: float
    failure: str | None


@dataclass
class Run:
    results: list[Result] = field(default_factory=list)

    def collected(self) -> Collected:
        out = Collected()
        for r in self.results:
            out.add(
                "astra_smoke_success", 0 if r.failure else 1, check=r.check.name, url=r.check.url
            )
        for r in self.results:
            out.add("astra_smoke_duration_seconds", round(r.seconds, 3), check=r.check.name)
        return out


def run_checks(checks: Sequence[Check], probes: Probes) -> Run:
    run = Run()
    for check in checks:
        start = probes.clock()
        try:
            failure = evaluate(check, probes.fetch(check.url))
        except (OSError, ValueError) as exc:  # URLError and timeouts are OSErrors
            failure = f"fetch failed: {exc}"
        run.results.append(Result(check, probes.clock() - start, failure))
    return run


def smoke(textfile: Path, checks: Sequence[Check] = CHECKS, probes: Probes | None = None) -> int:
    run = run_checks(checks, probes or Probes())
    for r in run.results:
        if r.failure:
            print(f"smoke: FAIL {r.check.name} {r.check.url}: {r.failure}", flush=True)  # noqa: T201 -- command-line output (the journal)
    try:
        write_atomic(textfile, render(run.collected(), HELP))
    except OSError as exc:
        print(f"smoke: cannot write {textfile}: {exc}", flush=True)  # noqa: T201 -- command-line output
        return 1
    failed = [r.check.name for r in run.results if r.failure]
    print(  # noqa: T201 -- command-line output (the journal)
        f"smoke: {len(run.results) - len(failed)}/{len(run.results)} checks passed, wrote "
        f"{textfile}; failed: {', '.join(failed) or 'none'}",
        flush=True,
    )
    return 0
