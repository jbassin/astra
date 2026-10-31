"""The schema of `sessions.kdl`, ontology-being's per-session overrides.

`being.kdl` says who plays whom; `sessions.kdl` holds the GM's corrections for single
sessions, which the pipeline reads instead of guessing:

    session "2025-8-11" skip=#true {
        note "The Blue Remains: a different campaign with the same players."
    }
    session "2026-10-19-recap-of-2025-8-28" kind="special"
    session "2026-9-7" title="The Night the Bell Rang Twice"
    session "2026-9-3" campaign="urth"

The argument is a session key (`YYYY-M-D`, not zero-padded) or, for a recap or special
episode, the date token of its id (`<last>-recap-of-<first>`). Properties, all optional:

* `skip=#true`: the session is not part of any show. The chronicle leaves it out (no
  episode summary, no season), heartwood never ingests it, and mouthpiece does not launch
  an episode for it. Its transcripts are still written.
* `kind`: the episode's kind (`session`, `recap` or `special`), over what its files say.
* `title`: the podcast episode title the catalog publishes, over the generated one.
* `campaign`: the `being.kdl` campaign slug the session belongs to. linguist files its
  transcript under that campaign (and bills from its roles), the chronicle and heartwood
  read it as the session's show, and akasha files the transcript page there, instead of
  guessing from character names or the transcript filename. It cannot be combined with
  `skip=#true`.

A `note` child records why. An unknown property, a malformed key, a repeated key, a
`campaign` that `being.kdl` does not list, or `skip` with `campaign` fails the load, so a
typo cannot silently do nothing. The campaign check needs the roster: pass ``campaigns``
to the loaders (ontology-being's `session_overrides()` does).
"""

from __future__ import annotations

import re
from collections.abc import Collection
from pathlib import Path
from typing import Annotated, Literal

from astra_config.kdl import Arg, Children, Prop, decode, load_kdl, parse_kdl
from pydantic import BaseModel, ConfigDict, field_validator, model_validator

__all__ = [
    "EpisodeKind",
    "SessionOverride",
    "SessionOverrides",
    "episode_key",
    "load_session_overrides",
    "parse_session_overrides",
]

#: What an episode is. ``session`` recaps one recorded session and is
#: numbered in its arc; ``recap`` (a multi-session capstone) and ``special`` (the
#: prediction roundtable, say) have no transcript of their own, are not numbered, and are
#: never read as a prior session.
EpisodeKind = Literal["session", "recap", "special"]

_DATE = r"\d{4}-\d{1,2}-\d{1,2}"
_KEY = re.compile(rf"^{_DATE}(-recap-of-{_DATE})?$")


def episode_key(episode_id: str) -> str:
    """The `sessions.kdl` key of an episode id: its last dotted segment
    (`000.show.2026-9-7` → `2026-9-7`; a date-keyed id is its own key)."""
    return episode_id.rsplit(".", 1)[-1]


class SessionOverride(BaseModel):
    """One `session` node."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    key: Annotated[str, Arg()]
    skip: Annotated[bool, Prop()] = False
    kind: Annotated[EpisodeKind | None, Prop()] = None
    title: Annotated[str | None, Prop()] = None
    campaign: Annotated[str | None, Prop()] = None
    note: str | None = None

    @field_validator("key")
    @classmethod
    def _session_key(cls, key: str) -> str:
        if not _KEY.match(key):
            raise ValueError(
                f"{key!r} is not a session key (YYYY-M-D) or a recap token (<date>-recap-of-<date>)"
            )
        return key

    @field_validator("title")
    @classmethod
    def _non_empty_title(cls, title: str | None) -> str | None:
        if title is not None and not title.strip():
            raise ValueError("title must not be empty")
        return title

    @field_validator("campaign")
    @classmethod
    def _non_empty_campaign(cls, campaign: str | None) -> str | None:
        if campaign is not None and not campaign.strip():
            raise ValueError("campaign must not be empty")
        return campaign

    @model_validator(mode="after")
    def _skip_or_campaign(self) -> SessionOverride:
        if self.skip and self.campaign is not None:
            raise ValueError(
                f"session {self.key!r} is both skipped and filed under {self.campaign!r}: "
                "a skipped session belongs to no campaign"
            )
        return self


class SessionOverrides(BaseModel):
    """Every override in `sessions.kdl`, looked up by session key or episode id."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    sessions: Annotated[list[SessionOverride], Children("session")] = []

    @model_validator(mode="after")
    def _unique_keys(self) -> SessionOverrides:
        seen: set[str] = set()
        for entry in self.sessions:
            if entry.key in seen:
                raise ValueError(f"session {entry.key!r} appears twice")
            seen.add(entry.key)
        return self

    def get(self, key: str) -> SessionOverride | None:
        """The override for a session key or recap token, if any."""
        return next((s for s in self.sessions if s.key == key), None)

    def for_episode(self, episode_id: str) -> SessionOverride | None:
        """The override for an episode id (`episode_key`)."""
        return self.get(episode_key(episode_id))

    def skipped(self, key: str) -> bool:
        """True when `sessions.kdl` marks this session `skip=#true`."""
        entry = self.get(key)
        return entry is not None and entry.skip

    @property
    def skipped_keys(self) -> frozenset[str]:
        return frozenset(s.key for s in self.sessions if s.skip)

    def campaign(self, key: str) -> str | None:
        """The campaign slug `sessions.kdl` files this session under, if any."""
        entry = self.get(key)
        return entry.campaign if entry is not None else None

    def check_campaigns(self, campaigns: Collection[str]) -> SessionOverrides:
        """Raise `ValueError` when a `campaign=` names a slug not in ``campaigns``."""
        known = set(campaigns)
        for entry in self.sessions:
            if entry.campaign is not None and entry.campaign not in known:
                raise ValueError(
                    f"session {entry.key!r} names campaign {entry.campaign!r}, "
                    f"which being.kdl does not list (known: {', '.join(sorted(known))})"
                )
        return self


def parse_session_overrides(
    text: str, *, source: str = "sessions.kdl", campaigns: Collection[str] | None = None
) -> SessionOverrides:
    """Parse and validate `sessions.kdl` text (raises `KdlDecodeError` or `ValueError`).
    With ``campaigns`` (the `being.kdl` slugs), an unknown `campaign=` raises too."""
    overrides = decode(SessionOverrides, parse_kdl(text, source=source))
    return overrides if campaigns is None else overrides.check_campaigns(campaigns)


def load_session_overrides(
    path: str | Path, *, campaigns: Collection[str] | None = None
) -> SessionOverrides:
    """Load `sessions.kdl`. A missing file raises: silently reading no overrides would
    put a skipped session back into the chronicle. With ``campaigns`` (the `being.kdl`
    slugs), an unknown `campaign=` raises too."""
    overrides = decode(SessionOverrides, load_kdl(path))
    return overrides if campaigns is None else overrides.check_campaigns(campaigns)
