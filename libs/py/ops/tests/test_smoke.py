"""smoke: each check over faked fetches, the textfile, and the committed check list."""

from __future__ import annotations

import itertools
from pathlib import Path
from urllib.parse import urlsplit

import pytest
from astra_ops import host_metrics as hm
from astra_ops import smoke

REPO = Path(__file__).resolve().parents[4]

PAGE = smoke.Check("page", "https://a.iridi.cc/p", contains=("Fireball",))
HEALTH = smoke.Check("health", "https://a.iridi.cc/healthz", json_fields=("releaseId",))
REDIRECT = smoke.Check(
    "redirect", "https://a.iridi.cc/pf.js", contains=("v=",), final_prefix="https://a.iridi.cc/r/"
)


def ok(url: str, body: str) -> smoke.Response:
    return smoke.Response(200, url, body.encode())


@pytest.mark.parametrize(
    ("check", "res", "failure"),
    [
        (PAGE, ok(PAGE.url, "<h1>Fireball</h1>"), None),
        (PAGE, ok(PAGE.url, "<h1>Not here</h1>"), "body lacks 'Fireball'"),
        (PAGE, smoke.Response(404, PAGE.url, b"Fireball"), "HTTP 404"),
        (HEALTH, ok(HEALTH.url, '{"releaseId":"a98324c9"}'), None),
        (HEALTH, ok(HEALTH.url, '{"releaseId":null}'), "JSON releaseId is None"),
        (HEALTH, ok(HEALTH.url, "<!doctype html>"), "body is not JSON"),
        (HEALTH, ok(HEALTH.url, "[1]"), "body is not a JSON object"),
        (REDIRECT, ok("https://a.iridi.cc/r/abc/pf.js", "v=1"), None),
        (REDIRECT, ok(REDIRECT.url, "v=1"), "ended at https://a.iridi.cc/pf.js, not under"),
    ],
)
def test_evaluate(check: smoke.Check, res: smoke.Response, failure: str | None) -> None:
    got = smoke.evaluate(check, res)
    if failure is None:
        assert got is None
    else:
        assert got is not None and got.startswith(failure)


def test_writes_one_success_and_one_duration_per_check(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    def fetch(url: str) -> smoke.Response:
        if url == HEALTH.url:
            raise OSError("connection refused")
        return ok(url, "<h1>Fireball</h1>")

    ticks = itertools.count(0, 0.25)
    textfile = tmp_path / "textfile" / "astra-smoke.prom"
    probes = smoke.Probes(fetch=fetch, clock=lambda: next(ticks))
    assert smoke.smoke(textfile, (PAGE, HEALTH), probes) == 0
    lines = textfile.read_text().splitlines()
    for line in [
        "# TYPE astra_smoke_success gauge",
        'astra_smoke_success{check="page",url="https://a.iridi.cc/p"} 1',
        'astra_smoke_success{check="health",url="https://a.iridi.cc/healthz"} 0',
        'astra_smoke_duration_seconds{check="page"} 0.25',
        'astra_smoke_duration_seconds{check="health"} 0.25',
    ]:
        assert line in lines, line
    out = capsys.readouterr().out
    assert "smoke: FAIL health https://a.iridi.cc/healthz: fetch failed: connection refused" in out
    assert "smoke: 1/2 checks passed" in out and "failed: health" in out


def test_an_unwritable_textfile_fails_the_run(tmp_path: Path) -> None:
    textfile = tmp_path / "astra-smoke.prom"
    textfile.mkdir()
    probes = smoke.Probes(fetch=lambda url: ok(url, "Fireball"))
    assert smoke.smoke(textfile, (PAGE,), probes) == 1


def test_every_check_host_is_a_site_and_every_name_is_unique() -> None:
    sites = set(hm.site_hosts(REPO / "sites.caddyfile"))
    names = [c.name for c in smoke.CHECKS]
    assert len(names) == len(set(names))
    for c in smoke.CHECKS:
        assert urlsplit(c.url).scheme == "https", c.name
        assert urlsplit(c.url).hostname in sites, c.name
        assert c.contains or c.json_fields, c.name  # status 200 alone proves too little
