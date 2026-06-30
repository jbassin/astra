"""Config loader + lazy SOPS resolution — using the real config.kdl + SOPS file.

These run against the live in-repo SOPS secrets (the age key is on the host), so they
double as a check that `ref=` resolution works end-to-end without a network call.
"""

from __future__ import annotations

import shutil
import textwrap
from pathlib import Path

import pytest
from astra_config import SecretRef, load_config
from astra_config.secrets import default_secrets_file, resolve_sops_ref
from astra_ontology_config import CONFIG_KDL_PATH, load

# Actually decrypting needs both the `sops` binary and the (gitignored) age key — host
# only. CI has neither, so the decrypt-backed checks skip there; the env-override path
# (test_env_override_wins_over_sops) still exercises resolution everywhere.
_AGE_KEY = default_secrets_file().parent / "age.key"
_SOPS_AVAILABLE = shutil.which("sops") is not None and _AGE_KEY.is_file()
sops_required = pytest.mark.skipif(
    not _SOPS_AVAILABLE, reason="needs the sops binary + age key (host only, not CI)"
)


def test_real_config_kdl_loads_and_types_are_right() -> None:
    cfg = load()
    assert cfg.llm.default_model == "openrouter/z-ai/glm-5.2"
    assert cfg.llm.default_max_tokens == 16000  # int, not str
    assert cfg.linguist.review_port == 10116
    assert cfg.telemetry.otlp_endpoint == "http://signoz-otel-collector:4318"
    assert cfg.orator.target_lufs == -16  # negative int
    assert cfg.orator.measure_loudness is True  # bool, not str
    assert cfg.weal.bind_addr == "127.0.0.1:10203"
    assert cfg.akasha_frontend.service_name == "astra.akasha-frontend"
    assert cfg.akasha_frontend.port == 10365
    assert cfg.akasha_frontend.public_origin == "https://akasha.iridi.cc"
    assert cfg.akasha_frontend.audio_dir == "/audio"
    assert cfg.mouthpiece_frontend.service_name == "astra.mouthpiece-frontend"
    assert cfg.mouthpiece_frontend.port == 10366
    assert cfg.mouthpiece_frontend.public_origin == "https://mouthpiece.iridi.cc"
    assert cfg.mouthpiece_frontend.audio_dir == "/audio"
    assert cfg.vellum_frontend.service_name == "astra.vellum-frontend"
    assert cfg.vellum_frontend.port == 10367
    assert cfg.vellum_frontend.public_origin == "https://vellum.iridi.cc"
    assert cfg.vellum_render.service_name == "astra.vellum-render"
    assert cfg.vellum_render.port == 10368
    assert cfg.strider.public_origin == "https://strider.iridi.cc"
    assert cfg.ledger.service_name == "astra.ledger"
    assert cfg.ledger.port == 10370
    assert cfg.ledger.public_origin == "https://ledger.iridi.cc"
    assert cfg.heartwood.service_name == "astra.heartwood-frontend"
    assert cfg.heartwood.port == 10371
    assert cfg.heartwood.public_origin == "https://heartwood.iridi.cc"


def test_secret_fields_are_lazy_refs_not_plaintext() -> None:
    cfg = load()
    assert isinstance(cfg.llm.anthropic_api_key, SecretRef)
    assert cfg.llm.anthropic_api_key.ref == "sops:anthropic_api_key"
    # repr never leaks a value.
    assert "sops:anthropic_api_key" in repr(cfg.llm.anthropic_api_key)
    assert isinstance(cfg.llm.openrouter_api_key, SecretRef)
    assert cfg.llm.openrouter_api_key.ref == "sops:openrouter_api_key"


@sops_required
def test_present_secret_resolves_via_sops() -> None:
    cfg = load()
    assert cfg.llm.anthropic_api_key is not None
    value = cfg.llm.anthropic_api_key.resolve()
    assert value.startswith("sk-ant-")  # the real key shape


def test_env_override_wins_over_sops(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-env-override")
    assert resolve_sops_ref("sops:anthropic_api_key") == "sk-ant-env-override"


@sops_required
def test_absent_secret_raises_only_on_resolve() -> None:
    # The rotated dice-feed url isn't in SOPS yet — the tree still loads (lazy),
    # but resolving it raises loud.
    cfg = load()
    assert isinstance(cfg.weal.dice_feed_url, SecretRef)
    with pytest.raises(KeyError):
        cfg.weal.dice_feed_url.resolve()


def test_unknown_kdl_key_is_rejected(tmp_path: Path) -> None:
    bad = tmp_path / "config.kdl"
    bad.write_text(
        textwrap.dedent("""
        llm {
            default-model "x"
            bogus-field "nope"
        }
    """)
    )
    with pytest.raises(Exception, match="bogus_field|bogus-field|extra"):
        load_config(bad)


def test_config_kdl_path_points_at_the_real_file() -> None:
    assert CONFIG_KDL_PATH.is_file()
    assert CONFIG_KDL_PATH.name == "config.kdl"
