"""The shared typed KDL decoder (`astra_config.kdl`): field markers, required-field errors
that name the node path, strictness, and the `kdl_quote` escaper."""

from __future__ import annotations

from typing import Annotated

import pytest
from astra_config import SecretRef
from astra_config.kdl import (
    Arg,
    Children,
    KdlDecodeError,
    Prop,
    decode,
    kdl_quote,
    parse_kdl,
)
from pydantic import BaseModel, ConfigDict


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True)


class Option(_Strict):
    label: Annotated[str, Arg()]
    correct: Annotated[bool, Prop()] = False


class Question(_Strict):
    text: Annotated[str, Arg()]
    time: Annotated[int, Prop()] = 20
    options: Annotated[list[Option], Children("option")]


class Settings(_Strict):
    title: str
    tags: list[str] = []
    token: SecretRef | None = None


class Doc(_Strict):
    settings: Settings
    questions: Annotated[list[Question], Children("question")] = []


def _decode(text: str) -> Doc:
    return decode(Doc, parse_kdl(text, source="test.kdl"))


def test_markers_map_args_props_children_and_leaves() -> None:
    doc = _decode(
        """
        settings {
            title "Quiz"
            tags "a"
            token ref="sops:QUIZ_TOKEN"
        }
        question "Two?" time=30 {
            option "yes" correct=#true
            option "no"
        }
        """
    )
    assert doc.settings.title == "Quiz"
    assert doc.settings.tags == ["a"]  # a list field takes the args even when there is one
    assert isinstance(doc.settings.token, SecretRef)
    assert doc.settings.token.config_key == "settings.token"
    (q,) = doc.questions
    assert (q.text, q.time) == ("Two?", 30)
    assert [(o.label, o.correct) for o in q.options] == [("yes", True), ("no", False)]


def test_missing_required_child_names_the_node_path() -> None:
    with pytest.raises(KdlDecodeError, match=r"^test\.kdl: settings > title: missing") as err:
        _decode('settings {\n    tags "a"\n}\n')
    assert "None" not in str(err.value)


def test_missing_required_arg_names_the_node_path() -> None:
    text = 'settings {\n    title "t"\n}\nquestion "Q" {\n    option correct=#true\n}\n'
    with pytest.raises(KdlDecodeError, match=r'test\.kdl: question "Q" > option: argument 0'):
        _decode(text)


def test_a_bare_leaf_is_not_the_string_none() -> None:
    with pytest.raises(KdlDecodeError, match=r"settings > title: Input should be a valid string"):
        _decode("settings {\n    title\n}\n")


def test_wrong_type_names_the_property() -> None:
    text = 'settings {\n    title "t"\n}\nquestion "Q" time="soon" {\n}\n'
    with pytest.raises(KdlDecodeError, match=r'question "Q": property time='):
        _decode(text)


def test_forbid_rejects_unknown_nodes_props_and_args() -> None:
    with pytest.raises(KdlDecodeError, match=r"settings > colour.*unknown node"):
        _decode('settings {\n    title "t"\n    colour "red"\n}\n')
    with pytest.raises(KdlDecodeError, match=r"unknown property shape="):
        _decode('settings {\n    title "t"\n}\nquestion "Q" shape="x"\n')
    with pytest.raises(KdlDecodeError, match=r"2 arguments; expected 1"):
        _decode('settings {\n    title "t"\n}\nquestion "Q" "extra"\n')


def test_a_repeated_single_child_is_rejected() -> None:
    with pytest.raises(KdlDecodeError, match=r"settings > title.*repeated"):
        _decode('settings {\n    title "a"\n    title "b"\n}\n')


def test_default_extra_ignores_unknown_nodes() -> None:
    class Loose(BaseModel):
        title: str

    assert decode(Loose, parse_kdl('title "t"\nother 1\n')).title == "t"


@pytest.mark.parametrize("value", ["plain", 'back\\slash "quoted"', "two\nlines\ttab\r", "\x01"])
def test_kdl_quote_round_trips(value: str) -> None:
    class One(BaseModel):
        v: str

    quoted = kdl_quote(value)
    assert "\n" not in quoted
    assert decode(One, parse_kdl(f"v {quoted}\n")).v == value
