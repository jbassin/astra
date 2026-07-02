import { useCallback, useEffect, useRef, useState } from "react";

import type { VoiceWarning } from "@/domain/review/manifest";
import { voiceLint } from "@/domain/review/voiceLint";
import { writeProposalBody } from "@/serverFns/writeProposalBody";

import { Editor } from "./Editor";
import { Preview } from "./Preview";

import styles from "./editor.module.css";

type SaveState = "idle" | "saving" | "saved" | "error";

// The edit surface for one proposal (client-only — CodeMirror can't SSR). Edits the
// staged `.vellum` (P4.5): the human IS the author now. Autosaves (debounced) straight
// to proposals/<date>/<id>.vellum via the write server fn; re-runs the live tell-lint
// (page-type-aware, advisory) as you type; a live gothic Preview mirrors the render.
export function EditorIsland({
  date,
  id,
  initialSource,
  knownPages,
  onChange,
}: {
  date: string;
  id: string;
  initialSource: string;
  knownPages: string[];
  onChange: (source: string) => void;
}) {
  const [source, setSource] = useState(initialSource);
  const [save, setSave] = useState<SaveState>("idle");
  const [lints, setLints] = useState<VoiceWarning[]>(() => voiceLint(initialSource));
  const known = useRef(new Set(knownPages));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback(
    (value: string) => {
      setSource(value);
      onChange(value);
      setLints(voiceLint(value, { knownPages: known.current }));
      setSave("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        writeProposalBody({ data: { date, id, source: value } })
          .then((r) => setSave(r.ok ? "saved" : "error"))
          .catch(() => setSave("error"));
      }, 600);
    },
    [date, id, onChange],
  );

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

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
