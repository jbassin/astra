"""Typed metadata — the same field set the TS reference parser exposes (parity contract)."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class Frontmatter(BaseModel):
    title: str | None = None
    tags: list[str] = []
    aliases: list[str] = []
    img: str | None = None
    extra: dict[str, Any] = {}


class CrossRef(BaseModel):
    target: str
    alias: str | None = None
    heading: str | None = None


class Metadata(BaseModel):
    frontmatter: Frontmatter
    crossrefs: list[CrossRef]
