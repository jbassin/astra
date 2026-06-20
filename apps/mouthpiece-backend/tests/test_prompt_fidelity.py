"""Byte-fidelity of the ported prompts vs the faerrin caster source (M2, gate C).

The tavern tone lives in the prompts, so they must be byte-identical to faerrin's.
This compares the rendered Python prompts against the faerrin TS template literals
(with `${hosts.X}` substituted). It **skips when the faerrin checkout is absent**
(CI doesn't have it) — like scribe's SOPS skip — so the suite stays hermetic; run
it locally against `/ruby/data/experiments/faerrin` to catch drift.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
from astra_mouthpiece.models import HostConfig, HostPersona
from astra_mouthpiece.prompts import (
    DISTILL_SYSTEM_PROMPT,
    build_dressing_system_prompt,
    build_improv_system_prompt,
    build_script_system_prompt,
)

_CASTER = Path("/ruby/data/experiments/faerrin/pkg/caster/src")
pytestmark = pytest.mark.skipif(not _CASTER.is_dir(), reason="faerrin caster source not present")

H = HostConfig(
    a=HostPersona(name="Bram", persona="warm fluent imprecise"),
    b=HostPersona(name="Maeve", persona="precise terse"),
    c=HostPersona(name="Pip", persona="fast scattered"),
)


def _interpolate(template: str) -> str:
    for sp, host in (("A", H.a), ("B", H.b), ("C", H.c)):
        template = template.replace(f"${{hosts.{sp}.name}}", host.name)
        template = template.replace(f"${{hosts.{sp}.persona}}", host.persona)
    return template


def _const_literal(ts: str, name: str) -> str:
    m = re.search(rf"{name} = `(.*?)`;", ts, re.S)
    assert m is not None, f"{name} not found"
    return m.group(1)


def _fn_literal(ts: str, name: str) -> str:
    m = re.search(rf"export function {name}\([^)]*\)[^{{]*\{{\s*return `(.*?)`;\s*\}}", ts, re.S)
    assert m is not None, f"{name} not found"
    return _interpolate(m.group(1))


def test_distill_prompt_byte_identical() -> None:
    ts = (_CASTER / "distill" / "prompt.ts").read_text()
    assert _const_literal(ts, "DISTILL_SYSTEM_PROMPT") == DISTILL_SYSTEM_PROMPT


def test_two_pass_and_one_shot_prompts_byte_identical() -> None:
    ts = (_CASTER / "script" / "prompt.ts").read_text()
    assert build_improv_system_prompt(H) == _fn_literal(ts, "buildImprovSystemPrompt")
    assert build_dressing_system_prompt(H) == _fn_literal(ts, "buildDressingSystemPrompt")
    assert build_script_system_prompt(H) == _fn_literal(ts, "buildScriptSystemPrompt")


def test_mega_prompt_byte_identical() -> None:
    from astra_mouthpiece.mega import MEGA_SYSTEM_PROMPT

    ts = (_CASTER / "mega" / "prompt.ts").read_text()
    assert _const_literal(ts, "MEGA_SYSTEM_PROMPT") == MEGA_SYSTEM_PROMPT
