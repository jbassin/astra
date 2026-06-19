"""Unit checks for the metadata extractor — the same contract the TS parser holds."""

from __future__ import annotations

from astra_vellum_lang import (
    canonical_meta_json,
    extract_metadata,
    parse_frontmatter,
    scan_crossrefs,
    split_frontmatter,
)


def test_frontmatter_normalizes_tags_aliases_and_keeps_extras() -> None:
    fm = parse_frontmatter(
        "title: Belvedere\ntags:\n  - Watcher\n  - Religious\naliases: Enclave\nkind: org"
    )
    assert fm.title == "Belvedere"
    assert fm.tags == ["Watcher", "Religious"]
    assert fm.aliases == ["Enclave"]  # scalar → one-element list
    assert fm.extra == {"kind": "org"}


def test_frontmatter_total_on_absent_blank_or_malformed() -> None:
    assert parse_frontmatter("").tags == []
    assert parse_frontmatter("[: not valid yaml").tags == []  # never throws
    yaml, body = split_frontmatter("# no frontmatter")
    assert yaml == ""
    assert body == "# no frontmatter"


def test_crossref_all_forms_in_document_order() -> None:
    refs = scan_crossrefs("[[A]] [[B|bee]] [[C#h]] [[D#h|dee]] [[x/y/index|z]] [[Færrin]]")
    assert [(r.target, r.alias, r.heading) for r in refs] == [
        ("A", None, None),
        ("B", "bee", None),
        ("C", None, "h"),
        ("D", "dee", "h"),
        ("x/y/index", "z", None),
        ("Færrin", None, None),
    ]


def test_crossref_skips_code() -> None:
    assert scan_crossrefs("a `[[InCode]]` b [[Real]]") == scan_crossrefs("b [[Real]]")
    assert [r.target for r in scan_crossrefs("```\n[[InFence]]\n```\n[[After]]")] == ["After"]


def test_extract_metadata_combines_both() -> None:
    meta = extract_metadata("---\ntags: [a]\n---\n\nSee [[X]].")
    assert meta.frontmatter.tags == ["a"]
    assert [r.target for r in meta.crossrefs] == ["X"]


def test_total_on_yaml_dates_and_bools() -> None:
    # Regression: a YAML date must parse as an ISO string (matching TS yaml 1.2 core), not a
    # datetime — which both diverged from TS and crashed JSON serialization (review C1).
    fm = parse_frontmatter("created: 2024-01-15\ndraft: false")
    assert fm.extra["created"] == "2024-01-15"
    assert fm.extra["draft"] is False
    # must not raise on a date-bearing extra bag:
    canonical_meta_json("---\ncreated: 2024-01-15\nupdated: 2026-06-19\n---\nbody")
