// The TS reader for the Phase-3 `manifest.kdl` change-set (the contract Phase 4
// consumes). Repo-wide, @bgotink/kdl is parse-only (strider/config/ontology) — we use
// it here to READ the manifest into a Zod-validated model that mirrors the Python
// `ProposalManifest` (proposer/models.py). The KDL is kebab-case (`page-type`,
// `placement-note`, `suggested-path`); the explicit walk maps each to a camelCase
// field. The fixture round-trip test (parse the committed 2025-8-28 manifest) gates it.
//
// NB: this is a pure parser (no fs) so it's safe to import from a test or the client;
// the file reads live in serverFns + domain/review/fs.ts (server-only).

import { type Node, parse } from "@bgotink/kdl";
import { z } from "zod";

export const ProposalOp = z.enum(["create", "rewrite"]);
export const ResolveStatus = z.enum(["resolved", "unknown"]);
export const PageType = z.enum(["lore", "stub", "deity-statblock", "timeline", "flavor-pre"]);

export const PageProposalSchema = z.object({
  id: z.string(),
  op: ProposalOp,
  targetPath: z.string(),
  canonical: z.string(),
  kind: z.string().nullable(),
  status: ResolveStatus,
  pageType: PageType,
  bodyFile: z.string(),
  facts: z.array(z.string()),
  placementNote: z.string().nullable(),
});

export const UnplacedFactSchema = z.object({
  subject: z.string(),
  claim: z.string(),
  candidates: z.array(z.tuple([z.string(), z.number()])),
});

export const SkippedPageSchema = z.object({
  targetPath: z.string(),
  reason: z.enum(["non-prose-page"]),
});

export const RegistryAdditionSchema = z.object({
  canonical: z.string(),
  kind: z.string().nullable(),
  suggestedPath: z.string(),
});

export const ProposalManifestSchema = z.object({
  date: z.string(),
  show: z.string(),
  world: z.string(),
  proposals: z.array(PageProposalSchema),
  unplaced: z.array(UnplacedFactSchema),
  skipped: z.array(SkippedPageSchema),
  registryAdditions: z.array(RegistryAdditionSchema),
});

export type PageProposal = z.infer<typeof PageProposalSchema>;
export type UnplacedFact = z.infer<typeof UnplacedFactSchema>;
export type SkippedPage = z.infer<typeof SkippedPageSchema>;
export type RegistryAddition = z.infer<typeof RegistryAdditionSchema>;
export type ProposalManifest = z.infer<typeof ProposalManifestSchema>;

// --- @bgotink/kdl node helpers (mirror strider/build-content) ---

function args(node: Node): unknown[] {
  return node.getArgumentEntries().map((e) => e.getValue());
}

function arg0(node: Node): string {
  return String(args(node)[0] ?? "");
}

function props(node: Node): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, entry] of node.getPropertyEntryMap()) out[key] = entry.getValue();
  return out;
}

function children(node: Node): Node[] {
  return node.children?.nodes ?? [];
}

/** A required string prop. */
function strProp(p: Record<string, unknown>, key: string): string {
  const v = p[key];
  if (v === undefined || v === null) throw new Error(`manifest: missing prop "${key}"`);
  return String(v);
}

/** An optional string prop → null when absent. */
function optProp(p: Record<string, unknown>, key: string): string | null {
  const v = p[key];
  return v === undefined || v === null ? null : String(v);
}

/**
 * Parse `manifest.kdl` text → a validated ProposalManifest. Explicit-walk (the
 * entity.kdl/Python parse_manifest idiom), kebab→camel by hand, then Zod-validate.
 */
export function parseManifest(text: string): ProposalManifest {
  const doc = parse(text);
  const proposalNode = doc.nodes.find((n) => n.name.name === "proposal");
  if (!proposalNode) throw new Error("manifest.kdl: no `proposal` node");
  const head = props(proposalNode);

  const proposals: unknown[] = [];
  const unplaced: unknown[] = [];
  const skipped: unknown[] = [];
  const registryAdditions: unknown[] = [];

  for (const node of children(proposalNode)) {
    const name = node.name.name;
    if (name === "page") {
      const p = props(node);
      const bodyFile = strProp(p, "body");
      proposals.push({
        id: bodyFile.endsWith(".vellum") ? bodyFile.slice(0, -".vellum".length) : bodyFile,
        op: strProp(p, "op"),
        targetPath: arg0(node),
        canonical: strProp(p, "canonical"),
        kind: optProp(p, "kind"),
        status: strProp(p, "status"),
        pageType: strProp(p, "page-type"),
        bodyFile,
        facts: children(node)
          .filter((c) => c.name.name === "fact")
          .map(arg0),
        placementNote: optProp(p, "placement-note"),
      });
    } else if (name === "unplaced") {
      const p = props(node);
      unplaced.push({
        subject: strProp(p, "subject"),
        claim: strProp(p, "claim"),
        candidates: children(node)
          .filter((c) => c.name.name === "candidate")
          .map((c) => [arg0(c), Number(strProp(props(c), "score"))] as [string, number]),
      });
    } else if (name === "skipped") {
      const p = props(node);
      skipped.push({ targetPath: strProp(p, "target-path"), reason: strProp(p, "reason") });
    } else if (name === "registry-add") {
      const p = props(node);
      registryAdditions.push({
        canonical: strProp(p, "canonical"),
        kind: optProp(p, "kind"),
        suggestedPath: strProp(p, "suggested-path"),
      });
    }
  }

  return ProposalManifestSchema.parse({
    date: arg0(proposalNode),
    show: strProp(head, "show"),
    world: strProp(head, "world"),
    proposals,
    unplaced,
    skipped,
    registryAdditions,
  });
}
