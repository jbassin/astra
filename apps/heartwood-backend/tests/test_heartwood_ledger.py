"""The run ledger (0033 D33-12): publish/revert lines, published dates, budget.

Hermetic: every test writes its own ledger under tmp_path.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from astra_heartwood.agent import ledger


def summary(date: str, run_id: str, *, cost: float | None = 0.25, status: str = "ok") -> dict:
    return {
        "status": status,
        "date": date,
        "campaign": "through-a-song-darkly",
        "run_id": run_id,
        "model": "openrouter/deepseek/deepseek-v4.1-flash",
        "sub_model": "openrouter/deepseek/deepseek-v4.1-flash",
        "cost_usd": cost,
        "counts": {"created": 2, "updated": 3, "moved": 1, "deleted": 0},
        "iterations": 17,
        "tokens": 123456,
        "changelog": "- did things",
        "main": {"calls": 17},
    }


def run_dir(tmp_path: Path, date: str, run_id: str, **kw: Any) -> Path:
    d = tmp_path / "art" / date / run_id
    d.mkdir(parents=True)
    (d / "summary.json").write_text(json.dumps(summary(date, run_id, **kw)), encoding="utf-8")
    return d


@pytest.fixture
def path(tmp_path: Path) -> Path:
    return tmp_path / "agent-runs.jsonl"


def test_empty_ledger(path: Path) -> None:
    assert ledger.entries(path) == []
    assert ledger.published_dates(path) == set()
    assert ledger.spent_usd(path) == 0
    assert not ledger.has_unknown_cost(path)
    assert ledger.budget_stop_reason(100, path) is None


def test_publish_line_is_deterministic_sorted_one_line_json(tmp_path: Path, path: Path) -> None:
    entry = ledger.append_publish(run_dir(tmp_path, "2025-8-28", "R1"), path)
    raw = path.read_text(encoding="utf-8")
    assert raw.count("\n") == 1 and raw.endswith("\n")
    parsed = json.loads(raw)
    assert list(parsed) == sorted(parsed)
    assert parsed == entry
    assert parsed == {
        "date": "2025-8-28",
        "run_id": "R1",
        "campaign": "through-a-song-darkly",
        "model": "openrouter/deepseek/deepseek-v4.1-flash",
        "sub_model": "openrouter/deepseek/deepseek-v4.1-flash",
        "cost_usd": 0.25,
        "counts": {"created": 2, "updated": 3, "moved": 1, "deleted": 0},
        "iterations": 17,
        "tokens": 123456,
    }
    # summary-only fields (changelog, per-role meters) stay out of the ledger
    assert "changelog" not in parsed and "main" not in parsed


def test_publish_revert_republish(tmp_path: Path, path: Path) -> None:
    ledger.append_publish(run_dir(tmp_path, "2025-8-28", "R1"), path)
    ledger.append_publish(run_dir(tmp_path, "2025-9-8", "R2"), path)
    assert ledger.published_dates(path) == {"2025-8-28", "2025-9-8"}

    rev = ledger.append_revert("2025-8-28", path)
    assert rev == {"date": "2025-8-28", "reverted": True, "run_id": "R1"}
    assert ledger.published_dates(path) == {"2025-9-8"}
    assert not ledger.is_published("2025-8-28", path)

    ledger.append_publish(run_dir(tmp_path, "2025-8-28", "R3"), path)
    assert ledger.published_dates(path) == {"2025-8-28", "2025-9-8"}
    latest = ledger.latest("2025-8-28", path)
    assert latest is not None and latest["run_id"] == "R3"
    assert len(ledger.entries(path)) == 4


def test_revert_refuses_unpublished_or_already_reverted(tmp_path: Path, path: Path) -> None:
    with pytest.raises(ledger.LedgerError):
        ledger.append_revert("2025-8-28", path)
    ledger.append_publish(run_dir(tmp_path, "2025-8-28", "R1"), path)
    ledger.append_revert("2025-8-28", path)
    with pytest.raises(ledger.LedgerError):
        ledger.append_revert("2025-8-28", path)
    assert len(ledger.entries(path)) == 2


def test_append_refuses_non_ok_and_double_append(tmp_path: Path, path: Path) -> None:
    with pytest.raises(ledger.LedgerError, match="incomplete"):
        ledger.append_publish(run_dir(tmp_path, "2025-8-28", "R0", status="incomplete"), path)
    d = run_dir(tmp_path, "2025-8-28", "R1")
    ledger.append_publish(d, path)
    with pytest.raises(ledger.LedgerError, match="already"):
        ledger.append_publish(d, path)
    assert len(ledger.entries(path)) == 1


def test_spent_counts_reverted_runs_and_unknown_cost(tmp_path: Path, path: Path) -> None:
    ledger.append_publish(run_dir(tmp_path, "2025-8-28", "R1", cost=1.5), path)
    ledger.append_revert("2025-8-28", path)  # the money was still spent
    ledger.append_publish(run_dir(tmp_path, "2025-9-8", "R2", cost=2.25), path)
    assert ledger.spent_usd(path) == 3.75
    assert not ledger.has_unknown_cost(path)

    ledger.append_publish(run_dir(tmp_path, "2025-9-15", "R3", cost=None), path)
    assert ledger.has_unknown_cost(path)
    assert ledger.spent_usd(path) == 3.75  # known costs only


def test_budget_stop_rule(tmp_path: Path, path: Path) -> None:
    ledger.append_publish(run_dir(tmp_path, "2025-8-28", "R1", cost=4.0), path)
    assert ledger.budget_stop_reason(5.0, path) is None  # 4 < 5: start another date
    ledger.append_publish(run_dir(tmp_path, "2025-9-8", "R2", cost=1.0), path)
    reason = ledger.budget_stop_reason(5.0, path)  # 5 >= 5: stop
    assert reason is not None and "$5.00" in reason
    ledger.append_publish(run_dir(tmp_path, "2025-9-15", "R3", cost=None), path)
    reason = ledger.budget_stop_reason(1000.0, path)  # unknown cost beats any headroom
    assert reason is not None and "2025-9-15" in reason
