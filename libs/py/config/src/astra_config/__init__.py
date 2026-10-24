"""astra-config — KDL config loader + lazy SOPS secret resolution.

    from astra_config import load_config
    cfg = load_config()
    model = cfg.llm.default_model                 # plaintext
    key = cfg.llm.anthropic_api_key.require()     # SOPS-decrypted on demand; raises if unset

Parse-at-edge (Decision E): KDL is read here and validated straight into the typed
`Config`; secrets stay as `SecretRef` until `.require()` / `.optional()`.

`load_config()` validates only the namespaces Python reads; `load_whole_config()`
validates every namespace and exists for the one CI test that guards the whole file.
`models.py` records which language reads which namespace.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .kdl import load_document, top_level_namespaces
from .models import (
    CaddyConfig,
    Config,
    DataConfig,
    LinguistConfig,
    LlmConfig,
    MouthpieceConfig,
    OratorConfig,
    OratorControllerConfig,
    ScribeConfig,
    TelemetryConfig,
    WealConfig,
    WealOverlayConfig,
    WholeConfig,
)
from .root import find_repo_root
from .secrets import (
    SecretRef,
    SecretUnsetError,
    default_secrets_file,
    is_blank_secret,
    resolve_sops_ref,
)

__all__ = [
    "CaddyConfig",
    "Config",
    "DataConfig",
    "LinguistConfig",
    "LlmConfig",
    "MouthpieceConfig",
    "OratorConfig",
    "OratorControllerConfig",
    "ScribeConfig",
    "SecretRef",
    "SecretUnsetError",
    "TelemetryConfig",
    "WealConfig",
    "WealOverlayConfig",
    "WholeConfig",
    "default_config_file",
    "default_secrets_file",
    "find_repo_root",
    "is_blank_secret",
    "load_config",
    "load_whole_config",
    "resolve_sops_ref",
]


def default_config_file() -> Path:
    """`<repo-root>/ontology/ontology-config/config.kdl` (raises outside a checkout)."""
    return find_repo_root() / "ontology" / "ontology-config" / "config.kdl"


def _read(path: str | Path | None, secrets_file: Path | None) -> dict[str, dict[str, Any]]:
    config_path = Path(path) if path is not None else default_config_file()
    return top_level_namespaces(load_document(config_path), secrets_file=secrets_file)


def load_config(path: str | Path | None = None, *, secrets_file: Path | None = None) -> Config:
    """Parse `config.kdl` → validated `Config`: the Python-read namespaces (secrets lazy)."""
    return Config.model_validate(_read(path, secrets_file))


def load_whole_config(
    path: str | Path | None = None, *, secrets_file: Path | None = None
) -> WholeConfig:
    """Parse `config.kdl` → `WholeConfig`, validating every namespace (the CI guard)."""
    return WholeConfig.model_validate(_read(path, secrets_file))
