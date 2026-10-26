"""Config loader + lazy SOPS resolution.

The loader tests read the fixture `fixtures/config/config.kdl`, so a value change in
the real `config.kdl` never touches them. Two tests read the real file: one loads it the way
every Python process does, and `test_whole_config_kdl_validates` is the CI guard that
validates every namespace in it (the union of what Python and TS read).
"""

from __future__ import annotations

import shutil
from collections.abc import Callable
from pathlib import Path

import pytest
from astra_config import (
    Config,
    KdlDecodeError,
    SecretRef,
    WholeConfig,
    find_repo_root,
    load_config,
    load_whole_config,
)
from astra_config.secrets import default_secrets_file, resolve_sops_ref
from astra_ontology_config import CONFIG_KDL_PATH, load

FIXTURE = find_repo_root() / "fixtures" / "config" / "config.kdl"
#: Writes the fixture with one line replaced to a temp file (the `fixture_with` fixture).
type FixtureWith = Callable[[str, str], Path]


@pytest.fixture
def fixture_with(tmp_path: Path) -> FixtureWith:
    """Write the fixture with its one ``line`` replaced to a temp file, and return it."""

    def write(line: str, replacement: str) -> Path:
        text = FIXTURE.read_text(encoding="utf-8")
        assert text.count(line) == 1, f"the fixture lacks one {line!r}"
        out = tmp_path / f"config-{len(list(tmp_path.iterdir()))}.kdl"
        out.write_text(text.replace(line, replacement), encoding="utf-8")
        return out

    return write


# Actually decrypting needs both the `sops` binary and the (gitignored) age key — host
# only. CI has neither, so the decrypt-backed checks skip there; the env-override path
# (test_env_override_wins_over_sops) still exercises resolution everywhere.
_AGE_KEY = default_secrets_file().parent / "age.key"
_SOPS_AVAILABLE = shutil.which("sops") is not None and _AGE_KEY.is_file()
sops_required = pytest.mark.skipif(
    not _SOPS_AVAILABLE, reason="needs the sops binary + age key (host only, not CI)"
)


@pytest.fixture
def no_root_overrides(monkeypatch: pytest.MonkeyPatch) -> None:
    """Drop the root conftest's data-root overrides so `data.root` comes from the KDL."""
    monkeypatch.delenv("ASTRA_DATA_ROOT", raising=False)
    monkeypatch.delenv("ASTRA_CONTENT_ROOT", raising=False)


# --- the real config.kdl -------------------------------------------------------------


def test_real_config_kdl_loads() -> None:
    cfg = load()
    assert isinstance(cfg, Config)
    assert not isinstance(cfg, WholeConfig)  # only the Python-read namespaces
    assert isinstance(cfg.heartwood.max_iterations, int)
    assert isinstance(cfg.llm.openrouter_api_key, SecretRef)
    assert cfg.llm.openrouter_api_key.config_key == "llm.openrouter-api-key"


def test_whole_config_kdl_validates() -> None:
    """The CI guard: every namespace in the real file validates against the union schema.

    Each process validates only its own language's namespaces, so this is the one place a
    typo in any block (or an unknown block) fails.
    """
    whole = load_whole_config(CONFIG_KDL_PATH)
    assert isinstance(whole.orator.measure_loudness, bool)
    assert isinstance(whole.portal.mcp_api_key, SecretRef)
    assert whole.portal.bridge_user_id == "xlC6LfQ7godJVVFf"


def test_config_kdl_path_points_at_the_real_file() -> None:
    assert CONFIG_KDL_PATH.is_file()
    assert CONFIG_KDL_PATH.name == "config.kdl"


# --- per-language validation ---------------------------------------------------------


def test_python_loader_ignores_a_bad_ts_only_block(fixture_with: FixtureWith) -> None:
    bad = fixture_with("port 20002", 'port "not-a-port"')
    cfg = load_config(bad)
    assert cfg.heartwood.max_iterations == 7  # int, not str
    assert not hasattr(cfg, "orator")  # a TS block is not loaded at all
    with pytest.raises(KdlDecodeError, match=r"orator > port"):
        load_whole_config(bad)


def test_python_loader_rejects_a_bad_python_block(fixture_with: FixtureWith) -> None:
    # The TS loader loads this file (libs/ts/config/src/config.test.ts).
    bad = fixture_with("max-iterations 7", 'max-iterations "many"')
    with pytest.raises(KdlDecodeError, match=r"heartwood > max-iterations"):
        load_config(bad)
    with pytest.raises(KdlDecodeError, match=r"heartwood > max-iterations"):
        load_whole_config(bad)


def test_whole_config_rejects_an_unknown_namespace(fixture_with: FixtureWith) -> None:
    kdl = fixture_with("menhir {", 'heartwod {\n    model "x"\n}\nmenhir {')
    assert load_config(kdl).heartwood.model  # the Python loader ignores the stray block
    with pytest.raises(KdlDecodeError, match="heartwod"):
        load_whole_config(kdl)


def test_a_missing_field_or_namespace_fails_the_load(
    fixture_with: FixtureWith, tmp_path: Path
) -> None:
    """Values live only in config.kdl: no field or namespace falls back to a code default."""
    no_field = fixture_with('    script-path "linguist/script"\n', "")
    with pytest.raises(KdlDecodeError, match=r"linguist > script-path: missing \(required\)"):
        load_config(no_field)
    no_block = tmp_path / "sparse.kdl"
    no_block.write_text('data {\n    root "/srv/state"\n}\n')
    with pytest.raises(KdlDecodeError, match=r"missing \(required\)"):
        load_config(no_block)


# --- the loader, against the fixture --------------------------------------------------


def test_fixture_loads_with_typed_values() -> None:
    cfg = load_config(FIXTURE)
    assert cfg.llm.default_model == "test/model-a"
    assert cfg.telemetry.otlp_endpoint == "http://collector.test:4318"
    assert cfg.codex.port == 20001
    assert cfg.heartwood.max_iterations == 7  # int, not str
    whole = load_whole_config(FIXTURE)
    assert whole.orator.target_lufs == -9  # negative int
    assert whole.orator.measure_loudness is False  # bool, not str


def test_secret_fields_are_lazy_refs_not_plaintext() -> None:
    cfg = load_config(FIXTURE)
    ref = cfg.llm.openrouter_api_key
    assert isinstance(ref, SecretRef)
    assert ref.ref == "sops:fixture_openrouter_key"
    assert ref.config_key == "llm.openrouter-api-key"
    assert "sops:fixture_openrouter_key" in repr(ref)  # repr never leaks a value
    assert cfg.scribe.groq_api_key is None  # absent → None, not a ref


def test_unknown_kdl_key_is_rejected(fixture_with: FixtureWith) -> None:
    bad = fixture_with('default-model "test/model-a"', 'default-model "x"\n    bogus-field "nope"')
    with pytest.raises(KdlDecodeError, match=r"llm > bogus-field"):
        load_config(bad)


def test_single_value_producer_lists_load_as_lists() -> None:
    cfg = load_config(FIXTURE)
    assert cfg.mouthpiece_producer.experiment_models == ["test/model-b"]
    assert cfg.mouthpiece_producer.experiment_max_tokens == [4321]


@pytest.mark.usefixtures("no_root_overrides")
def test_data_paths_resolve_against_the_root(monkeypatch: pytest.MonkeyPatch) -> None:
    cfg = load_config(FIXTURE)
    assert cfg.data.root == "/srv/state"
    assert cfg.data.content_root == "/srv/state/astra-data"  # relative, so under root
    assert cfg.scribe.data_path == "/srv/state/scribe/data"  # relative → under root
    assert cfg.codex.data_path == "/srv/state/codex/data"
    assert cfg.assay.book_out_path == "/srv/state/assay/books"
    assert cfg.data.akasha_content == "/elsewhere/content"  # absolute → as-is
    assert cfg.scribe.incoming_path == ""  # empty → unset, not the root
    # A relative dataset resolves under the content root (`astra-data` under root).
    assert cfg.data.linguist_data == "/srv/state/astra-data/linguist/data"
    whole = load_whole_config(FIXTURE)
    assert whole.menhir.results_path == "/srv/state/menhir/results.jsonl"
    assert whole.orator.data_dir == "/data"  # a container path, not a data path
    monkeypatch.setenv("ASTRA_DATA_ROOT", "/override")
    assert load_config(FIXTURE).scribe.data_path == "/override/scribe/data"
    monkeypatch.setenv("ASTRA_CONTENT_ROOT", "/clone")
    over = load_config(FIXTURE)
    assert over.data.content_root == "/clone"
    assert over.data.linguist_data == "/clone/linguist/data"
    assert over.data.akasha_content == "/elsewhere/content"  # absolute still wins
    assert over.scribe.data_path == "/override/scribe/data"  # state paths ignore it


# --- secrets ---------------------------------------------------------------------------


@sops_required
def test_present_secret_resolves_via_sops() -> None:
    value = SecretRef("sops:openrouter_api_key").resolve()
    assert value.startswith("sk-or-")  # the real key shape


def test_env_override_wins_over_sops(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-env-override")
    assert resolve_sops_ref("sops:openrouter_api_key") == "sk-or-env-override"


@sops_required
def test_absent_secret_raises_only_on_resolve() -> None:
    # A ref to a key that is not in SOPS constructs fine (lazy); resolving it raises loud.
    ref = SecretRef("sops:astra_test_absent_key")
    with pytest.raises(KeyError):
        ref.resolve()


# --- the repo-root finder --------------------------------------------------------------


def test_find_repo_root_walks_up_to_the_checkout(tmp_path: Path) -> None:
    root = find_repo_root()
    assert (root / "ontology" / "ontology-config" / "config.kdl").is_file()
    assert find_repo_root(root / "apps" / "any" / "depth" / "file.py") == root
    assert find_repo_root() is root  # memoized
    with pytest.raises(FileNotFoundError):
        find_repo_root(tmp_path)


def test_default_paths_use_the_one_root(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ASTRA_SOPS_FILE", raising=False)
    root = find_repo_root()
    assert root / "ontology" / "ontology-config" / "config.kdl" == CONFIG_KDL_PATH
    assert default_secrets_file() == root / "deploy" / "sops" / "secrets.enc.yaml"
