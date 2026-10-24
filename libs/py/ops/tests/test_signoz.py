"""SigNoz rules as code: the committed rule files, the comparison, and check/apply on a fake API."""

from __future__ import annotations

import copy
import dataclasses
import json
from pathlib import Path
from typing import Any

import pytest
from astra_config import find_repo_root
from astra_ops import cli, signoz
from astra_ops.testing import make_ctx

REPO = find_repo_root()
RULES = REPO / "deploy" / "signoz" / "rules"
FIXTURES = Path(__file__).parent / "fixtures" / "signoz"


def live_fixture(name: str) -> dict[str, Any]:
    return json.loads((FIXTURES / name).read_text())["data"]


class FakeSignoz:
    """An in-memory rules API: v3 summaries (or only the v2 list), GET/POST/PUT by id. A
    stored rule comes back the way SigNoz echoes it: with server fields and empty defaults."""

    def __init__(self, rules: list[dict[str, Any]] | None = None, *, v3: bool = True) -> None:
        self.rules: dict[str, dict[str, Any]] = {}
        self.v3 = v3
        self.writes: list[tuple[str, str]] = []
        self.fail_writes = False
        for rule in rules or []:
            self._store(rule, rule.get("id"))

    def _store(self, body: dict[str, Any], rid: str | None = None) -> str:
        rid = rid or f"id-{len(self.rules) + 1}"
        stored = copy.deepcopy(body)
        stored.update({"id": rid, "state": "inactive", "createdAt": "t", "disabled": False})
        for spec in stored["condition"]["thresholds"]["spec"]:
            spec.setdefault("targetUnit", "")
        self.rules[rid] = stored
        return rid

    def __call__(self, method: str, path: str, body: dict[str, Any] | None) -> tuple[int, Any]:
        if method == "GET" and path.startswith("/api/v3/rules"):
            if not self.v3:
                return 404, "404 page not found"
            offset = int(path.rsplit("offset=", 1)[1])
            summaries = [{"id": i, "alert": r["alert"]} for i, r in self.rules.items()]
            page = summaries[offset : offset + 2]  # tiny pages exercise the paging loop
            return 200, {"data": {"rules": page, "total": len(summaries)}}
        if method == "GET" and path == "/api/v2/rules":
            return 200, {"data": list(self.rules.values())}
        if method == "GET" and path.startswith("/api/v2/rules/"):
            return 200, {"data": copy.deepcopy(self.rules[path.rsplit("/", 1)[1]])}
        if method in ("POST", "PUT") and self.fail_writes:
            return 400, {"error": {"message": "alert rule is not valid"}}
        if method == "POST" and path == "/api/v2/rules":
            assert body is not None
            self.writes.append(("create", body["alert"]))
            return 201, {"data": {"id": self._store(body)}}
        if method == "PUT" and path.startswith("/api/v2/rules/"):
            assert body is not None
            rid = path.rsplit("/", 1)[1]
            self.writes.append(("update", body["alert"]))
            self._store(body, rid)
            return 204, None
        return 404, "no route"


def rule(alert: str, **extra: Any) -> dict[str, Any]:
    return {
        "alert": alert,
        "alertType": "METRIC_BASED_ALERT",
        "ruleType": "promql_rule",
        "schemaVersion": "v2alpha1",
        "condition": {
            "thresholds": {"kind": "basic", "spec": [{"name": "error", "target": 1, "op": "above"}]}
        },
        **extra,
    }


def write_rules(d: Path, *rules: dict[str, Any]) -> Path:
    d.mkdir(parents=True, exist_ok=True)
    for r in rules:
        (d / f"{signoz.slug(r['alert'])}.json").write_text(json.dumps(r, indent=2))
    return d


def lines() -> tuple[list[str], Any]:
    out: list[str] = []
    return out, out.append


# --- the committed rule files ------------------------------------------------------------------


def test_committed_rules_load_and_name_their_files() -> None:
    rules = signoz.load_rules(RULES)
    assert len(rules) == len(list(RULES.glob("*.json")))
    for r in rules.values():
        for t in r["condition"]["thresholds"]["spec"]:
            assert t["channels"] == ["discord-ops"], r["alert"]
        assert "notificationSettings" in r and "evaluation" in r, r["alert"]


def test_committed_rules_page_on_no_rum_service() -> None:
    """The browser RUM services post through the public OTLP ingest, so no paging rule may
    read their logs; the new host rules read only node-exporter's scrape."""
    rules = signoz.load_rules(RULES)
    logs = rules["astra error/fatal logs"]
    expr = logs["condition"]["compositeQuery"]["queries"][0]["spec"]["filter"]["expression"]
    assert "service.name NOT LIKE '%-rum'" in expr
    for name, r in rules.items():
        if r["ruleType"] == "promql_rule":
            for q in r["condition"]["compositeQuery"]["queries"]:
                assert '"service.name"="node-exporter"' in q["spec"]["query"], name


def test_multi_threshold_rules_carry_no_static_severity() -> None:
    """SigNoz takes an alert's severity from the threshold name; a static labels.severity
    would override it (only rules that predate this check are exempt)."""
    exempt = {"saffron filesystem filling up"}
    for name, r in signoz.load_rules(RULES).items():
        if len(r["condition"]["thresholds"]["spec"]) > 1 and name not in exempt:
            assert "severity" not in r.get("labels", {}), name


@pytest.mark.parametrize(
    ("content", "message"),
    [
        ("{", "not valid JSON"),
        ('{"alert": "x"}', "lacks"),
        (json.dumps({**rule("x"), "schemaVersion": "v1"}), "v2alpha1"),
        (json.dumps({**rule("x"), "u": "https://discord.com/api/webhooks/1/abc"}), "webhook"),
    ],
)
def test_bad_rule_files_refuse(tmp_path: Path, content: str, message: str) -> None:
    (tmp_path / "x.json").write_text(content)
    with pytest.raises(signoz.RulesError, match=message):
        signoz.load_rules(tmp_path)


def test_file_must_be_named_after_its_alert(tmp_path: Path) -> None:
    (tmp_path / "other.json").write_text(json.dumps(rule("My Rule")))
    with pytest.raises(signoz.RulesError, match=r"my-rule\.json"):
        signoz.load_rules(tmp_path)


# --- comparison --------------------------------------------------------------------------------


def test_live_echo_of_an_unchanged_rule_matches_its_file() -> None:
    """Real API responses (server fields, "source": "", "targetUnit": "") equal the files."""
    git = signoz.load_rules(RULES)
    live = live_fixture("live-filesystem-rule.json")
    assert signoz.diff(git["saffron filesystem filling up"], live) == []


def test_the_rum_exclusion_shows_as_drift_against_the_old_live_rule() -> None:
    git = signoz.load_rules(RULES)
    changes = signoz.diff(git["astra error/fatal logs"], live_fixture("live-error-logs-rule.json"))
    paths = sorted(c.split(":")[0] for c in changes)
    assert paths == ["condition.compositeQuery.queries[0].spec.filter.expression", "description"]


def test_diff_catches_live_only_values_and_list_changes() -> None:
    want = {"a": 1, "q": [{"x": 1}], "n": None}
    assert signoz.diff(want, {"a": 1, "q": [{"x": 1}], "id": "z", "s": ""}) == []
    assert signoz.diff(want, {"a": 1.0, "q": [{"x": 1}]}) == []
    assert signoz.diff(want, {"a": 2, "q": [{"x": 1}]}) == ["a: git 1, live 2"]
    assert signoz.diff(want, {"a": 1, "q": [{"x": 1, "f": "y"}]}) == ['q[0].f: live only ("y")']
    assert signoz.diff(want, {"a": 1, "q": []}) == ["q: 1 items in git, 0 live"]
    assert signoz.diff(want, {"q": [{"x": 1}]}) == ["a: missing live"]
    assert signoz.diff({"b": True}, {"b": 1}) == ["b: git true, live 1"]


# --- check and apply ---------------------------------------------------------------------------


def test_check_in_sync(tmp_path: Path) -> None:
    d = write_rules(tmp_path, rule("one"), rule("two"))
    api = signoz.Api(FakeSignoz([rule("one"), rule("two")]))
    out, say = lines()
    assert signoz.check(api, d, say) == 0
    assert out[-1] == f"signoz-rules-check: 2 rule(s) in sync with {d}"


@pytest.mark.parametrize("v3", [True, False])
def test_check_reports_every_kind_of_drift(tmp_path: Path, v3: bool) -> None:
    d = write_rules(tmp_path, rule("same"), rule("changed", description="new"), rule("missing"))
    fake = FakeSignoz(
        [rule("same"), rule("changed", description="old"), rule("extra"), rule("dup"), rule("dup")],
        v3=v3,
    )
    out, say = lines()
    assert signoz.check(signoz.Api(fake), d, say) == signoz.EXIT_DRIFT
    text = "\n".join(out)
    assert "  same     same" in text
    assert "  create   missing" in text
    assert "  update   changed" in text and 'description: git "new", live "old"' in text
    assert "  live only extra" in text and "  live only dup" in text
    assert "  duplicate dup" in text
    assert fake.writes == []  # check is read-only


def test_check_cannot_run_without_signoz(tmp_path: Path) -> None:
    def down(_m: str, _p: str, _b: Any) -> tuple[int, Any]:
        raise signoz.RulesError("SigNoz at http://x is unreachable: refused")

    out, say = lines()
    d = write_rules(tmp_path, rule("one"))
    assert signoz.check(signoz.Api(down), d, say) == signoz.EXIT_CANNOT_RUN
    assert "unreachable" in out[-1]


def test_apply_is_a_dry_run_without_yes(tmp_path: Path) -> None:
    d = write_rules(tmp_path, rule("new"), rule("changed", description="new"))
    fake = FakeSignoz([rule("changed", description="old")])
    out, say = lines()
    assert signoz.apply(signoz.Api(fake), d, yes=False, say=say) == 0
    assert fake.writes == []
    assert "dry run: 1 to create, 1 to update" in out[-1]


def test_apply_creates_updates_then_a_second_apply_is_a_no_op(tmp_path: Path) -> None:
    d = write_rules(tmp_path, rule("new"), rule("changed", description="new"), rule("same"))
    fake = FakeSignoz([rule("changed", description="old"), rule("same"), rule("extra")])
    out, say = lines()
    assert signoz.apply(signoz.Api(fake), d, yes=True, say=say) == 0
    assert sorted(fake.writes) == [("create", "new"), ("update", "changed")]
    assert out[-1] == "signoz-rules-apply: applied; every git rule now matches SigNoz"
    assert any("live only extra" in line for line in out)  # reported, never deleted
    assert len(fake.rules) == 4
    fake.writes.clear()
    assert signoz.apply(signoz.Api(fake), d, yes=True, say=say) == 0
    assert fake.writes == []


def test_apply_reports_a_rejected_write(tmp_path: Path) -> None:
    fake = FakeSignoz()
    fake.fail_writes = True
    out, say = lines()
    d = write_rules(tmp_path, rule("new"))
    assert signoz.apply(signoz.Api(fake), d, yes=True, say=say) == signoz.EXIT_DRIFT
    assert any("FAILED   create new" in line and "HTTP 400" in line for line in out)


# --- the CLI -----------------------------------------------------------------------------------


def test_cli_without_a_key_exits_3(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(cli, "signoz_api", lambda: None)
    ctx, r = make_ctx(tmp_path, [])
    assert cli.dispatch(ctx, "signoz-rules-check", []) == 3
    assert cli.dispatch(ctx, "signoz-rules-apply", ["--yes"]) == 3
    r.assert_done()


def test_cli_bad_arguments_exit_64(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(cli, "signoz_api", lambda: pytest.fail("built the API"))
    ctx, _ = make_ctx(tmp_path, [])
    assert cli.dispatch(ctx, "signoz-rules-check", ["--yes"]) == 64
    assert cli.dispatch(ctx, "signoz-rules-apply", ["--force"]) == 64
    assert cli.dispatch(ctx, "host-metrics", ["x"]) == 64


def test_cli_check_reads_the_checkout_rules(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    live = [copy.deepcopy(r) for r in signoz.load_rules(RULES).values()]
    monkeypatch.setattr(cli, "signoz_api", lambda: signoz.Api(FakeSignoz(live)))
    ctx, _ = make_ctx(tmp_path, [])
    assert cli.dispatch(dataclasses.replace(ctx, repo_root=REPO), "signoz-rules-check", []) == 0
