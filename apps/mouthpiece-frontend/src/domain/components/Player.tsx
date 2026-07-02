import { useEffect, useRef, useState } from "react";

// The audio player — ported 1:1 from faerrin face/src/islands/Player.tsx (Solid →
// React): MediaSession (OS lock-screen / headset controls, PNG artwork), pointer-
// capture scrubbing, and localStorage resume. All browser-API access sits inside the
// mount effect, so the component SSR-renders the static transport and hydrates safely.
//
// React port note (the load-bearing difference from Solid): Solid's `scrubbing()` /
// `duration()` accessors are always current, but React closures capture state at
// effect-run time. The DOM/MediaSession listeners are attached ONCE (mount), so they
// read the live values through refs (`scrubbingRef`/`durationRef`) — otherwise a
// scrub would be overwritten by `timeupdate` and `skip`'s clamp would use a stale
// duration. State still drives the render; the refs mirror it for the listeners.

export interface PlayerProps {
  id: string;
  src: string;
  title: string;
  /** Optional subtitle for the OS lock-screen / Now Playing card (e.g. campaign name). */
  artist?: string;
  /** Build-time runtime estimate; replaced by the real duration once metadata loads. */
  runtimeMs: number;
  /** Content hash for cache-busting the lock-screen artwork (iOS caches it hard). */
  iconVersion?: string;
}

function mmss(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}

const SKIP = 15; // seconds

export default function Player({ id, src, title, artist, runtimeMs, iconVersion }: PlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const posKey = `caster:pos:${id}`;

  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDurationState] = useState(runtimeMs / 1000);
  const [ready, setReady] = useState(false);
  const [scrubbing, setScrubbingState] = useState(false);

  // Live mirrors the once-attached listeners read (see the port note above).
  const scrubbingRef = useRef(false);
  const durationRef = useRef(runtimeMs / 1000);
  const setScrubbing = (v: boolean) => {
    scrubbingRef.current = v;
    setScrubbingState(v);
  };
  const setDuration = (v: number) => {
    durationRef.current = v;
    setDurationState(v);
  };

  const frac = duration > 0 ? Math.min(1, current / duration) : 0;

  const savePos = () => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      localStorage.setItem(posKey, String(audio.currentTime));
    } catch {
      /* storage may be unavailable (private mode) — ignore */
    }
  };

  const syncPosition = () => {
    const audio = audioRef.current;
    const ms = typeof navigator !== "undefined" ? navigator.mediaSession : undefined;
    if (!audio || !ms?.setPositionState) return;
    const d = audio.duration;
    if (!Number.isFinite(d) || d <= 0) return;
    try {
      ms.setPositionState({
        duration: d,
        playbackRate: audio.playbackRate || 1,
        position: Math.min(Math.max(0, audio.currentTime), d),
      });
    } catch {
      /* some engines throw on out-of-range transient values — ignore */
    }
  };

  const seekToClientX = (clientX: number) => {
    const audio = audioRef.current;
    const track = trackRef.current;
    if (!audio || !track) return;
    const rect = track.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const d = durationRef.current;
    if (d > 0) {
      audio.currentTime = f * d;
      setCurrent(audio.currentTime);
    }
  };

  const skip = (delta: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.min(durationRef.current, Math.max(0, audio.currentTime + delta));
    setCurrent(audio.currentTime);
    savePos();
  };

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  };

  const onTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    setScrubbing(true);
    trackRef.current?.setPointerCapture(e.pointerId);
    seekToClientX(e.clientX);
  };
  const onTrackPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (scrubbingRef.current) seekToClientX(e.clientX);
  };
  const onTrackPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubbingRef.current) return;
    setScrubbing(false);
    try {
      trackRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
    savePos();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === " ") {
      e.preventDefault();
      toggle();
    } else if (e.key === "ArrowRight") skip(SKIP);
    else if (e.key === "ArrowLeft") skip(-SKIP);
  };

  // OS-level media session + audio events, attached once at mount (mirrors face's
  // onMount/onCleanup). Browser-only; never runs during SSR.
  // oxlint-disable react-hooks/exhaustive-deps -- mount-once setup; listeners read live refs, props are stable per episode page (full-page nav remounts)
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-once setup (face's onMount); listeners read live refs, props are stable per episode page (full-page nav remounts)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const ms = typeof navigator !== "undefined" ? navigator.mediaSession : undefined;

    const onMeta = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration);
      setReady(true);
      const saved = Number(localStorage.getItem(posKey));
      if (Number.isFinite(saved) && saved > 0 && saved < audio.duration - 1) {
        audio.currentTime = saved;
        setCurrent(saved);
      }
      syncPosition();
    };
    const onTime = () => {
      if (!scrubbingRef.current) setCurrent(audio.currentTime);
      syncPosition();
    };
    const onPlay = () => {
      setPlaying(true);
      if (ms) ms.playbackState = "playing";
    };
    const onPause = () => {
      setPlaying(false);
      if (ms) ms.playbackState = "paused";
      savePos();
    };
    const onEnd = () => {
      setPlaying(false);
      if (ms) ms.playbackState = "none";
      try {
        localStorage.removeItem(posKey);
      } catch {
        /* ignore */
      }
    };
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnd);
    window.addEventListener("beforeunload", savePos);

    if (ms) {
      // Raster PNGs (not SVG) for the lock-screen card — iOS Now Playing doesn't
      // reliably render SVG artwork. Cache-bust with the icon's content hash.
      const v = iconVersion ? `?v=${iconVersion}` : "";
      ms.metadata = new MediaMetadata({
        title,
        artist: artist ?? "",
        album: "Mouthpiece",
        artwork: [192, 256, 512].map((s) => ({
          src: `/icon-${s}.png${v}`,
          sizes: `${s}x${s}`,
          type: "image/png",
        })),
      });
      // setActionHandler throws on unsupported actions in some engines; guard each.
      const setAction = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
        try {
          ms.setActionHandler(action, handler);
        } catch {
          /* action unsupported on this platform — ignore */
        }
      };
      setAction("play", () => void audio.play());
      setAction("pause", () => audio.pause());
      setAction("seekbackward", (d) => skip(-(d.seekOffset ?? SKIP)));
      setAction("seekforward", (d) => skip(d.seekOffset ?? SKIP));
      setAction("seekto", (d) => {
        if (d.seekTime == null) return;
        if (d.fastSeek && "fastSeek" in audio) audio.fastSeek(d.seekTime);
        else audio.currentTime = d.seekTime;
        setCurrent(audio.currentTime);
        syncPosition();
        savePos();
      });
    }

    return () => {
      savePos();
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnd);
      window.removeEventListener("beforeunload", savePos);
      if (ms) {
        for (const a of [
          "play",
          "pause",
          "seekbackward",
          "seekforward",
          "seekto",
        ] as MediaSessionAction[]) {
          try {
            ms.setActionHandler(a, null);
          } catch {
            /* ignore */
          }
        }
        ms.metadata = null;
        ms.playbackState = "none";
      }
    };
  }, []);
  // oxlint-enable react-hooks/exhaustive-deps

  return (
    <div className="player" role="group" aria-label={`Audio player: ${title}`}>
      {/* oxlint-disable media-has-caption -- the transcript on the page is the caption */}
      {/* biome-ignore lint/a11y/useMediaCaption: the transcript on the page is the caption */}
      <audio ref={audioRef} src={src} preload="metadata" />
      {/* oxlint-enable media-has-caption */}

      <button
        type="button"
        className={`player-play${playing ? " is-playing" : ""}`}
        onClick={toggle}
        onKeyDown={onKey}
        aria-label={playing ? "Pause" : "Play"}
        aria-pressed={playing}
      >
        <span className="player-glyph" aria-hidden="true">
          {playing ? (
            <span className="glyph-pause">
              <i />
              <i />
            </span>
          ) : (
            <span className="glyph-play" />
          )}
        </span>
      </button>

      <div className="player-body">
        <div className="player-row">
          <button
            type="button"
            className="player-skip"
            onClick={() => skip(-SKIP)}
            aria-label="Back 15 seconds"
          >
            «15
          </button>
          <div
            ref={trackRef}
            className={`player-track${scrubbing ? " is-scrubbing" : ""}${ready ? " is-ready" : ""}`}
            onPointerDown={onTrackPointerDown}
            onPointerMove={onTrackPointerMove}
            onPointerUp={onTrackPointerUp}
            role="slider"
            tabIndex={0}
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(current)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") skip(SKIP);
              else if (e.key === "ArrowLeft") skip(-SKIP);
            }}
          >
            <div className="player-fill" style={{ width: `${frac * 100}%` }} />
            <div className="player-knob" style={{ left: `${frac * 100}%` }} />
          </div>
          <button
            type="button"
            className="player-skip"
            onClick={() => skip(SKIP)}
            aria-label="Forward 15 seconds"
          >
            15»
          </button>
        </div>
        <div className="player-times">
          <span>{mmss(current)}</span>
          <span className="player-total">{mmss(duration)}</span>
        </div>
      </div>
    </div>
  );
}
