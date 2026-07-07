"""Stage 5 — assemble: clips → one normalized `episode.mp3` + `transcript.md`
(ported from caster `assemble/`). The arg-builders + gap/concat/transcript logic
are PURE (unit-testable without ffmpeg on PATH, like scribe `audio.py`); the
`run_ffmpeg` subprocess seam is injected. "turns" mode = jittered faded per-turn
silence; "dialogue" mode = pre-paced chunks + a uniform gap. Both apply EBU R128.
"""

from __future__ import annotations

import json
import random
import subprocess
import tempfile
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from .models import AudioManifest, Script, SpeakerId

#: EBU R128 podcast loudness target.
LOUDNORM = "loudnorm=I=-16:TP=-1.5:LRA=11"
DEFAULT_BED_GAIN = 0.22
DEFAULT_FADE_IN_MS = 10
DEFAULT_FADE_OUT_MS = 80
DEFAULT_CHUNK_GAP_MS = 300

_BASE = ["ffmpeg", "-hide_banner", "-y"]


@dataclass(slots=True)
class AudioParams:
    sample_rate: int
    channels: int
    codec: str


@dataclass(slots=True)
class BedOptions:
    path: str
    gain: float
    total_ms: int
    start_offset_sec: float = 0.0


# ── ffmpeg arg-builders (pure) ───────────────────────────────────────────────


def probe_args(path: str) -> list[str]:
    """ffprobe argv that prints a clip's audio stream params as JSON."""
    return [
        "ffprobe", "-v", "error", "-select_streams", "a:0",
        "-show_entries", "stream=sample_rate,channels,codec_name", "-of", "json", path,
    ]  # fmt: skip


def parse_probe(stdout: str) -> AudioParams:
    """Parse ffprobe JSON → AudioParams (with faerrin's defaults)."""
    streams = json.loads(stdout).get("streams") or [{}]
    s = streams[0]
    return AudioParams(
        sample_rate=int(s.get("sample_rate") or 24000),
        channels=int(s.get("channels") or 1),
        codec=s["codec_name"] if isinstance(s.get("codec_name"), str) else "mp3",
    )


def _codec_args(fmt: str, bitrate: str = "128k") -> list[str]:
    return ["-c:a", "libmp3lame", "-b:a", bitrate] if fmt == "mp3" else ["-c:a", "pcm_s16le"]


def make_silence_args(path: str, ms: int, params: AudioParams, fmt: str) -> list[str]:
    """ffmpeg argv generating a silence clip matching `params`, in `fmt`."""
    seconds = f"{ms / 1000:.3f}"
    layout = "mono" if params.channels == 1 else "stereo"
    src = f"anullsrc=channel_layout={layout}:sample_rate={params.sample_rate}"
    return [
        *_BASE, "-f", "lavfi", "-i", src, "-t", seconds,
        "-ac", str(params.channels), "-ar", str(params.sample_rate),
        *_codec_args(fmt, "48k"), path,
    ]  # fmt: skip


def fade_args(
    src: str, dst: str, params: AudioParams, fmt: str, fade_in_ms: int, fade_out_ms: int
) -> list[str]:
    """ffmpeg argv: copy a clip with a short fade-in/out (out-fade via areverse)."""
    in_sec = f"{fade_in_ms / 1000:.3f}"
    out_sec = f"{fade_out_ms / 1000:.3f}"
    af = f"areverse,afade=t=in:st=0:d={out_sec},areverse,afade=t=in:st=0:d={in_sec}"
    return [
        *_BASE, "-i", src, "-af", af,
        "-ac", str(params.channels), "-ar", str(params.sample_rate), *_codec_args(fmt), dst,
    ]  # fmt: skip


def bed_filter(bed: BedOptions) -> str:
    """filter_complex mixing a low ambient bed UNDER the loudnorm'd dialogue."""
    fade_out_start = f"{max(0.0, bed.total_ms / 1000 - 3):.3f}"
    return (
        f"[0:a]{LOUDNORM},aresample=44100,aformat=channel_layouts=stereo[spx];"
        f"[1:a]aresample=44100,aformat=channel_layouts=stereo,volume={bed.gain},"
        f"afade=t=in:st=0:d=2,afade=t=out:st={fade_out_start}:d=3[bed];"
        f"[spx][bed]amix=inputs=2:duration=first:normalize=0[mix];"
        f"[mix]alimiter=limit=0.85[out]"
    )


def concat_loudnorm_args(list_path: str, out_path: str, bed: BedOptions | None = None) -> list[str]:
    """ffmpeg argv: concat the list + EBU R128 loudnorm → 128 kbps mp3 (bed optional)."""
    if bed is None:
        return [
            *_BASE, "-f", "concat", "-safe", "0", "-i", list_path,
            "-af", LOUDNORM, "-c:a", "libmp3lame", "-b:a", "128k", "-ar", "44100", out_path,
        ]  # fmt: skip
    off = f"{bed.start_offset_sec:.3f}"
    return [
        *_BASE, "-f", "concat", "-safe", "0", "-i", list_path, "-ss", off, "-i", bed.path,
        "-filter_complex", bed_filter(bed), "-map", "[out]",
        "-c:a", "libmp3lame", "-b:a", "128k", "-ar", "44100", out_path,
    ]  # fmt: skip


# ── gaps + concat list (pure) ────────────────────────────────────────────────


@dataclass(slots=True)
class GapOptions:
    within_ms: int = 200
    change_ms: int = 400
    jitter_ms: int = 100
    quantize_ms: int = 50
    min_ms: int = 100
    max_ms: int = 800


DEFAULT_GAP_OPTIONS = GapOptions()


def compute_gaps(
    speakers: list[SpeakerId],
    opts: GapOptions = DEFAULT_GAP_OPTIONS,
    rng: Callable[[], float] | None = None,
) -> list[int]:
    """Inter-turn gap (ms) after each turn except the last — shorter within a
    speaker's run, longer on a change, with quantized jitter. `rng` injectable."""
    roll = rng if rng is not None else random.random
    gaps: list[int] = []
    for i in range(len(speakers) - 1):
        changed = speakers[i + 1] != speakers[i]
        base = opts.change_ms if changed else opts.within_ms
        jitter = (roll() * 2 - 1) * opts.jitter_ms
        quantized = round((base + jitter) / opts.quantize_ms) * opts.quantize_ms
        gaps.append(max(opts.min_ms, min(opts.max_ms, quantized)))
    return gaps


def _esc(path: str) -> str:
    return path.replace("'", "'\\''")


def build_concat_list(
    clip_paths: list[str], gap_ms: list[int], silence_path: Callable[[int], str]
) -> str:
    """ffmpeg concat-demuxer list interleaving clips with silence segments."""
    lines: list[str] = []
    for i, clip in enumerate(clip_paths):
        lines.append(f"file '{_esc(clip)}'")
        if i < len(gap_ms):
            lines.append(f"file '{_esc(silence_path(gap_ms[i]))}'")
    return "\n".join(lines) + "\n"


# ── transcript (pure) ────────────────────────────────────────────────────────


def render_transcript(script: Script) -> str:
    """Render a readable Markdown transcript (delivery shown as inline v3 tags)."""

    def name_of(s: SpeakerId) -> str:
        return script.hosts.by_id(s).name

    hosts = script.hosts
    byline = [f"{hosts.a.name} (the Recapper)", f"{hosts.b.name} (the grounded foil)"]
    if hosts.c is not None:  # legacy three-host episodes
        byline.append(f"{hosts.c.name} (the Instigator)")
    lines = [
        f"# {script.title}",
        "",
        f"*Hosts: {' · '.join(byline)}*",
        "",
    ]
    for turn in script.turns:
        text = f"[{turn.emotion}] {turn.text}" if turn.emotion else turn.text
        lines.append(f"**{name_of(turn.speaker)}:** {text}")
        lines.append("")
    return "\n".join(lines)


def bed_offset(session_id: str) -> int:
    """Deterministic seek (seconds) into the bed from the session id (any string id
    hashes fine, incl. historical synthetic recap ids). Bounded well under the bed length."""
    h = 0
    for ch in session_id:
        h = (h * 31 + ord(ch)) & 0xFFFFFFFF
    return h % 7000


# ── orchestration (subprocess injected) ──────────────────────────────────────


def run_ffmpeg(args: list[str]) -> subprocess.CompletedProcess[str]:
    """Run an ffmpeg/ffprobe argv. ffmpeg is a runtime dep (local + Dagster image)."""
    return subprocess.run(args, capture_output=True, text=True, check=True)


FfmpegRunner = Callable[[list[str]], subprocess.CompletedProcess[str]]


def assemble_episode(
    manifest: AudioManifest,
    script: Script,
    *,
    out_dir: Path | str,
    bed: BedOptions | None = None,
    gap_options: GapOptions = DEFAULT_GAP_OPTIONS,
    fade_in_ms: int = DEFAULT_FADE_IN_MS,
    fade_out_ms: int = DEFAULT_FADE_OUT_MS,
    chunk_gap_ms: int = DEFAULT_CHUNK_GAP_MS,
    rng: Callable[[], float] | None = None,
    run: FfmpegRunner = run_ffmpeg,
) -> tuple[Path, Path]:
    """Stitch a session's clips into one normalized episode + write a transcript.
    Returns (episode_path, transcript_path). Requires ffmpeg/ffprobe on PATH."""
    if not manifest.clips:
        raise ValueError(f"No clips to assemble for {manifest.session_id}.")
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    episode_path = out / f"{manifest.session_id}.episode.mp3"
    transcript_path = out / f"{manifest.session_id}.transcript.md"
    fmt = manifest.format

    with tempfile.TemporaryDirectory() as work_str:
        work = Path(work_str)
        params = parse_probe(run(probe_args(manifest.clips[0].path)).stdout)

        def silence_path(ms: int) -> str:
            return str(work / f"gap-{ms}.{fmt}")

        if manifest.mode == "dialogue":
            gaps = [chunk_gap_ms] * (len(manifest.clips) - 1)
            clip_paths = [c.path for c in manifest.clips]
            if len(manifest.clips) > 1:
                run(make_silence_args(silence_path(chunk_gap_ms), chunk_gap_ms, params, fmt))
        else:
            gaps = compute_gaps([c.speaker for c in manifest.clips], gap_options, rng)
            for ms in set(gaps):
                run(make_silence_args(silence_path(ms), ms, params, fmt))
            clip_paths = []
            for i, clip in enumerate(manifest.clips):
                faded = str(work / f"clip-{i + 1:03d}.{fmt}")
                run(fade_args(clip.path, faded, params, fmt, fade_in_ms, fade_out_ms))
                clip_paths.append(faded)

        list_path = work / "concat.txt"
        list_path.write_text(build_concat_list(clip_paths, gaps, silence_path), encoding="utf-8")

        resolved_bed = _resolve_bed(manifest, gaps, bed)
        run(concat_loudnorm_args(str(list_path), str(episode_path), resolved_bed))

    transcript_path.write_text(render_transcript(script), encoding="utf-8")
    return episode_path, transcript_path


def _resolve_bed(
    manifest: AudioManifest, gaps: list[int], bed: BedOptions | None
) -> BedOptions | None:
    """Fill a requested bed's episode-length + per-session seek (or None)."""
    if bed is None or not Path(bed.path).exists():
        return None
    clip_ms = sum(c.duration_ms for c in manifest.clips)
    return BedOptions(
        path=str(Path(bed.path).resolve()),
        gain=bed.gain,
        total_ms=clip_ms + sum(gaps),
        start_offset_sec=bed_offset(manifest.session_id),
    )
