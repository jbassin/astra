"""Every `ref="sops:KEY"` in config.kdl names a key the SOPS file holds.

A SOPS file stores its key names in plain text and encrypts only the values, so this reads the
names without decrypting anything.
"""

from __future__ import annotations

import re
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parents[2]
CONFIG = REPO / "ontology" / "ontology-config" / "config.kdl"
SECRETS = REPO / "deploy" / "sops" / "secrets.enc.yaml"

#: Keys config reads as optional and that may be absent until someone adds them. Each entry
#: says what stays off while its key is missing.
OPTIONAL = {
    # ops.signoz-api-key: until it exists, `just signoz-rules-check` warns and the watchdog
    # skips the rule-drift check (libs/py/ops/README.md).
    "signoz_api_key",
}


def _refs() -> set[str]:
    # The file's header comment shows the syntax as `ref="sops:KEY"`; real keys are lower case.
    return set(re.findall(r'ref="sops:([a-z0-9_]+)"', CONFIG.read_text()))


def _keys() -> set[str]:
    data = yaml.safe_load(SECRETS.read_text())
    return {k for k in data if k != "sops"}


def test_every_config_secret_ref_names_a_sops_key() -> None:
    missing = _refs() - _keys() - OPTIONAL
    assert not missing, f"config.kdl refers to SOPS keys that do not exist: {sorted(missing)}"


def test_the_optional_list_names_only_keys_config_reads() -> None:
    assert _refs() >= OPTIONAL, f"stale OPTIONAL entries: {sorted(OPTIONAL - _refs())}"
