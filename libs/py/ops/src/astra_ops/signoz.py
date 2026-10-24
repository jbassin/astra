"""SigNoz alert rules as code: ``deploy/signoz/rules/*.json`` is the source of truth.

    astra-ops signoz-rules-check            compare live with git, read-only
    astra-ops signoz-rules-apply [--yes]    print the plan; with --yes, create and update

Each file holds one rule body exactly as ``POST /api/v2/rules`` accepts it. A rule's stable
identity is its ``alert`` name: apply creates a rule git has and SigNoz lacks, replaces
(``PUT``) a live rule whose body differs from its file, and leaves an equal one alone, so a
second apply changes nothing. It never deletes: a live rule with no file is reported as
"live only", and check counts it as drift until someone deletes it in SigNoz or exports it
with ``just signoz-rules-export``.

Comparison. SigNoz echoes a stored rule with server fields added (``id``, ``state``, audit
fields, ``webUrl``) and with defaults filled in (``"source": ""`` in a query spec,
``"targetUnit": ""`` in a threshold). So every key the file sets must be equal live, and a
key only the live rule has counts as drift unless it is a server field or holds an empty
default (``""``, ``null``, ``false``, ``0``, ``[]``, ``{}``). A list must have the same
length and match item by item.

The API key is ``ops.signoz-api-key`` (``sops:signoz_api_key``; ``$SIGNOZ_API_KEY`` wins),
a SigNoz service-account key. Check needs the Viewer role, apply needs Editor.

Exit codes: 0 in sync (or applied), 1 drift (check) or a failed write (apply), 2 the
comparison could not run (SigNoz unreachable or erroring, a bad rule file), 3 no API key
configured, 64 bad arguments.
"""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

#: Keys SigNoz adds to a stored rule; never drift.
SERVER_KEYS = frozenset(
    {
        "id", "ruleId", "state", "createAt", "createBy", "updateAt", "updateBy",
        "createdAt", "createdBy", "updatedAt", "updatedBy", "webUrl",
    }
)  # fmt: skip
#: A webhook URL in a rule file would publish a secret in git (the notification channel
#: holds it, and channels are deliberately not in git).
WEBHOOK_RE = re.compile(r"/api/webhooks/|hooks\.slack\.com|discord(app)?\.com/api", re.IGNORECASE)
REQUIRED = ("alert", "alertType", "ruleType", "condition", "schemaVersion")
HTTP_TIMEOUT_S = 15.0

EXIT_DRIFT = 1
EXIT_CANNOT_RUN = 2
EXIT_NO_KEY = 3


class RulesError(Exception):
    """The comparison cannot run (exit 2)."""


# --- git side -------------------------------------------------------------------------------


def slug(alert: str) -> str:
    """The file stem for a rule (the same slug astra-backup.sh's export writes)."""
    return re.sub(r"[^a-z0-9]+", "-", alert.lower()).strip("-")


def load_rules(rules_dir: Path) -> dict[str, dict[str, Any]]:
    """Every ``*.json`` in ``rules_dir``, keyed by its ``alert`` name."""
    rules: dict[str, dict[str, Any]] = {}
    files = sorted(rules_dir.glob("*.json"))
    if not files:
        raise RulesError(f"no rule files in {rules_dir}")
    for path in files:
        text = path.read_text(encoding="utf-8")
        if WEBHOOK_RE.search(text):
            raise RulesError(f"{path.name} contains a webhook URL; rules must name channels")
        try:
            rule = json.loads(text)
        except ValueError as exc:
            raise RulesError(f"{path.name} is not valid JSON: {exc}") from exc
        if not isinstance(rule, dict):
            raise RulesError(f"{path.name} is not a JSON object")
        missing = [k for k in REQUIRED if k not in rule]
        if missing:
            raise RulesError(f"{path.name} lacks {', '.join(missing)}")
        if rule["schemaVersion"] != "v2alpha1":
            raise RulesError(f"{path.name}: schemaVersion must be v2alpha1")
        name = rule["alert"]
        if path.stem != slug(name):
            raise RulesError(
                f"{path.name}: name the file {slug(name)}.json after its alert, as "
                "just signoz-rules-export does"
            )
        if name in rules:
            raise RulesError(f"{path.name}: a second rule is named {name!r}")
        rules[name] = rule
    return rules


# --- comparison -----------------------------------------------------------------------------


def _empty(value: object) -> bool:
    return value in ("", None, False, 0, [], {})


def diff(want: Any, live: Any, path: str = "") -> list[str]:
    """Where ``live`` differs from ``want`` (dotted paths; empty when they match)."""
    if isinstance(want, dict) and isinstance(live, dict):
        out: list[str] = []
        live_map: dict[str, Any] = {str(k): v for k, v in live.items()}
        want_map: dict[str, Any] = {str(k): v for k, v in want.items()}
        for key, value in want_map.items():
            sub = f"{path}.{key}" if path else key
            if key not in live_map:
                if value is not None:
                    out.append(f"{sub}: missing live")
                continue
            out += diff(value, live_map[key], sub)
        for key, value in live_map.items():
            if key not in want_map and key not in SERVER_KEYS and not _empty(value):
                sub = f"{path}.{key}" if path else key
                out.append(f"{sub}: live only ({json.dumps(value)[:60]})")
        return out
    if isinstance(want, list) and isinstance(live, list):
        if len(want) != len(live):
            return [f"{path}: {len(want)} items in git, {len(live)} live"]
        out = []
        for i, (w, lv) in enumerate(zip(want, live, strict=True)):
            out += diff(w, lv, f"{path}[{i}]")
        return out
    if want == live and type(want) is type(live):
        return []
    numbers = (
        isinstance(want, int | float)
        and isinstance(live, int | float)
        and not isinstance(want, bool)
        and not isinstance(live, bool)
    )
    if numbers and want == live:
        return []  # 0 vs 0.0: JSON numbers
    return [f"{path}: git {json.dumps(want)[:60]}, live {json.dumps(live)[:60]}"]


@dataclass
class Plan:
    create: list[str] = field(default_factory=list)
    update: list[tuple[str, str, list[str]]] = field(default_factory=list)  # name, id, diffs
    same: list[str] = field(default_factory=list)
    live_only: list[str] = field(default_factory=list)
    duplicates: list[str] = field(default_factory=list)

    @property
    def in_sync(self) -> bool:
        return not (self.create or self.update or self.live_only or self.duplicates)


def make_plan(git: Mapping[str, dict[str, Any]], live: Iterable[dict[str, Any]]) -> Plan:
    plan = Plan()
    by_name: dict[str, list[dict[str, Any]]] = {}
    for rule in live:
        by_name.setdefault(str(rule.get("alert", "")), []).append(rule)
    for name, rules in sorted(by_name.items()):
        if len(rules) > 1:
            plan.duplicates.append(name)
        if name not in git:
            plan.live_only.append(name)
    for name, want in sorted(git.items()):
        rules = by_name.get(name, [])
        if not rules:
            plan.create.append(name)
        elif len(rules) == 1:
            changes = diff(want, rules[0])
            if changes:
                plan.update.append((name, rule_id(rules[0]), changes))
            else:
                plan.same.append(name)
    return plan


def rule_id(rule: Mapping[str, Any]) -> str:
    return str(rule.get("id") or rule.get("ruleId") or "")


def report(plan: Plan, say: Callable[[str], None]) -> None:
    for name in plan.same:
        say(f"  same     {name}")
    for name in plan.create:
        say(f"  create   {name}")
    for name, rid, changes in plan.update:
        say(f"  update   {name} ({rid})")
        for change in changes[:12]:
            say(f"             {change}")
        if len(changes) > 12:
            say(f"             ... {len(changes) - 12} more")
    for name in plan.live_only:
        say(f"  live only {name} (no file in git: delete it in SigNoz or export it)")
    for name in plan.duplicates:
        say(f"  duplicate {name} (several live rules share this name: delete the extras)")


# --- the API --------------------------------------------------------------------------------

Transport = Callable[[str, str, dict[str, Any] | None], tuple[int, Any]]


def urllib_transport(base_url: str, api_key: str) -> Transport:
    """``(method, path, body) -> (status, parsed JSON)`` over HTTP with the API key."""

    def call(method: str, path: str, body: dict[str, Any] | None) -> tuple[int, Any]:
        data = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request(  # noqa: S310 -- the configured SigNoz URL
            base_url.rstrip("/") + path,
            data=data,
            method=method,
            headers={"SIGNOZ-API-KEY": api_key, "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT_S) as resp:  # noqa: S310 -- as above
                status, raw = resp.status, resp.read()
        except urllib.error.HTTPError as exc:
            status, raw = exc.code, exc.read()
        except (urllib.error.URLError, OSError) as exc:
            raise RulesError(f"SigNoz at {base_url} is unreachable: {exc}") from exc
        try:
            return status, json.loads(raw) if raw else None
        except ValueError:
            return status, raw.decode(errors="replace")[:200]

    return call


@dataclass
class Api:
    transport: Transport

    def _ok(self, method: str, path: str, body: dict[str, Any] | None = None) -> Any:
        """The response's ``data``; a non-2xx status raises."""
        status, payload = self.transport(method, path, body)
        if not 200 <= status < 300:
            raise RulesError(f"{method} {path}: HTTP {status}: {str(payload)[:300]}")
        return payload.get("data") if isinstance(payload, dict) else payload

    def list_ids(self) -> list[str]:
        """Every rule id: ``GET /api/v3/rules`` (paged summaries under ``data.rules``) where
        the server has it, else the older ``GET /api/v2/rules`` list (a bare array)."""
        status, _ = self.transport("GET", "/api/v3/rules?limit=1&offset=0", None)
        if status in (404, 405):
            data = self._ok("GET", "/api/v2/rules")
            rules = data.get("rules", []) if isinstance(data, dict) else data
            return [rule_id(r) for r in rules or []]
        ids: list[str] = []
        while True:
            data = self._ok("GET", f"/api/v3/rules?limit=200&offset={len(ids)}") or {}
            page = data.get("rules") or []
            ids += [rule_id(r) for r in page]
            if not page or len(ids) >= int(data.get("total") or 0):
                return ids

    def live_rules(self) -> list[dict[str, Any]]:
        rules = []
        for rid in self.list_ids():
            rule = self._ok("GET", f"/api/v2/rules/{rid}")
            if isinstance(rule, dict):
                rule.setdefault("id", rid)
                rules.append(rule)
        return rules

    def create(self, rule: dict[str, Any]) -> None:
        self._ok("POST", "/api/v2/rules", rule)

    def update(self, rid: str, rule: dict[str, Any]) -> None:
        self._ok("PUT", f"/api/v2/rules/{rid}", rule)


# --- commands -------------------------------------------------------------------------------


def _say(msg: str) -> None:
    print(msg, flush=True)  # noqa: T201 -- command-line output


def check(api: Api, rules_dir: Path, say: Callable[[str], None] = _say) -> int:
    try:
        git = load_rules(rules_dir)
        plan = make_plan(git, api.live_rules())
    except RulesError as exc:
        say(f"signoz-rules-check: cannot compare: {exc}")
        return EXIT_CANNOT_RUN
    report(plan, say)
    if plan.in_sync:
        say(f"signoz-rules-check: {len(plan.same)} rule(s) in sync with {rules_dir}")
        return 0
    say("signoz-rules-check: DRIFT between SigNoz and git (fix with: just signoz-rules-apply)")
    return EXIT_DRIFT


def apply(api: Api, rules_dir: Path, *, yes: bool, say: Callable[[str], None] = _say) -> int:
    try:
        git = load_rules(rules_dir)
        plan = make_plan(git, api.live_rules())
    except RulesError as exc:
        say(f"signoz-rules-apply: cannot compare: {exc}")
        return EXIT_CANNOT_RUN
    report(plan, say)
    if not (plan.create or plan.update):
        say("signoz-rules-apply: nothing to create or update")
        return 0
    if not yes:
        say(
            f"signoz-rules-apply: dry run: {len(plan.create)} to create, {len(plan.update)} to "
            "update. Re-run with --yes to apply."
        )
        return 0
    failed = 0
    for name in plan.create:
        try:
            api.create(git[name])
            say(f"created  {name}")
        except RulesError as exc:
            failed += 1
            say(f"FAILED   create {name}: {exc}")
    for name, rid, _ in plan.update:
        try:
            api.update(rid, git[name])
            say(f"updated  {name}")
        except RulesError as exc:
            failed += 1
            say(f"FAILED   update {name}: {exc}")
    if failed:
        return EXIT_DRIFT
    # A write SigNoz normalises differently from the file would show as drift forever;
    # re-reading now says so at once instead of at the next check.
    try:
        after = make_plan(git, api.live_rules())
    except RulesError as exc:
        say(f"signoz-rules-apply: applied, but the re-read failed: {exc}")
        return EXIT_CANNOT_RUN
    leftover = [n for n, _, _ in after.update] + after.create
    if leftover:
        say(f"signoz-rules-apply: still differs after the write: {', '.join(leftover)}")
        report(after, say)
        return EXIT_DRIFT
    say("signoz-rules-apply: applied; every git rule now matches SigNoz")
    return 0
