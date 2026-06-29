import { DocumentView } from "@astra/gothic";
import { parseDocument } from "@astra/vellum-lang";
import { useState } from "react";
import ClientOnly from "@/components/ClientOnly/ClientOnly";
import { EditorIsland } from "@/domain/editor/EditorIsland";
import { diffLines, diffStat } from "@/domain/review/diff";
import type { PageProposal } from "@/domain/review/manifest";

type Tab = "reading" | "edit" | "diff";

// One proposed page, rendered for review. Reading (gothic DocumentView, SSR) | Edit
// (a client-only CodeMirror island that overwrites the staged .vellum live, P4.5) |
// Diff (the proposed body vs the current corpus body — additive for a preserve-and-
// append rewrite). The live edit buffer (`source`) drives Reading + Diff too, so they
// update as the human types. S4 adds the approve/reject/defer footer.
export function ProposalCard({
  proposal,
  body,
  corpusBody,
  date,
  knownPages,
}: {
  proposal: PageProposal;
  body: string;
  corpusBody: string | null;
  date: string;
  knownPages: string[];
}) {
  const [tab, setTab] = useState<Tab>("reading");
  const [source, setSource] = useState(body);

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

      {proposal.facts.length > 0 ? (
        <section className="pc-facts">
          <h3>Cited facts</h3>
          <ul>
            {proposal.facts.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {proposal.conflicts.length > 0 ? (
        <section className="pc-conflicts">
          <h3>Conflicts with the existing page</h3>
          <ul>
            {proposal.conflicts.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {proposal.lints.length > 0 ? (
        <section className="pc-lints">
          {proposal.lints.map((l) => (
            <p key={`${l.type}:${l.message}`} className="pc-lint">
              <span className="pc-lint-type">{l.type}</span> {l.message}
            </p>
          ))}
        </section>
      ) : null}

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

      {tab === "reading" ? (
        <section className="pc-reading">
          <DocumentView document={parseDocument(source, { mode: "mechanical" })} />
        </section>
      ) : null}

      {tab === "edit" ? (
        <section className="pc-edit">
          <ClientOnly fallback={<p className="pc-loading">Loading editor…</p>}>
            <EditorIsland
              date={date}
              id={proposal.id}
              initialSource={body}
              knownPages={knownPages}
              onChange={setSource}
            />
          </ClientOnly>
        </section>
      ) : null}

      {tab === "diff" ? <DiffView before={corpusBody ?? ""} after={source} /> : null}
    </article>
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
          // biome-ignore lint/suspicious/noArrayIndexKey: diff rows are a stable, never-reordered sequence
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
