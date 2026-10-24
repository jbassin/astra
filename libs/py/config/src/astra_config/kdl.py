"""KDL at the edge: one typed decoder for every KDL file astra reads (0037 LIB-12).

ckdl parses; `load_kdl` turns its untyped nodes into a frozen `KNode` tree once, and
`decode(Model, node)` maps that tree onto a Pydantic model. Walkers declare a schema
instead of walking nodes by hand. Each field reads one part of the node, chosen by a
marker in its `Annotated[...]` metadata:

* `Arg(i)`: the node's i-th positional argument (`player "josh"` → `"josh"`).
* `Prop("name")`: a `name=value` property (default name: the field name in kebab-case).
* `Child("name")` (the default for an unmarked field): the one child node of that name.
  A model-typed field decodes the child as that model; a `list[...]` field takes all
  of the child's arguments; any other field takes its single argument, or a `SecretRef`
  when the child carries `ref="sops:KEY"`.
* `Children("name")`: every child node of that name, as a list (model items decode as
  that model, scalar items take each child's first argument).

A required field that the KDL omits raises `KdlDecodeError` naming the node path
(`being.kdl: player "josh" > name`); it never becomes the string `"None"`. A model with
`extra="forbid"` also rejects unknown child nodes, properties and arguments, and a
`Child` field rejects a repeated node. `kdl_quote` is the one escaper for writers that
insert KDL text by hand.
"""

from __future__ import annotations

import types
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Union, get_args, get_origin

import ckdl
from pydantic import BaseModel, ValidationError
from pydantic.fields import FieldInfo

from .secrets import SecretRef

# ckdl ships no type stubs / py.typed, so its members (`parse`, `Value`) aren't
# statically visible. Route access through one Any handle; nothing past `load_kdl`
# sees a ckdl object.
_ckdl: Any = ckdl

#: A decoded KDL value. ckdl type annotations (`(u8)1`) are dropped; no astra file uses one.
KdlValue = str | int | float | bool | None


class KdlDecodeError(ValueError):
    """A KDL file does not match the model it decodes into; the message names the node."""


@dataclass(frozen=True, slots=True)
class KNode:
    """One KDL node, typed. The root node of a file has no name; its children are the
    file's top-level nodes."""

    name: str
    args: tuple[KdlValue, ...] = ()
    props: Mapping[str, KdlValue] = field(default_factory=dict)
    children: tuple[KNode, ...] = ()
    #: Where the node came from, for error messages (`being.kdl`).
    source: str = "<kdl>"
    #: The node labels from the root (`('player "josh"', "name")`), for error messages.
    trail: tuple[str, ...] = ()
    #: The node names from the root (`("orator", "session-secret")`); a `SecretRef`
    #: records them dotted as its `config_key`.
    keys: tuple[str, ...] = ()

    @property
    def path(self) -> str:
        """`being.kdl: player "josh" > name` (or just `being.kdl` for the root)."""
        return f"{self.source}: {' > '.join(self.trail)}" if self.trail else self.source

    def named(self, name: str) -> list[KNode]:
        """The child nodes called `name`, in file order."""
        return [c for c in self.children if c.name == name]


def _value(raw: Any) -> KdlValue:
    return raw.value if isinstance(raw, _ckdl.Value) else raw


def _label(name: str, args: tuple[KdlValue, ...]) -> str:
    return f'{name} "{args[0]}"' if args and isinstance(args[0], str) else name


def _knode(raw: Any, parent: KNode) -> KNode:
    args = tuple(_value(a) for a in raw.args)
    node = KNode(
        name=raw.name,
        args=args,
        props={k: _value(v) for k, v in dict(raw.properties).items()},
        source=parent.source,
        trail=(*parent.trail, _label(raw.name, args)),
        keys=(*parent.keys, raw.name),
    )
    object.__setattr__(node, "children", tuple(_knode(c, node) for c in raw.children))
    return node


def parse_kdl(text: str, *, source: str = "<kdl>") -> KNode:
    """Parse KDL text into its root `KNode`."""
    root = KNode(name="", source=source)
    object.__setattr__(root, "children", tuple(_knode(n, root) for n in _ckdl.parse(text).nodes))
    return root


def load_kdl(path: str | Path) -> KNode:
    """Parse a KDL file into its root `KNode` (errors name the file)."""
    p = Path(path)
    return parse_kdl(p.read_text(encoding="utf-8"), source=p.name)


def kebab(name: str) -> str:
    """Python snake_case field name → KDL kebab-case node name."""
    return name.replace("_", "-")


def kdl_quote(s: str) -> str:
    """A KDL v2 quoted string. Escapes `\\`, `"` and every control character, since a
    single-line KDL string may not hold a literal newline."""
    out = []
    for ch in s:
        if ch in _ESCAPES:
            out.append(_ESCAPES[ch])
        elif ord(ch) < 0x20 or ord(ch) == 0x7F:
            out.append(f"\\u{{{ord(ch):x}}}")
        else:
            out.append(ch)
    return '"' + "".join(out) + '"'


_ESCAPES = {"\\": "\\\\", '"': '\\"', "\n": "\\n", "\r": "\\r", "\t": "\\t"}


# ── field markers ────────────────────────────────────────────────────────────
@dataclass(frozen=True, slots=True)
class Arg:
    """The field is the node's `index`-th positional argument."""

    index: int = 0


@dataclass(frozen=True, slots=True)
class Prop:
    """The field is the node's `name=value` property (default: the kebab field name)."""

    name: str | None = None


@dataclass(frozen=True, slots=True)
class Child:
    """The field is the one child node `name` (default: the kebab field name)."""

    name: str | None = None


@dataclass(frozen=True, slots=True)
class Children:
    """The field is every child node `name`, as a list."""

    name: str


_Spec = Arg | Prop | Child | Children
_MISSING: Any = object()


def _spec(field_name: str, info: FieldInfo) -> _Spec:
    found = [m for m in info.metadata if isinstance(m, Arg | Prop | Child | Children)]
    spec = found[0] if found else Child()
    if isinstance(spec, Prop | Child) and spec.name is None:
        return type(spec)(kebab(field_name))
    return spec


def _members(annotation: Any) -> tuple[Any, ...]:
    """The non-None members of a union annotation (or the annotation itself)."""
    if get_origin(annotation) in (Union, types.UnionType):
        return tuple(a for a in get_args(annotation) if a is not type(None))
    return (annotation,)


def _model_of(annotation: Any) -> type[BaseModel] | None:
    for member in _members(annotation):
        if isinstance(member, type) and issubclass(member, BaseModel):
            return member
    return None


def _list_item(annotation: Any) -> Any:
    """The item type of a `list[...]` annotation, or `_MISSING` when it isn't a list."""
    for member in _members(annotation):
        if get_origin(member) is list:
            (item,) = get_args(member) or (Any,)
            return item
    return _MISSING


class _Decoder:
    def __init__(self, secrets_file: Path | None) -> None:
        self.secrets_file = secrets_file

    def leaf(self, node: KNode, annotation: Any) -> Any:
        if "ref" in node.props:
            return SecretRef(
                str(node.props["ref"]),
                secrets_file=self.secrets_file,
                config_key=".".join(node.keys),
            )
        if _list_item(annotation) is not _MISSING:
            return list(node.args)
        if len(node.args) == 1:
            return node.args[0]
        return list(node.args) if node.args else None

    def field(self, node: KNode, spec: _Spec, info: FieldInfo) -> Any:
        if isinstance(spec, Arg):
            return node.args[spec.index] if spec.index < len(node.args) else _MISSING
        if isinstance(spec, Prop):
            return node.props.get(spec.name or "", _MISSING)
        if isinstance(spec, Child):
            found = node.named(spec.name or "")
            if not found:
                return _MISSING
            if len(found) > 1:
                raise KdlDecodeError(f"{found[1].path}: repeated node; expected one")
            model = _model_of(info.annotation)
            return self.model(model, found[0]) if model else self.leaf(found[0], info.annotation)
        item = _list_item(info.annotation)
        model = _model_of(item)
        values = []
        for child in node.named(spec.name):
            if model is not None:
                values.append(self.model(model, child))
            elif child.args:
                values.append(child.args[0])
            else:
                raise KdlDecodeError(f"{child.path}: missing its value")
        return values

    def model[M: BaseModel](self, model: type[M], node: KNode) -> M:
        data: dict[str, Any] = {}
        specs = {name: _spec(name, info) for name, info in model.model_fields.items()}
        for name, spec in specs.items():
            info = model.model_fields[name]
            value = self.field(node, spec, info)
            if value is not _MISSING:
                data[name] = value
            elif info.is_required():
                raise KdlDecodeError(f"{_where(node, spec)}: missing (required)")
        if model.model_config.get("extra") == "forbid":
            _reject_unknown(node, specs.values())
        try:
            return model.model_validate(data)
        except ValidationError as err:
            raise KdlDecodeError(_explain(node, specs, err)) from err


def _where(node: KNode, spec: _Spec) -> str:
    """Where a field sits: `being.kdl: player "josh" > name`, `... > role: property class=`."""
    if isinstance(spec, Arg):
        return f"{node.path}: argument {spec.index}"
    if isinstance(spec, Prop):
        return f"{node.path}: property {spec.name}="
    return f"{node.path} > {spec.name}" if node.trail else f"{node.source}: {spec.name}"


def _reject_unknown(node: KNode, specs: Any) -> None:
    children = {s.name for s in specs if isinstance(s, Child | Children)}
    props = {s.name for s in specs if isinstance(s, Prop)}
    arity = max((s.index + 1 for s in specs if isinstance(s, Arg)), default=0)
    for child in node.children:
        if child.name not in children:
            raise KdlDecodeError(f"{child.path}: unknown node")
    for prop in node.props:
        if prop not in props:
            raise KdlDecodeError(f"{node.path}: unknown property {prop}=")
    if len(node.args) > arity:
        raise KdlDecodeError(f"{node.path}: {len(node.args)} arguments; expected {arity}")


def _explain(node: KNode, specs: dict[str, _Spec], err: ValidationError) -> str:
    lines = []
    for e in err.errors():
        spec = specs.get(str(e["loc"][0])) if e["loc"] else None
        where = _where(node, spec) if spec is not None else node.path
        lines.append(f"{where}: {e['msg']} (got {e.get('input')!r})")
    return "\n".join(lines)


def decode[M: BaseModel](model: type[M], node: KNode, *, secrets_file: Path | None = None) -> M:
    """Decode `node` (usually a file's root from `load_kdl`) into `model`.

    Raises `KdlDecodeError`, naming the node path, when a required field is missing or
    a value fails validation. `secrets_file` is handed to each `SecretRef` it creates.
    """
    return _Decoder(secrets_file).model(model, node)
