/**
 * TranscriptPlayer: the transcript page's behaviour. It renders NO markup of its own. It binds
 * imperatively to what the server rendered: the `.transcript-line` rows and the
 * `audio[data-transcript]` baked by transcriptBuild.ts, and the find bar, the docked player
 * and the speaker checkboxes rendered by TranscriptArticle. On any other page
 * `initTranscriptPlayer()` returns null and nothing binds.
 *
 * DO NOT rewrite reactively: a transcript renders to a 1.2 to 1.6 MB page with thousands of
 * lines, so the design is a delegated click, a precomputed seconds[] array searched by
 * bisection, and speaker filtering by one class on the root (`hide-<Name>`, rules generated
 * in SPEAKER_CSS). getElementById is kept for `${second}-${user}` ids (digit-leading and
 * dotted ids are invalid CSS selectors).
 *
 * Every listener and timer goes in the teardown: each page mounts fresh (README trap).
 *
 * Keyboard: `/` find, Space play or pause, Left and Right 5 s, `j` and `k` next and previous
 * line, `f` follow along; in the find field Enter and Shift+Enter step through matches and
 * Escape clears.
 */
import { useEffect } from "react";

import { withStorage } from "@/domain/lib/storage";

const SKIP_SECONDS = 10;
const ARROW_SECONDS = 5;
const SPEEDS = [1, 1.25, 1.5, 2] as const;
const NAMES_KEY = "transcript-names";
const FIND_HIGHLIGHT = "transcript-find";
const FIND_CURRENT = "transcript-find-current";

const pad = (n: number) => String(n).padStart(2, "0");

/** h:mm:ss, as the line times show it. */
const clock = (t: number) => {
  const s = Number.isFinite(t) && t > 0 ? Math.floor(t) : 0;
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s / 60) % 60))}:${pad(s % 60)}`;
};

const speedLabel = (rate: number) => `${rate}×`;

/** The URL fragment as an element id. Line ids are ASCII, so only %XX escapes need undoing
 *  (decodeURIComponent would throw on a malformed fragment). */
const hashId = (hash: string) =>
  hash
    .slice(1)
    .replaceAll(/%([0-9a-f]{2})/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    );

/** The CSS Custom Highlight API, where the browser has it (marks find matches in place). */
function highlightRegistry(): HighlightRegistry | null {
  return typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight === "function"
    ? CSS.highlights
    : null;
}

/** Ranges over each occurrence of `q` (lower case) in an element's text nodes. */
function rangesIn(el: Element, q: string): Range[] {
  const out: Range[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue ?? "";
    const lower = text.toLowerCase();
    // Lower-casing can change the length of some characters; skip those nodes.
    if (lower.length !== text.length) continue;
    for (let i = lower.indexOf(q); i !== -1; i = lower.indexOf(q, i + q.length)) {
      const r = document.createRange();
      r.setStart(node, i);
      r.setEnd(node, i + q.length);
      out.push(r);
    }
  }
  return out;
}

/** Initialize the player against the current page. Returns a teardown fn or null. */
function initTranscriptPlayer(): (() => void) | null {
  const audio = document.querySelector<HTMLAudioElement>("audio[data-transcript]");
  const player = document.querySelector<HTMLElement>(".transcript-player");
  const lines = Array.from(document.querySelectorAll<HTMLElement>(".transcript-line"));
  const root = lines[0]?.parentElement;
  if (!audio || !player || !root) return null;
  root.classList.add("transcript-root");
  audio.controls = false;

  const seconds = lines.map((l) => Number(l.dataset.second));
  const listeners: (() => void)[] = [];
  // Every listener goes through here, so the teardown removes them all.
  const on = (target: EventTarget | null, type: string, listener: (e: Event) => void) => {
    if (!target) return;
    target.addEventListener(type, listener);
    listeners.push(() => target.removeEventListener(type, listener));
  };

  // ── the docked player ───────────────────────────────────────────────────────────
  const playBtn = player.querySelector<HTMLButtonElement>(".tp-play");
  const backBtn = player.querySelector<HTMLButtonElement>(".tp-back");
  const fwdBtn = player.querySelector<HTMLButtonElement>(".tp-fwd");
  const scrubber = player.querySelector<HTMLInputElement>(".tp-scrubber");
  const currentLabel = player.querySelector<HTMLElement>(".tp-current");
  const totalLabel = player.querySelector<HTMLElement>(".tp-total");
  const speedBtn = player.querySelector<HTMLButtonElement>(".tp-speed");
  const speedValue = player.querySelector<HTMLElement>(".tp-speed-value");
  const followBtn = player.querySelector<HTMLButtonElement>(".tp-follow");
  // Until the audio's metadata loads (or when it can't), the build's duration stands in.
  const builtDuration = Number(player.dataset.duration) || 0;
  const duration = () =>
    Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : builtDuration;

  const setPlayState = () => {
    const playing = !audio.paused && !audio.ended;
    player.classList.toggle("is-playing", playing);
    playBtn?.setAttribute("aria-label", playing ? "Pause" : "Play");
  };

  let scrubbing = false;
  const showPosition = (t: number) => {
    const dur = duration();
    const pct = dur ? Math.min(100, (t / dur) * 100) : 0;
    if (currentLabel) currentLabel.textContent = clock(t);
    if (totalLabel) totalLabel.textContent = clock(dur);
    if (scrubber) {
      scrubber.style.setProperty("--tp-pct", `${pct}%`);
      scrubber.setAttribute("aria-valuetext", `${clock(t)} of ${clock(dur)}`);
    }
    return pct;
  };
  const syncScrubber = () => {
    if (scrubbing) return;
    const pct = showPosition(audio.currentTime);
    if (scrubber) scrubber.value = String(pct);
  };

  let activeIdx = -1;
  const activeIndexFor = (t: number) => {
    let lo = 0;
    let hi = seconds.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      // oxlint-disable-next-line typescript/no-non-null-assertion -- mid is within bounds
      if (seconds[mid]! <= t) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return ans;
  };

  let follow = false;
  const updateActive = () => {
    const idx = activeIndexFor(audio.currentTime);
    if (idx === activeIdx) return;
    lines[activeIdx]?.classList.remove("is-playing");
    activeIdx = idx;
    const line = lines[idx];
    if (!line) return;
    line.classList.add("is-playing");
    if (follow) line.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  const onTimeUpdate = () => {
    syncScrubber();
    updateActive();
  };
  on(audio, "timeupdate", onTimeUpdate);
  on(audio, "play", setPlayState);
  on(audio, "pause", setPlayState);
  on(audio, "ended", setPlayState);
  on(audio, "loadedmetadata", syncScrubber);
  on(audio, "durationchange", syncScrubber);

  const seekBy = (delta: number) => {
    audio.currentTime = Math.min(duration() || Infinity, Math.max(0, audio.currentTime + delta));
  };
  const togglePlay = () => {
    if (audio.paused) void audio.play().catch(() => setPlayState());
    else audio.pause();
  };
  on(playBtn, "click", togglePlay);
  on(backBtn, "click", () => seekBy(-SKIP_SECONDS));
  on(fwdBtn, "click", () => seekBy(SKIP_SECONDS));

  on(scrubber, "input", () => {
    scrubbing = true;
    showPosition((Number(scrubber?.value) / 100) * duration());
  });
  on(scrubber, "change", () => {
    audio.currentTime = (Number(scrubber?.value) / 100) * duration();
    scrubbing = false;
    syncScrubber();
  });

  on(speedBtn, "click", () => {
    const i = SPEEDS.findIndex((s) => s === audio.playbackRate);
    const next = SPEEDS[(i + 1) % SPEEDS.length] ?? 1;
    audio.playbackRate = next;
    if (speedValue) speedValue.textContent = speedLabel(next);
  });

  const scrollToActive = () => {
    lines[activeIdx]?.scrollIntoView({ block: "center", behavior: "smooth" });
  };
  const toggleFollow = () => {
    follow = !follow;
    followBtn?.setAttribute("aria-pressed", String(follow));
    if (follow) scrollToActive();
  };
  on(followBtn, "click", toggleFollow);

  // ── lines: click to seek, deep links ────────────────────────────────────────────
  // body[data-slug] replaces Quartz's getFullSlug(window); without it, deep links
  // would write `/undefined#…`. __root.tsx sets it on every page.
  const slug = document.body.dataset.slug ?? "";
  const seekTo = (second: number, user: string) => {
    if (!Number.isNaN(second)) audio.currentTime = second;
    // Keep the router's history state (its entry key drives scroll restoration). The router
    // watches replaceState and would scroll the new hash's line into view; the flag stops it,
    // so a click or j/k never moves the page.
    history.replaceState(
      { ...history.state, __hashScrollIntoViewOptions: false },
      "",
      `/${slug}#${second}-${user}`,
    );
    // Paused, timeupdate may not fire at once; mark the line now.
    updateActive();
    syncScrubber();
  };
  on(root, "click", (e) => {
    const target = e.target;
    if (!(target instanceof Element) || target.closest("a")) return;
    if ((window.getSelection()?.toString().length ?? 0) > 0) return;
    const line = target.closest<HTMLElement>(".transcript-line");
    if (!line || !root.contains(line)) return;
    seekTo(Number(line.dataset.second), line.dataset.user || "");
  });

  let targetTimer: number | undefined;
  const highlightHash = () => {
    const id = hashId(window.location.hash);
    if (!id) return;
    const target = document.getElementById(id);
    if (!target?.classList.contains("transcript-line")) return;
    for (const l of root.querySelectorAll(".is-target")) l.classList.remove("is-target");
    target.classList.add("is-target");
    target.scrollIntoView({ block: "center" });
    // A shared link starts the recording at its line.
    const second = Number(target.dataset.second);
    if (!Number.isNaN(second) && audio.paused) {
      audio.currentTime = second;
      updateActive();
      syncScrubber();
    }
    window.clearTimeout(targetTimer);
    targetTimer = window.setTimeout(() => target.classList.remove("is-target"), 2400);
  };
  on(window, "hashchange", highlightHash);

  // ── speakers: show or hide each speaker's lines; character or real names ─────────
  const aside = document.querySelector<HTMLElement>(".tp-speakers");
  on(aside, "change", (e) => {
    const box = e.target;
    const user = box instanceof HTMLInputElement ? box.dataset.speaker : undefined;
    if (box instanceof HTMLInputElement && user) {
      root.classList.toggle(`hide-${user}`, !box.checked);
    }
  });

  const nameSpans = Array.from(root.querySelectorAll<HTMLElement>(".transcript-name"));
  const namesSwitch = aside?.querySelector<HTMLInputElement>(".tp-names-switch") ?? null;
  const applyNames = (real: boolean) => {
    for (const s of nameSpans) s.textContent = (real ? s.dataset.real : s.dataset.char) ?? "";
  };
  if (namesSwitch) {
    // Character names by default; the choice persists per browser.
    if (withStorage((s) => s.getItem(NAMES_KEY), null) === "real") {
      namesSwitch.checked = true;
      applyNames(true);
    }
    on(namesSwitch, "change", () => {
      const mode = namesSwitch.checked ? "real" : "char";
      withStorage((s) => s.setItem(NAMES_KEY, mode), undefined);
      applyNames(namesSwitch.checked);
    });
  }

  // ── find ────────────────────────────────────────────────────────────────────────
  const findInput = document.querySelector<HTMLInputElement>(".tp-search-input");
  const findCount = document.querySelector<HTMLElement>(".tp-search-count");
  const findPrev = document.querySelector<HTMLButtonElement>(".tp-search-prev");
  const findNext = document.querySelector<HTMLButtonElement>(".tp-search-next");
  const registry = highlightRegistry();
  let texts: string[] | null = null;
  let matches: HTMLElement[] = [];
  let matchPos = -1;

  const setNavEnabled = (enabled: boolean) => {
    if (findPrev) findPrev.disabled = !enabled;
    if (findNext) findNext.disabled = !enabled;
  };
  setNavEnabled(false);

  const clearMatches = () => {
    for (const m of matches) m.classList.remove("search-match", "search-current");
    matches = [];
    matchPos = -1;
    registry?.delete(FIND_HIGHLIGHT);
    registry?.delete(FIND_CURRENT);
    setNavEnabled(false);
  };
  const query = () => findInput?.value.trim().toLowerCase() ?? "";
  const showMatch = (pos: number) => {
    if (matches.length === 0) return;
    matches[matchPos]?.classList.remove("search-current");
    matchPos = (pos + matches.length) % matches.length;
    // oxlint-disable-next-line typescript/no-non-null-assertion -- matchPos is within bounds
    const m = matches[matchPos]!;
    m.classList.add("search-current");
    if (registry) {
      const content = m.querySelector(".transcript-content");
      const current = content ? rangesIn(content, query()) : [];
      registry.set(FIND_CURRENT, new Highlight(...current));
    }
    m.scrollIntoView({ block: "center", behavior: "smooth" });
    if (findCount) findCount.textContent = `${matchPos + 1} of ${matches.length}`;
  };
  const runSearch = () => {
    clearMatches();
    const needle = query();
    if (needle.length < 2) {
      if (findCount) findCount.textContent = "";
      return;
    }
    texts ??= lines.map((l) =>
      (l.querySelector(".transcript-content")?.textContent ?? "").toLowerCase(),
    );
    const ranges: Range[] = [];
    for (const [i, text] of texts.entries()) {
      if (!text.includes(needle)) continue;
      // oxlint-disable-next-line typescript/no-non-null-assertion -- texts mirrors lines
      const line = lines[i]!;
      line.classList.add("search-match");
      matches.push(line);
      const content = registry ? line.querySelector(".transcript-content") : null;
      if (content) ranges.push(...rangesIn(content, needle));
    }
    if (registry && ranges.length > 0) registry.set(FIND_HIGHLIGHT, new Highlight(...ranges));
    if (matches.length === 0) {
      if (findCount) findCount.textContent = "No matches";
      return;
    }
    setNavEnabled(true);
    showMatch(0);
  };

  let searchTimer: number | undefined;
  on(findInput, "input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(runSearch, 180);
  });
  on(findInput, "keydown", (e) => {
    if (!(e instanceof KeyboardEvent)) return;
    if (e.key === "Enter") {
      e.preventDefault();
      // Enter before the debounce fires searches at once.
      if (matches.length === 0) {
        window.clearTimeout(searchTimer);
        runSearch();
      } else {
        showMatch(matchPos + (e.shiftKey ? -1 : 1));
      }
    } else if (e.key === "Escape") {
      if (findInput) findInput.value = "";
      clearMatches();
      if (findCount) findCount.textContent = "";
    }
  });
  on(findPrev, "click", () => showMatch(matchPos - 1));
  on(findNext, "click", () => showMatch(matchPos + 1));

  // ── keyboard ────────────────────────────────────────────────────────────────────
  const isTyping = (t: EventTarget | null) =>
    t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;
  const isHidden = (line: HTMLElement) =>
    root.classList.contains(`hide-${line.dataset.user ?? ""}`);
  // The next or previous line whose speaker is shown.
  const seekLine = (delta: number) => {
    let idx = activeIdx >= 0 ? activeIdx + delta : 0;
    for (let l = lines[idx]; l && isHidden(l); l = lines[idx]) idx += delta;
    const line = lines[Math.max(0, Math.min(lines.length - 1, idx))];
    if (!line) return;
    seekTo(Number(line.dataset.second), line.dataset.user || "");
    line.scrollIntoView({ block: "nearest" });
  };
  // The page's shortcuts, by key (letters in lower case).
  const shortcuts: Record<string, () => void> = {
    "/": () => {
      findInput?.focus({ preventScroll: true });
      findInput?.select();
    },
    " ": togglePlay,
    arrowleft: () => seekBy(-ARROW_SECONDS),
    arrowright: () => seekBy(ARROW_SECONDS),
    j: () => seekLine(1),
    k: () => seekLine(-1),
    f: toggleFollow,
  };
  // These keys' default actions (typing a slash, scrolling the page) give way to the shortcut.
  const claimed = new Set(["/", " "]);
  on(document, "keydown", (e) => {
    if (!(e instanceof KeyboardEvent) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (isTyping(e.target)) return;
    const key = e.key.toLowerCase();
    const run = shortcuts[key];
    if (!run) return;
    if (claimed.has(key)) e.preventDefault();
    run();
  });

  highlightHash();
  setPlayState();
  syncScrubber();
  updateActive();

  return () => {
    window.clearTimeout(searchTimer);
    window.clearTimeout(targetTimer);
    for (const off of listeners) off();
    registry?.delete(FIND_HIGHLIGHT);
    registry?.delete(FIND_CURRENT);
    audio.pause();
  };
}

export function TranscriptPlayer() {
  useEffect(() => {
    const teardown = initTranscriptPlayer();
    return () => teardown?.();
  }, []);
  return null;
}
