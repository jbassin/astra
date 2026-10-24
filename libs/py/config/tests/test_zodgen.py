"""The Zod generator (`astra_config.zodgen`): its rules, not the generated text.

`just ontology-check` is the freshness gate; these tests pin what the generator refuses.
"""

from __future__ import annotations

import pytest
from astra_config import models, zodgen
from astra_config.models import TS_NAMESPACES, WholeConfig
from pydantic import create_model


def test_ts_namespaces_are_whole_config_namespaces() -> None:
    assert len(set(TS_NAMESPACES)) == len(TS_NAMESPACES)
    assert set(TS_NAMESPACES) <= set(WholeConfig.model_fields)


def test_generated_text_names_every_ts_namespace_in_camel_case() -> None:
    text = zodgen.generate()
    for ns in TS_NAMESPACES:
        assert f"  {zodgen.camel(ns)}: " in text
    assert "  heartwood: " not in text  # a Python-only namespace stays out
    assert "secret()" in text
    assert "dataPath()" in text
    assert "contentPath()" in text


def test_a_plaintext_default_is_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    defaulted = create_model("StriderConfig", __base__=models._Base, port=(int, 1))
    whole = create_model("WholeConfig", __base__=WholeConfig, strider=(defaulted, ...))
    monkeypatch.setattr(zodgen, "WholeConfig", whole)
    with pytest.raises(zodgen.ZodGenError, match=r"strider\.port: .*no default"):
        zodgen.generate()


def test_camel() -> None:
    assert zodgen.camel("max_creates_per_request") == "maxCreatesPerRequest"
    assert zodgen.camel("port") == "port"
