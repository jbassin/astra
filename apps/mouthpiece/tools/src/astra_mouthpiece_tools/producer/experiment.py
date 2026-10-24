"""The producer comparison (0034 §5): one brief, the two-pass script once per model arm,
and a report against the live script.

Writes only into ``run_dir``: the producer artifacts, ``script.<arm>.json`` per arm,
``script.baseline.json`` (a copy of the live ``episodes/<date>/script.json``),
``cost.json`` and ``report.md``. No TTS, nothing under ``episodes/``, no commit.

Per-arm cost (D34-10): ``MeteredClient`` adds up ``LiteLLMClient._price`` per arm. The
static price table now has a DeepSeek row, so the DeepSeek arm is priced, not silently 0;
``priced`` records whether every model used had a row.
"""

from __future__ import annotations

import json
import re
import shutil
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from astra_config import load_config
from astra_config.models import MouthpieceProducerConfig
from astra_llm import LiteLLMClient, ensure_openrouter_env
from astra_llm.pricing import PRICING_USD_PER_1M
from astra_mouthpiece.hosts import load_hosts
from astra_mouthpiece.inputs import episodes_root
from astra_mouthpiece.lint import THRESHOLDS, score_script, words
from astra_mouthpiece.models import HostConfig, Script
from astra_mouthpiece.producer.brief import ProducerBrief, render_brief
from astra_mouthpiece.producer.run import (
    ARTIFACTS_ROOT,
    ProducerInputs,
    load_inputs,
    new_run_id,
    run_producer,
)
from astra_mouthpiece.producer.telemetry import log, tracer
from astra_mouthpiece.script import generate_script
from opentelemetry.trace import Status, StatusCode


class MeteredClient(LiteLLMClient):
    """``LiteLLMClient`` that also accumulates its own calls' cost and tokens."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.calls = 0
        self.cost_usd = 0.0
        self.input_tokens = 0
        self.output_tokens = 0
        self.priced = True

    def _price(self, model: str, usage: Any) -> float:
        cost = super()._price(model, usage)
        self.calls += 1
        self.cost_usd += cost
        self.input_tokens += usage.input_tokens
        self.output_tokens += usage.output_tokens
        if model not in PRICING_USD_PER_1M:
            self.priced = False
        return cost

    def snapshot(self) -> dict[str, Any]:
        return {
            "calls": self.calls,
            "cost_usd": round(self.cost_usd, 6),
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "priced": self.priced,
        }


def arm_slug(model: str) -> str:
    """``openrouter/z-ai/glm-5.3`` → ``glm-5.3``."""
    return re.sub(r"[^A-Za-z0-9._-]+", "-", model.rsplit("/", 1)[-1])


@dataclass
class ArmResult:
    model: str
    slug: str
    max_tokens: int
    script: Script | None = None
    cost: dict[str, Any] = field(default_factory=dict)
    error: str | None = None


def _newcomer(hosts: HostConfig) -> str:
    return hosts.c.name if hosts.c is not None else "The newcomer"


def run_arm(
    model: str,
    max_tokens: int,
    inp: ProducerInputs,
    brief_block: str,
    hosts: HostConfig,
    *,
    client_factory: Any = MeteredClient,
) -> ArmResult:
    """One script arm: the unchanged two-pass script, fed the brief instead of
    grounding + continuity. A failure is recorded, never raised."""
    client = client_factory()
    arm = ArmResult(model=model, slug=arm_slug(model), max_tokens=max_tokens)
    with tracer().start_as_current_span("mouthpiece.experiment.arm") as span:
        span.set_attribute("mouthpiece.experiment.model", model)
        try:
            arm.script = generate_script(
                client,
                inp.digest,
                inp.cleaned_turns,
                [],
                hosts,
                roster_block=inp.roster,
                model=model,
                max_tokens=max_tokens,
                brief_block=brief_block,
            )
            span.set_attribute("mouthpiece.experiment.turns", len(arm.script.turns))
            span.set_attribute("mouthpiece.experiment.words", script_words(arm.script))
        except Exception as exc:  # noqa: BLE001 -- the failure is recorded on the arm; the other arms still run
            arm.error = f"{type(exc).__name__}: {exc}"
            span.record_exception(exc)
            span.set_status(Status(StatusCode.ERROR, arm.error[:500]))
            log.warning("experiment arm %s failed: %s", model, arm.error)
        arm.cost = client.snapshot() if hasattr(client, "snapshot") else {}
        if "cost_usd" in arm.cost:
            span.set_attribute("mouthpiece.experiment.cost_usd", arm.cost["cost_usd"])
    return arm


# ── report ─────────────────────────────────────────────────────────────────
def script_words(script: Script) -> int:
    return sum(len(words(t.text)) for t in script.turns)


def host_shares(script: Script) -> dict[str, float]:
    """Host name → share of words."""
    names = {"A": script.hosts.a.name, "B": script.hosts.b.name}
    if script.hosts.c is not None:
        names["C"] = script.hosts.c.name
    totals: dict[str, int] = {}
    for t in script.turns:
        name = names.get(t.speaker, t.speaker)
        totals[name] = totals.get(name, 0) + len(words(t.text))
    total = sum(totals.values()) or 1
    return {k: round(v / total, 3) for k, v in totals.items()}


def lore_mentions(script: Script, brief: ProducerBrief | None) -> tuple[int, int]:
    """How many of the brief's lore names the script says at least once."""
    if brief is None or not brief.lore:
        return 0, 0
    text = " ".join(t.text for t in script.turns).casefold()
    names = {n.name for n in brief.lore}
    return sum(1 for n in names if n.casefold() in text), len(names)


def build_report(
    date: str,
    producer_summary: dict[str, Any] | None,
    warnings: dict[str, Any] | None,
    brief: ProducerBrief | None,
    scripts: list[tuple[str, Script | None, dict[str, Any], str | None]],
) -> str:
    """Markdown report: producer stats, then one column per script (baseline first)."""
    lines = [f"# mouthpiece producer experiment — {date}", ""]
    if producer_summary is not None:
        p = producer_summary
        cost = p.get("cost_usd")
        lines += [
            "## Producer",
            "",
            f"- status **{p['status']}**, {p['iterations']} iterations, "
            f"{p['parse_errors']} parse errors, {p['seconds']} s, cost "
            f"{'unknown' if cost is None else f'${cost:.4f}'}",
            f"- counts: {p['counts']}",
            f"- wiki head: start {p['wiki_head']['start']}, end {p['wiki_head']['end']}",
        ]
        if warnings is not None:
            lines.append(
                f"- citations: {warnings['citations_bad']} of {warnings['citations_total']} "
                f"repaired (drop rate {warnings['drop_rate']})"
            )
        lines.append("")
    rows: list[tuple[str, list[str]]] = []
    header = ["metric"] + [label for label, *_ in scripts]
    reports = {label: score_script(s) for label, s, _c, _e in scripts if s is not None}

    def cell(label: str, fn: Any) -> str:
        script = next(s for lab, s, _c, _e in scripts if lab == label)
        return "—" if script is None else fn(script)

    rows.append(("title", [cell(lab, lambda s: s.title) for lab, *_ in scripts]))
    rows.append(("turns", [cell(lab, lambda s: str(len(s.turns))) for lab, *_ in scripts]))
    rows.append(("words", [cell(lab, lambda s: str(script_words(s))) for lab, *_ in scripts]))
    rows.append(
        (
            "host word share",
            [
                cell(lab, lambda s: ", ".join(f"{k} {v:.0%}" for k, v in host_shares(s).items()))
                for lab, *_ in scripts
            ],
        )
    )
    rows.append(
        (
            "brief lore names said",
            [
                cell(lab, lambda s: "{} / {}".format(*lore_mentions(s, brief)))
                for lab, *_ in scripts
            ],
        )
    )
    rows.extend(
        (
            f"{t.id} {t.label}",
            [
                "—"
                if lab not in reports
                else (
                    f"{next(c for c in reports[lab].criteria if c.id == t.id).value:.2f} "
                    f"({next(c for c in reports[lab].criteria if c.id == t.id).score})"
                )
                for lab, *_ in scripts
            ],
        )
        for t in THRESHOLDS
    )
    rows.append(
        (
            "lint subtotal",
            [
                "—" if lab not in reports else f"{reports[lab].mechanical_subtotal}/10"
                for lab, *_ in scripts
            ],
        )
    )
    rows.append(
        (
            "script cost",
            [
                "live (not re-run)"
                if lab == "baseline"
                else ("—" if not c else f"${c.get('cost_usd', 0):.4f}")
                for lab, _s, c, _e in scripts
            ],
        )
    )
    lines += ["## Scripts", "", "| " + " | ".join(header) + " |"]
    lines.append("|" + "---|" * len(header))
    for name, cells in rows:
        lines.append("| " + " | ".join([name, *[c.replace("|", "/") for c in cells]]) + " |")
    errors = [(lab, e) for lab, _s, _c, e in scripts if e]
    if errors:
        lines += ["", "## Arm failures", ""] + [f"- {lab}: {e}" for lab, e in errors]
    lines += [
        "",
        "Lint scores are the PROVISIONAL mechanical rubric (lint.py). Read the scripts; the "
        "numbers only flag tells.",
        "",
    ]
    return "\n".join(lines)


# ── the experiment ─────────────────────────────────────────────────────────
@dataclass
class ExperimentResult:
    run_dir: Path
    producer_status: str
    arms: list[ArmResult]
    report: str


def _write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def run_experiment(
    date: str,
    *,
    config: MouthpieceProducerConfig | None = None,
    arms: list[str] | None = None,
    reuse_brief: Path | None = None,
    run_dir: Path | None = None,
    inputs: ProducerInputs | None = None,
    hosts: HostConfig | None = None,
    baseline_root: Path | None = None,
    producer: Any = run_producer,
    client_factory: Any = MeteredClient,
) -> ExperimentResult:
    """Run the comparison for ``date`` (§5). ``arms`` filters ``experiment-models``.

    A ``failed`` producer stops before any script call (D34-8).
    """
    cfg = config if config is not None else load_config().mouthpiece_producer
    if len(cfg.experiment_models) != len(cfg.experiment_max_tokens):
        raise ValueError("experiment-models and experiment-max-tokens must have equal length")
    pairs = list(zip(cfg.experiment_models, cfg.experiment_max_tokens, strict=True))
    if arms:
        pairs = [(m, t) for m, t in pairs if m in arms or arm_slug(m) in arms]
        if not pairs:
            raise ValueError(f"no configured arm matches {arms}")
    # The --reuse-brief path never builds a dspy LM, which is where the key is set (D34-10).
    ensure_openrouter_env()
    out = run_dir if run_dir is not None else ARTIFACTS_ROOT / date / new_run_id()
    out.mkdir(parents=True, exist_ok=True)
    inp = inputs or load_inputs(date)
    host_cfg = hosts or load_hosts()

    summary: dict[str, Any] | None = None
    warnings: dict[str, Any] | None = None
    if reuse_brief is not None:
        brief = ProducerBrief.model_validate_json((reuse_brief / "brief.json").read_text())
        status = "reused"
        for name in ("brief.json", "summary.json", "warnings.json", "trajectory.json"):
            if (reuse_brief / name).is_file() and reuse_brief.resolve() != out.resolve():
                shutil.copy2(reuse_brief / name, out / name)
        if (out / "summary.json").is_file():
            summary = json.loads((out / "summary.json").read_text())
        if (out / "warnings.json").is_file():
            warnings = json.loads((out / "warnings.json").read_text())
        block = render_brief(brief, newcomer=_newcomer(host_cfg))
        (out / "brief.md").write_text(block + "\n", encoding="utf-8")
    else:
        result = producer(date, config=cfg, inputs=inp, run_dir=out)
        status = result.status
        summary = result.summary
        warnings = json.loads((out / "warnings.json").read_text())
        brief = result.brief
        if result.status == "failed" or brief is None:
            report = build_report(date, summary, warnings, None, [])
            (out / "report.md").write_text(report, encoding="utf-8")
            return ExperimentResult(
                run_dir=out, producer_status=result.status, arms=[], report=report
            )
        block = render_brief(brief, newcomer=_newcomer(host_cfg))
        (out / "brief.md").write_text(block + "\n", encoding="utf-8")

    results = [run_arm(m, t, inp, block, host_cfg, client_factory=client_factory) for m, t in pairs]
    for arm in results:
        if arm.script is not None:
            (out / f"script.{arm.slug}.json").write_text(
                arm.script.model_dump_json(indent=2), encoding="utf-8"
            )

    baseline: Script | None = None
    live = (baseline_root if baseline_root is not None else episodes_root()) / date / "script.json"
    if live.is_file():
        shutil.copy2(live, out / "script.baseline.json")
        baseline = Script.model_validate_json(live.read_text(encoding="utf-8"))

    _write_json(
        out / "cost.json",
        {
            "producer_usd": summary.get("cost_usd") if summary else None,
            "producer_reused": reuse_brief is not None,
            "arms": {a.model: a.cost for a in results},
        },
    )
    rows = [("baseline", baseline, {}, None if baseline else "no live script.json")]
    rows += [(a.slug, a.script, a.cost, a.error) for a in results]
    report = build_report(date, summary, warnings, brief, rows)
    (out / "report.md").write_text(report, encoding="utf-8")
    return ExperimentResult(run_dir=out, producer_status=status, arms=results, report=report)
