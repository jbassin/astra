"""Thin KDL → Python adapter (ckdl) shared by config + ontology loaders.

Keeps KDL strictly at the edge (CLAUDE.md): parse here, hand back plain dicts/scalars
+ `SecretRef`, and never thread raw ckdl nodes into application code. The ontology
loader (`libs/py/ontology`) reuses these helpers for its repeated-node walk.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import ckdl

from .secrets import SecretRef

# ckdl ships no type stubs / py.typed, so its members (`parse`, `Document`, `Node`)
# aren't statically visible. Route access through an Any handle + alias the types;
# the runtime objects are real (see the probe in the Phase-1 spec).
_ckdl: Any = ckdl
KdlDocument = Any
KdlNode = Any


def load_document(path: str | Path) -> KdlDocument:
    """Parse a KDL file into a ckdl Document."""
    return _ckdl.parse(Path(path).read_text(encoding="utf-8"))


def node_props(node: KdlNode) -> dict[str, Any]:
    """A node's `key=value` properties as a plain dict."""
    return dict(node.properties)


def snake(name: str) -> str:
    """KDL kebab-case node name → Python snake_case key."""
    return name.replace("-", "_")


def leaf_value(node: KdlNode, *, secrets_file: Path | None = None) -> Any:
    """Resolve a leaf KDL node to a scalar, a `SecretRef`, a list, or None.

    * `name ref="sops:KEY"` → `SecretRef`
    * `name "x"` / `name 1` / `name #true` → the single typed arg
    * `name "a" "b"` → the list of args
    * `name` (no args) → None
    """
    props = node_props(node)
    if "ref" in props:
        return SecretRef(str(props["ref"]), secrets_file=secrets_file)
    args = list(node.args)
    if len(args) == 1:
        return args[0]
    if not args:
        return None
    return args


def children_as_dict(node: KdlNode, *, secrets_file: Path | None = None) -> dict[str, Any]:
    """A node's child nodes as `{snake_name: leaf_value | nested dict}`."""
    out: dict[str, Any] = {}
    for child in node.children:
        key = snake(child.name)
        if list(child.children) and not list(child.args) and "ref" not in node_props(child):
            out[key] = children_as_dict(child, secrets_file=secrets_file)
        else:
            out[key] = leaf_value(child, secrets_file=secrets_file)
    return out


def top_level_namespaces(
    doc: KdlDocument, *, secrets_file: Path | None = None
) -> dict[str, dict[str, Any]]:
    """Each top-level node → its children dict (the config-namespace shape)."""
    return {
        snake(node.name): children_as_dict(node, secrets_file=secrets_file) for node in doc.nodes
    }
