"""Import the earlier campaigns' transcripts from the old quartz site into astra-data.

The GM's second campaign (Deep Eyes) and two Færrin one-shots were recorded before astra
existed; their transcripts survive as quartz pages under
`/ruby/data/experiments/quartz/content/Script/Unsorted/<date>.md`. This one-off converts the
25 sessions in `SESSIONS` into the two files linguist publishes for a session:

- `linguist/transcripts/<NNN>.<slug>.<date>.txt`, the canonical transcript, built with
  linguist's own `build_context` and `to_canonical`. Each player is billed as their character
  in that campaign (each has one role there) and Josh as Gamemaster.
- `linguist/data/<date>.json`, the session JSON akasha's transcript pages read. quartz kept
  no line end times, so `duration` is the gap to the next line. An existing data file is
  kept, never replaced: the published ones for these dates already exist, written from the
  same recordings with real durations.

quartz wiki links are reduced to their text (`[[Geography/Calaria/index|Calaria]]` becomes
`Calaria`) and today's `defs.kdl` corrections are applied, as `stored_corrections` would.
The output root is an astra-data-shaped directory, never the live clone:

    uv run python apps/linguist/py/scripts/import_quartz.py <astra-data root>
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path

from astra_lexicon import Replacer, load_corrections
from astra_linguist.campaigns import (
    CampaignView,
    CharacterRole,
    MatchedCampaign,
    campaign_filename,
    campaign_views,
)
from astra_linguist.canonical import to_canonical
from astra_linguist.context import build_context
from astra_linguist.ingest import to_json
from astra_linguist.models import FormattedLine, Transcript
from astra_linguist.roster import SpeakerResolver
from astra_ontology import load_being
from astra_ontology.models import Being
from astra_ontology_being import BEING_KDL_PATH

QUARTZ_DIR = Path("/ruby/data/experiments/quartz/content/Script/Unsorted")
#: The live astra-data clone the bots publish from. This script never writes into it.
LIVE_CLONE = Path("/ruby/data/astra-state/astra-data")
#: The audio URL quartz and the published data files use (akasha normalizes it).
AUDIO_URL = "https://static-audio.iridi.cc/{date}/audio.mp3"
#: `duration` of a session's last line, which has no next line to measure against.
LAST_LINE_SECONDS = 1.0

_DEEP_EYES = [
    "2024-10-28",
    "2024-11-4",
    "2024-11-11",
    "2024-12-2",
    "2024-12-9",
    "2024-12-16",
    "2024-12-23",
    "2025-1-6",
    "2025-1-13",
    "2025-1-22",
    "2025-1-27",
    "2025-2-3",
    "2025-2-10",
    "2025-2-18",
    "2025-2-24",
    "2025-3-10",
    "2025-3-24",
    "2025-3-31",
    "2025-4-7",
    "2025-4-17",
    "2025-4-21",
    "2025-5-5",
    "2025-5-12",
]
#: session date → being.kdl campaign slug. Every other quartz transcript (Starfinder, The
#: Blue Remains, Tanner's one-shot, the empty stubs) is outside the Astra and stays out.
SESSIONS: dict[str, str] = {
    "2024-10-21": "the-midnight-sun",
    "2024-11-20": "hildebrandt-heist",
    **dict.fromkeys(_DEEP_EYES, "deep-eyes"),
}

_LINK = re.compile(r"\[\[([^\]|]*)(?:\|([^\]]*))?\]\]")
_AUDIO = re.compile(r'^::transcript-audio\{date="([^"]*)" audio="([^"]*)"\}$', re.M)
_BLOCK = re.compile(r"^:::transcript-line\{([^}]*)\}\n(.*?)^:::$", re.M | re.S)
_ATTR = re.compile(r'(\w+)="([^"]*)"')


@dataclass(frozen=True)
class QuartzLine:
    second: float
    start: str
    user: str  # the player's display name ("Josh", "Noah")
    text: str


@dataclass(frozen=True)
class QuartzSession:
    date: str
    lines: list[QuartzLine]


def strip_links(text: str) -> str:
    """`[[target|label]]` becomes `label`; `[[target]]` the target's last path segment."""

    def label(m: re.Match[str]) -> str:
        if m.group(2) is not None:
            return m.group(2)
        return m.group(1).split("/")[-1]

    return _LINK.sub(label, text)


def parse_quartz(text: str) -> QuartzSession:
    """A quartz transcript page → its date and speech lines (text may span lines)."""
    audio = _AUDIO.search(text)
    if audio is None:
        raise ValueError("no ::transcript-audio line")
    lines: list[QuartzLine] = []
    for block in _BLOCK.finditer(text):
        attrs = dict(_ATTR.findall(block.group(1)))
        body = " ".join(part.strip() for part in block.group(2).splitlines() if part.strip())
        lines.append(
            QuartzLine(
                second=float(attrs["second"]),
                start=attrs["start"],
                user=attrs["user"],
                text=strip_links(body),
            )
        )
    return QuartzSession(date=audio.group(1), lines=lines)


def to_transcript(session: QuartzSession, replace: Replacer, being: Being) -> Transcript:
    """The session as linguist's `Transcript`: corrected text, `{name, color}` speakers, and
    each line's duration measured to the next line."""
    resolver = SpeakerResolver({p.name: p.name for p in being.players})
    script: list[FormattedLine] = []
    for i, line in enumerate(session.lines):
        following = session.lines[i + 1].second if i + 1 < len(session.lines) else None
        duration = LAST_LINE_SECONDS if following is None else round(following - line.second, 3)
        script.append(
            FormattedLine(
                start=line.start,
                second=line.second,
                text=replace(line.text),
                user=resolver.resolve(line.user),
                duration=duration,
            )
        )
    return Transcript(date=session.date, audio=AUDIO_URL.format(date=session.date), script=script)


def roster_billing(view: CampaignView) -> dict[str, CharacterRole]:
    """Player display name → their one role in the campaign. A player with several roles
    would need a per-session choice, which these campaigns do not: refuse rather than guess."""
    billing: dict[str, CharacterRole] = {}
    for player, roles in view.roles.items():
        if len(roles) != 1:
            names = ", ".join(r.name for r in roles)
            raise ValueError(f"{player} has {len(roles)} roles in {view.name} ({names})")
        billing[player] = roles[0]
    return billing


@dataclass(frozen=True)
class Converted:
    stem: str  # `<NNN>.<slug>`
    transcript: Transcript
    canonical: str
    billing: dict[str, CharacterRole]


def convert(session: QuartzSession, slug: str, being: Being, replace: Replacer) -> Converted:
    """One quartz session → its canonical transcript and session JSON for campaign `slug`."""
    idx = next(i for i, c in enumerate(being.campaigns) if c.slug == slug)
    view = campaign_views(being)[idx]
    transcript = to_transcript(session, replace, being)
    billing = roster_billing(view)
    matched = MatchedCampaign(campaign=view, idx=idx, billing=billing)
    stem = campaign_filename(matched)
    if stem.split(".", 1)[1] != slug:
        raise ValueError(f"campaign {slug!r} files as {stem!r}: the show would not resolve")
    canonical = to_canonical(build_context(transcript, matched))
    return Converted(stem=stem, transcript=transcript, canonical=canonical, billing=billing)


def refuse_live_clone(root: Path) -> None:
    root = root.resolve()
    live = LIVE_CLONE.resolve()
    if root == live or root.is_relative_to(live):
        raise SystemExit(f"refusing to write into the live clone {LIVE_CLONE}")


def _billed(converted: Converted, player: str) -> str:
    role = converted.billing.get(player)
    return player if role is None else role.name


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Import the earlier campaigns from quartz.")
    parser.add_argument("root", type=Path, help="the astra-data-shaped output directory")
    parser.add_argument("--quartz-dir", type=Path, default=QUARTZ_DIR)
    args = parser.parse_args(argv)
    refuse_live_clone(args.root)

    missing = [d for d in SESSIONS if not (args.quartz_dir / f"{d}.md").is_file()]
    if missing:
        print(f"missing quartz transcripts: {', '.join(missing)}", file=sys.stderr)
        return 1

    being = load_being(BEING_KDL_PATH)
    replace = load_corrections()
    transcripts_dir = args.root / "linguist" / "transcripts"
    data_dir = args.root / "linguist" / "data"
    transcripts_dir.mkdir(parents=True, exist_ok=True)
    data_dir.mkdir(parents=True, exist_ok=True)

    for date, slug in SESSIONS.items():
        session = parse_quartz((args.quartz_dir / f"{date}.md").read_text(encoding="utf-8"))
        if session.date != date:
            print(f"{date}: the page says {session.date}", file=sys.stderr)
            return 1
        converted = convert(session, slug, being, replace)
        (transcripts_dir / f"{converted.stem}.{date}.txt").write_text(
            converted.canonical, encoding="utf-8"
        )
        data_path = data_dir / f"{date}.json"
        if data_path.exists():
            data = "kept"
        else:
            data_path.write_text(to_json(converted.transcript), encoding="utf-8")
            data = "written"
        speakers = {line.user.name for line in converted.transcript.script}
        billed = ", ".join(f"{p}={_billed(converted, p)}" for p in sorted(speakers))
        print(f"{converted.stem}.{date}: {len(session.lines)} lines, data {data}; {billed}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
