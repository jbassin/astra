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
    assert cfg.mouthpiece.model == "openrouter/z-ai/glm-5.3"  # its own pin, not llm.default
    assert cfg.mouthpiece.tts_provider == "elevenlabs"
    assert cfg.mouthpiece.elevenlabs_model == "eleven_v4"
    assert cfg.mouthpiece.cartesia_api_key is not None
    assert cfg.linguist.review_port == 10116
    assert cfg.telemetry.otlp_endpoint == "http://signoz-otel-collector:4318"
    assert cfg.telemetry.host_otlp_endpoint == "http://localhost:10353"
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
    assert cfg.heartwood.model == "openrouter/deepseek/deepseek-v4.1-flash"
    assert cfg.heartwood.sub_model == "openrouter/deepseek/deepseek-v4.1-flash"
    assert cfg.heartwood.max_iterations == 60
    assert cfg.heartwood.max_llm_calls == 100
    assert cfg.heartwood.max_tokens == 64000
    assert cfg.heartwood.max_output_chars == 10000
    assert cfg.heartwood.backfill_budget_usd == 100
    assert cfg.heartwood.requests_path.endswith("/heartwood/requests")
    assert cfg.heartwood.request_timeout_minutes == 180
    assert cfg.mouthpiece_producer.model == "openrouter/deepseek/deepseek-v4.1-flash"
    assert cfg.mouthpiece_producer.max_iterations == 30
    # the live KDL has ONE arm — exercises the scalar→list coercion for real
    assert cfg.mouthpiece_producer.experiment_models == ["openrouter/z-ai/glm-5.3"]
    assert cfg.mouthpiece_producer.experiment_max_tokens == [128000]
    assert cfg.portal.port == 10372
    assert cfg.portal.public_origin == "https://portal.iridi.cc"
    assert cfg.portal.bridge_timeout_ms == 15000
    assert cfg.portal.max_creates_per_request == 10
    assert cfg.portal_headless.port == 10373
    assert cfg.portal_headless.foundry_origin == "https://btl.iridi.cc"
    assert cfg.portal_headless.world == "faerrin"
    assert cfg.portal_headless.gm_username == "Portal"
    assert cfg.portal_headless.reload_interval_hours == 24
    assert cfg.codex.service_name == "astra.codex"
    assert cfg.codex.port == 10374
    assert cfg.codex.public_origin == "https://codex.iridi.cc"
    assert cfg.codex.data_path == f"{cfg.data.root}/codex/data"
    assert cfg.menhir.service_name == "astra.menhir"
    assert cfg.menhir.port == 10375
    assert cfg.menhir.public_origin == "https://menhir.iridi.cc"
    assert cfg.menhir.results_path == f"{cfg.data.root}/menhir/results.jsonl"


def test_secret_fields_are_lazy_refs_not_plaintext() -> None:
    cfg = load()
    assert isinstance(cfg.llm.anthropic_api_key, SecretRef)
    assert cfg.llm.anthropic_api_key.ref == "sops:anthropic_api_key"
    # repr never leaks a value.
    assert "sops:anthropic_api_key" in repr(cfg.llm.anthropic_api_key)
    assert isinstance(cfg.llm.openrouter_api_key, SecretRef)
    assert cfg.llm.openrouter_api_key.ref == "sops:openrouter_api_key"
    assert isinstance(cfg.portal.mcp_api_key, SecretRef)
    assert cfg.portal.mcp_api_key.ref == "sops:portal_mcp_api_key"
    # 0028 D28-1: the player-facing static key mirror.
    assert isinstance(cfg.portal.player_mcp_api_key, SecretRef)
    assert cfg.portal.player_mcp_api_key.ref == "sops:portal_player_api_key"
    assert isinstance(cfg.portal.bridge_api_key, SecretRef)
    assert cfg.portal.bridge_api_key.ref == "sops:portal_bridge_api_key"
    assert isinstance(cfg.portal_headless.gm_password, SecretRef)
    assert cfg.portal_headless.gm_password.ref == "sops:foundry_portal_gm_password"


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


def test_single_value_producer_lists_load_as_lists(tmp_path: Path) -> None:
    one = tmp_path / "config.kdl"
    one.write_text(
        textwrap.dedent("""
        mouthpiece-producer {
            experiment-models "openrouter/z-ai/glm-5.3"
            experiment-max-tokens 128000
        }
    """)
    )
    cfg = load_config(one)
    assert cfg.mouthpiece_producer.experiment_models == ["openrouter/z-ai/glm-5.3"]
    assert cfg.mouthpiece_producer.experiment_max_tokens == [128000]


def test_real_data_root_resolves_todays_paths(monkeypatch: pytest.MonkeyPatch) -> None:
    """Without the test override, config.kdl resolves every data path under the live root."""
    monkeypatch.delenv("ASTRA_DATA_ROOT", raising=False)
    monkeypatch.delenv("ASTRA_CONTENT_ROOT", raising=False)
    cfg = load()
    root = "/ruby/data/astra-state"
    content = f"{root}/astra-data"
    assert cfg.data.root == root
    assert cfg.data.content_root == content
    assert cfg.data.linguist_transcripts == f"{content}/linguist/transcripts"
    assert cfg.data.akasha_content == f"{content}/akasha/content"
    assert cfg.data.entity_registry == f"{content}/entity/entity.kdl"
    assert cfg.data.heartwood_ledger == f"{content}/heartwood/agent-runs.jsonl"
    assert cfg.scribe.data_path == f"{root}/scribe/data"
    assert cfg.linguist.ingest_saved_dir == f"{root}/scribe/data/saved"
    assert cfg.mouthpiece.episodes_path == f"{root}/mouthpiece/episodes"
    assert cfg.heartwood.requests_path == f"{root}/heartwood/requests"
    assert cfg.orator.data_dir == "/data"  # a container path, not a data path


def test_data_paths_resolve_against_the_root(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("ASTRA_DATA_ROOT", raising=False)
    monkeypatch.delenv("ASTRA_CONTENT_ROOT", raising=False)
    kdl = tmp_path / "config.kdl"
    kdl.write_text(
        textwrap.dedent("""
        data {
            root "/srv/state"
            akasha-content "/elsewhere/content"
        }
        scribe {
            data-path "scribe/data"
            state-file ""
        }
    """)
    )
    cfg = load_config(kdl)
    assert cfg.scribe.data_path == "/srv/state/scribe/data"  # relative → under root
    assert cfg.data.akasha_content == "/elsewhere/content"  # absolute → as-is
    assert cfg.scribe.incoming_path == ""  # empty → unset, not the root
    # A dataset's default resolves under the default content root (`astra-data` under root).
    assert cfg.data.linguist_data == "/srv/state/astra-data/linguist/data"
    monkeypatch.setenv("ASTRA_DATA_ROOT", "/override")
    assert load_config(kdl).scribe.data_path == "/override/scribe/data"
    monkeypatch.setenv("ASTRA_CONTENT_ROOT", "/clone")
    over = load_config(kdl)
    assert over.data.content_root == "/clone"
    assert over.data.linguist_data == "/clone/linguist/data"
    assert over.data.akasha_content == "/elsewhere/content"  # absolute still wins
    assert over.scribe.data_path == "/override/scribe/data"  # state paths ignore it


def test_config_kdl_path_points_at_the_real_file() -> None:
    assert CONFIG_KDL_PATH.is_file()
    assert CONFIG_KDL_PATH.name == "config.kdl"
