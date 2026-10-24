"""astra-config — KDL config loader + lazy SOPS secret resolution.

    from astra_config import load_config
    cfg = load_config()
    model = cfg.llm.default_model                 # plaintext
    key = cfg.llm.anthropic_api_key.require()     # SOPS-decrypted on demand; raises if unset

Parse-at-edge (Decision E): KDL is read here and validated straight into the typed
`Config`; secrets stay as `SecretRef` until `.require()` / `.optional()`.
"""

from __future__ import annotations

from pathlib import Path

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
)
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
    "default_config_file",
    "default_secrets_file",
    "find_repo_root",
    "is_blank_secret",
    "load_config",
    "resolve_sops_ref",
]


def find_repo_root(start: Path | None = None) -> Path:
    """The checkout root: the nearest ancestor of `start` holding `ontology/ontology-config`.

    `start` defaults to this module's own file, which sits inside the checkout because
    workspace members install editable (`/repo` in the Dagster image). Code calls this
    instead of counting `Path.parents`, so no path depends on how deep an app sits under
    `apps/`. Raises `FileNotFoundError` when no ancestor matches.
    """
    origin = (start if start is not None else Path(__file__)).resolve()
    for parent in [origin, *origin.parents]:
        if (parent / "ontology" / "ontology-config").is_dir():
            return parent
    raise FileNotFoundError(f"no ancestor of {origin} holds ontology/ontology-config")


def _find_repo_root(start: Path) -> Path:
    try:
        return find_repo_root(start)
    except FileNotFoundError:
        return start


def default_config_file() -> Path:
    """`<repo-root>/ontology/ontology-config/config.kdl`."""
    root = _find_repo_root(Path(__file__).resolve())
    return root / "ontology" / "ontology-config" / "config.kdl"


def load_config(path: str | Path | None = None, *, secrets_file: Path | None = None) -> Config:
    """Parse `config.kdl` → validated `Config` (secrets stay lazy)."""
    config_path = Path(path) if path is not None else default_config_file()
    doc = load_document(config_path)
    namespaces = top_level_namespaces(doc, secrets_file=secrets_file)
    return Config.model_validate(namespaces)
