"""The homebrew store model, canonical format, and `store check` / `store fmt`.

The real-store tests read the committed store read-only; every test that writes works on a
temporary copy of a few real files."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest
from astra_assay import store
from astra_assay.cli import build_parser

REAL_SPELLS = store.STORE_ROOT / store.SPELLS_SUBDIR
REAL_TRAITS = store.STORE_ROOT / store.TRAITS_SUBDIR


def _load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.fixture
def tmp_store(tmp_path: Path) -> Path:
    """A small store copied from real files, rewritten canonically: one spell with fixed
    heightening, one with `heightening: {}`, one ritual, one without adapterWarnings, and
    one trait."""
    root = tmp_path / "homebrew"
    (root / "spells").mkdir(parents=True)
    (root / "traits").mkdir()
    for slug in ("time-loop", "shape-modify-speed", "hellforging", "monstrous-copy-claws"):
        doc = _load(REAL_SPELLS / f"{slug}.json")
        (root / "spells" / f"{slug}.json").write_text(store.canonical_json(doc), encoding="utf-8")
    trait = sorted(REAL_TRAITS.glob("*.json"))[0]
    (root / "traits" / trait.name).write_text(store.canonical_json(_load(trait)), encoding="utf-8")
    return root


def _messages(root: Path) -> list[str]:
    _, problems = store.check_store(root)
    return [p.message for p in problems]


def test_every_real_store_file_matches_its_model() -> None:
    files = store.store_files(store.STORE_ROOT)
    assert len([p for p, m in files if m is store.SpellDoc]) == 173
    assert len([p for p, m in files if m is store.TraitDoc]) == 8
    for path, model in files:
        model.model_validate(_load(path))


def test_canonical_json_is_the_repo_convention() -> None:
    doc = {"b": 1, "a": {"d": "Ætherial – “quoted”", "c": [2, 1]}}
    text = store.canonical_json(doc)
    assert text == (
        '{\n  "a": {\n    "c": [\n      2,\n      1\n    ],\n'
        '    "d": "Ætherial – “quoted”"\n  },\n  "b": 1\n}\n'
    )
    assert json.loads(text) == doc


def test_a_canonical_store_passes(tmp_store: Path) -> None:
    n, problems = store.check_store(tmp_store)
    assert (n, problems) == (5, [])


@pytest.mark.parametrize(
    ("mutate", "expected"),
    [
        (lambda d: d["system"].update(school="x"), "system.school: Extra inputs are not permitted"),
        (lambda d: d["system"]["level"].update(value="3"), "system.level.value: Input should be"),
        (lambda d: d["system"].update(ritual=None), "ritual: omit the key instead of null"),
        (lambda d: d["system"].pop("requirements"), "system.requirements: Field required"),
        (lambda d: d.update(_id="short"), "_id: String should match pattern"),
        (lambda d: d.update(type="feat"), "type: Input should be 'spell'"),
        (
            lambda d: d["system"]["traits"].update(rarity="legendary"),
            "system.traits.rarity: Input should be",
        ),
    ],
)
def test_check_reports_schema_problems(tmp_store: Path, mutate, expected: str) -> None:
    path = tmp_store / "spells" / "time-loop.json"
    doc = _load(path)
    mutate(doc)
    path.write_text(store.canonical_json(doc), encoding="utf-8")
    messages = _messages(tmp_store)
    assert any(expected in m for m in messages), messages


def test_check_rejects_an_extra_trait_key(tmp_store: Path) -> None:
    path = next((tmp_store / "traits").glob("*.json"))
    doc = _load(path)
    doc["level"] = 1
    path.write_text(store.canonical_json(doc), encoding="utf-8")
    assert any("level: Extra inputs are not permitted" in m for m in _messages(tmp_store))


@pytest.mark.parametrize(
    "rewrite",
    [
        lambda d: json.dumps(d, indent=2, sort_keys=True) + "\n",  # ASCII-escaped
        lambda d: json.dumps(d, indent=2, sort_keys=True, ensure_ascii=False),  # no newline
        lambda d: json.dumps(d, indent=2, ensure_ascii=False) + "\n",  # insertion order
        lambda d: json.dumps(d, indent=4, sort_keys=True, ensure_ascii=False) + "\n",
    ],
)
def test_check_and_fmt_handle_non_canonical_text(tmp_store: Path, rewrite) -> None:
    path = tmp_store / "spells" / "time-loop.json"
    doc = _load(path)
    doc = {"system": doc["system"], **{k: v for k, v in doc.items() if k != "system"}}
    path.write_text(rewrite(doc), encoding="utf-8")
    assert _messages(tmp_store) == ["not canonically formatted (run `uv run assay store fmt`)"]

    rewritten, unparseable = store.format_store(tmp_store)

    assert (rewritten, unparseable) == ([path], [])
    assert _load(path) == doc
    assert store.check_store(tmp_store)[1] == []


def test_fmt_leaves_canonical_files_alone(tmp_store: Path) -> None:
    before = {p: p.stat().st_mtime_ns for p in tmp_store.rglob("*.json")}
    assert store.format_store(tmp_store) == ([], [])
    assert {p: p.stat().st_mtime_ns for p in tmp_store.rglob("*.json")} == before


def test_unparseable_file_is_reported_and_left_untouched(tmp_store: Path) -> None:
    path = tmp_store / "spells" / "time-loop.json"
    path.write_text('{"name": ', encoding="utf-8")
    assert any(m.startswith("not valid UTF-8 JSON") for m in _messages(tmp_store))
    _, unparseable = store.format_store(tmp_store)
    assert [p.path for p in unparseable] == [path]
    assert path.read_text(encoding="utf-8") == '{"name": '


def test_a_duplicate_key_fails_check_and_fmt_leaves_the_file_alone(tmp_store: Path) -> None:
    path = tmp_store / "spells" / "time-loop.json"
    text = path.read_text(encoding="utf-8")
    # A repeated top-level key: plain json.loads would keep the second value silently.
    dup = text.replace("{\n", '{\n  "type": "spell",\n', 1)
    assert dup != text
    path.write_text(dup, encoding="utf-8")
    assert any("duplicate key 'type'" in m for m in _messages(tmp_store))
    rewritten, unparseable = store.format_store(tmp_store)
    assert rewritten == []
    assert [(p.path, p.message) for p in unparseable] == [(path, "duplicate key 'type'")]
    assert path.read_text(encoding="utf-8") == dup


def test_a_nested_duplicate_key_is_rejected() -> None:
    with pytest.raises(store.DuplicateKeyError, match="duplicate key 'a'"):
        store.parse_store_json('{"x": {"a": 1, "a": 2}}')


def test_an_empty_store_directory_is_an_error(tmp_store: Path) -> None:
    for p in (tmp_store / "traits").glob("*.json"):
        p.unlink()
    with pytest.raises(SystemExit, match=r"no \*\.json files"):
        store.check_store(tmp_store)


def test_store_commands_are_registered() -> None:
    for command in ("check", "fmt"):
        args = build_parser().parse_args(["store", command, "--root", "/x"])
        assert args.func in (store.cmd_store_check, store.cmd_store_fmt)
        assert args.root == "/x"


def test_store_check_command_exits_non_zero_on_a_problem(
    tmp_store: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    args = build_parser().parse_args(["store", "check", "--root", str(tmp_store)])
    args.func(args)
    assert "5 files valid" in capsys.readouterr().out

    shutil.copy(tmp_store / "spells" / "time-loop.json", tmp_store / "spells" / "copy.json")
    path = tmp_store / "spells" / "copy.json"
    path.write_text(path.read_text(encoding="utf-8").rstrip("\n"), encoding="utf-8")
    with pytest.raises(SystemExit, match="1 of 6 files failed"):
        args.func(args)
