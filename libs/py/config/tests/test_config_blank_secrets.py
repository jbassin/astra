"""A blank secret (empty or ASCII-whitespace-only) counts as UNSET (0037 LIB-2).

Compose injects every secret as `${KEY:-}`, so a container recreated without `just up`
sees the env var present but empty. These tests pin that a blank value behaves exactly
like an absent one at both resolution steps (env override, then the SOPS file).

Hermetic: a fake `sops` on PATH prints a plaintext fixture, so the file path runs in CI
without the real binary or age key. The TS twin (`libs/ts/config/src/secrets.test.ts`)
runs the same cases.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from astra_config import SecretRef, SecretUnsetError, is_blank_secret, load_config
from astra_config.secrets import resolve_sops_ref

REF = "sops:astra_blank_test_secret"
ENV = "ASTRA_BLANK_TEST_SECRET"
BLANKS = ["", " ", "\t", "\n", " \t\r\n\f\v "]


@pytest.fixture
def secrets_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Return a writer: `write(yaml_text) -> Path` behind a fake `sops -d` on PATH."""
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    fake = bin_dir / "sops"
    # Fake `sops -d FILE`: the fixture is already plaintext.
    fake.write_text('#!/bin/sh\ncat "$2"\n')
    fake.chmod(0o755)
    monkeypatch.setenv("PATH", f"{bin_dir}{os.pathsep}{os.environ.get('PATH', '')}")
    monkeypatch.delenv(ENV, raising=False)
    # A fresh path per test, so the per-path decrypt cache never leaks between cases.
    path = tmp_path / "secrets.enc.yaml"

    def write(text: str) -> Path:
        path.write_text(text)
        return path

    return write


@pytest.mark.parametrize(
    ("value", "blank"),
    [
        (None, True),
        *[(b, True) for b in BLANKS],
        ("x", False),
        (" x ", False),
        # Non-ASCII whitespace is a value: the blank set is explicit ASCII so the TS twin
        # (whose trim() set differs from str.strip()) classifies it identically.
        (" ", False),
        ("﻿", False),
    ],
)
def test_is_blank_secret(value: str | None, blank: bool) -> None:
    assert is_blank_secret(value) is blank


def test_missing_env_falls_through_to_the_file(secrets_file) -> None:
    path = secrets_file("astra_blank_test_secret: from-file\n")
    assert resolve_sops_ref(REF, secrets_file=path) == "from-file"


def test_missing_env_and_missing_key_raises(secrets_file) -> None:
    path = secrets_file("other_key: x\n")
    with pytest.raises(KeyError, match="astra_blank_test_secret"):
        resolve_sops_ref(REF, secrets_file=path)


@pytest.mark.parametrize("blank", BLANKS)
def test_blank_env_falls_through_like_missing(
    secrets_file, monkeypatch: pytest.MonkeyPatch, blank: str
) -> None:
    path = secrets_file("astra_blank_test_secret: from-file\n")
    monkeypatch.setenv(ENV, blank)
    assert resolve_sops_ref(REF, secrets_file=path) == "from-file"


@pytest.mark.parametrize("blank", BLANKS)
def test_blank_env_and_missing_key_raises_like_missing(
    secrets_file, monkeypatch: pytest.MonkeyPatch, blank: str
) -> None:
    path = secrets_file("other_key: x\n")
    monkeypatch.setenv(ENV, blank)
    with pytest.raises(KeyError, match="astra_blank_test_secret"):
        resolve_sops_ref(REF, secrets_file=path)


def test_blank_env_without_a_sops_file_raises_like_missing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The in-container case: no SOPS file in the image, `${KEY:-}` injected empty."""
    monkeypatch.setenv(ENV, "")
    with pytest.raises(FileNotFoundError):
        resolve_sops_ref(REF, secrets_file=tmp_path / "absent.enc.yaml")


@pytest.mark.parametrize(
    "entry",
    [
        'astra_blank_test_secret: ""\n',
        'astra_blank_test_secret: "  \\t "\n',
        "astra_blank_test_secret:\n",
    ],
    ids=["empty", "whitespace", "yaml-null"],
)
def test_blank_file_entry_raises_like_missing(secrets_file, entry: str) -> None:
    path = secrets_file(entry)
    with pytest.raises(KeyError, match="astra_blank_test_secret"):
        resolve_sops_ref(REF, secrets_file=path)


@pytest.mark.parametrize("value", ["real-value", "  padded value  "])
def test_real_env_value_wins_and_is_returned_verbatim(
    secrets_file, monkeypatch: pytest.MonkeyPatch, value: str
) -> None:
    path = secrets_file("astra_blank_test_secret: from-file\n")
    monkeypatch.setenv(ENV, value)
    assert resolve_sops_ref(REF, secrets_file=path) == value


def test_secret_ref_resolve_applies_the_same_rule(
    secrets_file, monkeypatch: pytest.MonkeyPatch
) -> None:
    path = secrets_file("other_key: x\n")
    ref = SecretRef(REF, secrets_file=path)
    monkeypatch.setenv(ENV, "")
    with pytest.raises(KeyError):
        ref.resolve()
    monkeypatch.setenv(ENV, "real-value")
    assert ref.resolve() == "real-value"


# --- `require()` / `optional()`: the one way app code reads a secret ---------------------


def _ref(path: Path) -> SecretRef:
    return SecretRef(REF, secrets_file=path, config_key="test.blank-secret")


@pytest.mark.parametrize("blank", [None, *BLANKS])
def test_require_refuses_unset_or_blank_and_names_the_config_key(
    secrets_file, monkeypatch: pytest.MonkeyPatch, blank: str | None
) -> None:
    path = secrets_file("other_key: x\n")
    if blank is not None:
        monkeypatch.setenv(ENV, blank)
    with pytest.raises(SecretUnsetError, match=r"test\.blank-secret .*\$ASTRA_BLANK_TEST_SECRET"):
        _ref(path).require()


def test_require_refuses_when_there_is_no_sops_file(tmp_path: Path) -> None:
    with pytest.raises(SecretUnsetError, match="unset, blank or unresolvable"):
        _ref(tmp_path / "absent.enc.yaml").require()


def test_require_refuses_a_blank_file_entry(secrets_file) -> None:
    path = secrets_file('astra_blank_test_secret: "  "\n')
    with pytest.raises(SecretUnsetError):
        _ref(path).require()


def test_require_returns_a_real_value_verbatim(
    secrets_file, monkeypatch: pytest.MonkeyPatch
) -> None:
    assert _ref(secrets_file("astra_blank_test_secret: from-file\n")).require() == "from-file"
    monkeypatch.setenv(ENV, "  padded  ")
    assert _ref(secrets_file("other_key: x\n")).require() == "  padded  "


@pytest.mark.parametrize("blank", [None, *BLANKS])
def test_optional_reads_unset_or_blank_as_none(
    secrets_file, monkeypatch: pytest.MonkeyPatch, blank: str | None
) -> None:
    path = secrets_file('other_key: x\nastra_blank_test_secret: ""\n')
    if blank is not None:
        monkeypatch.setenv(ENV, blank)
    assert _ref(path).optional() is None


def test_optional_reads_no_sops_file_as_none(tmp_path: Path) -> None:
    assert _ref(tmp_path / "absent.enc.yaml").optional() is None


def test_optional_returns_a_real_value(secrets_file, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(ENV, "real-value")
    assert _ref(secrets_file("other_key: x\n")).optional() == "real-value"


def test_optional_still_raises_when_sops_fails(tmp_path: Path, monkeypatch) -> None:
    """A broken age key is not an unset secret: it must not silently turn a feature off."""
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    (bin_dir / "sops").write_text("#!/bin/sh\necho boom >&2\nexit 1\n")
    (bin_dir / "sops").chmod(0o755)
    monkeypatch.setenv("PATH", f"{bin_dir}{os.pathsep}{os.environ.get('PATH', '')}")
    monkeypatch.delenv(ENV, raising=False)
    path = tmp_path / "broken.enc.yaml"
    path.write_text("x: y\n")
    with pytest.raises(RuntimeError, match="sops -d failed"):
        _ref(path).optional()


def test_loaded_refs_carry_their_config_key() -> None:
    cfg = load_config()
    assert cfg.orator.session_secret is not None
    assert cfg.orator.session_secret.config_key == "orator.session-secret"
    assert cfg.weal_overlay.token is not None
    assert cfg.weal_overlay.token.config_key == "weal-overlay.token"
