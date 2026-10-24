"""The homebrew store: the typed model of a store file, its canonical format, and the
`assay store check` / `assay store fmt` commands.

The store is `apps/assay/py/homebrew/{spells,traits}/*.json`, one JSON document per
file. codex's transform and the Liturgy book read it, so it is live product content.

- The models describe the files exactly as they are: every field, its type, and whether
  it may be absent or null. They forbid unknown keys and never coerce a type, so a typo,
  a stray field or a quoted number fails `store check`. They validate only; nothing
  writes a file from a model, so a model can never change a stored value.
- The canonical format is the repo's canonical-JSON convention (`being.canonical.json`):
  sorted keys, 2-space indent, UTF-8 text written as-is (no `\\uXXXX` escapes), and one
  trailing newline. `store fmt` rewrites a file from its own parsed value, so formatting
  never changes content.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, ClassVar, Literal

from astra_observe import get_tracer
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

APP_ROOT = Path(__file__).resolve().parents[2]  # src/astra_assay/store.py -> apps/assay/py
STORE_ROOT = APP_ROOT / "homebrew"
SPELLS_SUBDIR = "spells"
TRAITS_SUBDIR = "traits"

_tracer = get_tracer("astra.assay")


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class _StoreModel(BaseModel):
    """Strict: unknown keys fail, and no value is coerced to the declared type.

    A field typed `X | None = None` accepts both an absent key and an explicit null.
    Fields listed in `_absent_not_null` may be absent but are never null in the store, and
    an explicit null there fails."""

    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)
    _absent_not_null: ClassVar[frozenset[str]] = frozenset()

    @model_validator(mode="before")
    @classmethod
    def _reject_null_for_absent_only_fields(cls, data: Any) -> Any:
        if isinstance(data, dict):
            nulls = sorted(k for k in cls._absent_not_null if k in data and data[k] is None)
            if nulls:
                raise ValueError(f"{', '.join(nulls)}: omit the key instead of null")
        return data


class TextValue(_StoreModel):
    value: str


class IntValue(_StoreModel):
    value: int


class SpellTraits(_StoreModel):
    rarity: Literal["common", "uncommon", "rare", "unique"]
    traditions: list[Literal["arcane", "divine", "occult", "primal"]]
    value: list[str]


class Publication(_StoreModel):
    license: str
    remaster: bool
    title: str


class Duration(_StoreModel):
    sustained: bool
    value: str


class Area(_StoreModel):
    type: Literal["burst", "cone", "cylinder", "emanation", "line", "square"]
    value: int


class Save(_StoreModel):
    basic: bool
    statistic: Literal["fortitude", "reflex", "will"]


class Defense(_StoreModel):
    save: Save


DamageType = Literal[
    "acid",
    "bleed",
    "bludgeoning",
    "cold",
    "electricity",
    "fire",
    "force",
    "mental",
    "piercing",
    "poison",
    "slashing",
    "sonic",
    "spirit",
    "untyped",
    "vitality",
    "void",
]


class DamagePartial(_StoreModel):
    """One entry of `system.damage`, keyed `"0"`, `"1"`, … as in Foundry."""

    applyMod: bool
    category: Literal["persistent", "precision", "splash"] | None
    formula: str
    kinds: list[Literal["damage", "healing"]]
    materials: list[str]
    type: DamageType


class HeighteningInterval(_StoreModel):
    """Heightened (+N): `damage` maps a `system.damage` key to the added formula. A
    non-damage step is `{"damage": {}, "interval": N, "type": "interval"}`."""

    _absent_not_null: ClassVar[frozenset[str]] = frozenset({"area"})
    type: Literal["interval"]
    interval: int
    damage: dict[str, str]
    area: int | None = None


class HeighteningLevel(_StoreModel):
    _absent_not_null: ClassVar[frozenset[str]] = frozenset({"target"})
    target: TextValue | None = None


class HeighteningFixed(_StoreModel):
    """Heightened (Nth): `levels` is keyed by rank as a string (`"4"`, `"10"`)."""

    type: Literal["fixed"]
    levels: dict[str, HeighteningLevel]


class HeighteningEmpty(_StoreModel):
    """`"heightening": {}`, which some store files carry instead of null or no key."""


class RitualPrimary(_StoreModel):
    check: str


class RitualSecondary(_StoreModel):
    casters: int
    checks: str


class Ritual(_StoreModel):
    primary: RitualPrimary
    secondary: RitualSecondary


class SpellSystem(_StoreModel):
    _absent_not_null: ClassVar[frozenset[str]] = frozenset({"ritual"})
    area: Area | None
    cost: TextValue
    counteraction: bool
    damage: dict[str, DamagePartial]
    defense: Defense | None
    description: TextValue
    duration: Duration
    # Absent, null and `{}` all occur in the store and all mean "does not heighten".
    heightening: HeighteningInterval | HeighteningFixed | HeighteningEmpty | None = None
    level: IntValue
    publication: Publication
    range: TextValue
    requirements: str
    ritual: Ritual | None = None
    # Foundry rule elements. No store spell carries one today.
    rules: list[dict[str, Any]]
    target: TextValue
    time: TextValue
    traits: SpellTraits


class SeededFrom(_StoreModel):
    """Provenance back to the vendored conversion; `homebrew-revisions` pairs files by it."""

    commit: str
    convertedName: str
    originalName: str
    repo: str


class AssayFlags(_StoreModel):
    _absent_not_null: ClassVar[frozenset[str]] = frozenset({"adapterWarnings"})
    adapterWarnings: list[str] | None = None
    seededFrom: SeededFrom


class SpellFlags(_StoreModel):
    assay: AssayFlags


class SpellDoc(_StoreModel):
    """One `homebrew/spells/<slug>.json` file."""

    id: str = Field(alias="_id", pattern=r"^[A-Za-z0-9]{16}$")
    flags: SpellFlags
    name: str
    system: SpellSystem
    type: Literal["spell"]


class TraitDoc(_StoreModel):
    """One `homebrew/traits/<slug>.json` file: a name and a description, nothing else
    (codex turns any extra key into a column on every row that carries the trait)."""

    description: TextValue
    name: str


_MODELS: dict[str, type[_StoreModel]] = {SPELLS_SUBDIR: SpellDoc, TRAITS_SUBDIR: TraitDoc}


# ---------------------------------------------------------------------------
# Canonical format
# ---------------------------------------------------------------------------


class DuplicateKeyError(ValueError):
    """A JSON object repeats a key. Plain `json.loads` keeps the last value silently, so
    `fmt` would drop the first one; the store refuses the file instead."""


def _reject_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    doc: dict[str, Any] = {}
    for key, value in pairs:
        if key in doc:
            raise DuplicateKeyError(f"duplicate key {key!r}")
        doc[key] = value
    return doc


def parse_store_json(text: str) -> Any:
    """Parse a store file's text, raising `DuplicateKeyError` on a repeated key."""
    return json.loads(text, object_pairs_hook=_reject_duplicate_keys)


def canonical_json(doc: Any) -> str:
    """The canonical text of a store file: sorted keys, 2-space indent, non-ASCII text
    as-is, one trailing newline (the same rule as `astra_ontology.canonical_json`)."""
    return json.dumps(doc, sort_keys=True, ensure_ascii=False, indent=2) + "\n"


# ---------------------------------------------------------------------------
# check / fmt
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Problem:
    path: Path
    message: str


def store_files(root: Path) -> list[tuple[Path, type[_StoreModel]]]:
    """Every store file under `root`, sorted, with the model it must match. A missing or
    empty spells/ or traits/ directory is an error, never an empty store."""
    files: list[tuple[Path, type[_StoreModel]]] = []
    for subdir, model in _MODELS.items():
        paths = sorted((root / subdir).glob("*.json"))
        if not paths:
            raise SystemExit(f"assay store: no *.json files in {root / subdir}")
        files.extend((p, model) for p in paths)
    return files


def _validation_messages(err: ValidationError) -> list[str]:
    msgs = []
    for e in err.errors():
        loc = ".".join(str(part) for part in e["loc"]) or "(document)"
        msgs.append(f"{loc}: {e['msg']}")
    return msgs


def check_file(path: Path, model: type[_StoreModel]) -> list[Problem]:
    try:
        text = path.read_text(encoding="utf-8")
        doc = parse_store_json(text)
    except (UnicodeDecodeError, json.JSONDecodeError) as e:
        return [Problem(path, f"not valid UTF-8 JSON: {e}")]
    except DuplicateKeyError as e:
        return [Problem(path, f"{e} (fix it by hand: `fmt` won't pick a value)")]
    problems: list[Problem] = []
    try:
        model.model_validate(doc)
    except ValidationError as e:
        problems.extend(Problem(path, msg) for msg in _validation_messages(e))
    if text != canonical_json(doc):
        problems.append(Problem(path, "not canonically formatted (run `uv run assay store fmt`)"))
    return problems


def check_store(root: Path = STORE_ROOT) -> tuple[int, list[Problem]]:
    """`(files checked, problems)` for the whole store."""
    files = store_files(root)
    problems = [p for path, model in files for p in check_file(path, model)]
    return len(files), problems


def format_store(root: Path = STORE_ROOT) -> tuple[list[Path], list[Problem]]:
    """Rewrite every file whose text is not canonical, from its own parsed value.
    Returns `(rewritten paths, files that could not be parsed)`; an unparseable file is
    left untouched."""
    rewritten: list[Path] = []
    unparseable: list[Problem] = []
    for path, _model in store_files(root):
        try:
            text = path.read_text(encoding="utf-8")
            doc = parse_store_json(text)
        except (UnicodeDecodeError, json.JSONDecodeError) as e:
            unparseable.append(Problem(path, f"not valid UTF-8 JSON: {e}"))
            continue
        except DuplicateKeyError as e:
            unparseable.append(Problem(path, str(e)))
            continue
        canonical = canonical_json(doc)
        if text != canonical:
            path.write_text(canonical, encoding="utf-8")
            rewritten.append(path)
    return rewritten, unparseable


def _rel(path: Path) -> str:
    try:
        return str(path.relative_to(Path.cwd()))
    except ValueError:
        return str(path)


def cmd_store_check(args: argparse.Namespace) -> None:
    root = Path(args.root) if args.root else STORE_ROOT
    with _tracer.start_as_current_span("assay.store-check") as span:
        n, problems = check_store(root)
        bad = {p.path for p in problems}
        span.set_attribute("assay.store_check.files", n)
        span.set_attribute("assay.store_check.failing_files", len(bad))
        for p in problems:
            print(f"{_rel(p.path)}: {p.message}")  # noqa: T201 -- command-line output
        if problems:
            raise SystemExit(
                f"assay store check: {len(bad)} of {n} files failed ({len(problems)} problems)"
            )
        print(f"assay store check: {n} files valid and canonically formatted")  # noqa: T201 -- command-line output


def cmd_store_fmt(args: argparse.Namespace) -> None:
    root = Path(args.root) if args.root else STORE_ROOT
    with _tracer.start_as_current_span("assay.store-fmt") as span:
        rewritten, unparseable = format_store(root)
        span.set_attribute("assay.store_fmt.rewritten", len(rewritten))
        span.set_attribute("assay.store_fmt.unparseable", len(unparseable))
        for path in rewritten:
            print(f"formatted {_rel(path)}")  # noqa: T201 -- command-line output
        for p in unparseable:
            print(f"{_rel(p.path)}: {p.message}")  # noqa: T201 -- command-line output
        if unparseable:
            raise SystemExit(f"assay store fmt: {len(unparseable)} files could not be parsed")
        print(f"assay store fmt: {len(rewritten)} files rewritten")  # noqa: T201 -- command-line output


def register_subparsers(sub: argparse._SubParsersAction) -> None:
    p_store = sub.add_parser(
        "store", help="the homebrew store: `check` validates it, `fmt` rewrites it canonically"
    )
    store_sub = p_store.add_subparsers(dest="store_command", required=True)
    for name, func, help_text in (
        (
            "check",
            cmd_store_check,
            "validate every store file against the model and check its format",
        ),
        ("fmt", cmd_store_fmt, "rewrite every store file in the canonical format"),
    ):
        p = store_sub.add_parser(name, help=help_text)
        p.add_argument(
            "--root",
            default=None,
            help="store root holding spells/ and traits/ (default apps/assay/py/homebrew)",
        )
        p.set_defaults(func=func)
