// The read server fns for the review surface. Each runs server-side only (createServerFn
// strips the node:fs seam from the client bundle); under full-page nav the route loaders
// call them inline at SSR. S2 is read-only — S3/S4 add the write fns (writeProposalBody,
// writeDecision).

import { createServerFn } from "@tanstack/react-start";
import {
  listSessionDates,
  readCorpusBody,
  readKnownPages,
  readManifestText,
  readProposalBody,
} from "@/domain/review/fs";
import { type ProposalManifest, parseManifest } from "@/domain/review/manifest";

export interface SessionSummary {
  date: string;
  show: string;
  world: string;
  pages: number;
  creates: number;
  rewrites: number;
  unplaced: number;
  skipped: number;
  registryAdds: number;
}

export interface ReviewData {
  manifest: ProposalManifest;
  /** Proposal id → its staged `.vellum` source (the editable draft, P4.5). */
  bodies: Record<string, string>;
  /** Proposal id → the CURRENT akasha corpus body (rewrites only; null otherwise) — for the diff. */
  corpusBodies: Record<string, string | null>;
  /** The akasha page-path set ∪ this change-set's create paths — for live broken_wikilink checks. */
  knownPages: string[];
}

/** Every staged change-set (newest first) with its headline counts, for the index. */
export const listSessions = createServerFn({ method: "GET" }).handler((): SessionSummary[] => {
  return listSessionDates().map((date) => {
    const m = parseManifest(readManifestText(date));
    return {
      date,
      show: m.show,
      world: m.world,
      pages: m.proposals.length,
      creates: m.proposals.filter((p) => p.op === "create").length,
      rewrites: m.proposals.filter((p) => p.op === "rewrite").length,
      unplaced: m.unplaced.length,
      skipped: m.skipped.length,
      registryAdds: m.registryAdditions.length,
    };
  });
});

/** One session's full change-set: the manifest + each proposal's body + the corpus diff base. */
export const loadReview = createServerFn({ method: "GET" })
  .validator((date: string) => date)
  .handler(({ data: date }): ReviewData => {
    const manifest = parseManifest(readManifestText(date));
    const bodies: Record<string, string> = {};
    const corpusBodies: Record<string, string | null> = {};
    for (const p of manifest.proposals) {
      bodies[p.id] = readProposalBody(date, p.bodyFile);
      corpusBodies[p.id] = p.op === "rewrite" ? readCorpusBody(p.targetPath) : null;
    }
    // The known-page set for live broken_wikilink checks: the committed snapshot's
    // pages ∪ the paths this change-set itself creates (sibling crossrefs aren't broken).
    const knownPages = [...readKnownPages(), ...manifest.proposals.map((p) => p.targetPath)];
    return { manifest, bodies, corpusBodies, knownPages };
  });
