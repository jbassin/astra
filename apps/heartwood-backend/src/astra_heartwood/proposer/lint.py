"""Stage B — page-type detection + the machine tell-lint (spec §8, ported from faerrin
``voice-warnings.ts`` + ``page-type.ts``).

The tell-lint is *warnings, never an auto-reject* (faerrin's load-bearing principle — the human
is always the gate); the warnings drive the bounded revise pass (S4) and surface to the reviewer
in Phase 4. ``detect_page_type`` (S1) gates which lints apply: the prose-cadence tells
(``encyclopedia_opener``/``it_is_template``/``intensifier``) run only on ``lore``/``stub`` bodies;
``broken_wikilink``/``empty`` run on all. The revise loop lands in S4.
"""

from __future__ import annotations

import re

from astra_ontology_entity import resolve

from .corpus import split_frontmatter
from .models import PageType, VoiceWarning

#: Page types that are NOT prose — their bodies carry structured constructs (``@deity`` stat
#: blocks, ``@timeline`` entries, ``<pre>`` flavor) that a full-body ``call_text`` rewrite would
#: destroy. Phase 3 only rewrites ``lore``/``stub`` pages (P3.10); these are skipped-with-note.
NON_PROSE_TYPES: frozenset[PageType] = frozenset({"deity-statblock", "timeline", "flavor-pre"})

#: Page types that face the literary prose bar (a stub graduates to prose on its first paragraph).
PROSE_PAGE_TYPES: frozenset[PageType] = frozenset({"lore", "stub"})

#: The prose-cadence tells (vs broken_wikilink/empty) — only these trigger the bounded revise (§8).
PROSE_TELL_TYPES = frozenset({"encyclopedia_opener", "it_is_template", "intensifier"})

#: Warnings a bounded revise can plausibly fix (cadence tells + a drifted POV on an amendment).
REVISABLE_TYPES = PROSE_TELL_TYPES | frozenset({"pov_shift"})

#: Second-person address (the corpus uses it on several pages — a rewrite must preserve it, P3.16).
_SECOND_PERSON_RE = re.compile(r"\b(you|your|you're|yourself|yours)\b", re.IGNORECASE)


def is_second_person(text: str) -> bool:
    """True if the prose addresses the reader directly (a load-bearing POV signal, P3.16)."""
    return bool(_SECOND_PERSON_RE.search(text))


def pov_shift_warning(existing_body: str, passage: str) -> VoiceWarning | None:
    """Flag an appended passage whose POV drifts from the page it amends (rewrite-hardening).

    Only the clear, deterministic case: the existing page is second-person but the new passage is
    not. (3rd→2nd is not flagged — adding direct address to a 3rd-person page is rarely the error.)
    """
    if is_second_person(existing_body) and passage.strip() and not is_second_person(passage):
        return VoiceWarning(
            type="pov_shift",
            message="The existing page addresses the reader as 'you'; this added passage must too "
            "— rewrite it in the second person.",
        )
    return None


#: "{Name} is a/an/the {type}…" — the dictionary-entry cadence the house voice avoids (§8).
_OPENER_RE = re.compile(r"^\s*(?:\[\[)?[A-Z][\w'’ -]*?(?:\]\])?\s+is\s+(?:a|an|the)\s+\w+")
#: A second sentence opening "It is …" — the slop archetype's templated cadence.
_IT_IS_RE = re.compile(r"^it\s+is\b", re.IGNORECASE)
#: ``[[target]]`` / ``[[target|alias]]`` / ``[[target#anchor]]`` — group 1 is the bare target.
_WIKILINK_RE = re.compile(r"\[\[([^\[\]|#]+)(?:#[^\[\]|]+)?(?:\|[^\[\]]+)?\]\]")
#: Filler intensifiers used as meaningless volume (§8 list, ported verbatim).
_INTENSIFIERS = frozenset(
    {"large", "vast", "expansive", "numerous", "various", "many", "massive", "huge", "enormous"}
)


def _sentences(text: str) -> list[str]:
    """Naive sentence split — good enough for warnings (ported from faerrin)."""
    collapsed = re.sub(r"\s+", " ", text)
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", collapsed) if s.strip()]


def _broken_wikilinks(
    text: str,
    *,
    known_pages: frozenset[str],
    batch_pages: frozenset[str],
    batch_names: frozenset[str],
) -> list[VoiceWarning]:
    """Flag ``[[crossrefs]]`` that resolve to nothing (§8).

    A **path-form** target (contains ``/``) is checked against the known page set ∪ in-batch
    new-page paths; a **name-form** target is satisfied by an in-batch new-page canonical or a
    registry ``resolve()`` that is not ``unknown`` (resolved/ambiguous both name a real entity).
    """
    out: list[VoiceWarning] = []
    seen: set[str] = set()
    for match in _WIKILINK_RE.finditer(text):
        target = match.group(1).strip()
        if not target or target in seen:
            continue
        seen.add(target)
        if "/" in target:  # path-form
            ok = target in known_pages or target in batch_pages
        elif target in batch_names:  # name-form created in this same change-set
            ok = True
        else:
            ok = resolve(target).status != "unknown"
        if not ok:
            out.append(
                VoiceWarning(
                    type="broken_wikilink",
                    message=f"Wikilink target not found: {target}. "
                    "Check the page exists (or create it).",
                    hit=target,
                )
            )
    return out


def _prose_tells(text: str) -> list[VoiceWarning]:
    """The literary-cadence tells (suppressed on non-prose pages, §8)."""
    out: list[VoiceWarning] = []
    sents = _sentences(text)
    if sents and _OPENER_RE.search(sents[0]):
        out.append(
            VoiceWarning(
                type="encyclopedia_opener",
                message='Encyclopedia opener ("X is a/the …"). Lead with a point of view '
                "or tension, not the dictionary-entry cadence.",
            )
        )
    if len(sents) > 1 and _IT_IS_RE.search(sents[1]):
        out.append(
            VoiceWarning(
                type="it_is_template",
                message='"It is …" follow-on reads as templated. Vary the cadence.',
            )
        )
    seen: set[str] = set()
    for word in text.split():
        token = re.sub(r"[^a-z]", "", word.lower())
        if token in _INTENSIFIERS and token not in seen:
            seen.add(token)
            out.append(
                VoiceWarning(
                    type="intensifier",
                    message=f"Filler intensifier: {token}. "
                    "Prefer specific, consequence-bearing detail.",
                    hit=token,
                )
            )
    return out


def voice_warnings(
    text: str,
    *,
    page_type: PageType,
    known_pages: frozenset[str] = frozenset(),
    batch_pages: frozenset[str] = frozenset(),
    batch_names: frozenset[str] = frozenset(),
) -> list[VoiceWarning]:
    """Run the machine tell-lint over a draft body (§8). Warnings only — never a hard gate.

    ``broken_wikilink``/``empty`` apply to every page type; the prose-cadence tells apply only to
    ``lore``/``stub``. In-batch new pages (``batch_pages`` = their paths, ``batch_names`` = their
    canonicals) suppress false ``broken_wikilink`` warnings for sibling crossrefs created this run.
    """
    if not text.strip():
        return [VoiceWarning(type="empty", message="No prose written yet.")]
    out = _broken_wikilinks(
        text, known_pages=known_pages, batch_pages=batch_pages, batch_names=batch_names
    )
    if page_type in PROSE_PAGE_TYPES:
        out += _prose_tells(text)
    return out


def detect_page_type(text: str, *, path: str | None = None) -> PageType:
    """Classify a ``.vellum`` body (ported from faerrin ``page-type.ts``, P3.10).

    ``text`` may include frontmatter (it is stripped here). ``path`` lets the lone ``Timeline``
    page classify even when its body wouldn't. Order matters: structural markers win over length.
    """
    body = split_frontmatter(text)[1]
    stripped = body.strip()
    if path and path.split("/")[-1] == "Timeline":
        return "timeline"
    if "@timeline" in body or ":::timeline" in body:
        return "timeline"
    if "<pre" in body:
        return "flavor-pre"
    if "@deity" in body or ":::deity" in body:
        return "deity-statblock"
    if sum(1 for line in body.splitlines() if " :: " in line) >= 2:
        return "deity-statblock"
    if not stripped:
        return "stub"
    if len(stripped) < 40:
        return "stub"
    return "lore"
