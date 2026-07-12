import { useCallback, useEffect, useRef, useState } from "react";

import { type VoiceWarning, voiceLint } from "@/domain/review/voiceLint";
import { writeProposalBody } from "@/serverFns/writeProposalBody";

import { Editor } from "./Editor";
import { Preview } from "./Preview";

import styles from "./editor.module.css";

export type SaveState = "idle" | "saving" | "saved" | "error";

// The edit surface for one proposal (client-only — CodeMirror can't SSR). Edits the
// staged `.vellum` (P4.5): the human IS the author now. Autosaves (debounced) straight
// to proposals/<date>/<id>.vellum via the write server fn; re-runs the live tell-lint
// (page-type-aware, advisory) as you type; a live gothic Preview mirrors the render.
//
// FO-5/B2: the Approve gate must only ever fire against a PERSISTED body (`apply.py`
// copies the proposal `.vellum` bytes straight off disk), not the in-memory buffer. This
// island unmounts on every tab switch (ProposalCard renders it only while `tab==="edit"`),
// so a pending 600ms-debounced write must be FLUSHED on unmount rather than dropped, and
// the save status is lifted to the parent via `onSaveStateChange` so `canApprove` can see
// it even while the editor itself isn't mounted.
export function EditorIsland({
  date,
  id,
  initialSource,
  knownPages,
  onChange,
  onSaveStateChange,
}: {
  date: string;
  id: string;
  initialSource: string;
  knownPages: string[];
  onChange: (source: string) => void;
  onSaveStateChange: (state: SaveState) => void;
}) {
  const [source, setSource] = useState(initialSource);
  const [save, setSave] = useState<SaveState>("idle");
  const [lints, setLints] = useState<VoiceWarning[]>(() => voiceLint(initialSource));
  const known = useRef(new Set(knownPages));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The most recent unsaved value, or null once it's been flushed to disk — read by the
  // unmount cleanup so it can flush without a stale closure over `handleChange`'s value.
  const pendingValue = useRef<string | null>(null);

  const setSaveState = useCallback(
    (next: SaveState) => {
      setSave(next);
      onSaveStateChange(next);
    },
    [onSaveStateChange],
  );

  const flush = useCallback(
    (value: string) => {
      pendingValue.current = null;
      writeProposalBody({ data: { date, id, source: value } })
        .then((r) => setSaveState(r.ok ? "saved" : "error"))
        .catch(() => setSaveState("error"));
    },
    [date, id, setSaveState],
  );

  const handleChange = useCallback(
    (value: string) => {
      setSource(value);
      onChange(value);
      setLints(voiceLint(value, { knownPages: known.current }));
      setSaveState("saving");
      pendingValue.current = value;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        flush(value);
      }, 600);
    },
    [flush, onChange, setSaveState],
  );

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      // A pending debounced write means the last keystroke hasn't hit disk yet — flush
      // it now instead of cancelling, so a fast write→tab-switch→approve can't race
      // apply.py's still-stale on-disk copy (FO-5's B2 blocker).
      if (pendingValue.current !== null) flush(pendingValue.current);
    },
    [flush],
  );

  return (
    <div className={styles.editorIsland}>
      <div className={styles.editorPanes}>
        <Editor initialValue={initialSource} onChange={handleChange} />
        <Preview source={source} mode="mechanical" />
      </div>
      <div className={styles.editorStatus}>
        <span className={`${styles.saveDot} ${styles[`save-${save}`]}`}>
          {save === "saving"
            ? "saving…"
            : save === "saved"
              ? "saved"
              : save === "error"
                ? "save failed"
                : ""}
        </span>
        {lints.length > 0 ? (
          <span className={styles.lintCount}>
            {lints.length} lint{lints.length === 1 ? "" : "s"}:{" "}
            {lints.map((l) => l.type).join(", ")}
          </span>
        ) : (
          <span className={styles.lintClean}>clean</span>
        )}
      </div>
    </div>
  );
}
