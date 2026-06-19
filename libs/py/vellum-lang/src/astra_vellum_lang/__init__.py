"""astra-vellum-lang — the metadata-only vellum extractor (D2).

TS owns the full `VellumDocument` AST + structural validation; this extracts just the
`{frontmatter, crossrefs}` akasha-backend (0007) needs to build the page index +
backlink graph. The frontmatter split + the `[[…]]` grammar mirror the TS parser exactly;
the shared committed `.meta.json` is the parity gate. Total — never throws.

    from astra_vellum_lang import extract_metadata
    meta = extract_metadata(source)   # Metadata(frontmatter=..., crossrefs=[...])
"""

from __future__ import annotations

import json
import re
from typing import Any

import yaml
from astra_observe import get_tracer

from .models import CrossRef, Frontmatter, Metadata

__all__ = [
    "CrossRef",
    "Frontmatter",
    "Metadata",
    "canonical_meta_json",
    "extract_metadata",
    "parse_frontmatter",
    "scan_crossrefs",
    "split_frontmatter",
]

# Mirrors the TS frontmatter split + crossref grammar exactly (the parity contract).
_FRONTMATTER_RE = re.compile(r"^---\r?\n(.*?)\r?\n---[ \t]*\r?\n?", re.DOTALL)
_CROSSREF_RE = re.compile(r"\[\[([^\[\]|#]+)(?:#([^\[\]|]+))?(?:\|([^\[\]]+))?\]\]")
# The TS parser only sees `[[…]]` inside text nodes, so code is naturally excluded. The
# raw scan drops fenced (``` and ~~~) + inline code first to agree (and to avoid spurious
# backlinks). Note: indented code blocks + multi-backtick spans are not stripped — but a
# `[[wikilink]]` inside code is near-nonexistent in the corpus, so this is a tiny residual.
_FENCED_CODE_RE = re.compile(r"```[\s\S]*?```|~~~[\s\S]*?~~~", re.MULTILINE)
_INLINE_CODE_RE = re.compile(r"`[^`\n]+`")


def _strip_code(body: str) -> str:
    return _INLINE_CODE_RE.sub("", _FENCED_CODE_RE.sub("", body))


# Match the TS `yaml` package (YAML 1.2 core schema) by dropping PyYAML's 1.1-only implicit
# timestamp resolver, so `created: 2024-01-15` parses as the string "2024-01-15" (as TS does)
# instead of a `datetime.date` — which both diverges from TS and crashes JSON serialization.
class _YamlLoader(yaml.SafeLoader):
    pass


_YamlLoader.yaml_implicit_resolvers = {
    key: [(tag, regexp) for tag, regexp in resolvers if tag != "tag:yaml.org,2002:timestamp"]
    for key, resolvers in yaml.SafeLoader.yaml_implicit_resolvers.items()
}


def split_frontmatter(source: str) -> tuple[str, str]:
    """Split a leading `---…---` YAML block off the source → (yaml_body, document_body)."""
    m = _FRONTMATTER_RE.match(source)
    if not m:
        return "", source
    return m.group(1), source[m.end() :]


def _to_str_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v) for v in value]
    return [str(value)]


def parse_frontmatter(yaml_text: str) -> Frontmatter:
    """Parse + normalize a frontmatter YAML body into the typed struct (total)."""
    if yaml_text.strip() == "":
        return Frontmatter()
    try:
        raw = yaml.load(yaml_text, Loader=_YamlLoader)  # _YamlLoader is a SafeLoader subclass
    except yaml.YAMLError:
        return Frontmatter()
    if not isinstance(raw, dict):
        return Frontmatter()

    known = {"title", "tags", "aliases", "img"}
    extra = {k: v for k, v in raw.items() if k not in known}
    title = raw.get("title")
    img = raw.get("img")
    return Frontmatter(
        title=str(title) if title is not None else None,
        tags=_to_str_list(raw.get("tags")),
        aliases=_to_str_list(raw.get("aliases")),
        img=str(img) if img is not None else None,
        extra=extra,
    )


def scan_crossrefs(body: str) -> list[CrossRef]:
    """Scan a document body for `[[target#heading|alias]]` refs, in document order.

    Fenced + inline code is stripped first so the scan matches the TS parser (which never
    sees `[[…]]` inside code nodes) and so code samples don't become spurious backlinks.
    """
    out: list[CrossRef] = []
    for m in _CROSSREF_RE.finditer(_strip_code(body)):
        target, heading, alias = m.group(1), m.group(2), m.group(3)
        out.append(
            CrossRef(
                target=target.strip(),
                heading=heading.strip() if heading is not None else None,
                alias=alias.strip() if alias is not None else None,
            )
        )
    return out


def extract_metadata(source: str) -> Metadata:
    """Extract `{frontmatter, crossrefs}` from a vellum document (total)."""
    with get_tracer("astra.vellum-lang").start_as_current_span("vellum.extract_metadata"):
        yaml_text, body = split_frontmatter(source)
        return Metadata(frontmatter=parse_frontmatter(yaml_text), crossrefs=scan_crossrefs(body))


def canonical_meta_json(source: str) -> str:
    """Stable `{frontmatter, crossrefs}` JSON — byte-identical to the TS `canonicalMetaJson`
    for the field types the wiki uses (strings, lists, ints, bools, ISO dates). `default=str`
    is a totality net so any exotic YAML scalar in `extra` serializes instead of crashing;
    rare YAML 1.1-vs-1.2 scalar edges (bare exponent floats) may then differ from TS."""
    meta = extract_metadata(source)
    canonical = {
        "frontmatter": {
            "title": meta.frontmatter.title,
            "tags": meta.frontmatter.tags,
            "aliases": meta.frontmatter.aliases,
            "img": meta.frontmatter.img,
            "extra": meta.frontmatter.extra,
        },
        "crossrefs": [
            {"target": r.target, "alias": r.alias, "heading": r.heading} for r in meta.crossrefs
        ],
    }
    return json.dumps(canonical, sort_keys=True, ensure_ascii=False, indent=2, default=str) + "\n"
