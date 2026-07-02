import { indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { indentUnit } from "@codemirror/language";
import { EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { useEffect, useRef } from "react";

import { slashComplete } from "./slashComplete";
import { vellumHighlighting } from "./vellumHighlight";
import { vssHighlighting, vssMarkdown } from "./vssLanguage";

import styles from "./editor.module.css";

/**
 * Tab inserts 2 spaces (and indents/dedents a multi-line selection) instead of
 * moving focus. `Prec.low` keeps this below the autocomplete keymap, so Tab
 * still accepts an open `/` completion before falling back to indentation.
 */
const tabIndents = [indentUnit.of("  "), Prec.low(keymap.of([indentWithTab]))];

/** CM6 theme wired to gothic tokens (NFR-3: colors via vars, no hex). */
const gothicTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "var(--color-panel)",
      color: "var(--color-ink)",
      height: "100%",
      fontSize: "14px",
    },
    ".cm-content": {
      fontFamily: "var(--font-mono), monospace",
      caretColor: "var(--color-accent)",
    },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--color-accent)" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "var(--color-hover)",
    },
    ".cm-gutters": {
      backgroundColor: "var(--color-void)",
      color: "var(--color-ink-faint)",
      border: "none",
    },
    ".cm-activeLine": { backgroundColor: "var(--color-elevated)" },
    ".cm-activeLineGutter": { backgroundColor: "var(--color-elevated)" },
  },
  { dark: true },
);

/**
 * Uncontrolled CodeMirror 6 host. We mount once and push edits out via
 * `onChange`; we deliberately don't re-seed the doc on every `value` change
 * (that would fight the user's cursor). `onChange` is read through a ref so the
 * mount effect never needs to re-run. Doc switching is driven by remounting
 * (a fresh `key`) in VellumEditor, not by prop change.
 */
export function Editor({
  initialValue,
  onChange,
}: {
  initialValue: string;
  onChange: (value: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // oxlint-disable react-hooks/exhaustive-deps -- mount once; initialValue is the seed, onChange is via ref.
  useEffect(() => {
    const parent = host.current;
    if (!parent) return;

    const listener = EditorView.updateListener.of((update) => {
      if (update.docChanged) onChangeRef.current(update.state.doc.toString());
    });

    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: initialValue,
        extensions: [
          basicSetup,
          // The VSS structural surface is parsed by real grammar nodes
          // (vssLanguage.ts); canonical fences + sigils stay regex-decorated.
          markdown({ extensions: vssMarkdown }),
          vssHighlighting,
          vellumHighlighting,
          slashComplete,
          tabIndents,
          EditorView.lineWrapping,
          gothicTheme,
          listener,
        ],
      }),
    });

    return () => view.destroy();
  }, []);
  // oxlint-enable react-hooks/exhaustive-deps

  return <div className={styles.editor} ref={host} />;
}
