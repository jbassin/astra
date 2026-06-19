"""Lazy SOPS secret-ref resolution (roadmap Decision E).

KDL config never holds plaintext secrets — only `ref="sops:KEY"` pointers. The real
values live in the SOPS-encrypted file (`deploy/sops/secrets.enc.yaml`), decrypted at
*access* time, not at load. So a config tree with refs whose keys aren't present yet
(e.g. the Discord/Cloudflare secrets that land in Phases 4/6) still loads; only a
`.resolve()` on a missing key raises.

Resolution order for `sops:KEY`:
1. an env var named `KEY` upper-cased (deploy injection / CI) — wins;
2. else the decrypted SOPS map (cached per file).

`sops -d` reads the age key from `SOPS_AGE_KEY_FILE`; we default that to the in-repo
`deploy/sops/age.key` if it isn't already set in the environment.
"""

from __future__ import annotations

import functools
import os
import subprocess
from pathlib import Path

import yaml

SOPS_SCHEME = "sops:"


def _find_repo_root(start: Path) -> Path:
    """Walk up from `start` to the first dir containing `deploy/sops`."""
    for parent in [start, *start.parents]:
        if (parent / "deploy" / "sops").is_dir():
            return parent
    # Fall back to the original dir rather than guessing wildly.
    return start


def default_secrets_file() -> Path:
    """`$ASTRA_SOPS_FILE` or `<repo-root>/deploy/sops/secrets.enc.yaml`."""
    override = os.environ.get("ASTRA_SOPS_FILE")
    if override:
        return Path(override)
    root = _find_repo_root(Path(__file__).resolve())
    return root / "deploy" / "sops" / "secrets.enc.yaml"


@functools.lru_cache(maxsize=8)
def _decrypt(secrets_file: str) -> dict[str, str]:
    """Decrypt a SOPS file once (cached by path); returns the flat key→value map."""
    path = Path(secrets_file)
    if not path.is_file():
        raise FileNotFoundError(f"SOPS secrets file not found: {path}")

    env = dict(os.environ)
    if "SOPS_AGE_KEY_FILE" not in env:
        age_key = _find_repo_root(path) / "deploy" / "sops" / "age.key"
        env["SOPS_AGE_KEY_FILE"] = str(age_key)

    proc = subprocess.run(
        ["sops", "-d", str(path)],
        capture_output=True,
        text=True,
        env=env,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"sops -d failed for {path}: {proc.stderr.strip()}")
    data = yaml.safe_load(proc.stdout) or {}
    # The SOPS metadata block (`sops:`) is not a real secret.
    data.pop("sops", None)
    return {str(k): str(v) for k, v in data.items()}


def resolve_sops_ref(ref: str, *, secrets_file: Path | None = None) -> str:
    """Resolve a `sops:KEY` pointer to its value (env override → decrypted file)."""
    if not ref.startswith(SOPS_SCHEME):
        raise ValueError(f"not a sops ref: {ref!r} (expected '{SOPS_SCHEME}KEY')")
    key = ref[len(SOPS_SCHEME) :]

    env_value = os.environ.get(key.upper())
    if env_value is not None:
        return env_value

    path = secrets_file or default_secrets_file()
    decrypted = _decrypt(str(path))
    if key not in decrypted:
        raise KeyError(
            f"secret {key!r} not in {path} (and ${key.upper()} unset). "
            "Add it to deploy/sops/secrets.enc.yaml or inject the env var."
        )
    return decrypted[key]


class SecretRef:
    """A deferred secret pointer parsed from KDL (`ref="sops:KEY"`).

    Holds only the ref string; `.resolve()` decrypts on demand. `repr`/`str` never
    leak the value, so a secret can't be logged by accident.
    """

    __slots__ = ("ref", "_secrets_file")

    def __init__(self, ref: str, *, secrets_file: Path | None = None) -> None:
        self.ref = ref
        self._secrets_file = secrets_file

    def resolve(self) -> str:
        """Decrypt + return the secret value (raises loud if absent)."""
        return resolve_sops_ref(self.ref, secrets_file=self._secrets_file)

    def __repr__(self) -> str:
        return f"SecretRef({self.ref!r})"

    def __eq__(self, other: object) -> bool:
        return isinstance(other, SecretRef) and other.ref == self.ref

    def __hash__(self) -> int:
        return hash(self.ref)
