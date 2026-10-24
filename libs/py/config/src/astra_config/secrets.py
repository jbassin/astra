"""Lazy SOPS secret-ref resolution (roadmap Decision E).

KDL config never holds plaintext secrets — only `ref="sops:KEY"` pointers. The real
values live in the SOPS-encrypted file (`deploy/sops/secrets.enc.yaml`), decrypted at
*access* time, not at load. So a config tree with refs whose keys aren't present yet
(e.g. the Discord/Cloudflare secrets that land in Phases 4/6) still loads; only a
`.resolve()` on a missing key raises.

Resolution order for `sops:KEY`:
1. an env var named `KEY` upper-cased (deploy injection / CI) — wins;
2. else the decrypted SOPS map (cached per file).

A BLANK value — empty, or only ASCII whitespace — counts as UNSET at both steps (0037
LIB-2). Compose injects every secret as `${KEY:-}`, so a container recreated without
`just up` sees the env var present but empty; that must not pass as a real secret. A
blank env var falls through to the SOPS file exactly like an absent one, and a blank
SOPS entry raises exactly like a missing one — so `resolve()` returns a non-blank value
or raises, never `""`. The TS twin (`libs/ts/config/src/secrets.ts`) applies the same
rule with the same character set.

Read a secret through `SecretRef.require()` (load-bearing: raises a `SecretUnsetError`
naming the config key) or `SecretRef.optional()` (feature switch: unset → `None`). App
code doesn't wrap `resolve()` itself (0037 LIB-2).

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

# The characters a blank secret may consist of. An explicit ASCII set rather than bare
# `str.strip()`: Python's and JS's `trim()` Unicode whitespace sets differ, and the TS twin
# must classify every value identically. A real value is returned verbatim (never stripped).
_BLANK_CHARS = " \t\n\r\f\v"


def is_blank_secret(value: str | None) -> bool:
    """True when a secret value is absent, empty, or only ASCII whitespace (= unset)."""
    return value is None or value.strip(_BLANK_CHARS) == ""


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
    # A YAML null (`key:` with no value) is an empty secret, not the string "None".
    return {str(k): "" if v is None else str(v) for k, v in data.items()}


def resolve_sops_ref(ref: str, *, secrets_file: Path | None = None) -> str:
    """Resolve a `sops:KEY` pointer to its value (env override → decrypted file).

    A blank env var or SOPS entry counts as unset (see the module docstring), so this
    returns a non-blank value or raises.
    """
    if not ref.startswith(SOPS_SCHEME):
        raise ValueError(f"not a sops ref: {ref!r} (expected '{SOPS_SCHEME}KEY')")
    key = ref[len(SOPS_SCHEME) :]

    env_value = os.environ.get(key.upper())
    if env_value is not None and not is_blank_secret(env_value):
        return env_value

    path = secrets_file or default_secrets_file()
    decrypted = _decrypt(str(path))
    value = decrypted.get(key)
    if value is None or is_blank_secret(value):
        raise KeyError(
            f"secret {key!r} is missing or blank in {path} (and ${key.upper()} is unset "
            "or blank). Add it to deploy/sops/secrets.enc.yaml or inject the env var."
        )
    return value


class SecretUnsetError(RuntimeError):
    """A required secret is unset, blank or unresolvable. The message never holds a value."""


class SecretRef:
    """A deferred secret pointer parsed from KDL (`ref="sops:KEY"`).

    Holds only the ref string (and the config key it was read from, e.g.
    `orator.session-secret`); `.require()` / `.optional()` decrypt on demand.
    `repr`/`str` never leak the value, so a secret can't be logged by accident.
    """

    __slots__ = ("_secrets_file", "config_key", "ref")

    def __init__(
        self, ref: str, *, secrets_file: Path | None = None, config_key: str | None = None
    ) -> None:
        self.ref = ref
        self._secrets_file = secrets_file
        self.config_key = config_key

    def resolve(self) -> str:
        """Decrypt + return the secret value (raises loud if absent or blank)."""
        return resolve_sops_ref(self.ref, secrets_file=self._secrets_file)

    def require(self) -> str:
        """The secret's value, or `SecretUnsetError` naming the config key and env var.

        Every resolution failure (unset, blank, no SOPS file, `sops -d` failed) raises,
        so a caller can never proceed with an empty secret.
        """
        try:
            return self.resolve()
        except (KeyError, OSError, RuntimeError) as exc:
            key = self.ref.removeprefix(SOPS_SCHEME)
            name = f"config key {self.config_key} ({self.ref})" if self.config_key else self.ref
            raise SecretUnsetError(
                f"{name} is unset, blank or unresolvable: add {key!r} to "
                f"deploy/sops/secrets.enc.yaml and deploy with `just up` (which injects "
                f"${key.upper()}), or set ${key.upper()} for a host run ({exc})"
            ) from exc

    def optional(self) -> str | None:
        """The secret's value, or `None` when it is unset or blank (no SOPS file counts).

        A `sops -d` failure still raises: a broken age key is not an unset secret.
        """
        try:
            return self.resolve()
        except (KeyError, FileNotFoundError):
            return None

    def __repr__(self) -> str:
        return f"SecretRef({self.ref!r})"

    def __eq__(self, other: object) -> bool:
        return isinstance(other, SecretRef) and other.ref == self.ref

    def __hash__(self) -> int:
        return hash(self.ref)
