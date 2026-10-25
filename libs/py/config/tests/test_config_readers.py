"""Every config field has a reader: the CI check against dead config.

A field that nothing reads costs an edit in `config.kdl`, Pydantic and Zod, and it misleads
the next reader (`llm.default-max-tokens` looked like it set the client's limit). This test
walks every field of `WholeConfig` and looks for a reader in the tracked source outside the
config libraries, their tests and the docs.

A file reads `<namespace>.<field>` when it either

* names the dotted KDL path (`scribe.incoming-path`, as the justfile's
  `python -m astra_ontology_config` calls do), or
* names the namespace as an accessor (`.scribe`, `.akashaFrontend`, `["akasha-frontend"]`)
  and the field as a whole word (`incoming_path`, `incomingPath`).

That is a grep, not a type check: a field name that is common enough can pass on a file
that only mentions it. It does catch every field nothing names at all. A field read only
through a computed name goes in `ALLOWLIST`, with the reason.
"""

from __future__ import annotations

import re
import subprocess
from functools import cache
from pathlib import Path

import pytest
from astra_config import WholeConfig, find_repo_root
from pydantic import BaseModel

#: Fields read only through a computed name, which the grep cannot see:
#: ``(namespace, field)`` in Python spelling, mapped to why the field is still live.
#: An entry whose field is gone, or that the grep now finds a reader for, fails the test.
_REGISTER = (
    "@astra/observe/register (libs/ts/observe/src/node.ts serviceNameFor) reads every Node "
    "service's service-name from the block its package.json `astra.config` names"
)
ALLOWLIST: dict[tuple[str, str], str] = {
    ("portal_headless", "service_name"): _REGISTER,
}

#: Tracked paths that are not readers: the config libraries themselves (the schemas, the
#: KDL file and its `python -m astra_ontology_config` CLI), tests, fixtures, prose and the
#: encrypted secrets.
_NOT_A_READER = re.compile(
    r"^(libs/py/config/|libs/ts/config/|ontology/ontology-config/|fixtures/|docs/|thoughts/"
    r"|deploy/sops/)"
    r"|(^|/)tests?/|(^|/)test_[^/]*\.py$|_test\.py$|(^|/)conftest\.py$|\.(test|spec)\.[mc]?tsx?$"
    r"|\.md$"
)
#: The text files code and deploy config live in.
_SOURCE = re.compile(
    r"\.(py|[mc]?[jt]sx?|sh|ya?ml|toml|kdl|caddyfile|service|timer|rs)$"
    r"|(^|/)(justfile|[^/]*Dockerfile[^/]*|Caddyfile)$"
)


def _camel(snake: str) -> str:
    head, *rest = snake.split("_")
    return head + "".join(part.title() for part in rest)


@cache
def _sources() -> dict[str, str]:
    """Every tracked source file outside the config libraries, tests and docs."""
    root = find_repo_root()
    listed = subprocess.run(
        ["git", "ls-files", "-z"], cwd=root, capture_output=True, text=True, check=True
    ).stdout.split("\0")
    texts = {}
    for name in listed:
        if not name or _NOT_A_READER.search(name) or not _SOURCE.search(name):
            continue
        path = root / name
        if path.is_file():  # a deleted-but-unstaged file is still listed
            texts[name] = path.read_text(encoding="utf-8", errors="replace")
    return texts


def unread_fields(schema: type[BaseModel], texts: dict[str, str]) -> list[tuple[str, str]]:
    """The ``(namespace, field)`` pairs of ``schema`` that no text in ``texts`` reads."""
    unread = []
    for ns, ns_info in schema.model_fields.items():
        namespace = ns_info.annotation
        assert isinstance(namespace, type) and issubclass(namespace, BaseModel), ns
        ns_kebab, ns_camel = ns.replace("_", "-"), _camel(ns)
        accessor = re.compile(
            rf"\.(?:{ns}|{ns_camel})\b|\[\s*[\"'](?:{ns}|{ns_kebab}|{ns_camel})[\"']\s*\]"
        )
        files_naming_ns = [text for text in texts.values() if accessor.search(text)]
        for field in namespace.model_fields:
            dotted = f"{ns_kebab}.{field.replace('_', '-')}"
            word = re.compile(rf"\b(?:{field}|{_camel(field)})\b")
            if any(dotted in text for text in texts.values()):
                continue
            if any(word.search(text) for text in files_naming_ns):
                continue
            unread.append((ns, field))
    return unread


def test_every_config_field_has_a_reader() -> None:
    unread = [key for key in unread_fields(WholeConfig, _sources()) if key not in ALLOWLIST]
    assert not unread, (
        "config fields with no reader outside the config libraries and tests — delete them "
        "from config.kdl, models.py and config.ts (or, if one is read through a computed "
        f"name, add it to ALLOWLIST with the reason): {unread}"
    )


@pytest.mark.parametrize(("key", "reason"), sorted(ALLOWLIST.items()))
def test_allowlist_entries_are_needed(key: tuple[str, str], reason: str) -> None:
    ns, field = key
    assert reason.strip(), f"{key}: an allowlist entry needs a reason"
    assert ns in WholeConfig.model_fields, f"{key}: no such namespace"
    namespace = WholeConfig.model_fields[ns].annotation
    assert isinstance(namespace, type) and issubclass(namespace, BaseModel)
    assert field in namespace.model_fields, f"{key}: no such field; drop the entry"
    assert key in unread_fields(WholeConfig, _sources()), (
        f"{key}: the grep finds a reader now; drop the entry"
    )


# --- the matcher, on made-up sources ------------------------------------------------------


class _Ns(BaseModel):
    incoming_path: str = ""
    max_iterations: int = 0
    gone: str = ""


class _Schema(BaseModel):
    akasha_frontend: _Ns = _Ns()


@pytest.mark.parametrize(
    "text",
    [
        "cfg.akasha_frontend.incoming_path",  # Python attribute
        "const { incomingPath } = cfg.akashaFrontend;",  # TS camelCase, destructured
        'raw["akasha-frontend"]\nraw.incomingPath',  # KDL-keyed lookup
        "python -m astra_ontology_config akasha-frontend.incoming-path",  # dotted path
    ],
)
def test_matcher_finds_each_reader_spelling(text: str) -> None:
    assert ("akasha_frontend", "incoming_path") not in unread_fields(_Schema, {"a": text})


def test_matcher_needs_the_namespace_in_the_same_file() -> None:
    texts = {"a.py": "cfg.akasha_frontend.max_iterations", "b.py": "x.incoming_path"}
    assert unread_fields(_Schema, texts) == [
        ("akasha_frontend", "incoming_path"),
        ("akasha_frontend", "gone"),
    ]


def test_sources_skip_config_libraries_tests_and_docs() -> None:
    names = _sources().keys()
    assert "justfile" in names
    assert not [n for n in names if n.startswith(("libs/py/config/", "libs/ts/config/"))]
    assert not [n for n in names if n.endswith(".md") or "/tests/" in n]
    assert Path(__file__).relative_to(find_repo_root()).as_posix() not in names
