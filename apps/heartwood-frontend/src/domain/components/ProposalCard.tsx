import { DocumentView } from "@astra/gothic";
import { parseDocument } from "@astra/vellum-lang";
import { useState } from "react";

import ClientOnly from "@/components/ClientOnly/ClientOnly";
import { EditorIsland, type SaveState } from "@/domain/editor/EditorIsland";
import { diffLines, diffStat } from "@/domain/review/diff";
import type { PageProposal } from "@/domain/review/manifest";
import type { Decision } from "@/domain/review/reviewState";

import { DecisionFooter } from "./DecisionFooter";

type Tab = "reading" | "edit" | "diff";

// One proposed page, rendered for review (0020 facts-only rework: the machine stages
// facts + a skeleton/verbatim body, the human writes every word). Facts-first: the cited
// facts are the card's PRIMARY content, above the tabs — it's what the human writes
// *from*. Reading (gothic DocumentView, SSR) | Edit (a client-only CodeMirror island
// that overwrites the staged .vellum live, P4.5) | Diff (the proposed body vs the
// current corpus body). The live edit buffer (`source`) drives Reading + Diff too. The
// footer (S4) carries approve/reject/defer + placement, gated on FO-5/FO-10's
// `canApprove` (placement resolved ∧ the buffer is persisted to disk ∧ real content).
export function ProposalCard({
  proposal,
  body,
  corpusBody,
  date,
  knownPages,
  decision,
}: {
  proposal: PageProposal;
  body: string;
  corpusBody: string | null;
  date: string;
  knownPages: string[];
  decision: Decision | undefined;
}) {
  const [tab, setTab] = useState<Tab>("reading");
  const [source, setSource] = useState(body);
  // Lifted out of EditorIsland (FO-5/B2): the editor unmounts on every tab switch, but
  // the Approve gate must keep seeing the save status even while it isn't mounted.
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const savePersisted = saveState === "idle" || saveState === "saved";

  return (
    <article className="proposal-card" id={proposal.id}>
      <header className="pc-head">
        <span className={`pc-op pc-op-${proposal.op}`}>{proposal.op}</span>
        <h2 className="pc-title">{proposal.canonical}</h2>
        <code className="pc-path">{proposal.targetPath}</code>
        <span className="pc-tags">
          <span className={`pc-status pc-status-${proposal.status}`}>{proposal.status}</span>
          {proposal.kind ? <span className="pc-kind">{proposal.kind}</span> : null}
        </span>
      </header>

      {proposal.placementNote ? <p className="pc-placement">⚑ {proposal.placementNote}</p> : null}

      <section className="pc-facts">
        <h3>Facts to incorporate</h3>
        {proposal.facts.length > 0 ? (
          <ul>
            {proposal.facts.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        ) : (
          <p className="pc-facts-empty">No cited facts for this page — write from the corpus.</p>
        )}
      </section>

      <nav className="pc-tabs">
        {(["reading", "edit", "diff"] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={`pc-tab ${tab === t ? "pc-tab-active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t === "diff" && proposal.op === "create" ? "diff (new)" : t}
          </button>
        ))}
      </nav>

      {tab === "reading" ? <Reading source={source} /> : null}

      {tab === "edit" ? (
        <section className="pc-edit">
          <ClientOnly fallback={<p className="pc-loading">Loading editor…</p>}>
            <EditorIsland
              date={date}
              id={proposal.id}
              // Seed from the LIVE buffer, not the original prop: the island unmounts on
              // every tab switch, and reseeding from `body` would hand the next keystroke
              // a stale doc to debounce-save over the human's flushed edits.
              initialSource={source}
              knownPages={knownPages}
              onChange={setSource}
              onSaveStateChange={setSaveState}
            />
          </ClientOnly>
        </section>
      ) : null}

      {tab === "diff" ? <DiffView before={corpusBody ?? ""} after={source} /> : null}

      <DecisionFooter
        proposal={proposal}
        date={date}
        initial={decision}
        source={source}
        corpusBody={corpusBody}
        savePersisted={savePersisted}
      />
    </article>
  );
}

// Mirrors Preview.tsx's empty-document message (P4.6): a skeleton create parses to zero
// nodes until the human writes something, so the placeholder replaces a blank pane.
function Reading({ source }: { source: string }) {
  const document = parseDocument(source, { mode: "mechanical" });
  return (
    <section className="pc-reading">
      {document.nodes.length === 0 ? (
        <p className="pc-reading-empty">
          Nothing written yet — open the Edit tab and write the page from the facts above.
        </p>
      ) : (
        <DocumentView document={document} />
      )}
    </section>
  );
}

function DiffView({ before, after }: { before: string; after: string }) {
  const rows = diffLines(before, after);
  const { added, removed } = diffStat(rows);
  return (
    <section className="pc-diff">
      <p className="pc-diff-stat">
        +{added} −{removed}
      </p>
      <pre className="pc-diff-body">
        {rows.map((r, i) => (
          <span key={`${i}:${r.type}:${r.text}`} className={`diff-${r.type}`}>
            {r.type === "add" ? "+ " : r.type === "del" ? "- " : "  "}
            {r.text}
            {"\n"}
          </span>
        ))}
      </pre>
    </section>
  );
}
