"""Shared bodies for the RLM agents' read-only tools (heartwood ``HeartwoodTools`` and the
mouthpiece producer's ``ProducerTools``).

Both agents expose wiki search, transcript search and entity lookup with the same return
shapes and error rules (errors raise ``ValueError``; returns are plain JSON types, never
``None``). ``SessionToolsMixin`` holds those bodies once. Each agent class keeps its own
public methods, because a tool's docstring is its whole contract to the agent (the prompt
the model sees) and the two agents word theirs for their own context; each public method
is a one-line call into the mixin.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable
from typing import Any

from astra_llm.rlm import text_matcher
from astra_ontology import Resolution

from .transcripts import TRANSCRIPT_LINE

#: Cap on search results (wiki and transcript searches).
MAX_RESULTS = 200
#: How many ``resolve_name`` candidates to surface.
MAX_CANDIDATES = 5


class SessionToolsMixin:
    """The search and lookup bodies both RLM tool classes compose."""

    def _search_pages(
        self, pages: Iterable[tuple[str, str]], pattern: str, regex: bool
    ) -> list[dict[str, Any]]:
        """Up to ``MAX_RESULTS`` ``{'path', 'line', 'text'}`` hits over ``(path, source)``
        pairs, in the order given. ``pages`` is consumed lazily, so a source is read only
        until the cap is reached."""
        match = text_matcher(pattern, regex)
        hits: list[dict[str, Any]] = []
        for path, source in pages:
            for n, line in enumerate(source.splitlines(), start=1):
                if match(line):
                    hits.append({"path": path, "line": n, "text": line})
                    if len(hits) >= MAX_RESULTS:
                        return hits
        return hits

    def _search_transcripts(
        self, dates: Iterable[str], text_for: Callable[[str], str], pattern: str, regex: bool
    ) -> list[dict[str, Any]]:
        """Up to ``MAX_RESULTS`` ``{'date', 'line', 'speaker', 'text'}`` hits over the
        spoken text of each session in ``dates`` (in order); ``text_for(date)`` is the
        session's transcript."""
        match = text_matcher(pattern, regex)
        hits: list[dict[str, Any]] = []
        for date in dates:
            for raw in text_for(date).splitlines():
                m = TRANSCRIPT_LINE.match(raw)
                if m is None:
                    continue
                spoken = m.group(3).rstrip()
                if match(spoken):
                    hits.append(
                        {
                            "date": date,
                            "line": int(m.group(1)),
                            "speaker": m.group(2).strip(),
                            "text": spoken,
                        }
                    )
                    if len(hits) >= MAX_RESULTS:
                        return hits
        return hits

    def _resolve_name(
        self,
        name: str,
        resolver: Callable[[str], Resolution],
        page_exists: Callable[[str], bool],
    ) -> dict[str, Any]:
        """The ``resolve_name`` result for ``name``; ``page_exists`` is asked only for a
        non-empty page. Raises ``ValueError`` on an empty name."""
        if not isinstance(name, str) or not name.strip():
            raise ValueError("name must be a non-empty string")
        res = resolver(name)
        ent = res.entity
        page = (ent.page or "") if ent is not None else ""
        return {
            "status": res.status,
            "canonical": ent.canonical if ent is not None else "",
            "kind": (ent.kind or "") if ent is not None else "",
            "page": page,
            "page_exists": page_exists(page) if page else False,
            "confidence": round(float(res.confidence), 3),
            "candidates": [ref.canonical for ref, _ in res.candidates[:MAX_CANDIDATES]],
        }
