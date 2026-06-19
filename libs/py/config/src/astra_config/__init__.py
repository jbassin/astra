"""astra-config — KDL config loader + lazy SOPS secret resolution.

    from astra_config import load_config
    cfg = load_config()
    model = cfg.llm.default_model                 # plaintext
    key = cfg.llm.anthropic_api_key.resolve()     # SOPS-decrypted on demand

Parse-at-edge (Decision E): KDL is read here and validated straight into the typed
`Config`; secrets stay as `SecretRef` until `.resolve()`.
"""

from __future__ import annotations

from pathlib import Path

from .kdl import load_document, top_level_namespaces
from .models import (
    CaddyConfig,
    Config,
    LinguistConfig,
    LlmConfig,
    MouthpieceConfig,
    OratorConfig,
    OratorControllerConfig,
    ScribeConfig,
    WealConfig,
    WealOverlayConfig,
)
from .secrets import SecretRef, default_secrets_file, resolve_sops_ref

__all__ = [
    "CaddyConfig",
    "Config",
    "LinguistConfig",
    "LlmConfig",
    "MouthpieceConfig",
    "OratorConfig",
    "OratorControllerConfig",
    "ScribeConfig",
    "SecretRef",
    "WealConfig",
    "WealOverlayConfig",
    "default_config_file",
    "default_secrets_file",
    "load_config",
    "resolve_sops_ref",
]


def _find_repo_root(start: Path) -> Path:
    for parent in [start, *start.parents]:
        if (parent / "ontology" / "ontology-config").is_dir():
            return parent
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
