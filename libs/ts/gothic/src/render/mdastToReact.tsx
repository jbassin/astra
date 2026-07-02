import type { CrossRef as CrossRefNode } from "@astra/vellum-lang";
import type { Nodes } from "mdast";
import type { ReactNode } from "react";

import { CrossRef } from "./components/CrossRef";
import { ErrorChip } from "./components/ErrorChip";
import { Redaction } from "./components/Redaction";
import { TraitPill } from "./components/TraitPill";
import { ActionGlyph, normalizeActionCost } from "./glyphs/actions";

/**
 * Renderable node = an mdast node OR a `crossref` (which `@astra/vellum-lang`
 * splices into phrasing content as a custom node — full-vellum §3.2). mdast's
 * own `Nodes` union doesn't know about it, so we widen the renderer's input.
 */
export type RenderableNode = Nodes | CrossRefNode;

/** Flatten a node subtree to its text content (verbatim, no evaluation). */
export function collectText(nodes: readonly RenderableNode[]): string {
  let out = "";
  for (const node of nodes) {
    if (node.type === "text" || node.type === "inlineCode") out += node.value;
    else if (node.type === "crossref") out += node.alias ?? node.target;
    else if ("children" in node) out += collectText(node.children);
  }
  return out;
}

/** Render an inline/leaf directive (`:action`, `:trait`, …) to React. */
function renderDirective(
  name: string,
  children: readonly Nodes[],
  attributes: Record<string, string | null | undefined> | null | undefined,
): ReactNode {
  if (name === "action") {
    const token = collectText(children) || attributes?.cost || "";
    const cost = normalizeActionCost(token);
    return cost ? <ActionGlyph cost={cost} /> : <ErrorChip message={`?action[${token}]`} />;
  }
  if (name === "trait") {
    const trait = collectText(children).trim();
    return trait ? <TraitPill name={trait} /> : <ErrorChip message="?trait[]" />;
  }
  if (name === "redact") {
    return <Redaction>{collectText(children)}</Redaction>;
  }
  if (name === "vsserr") {
    // VSS compile error (`:vsserr[reason]`). The compiler emits it for any
    // malformed structural input; render the reason so errors are never blank.
    return <ErrorChip message={collectText(children)} />;
  }
  return <ErrorChip message={`?${name}`} />;
}

function renderNode(node: RenderableNode, key: number): ReactNode {
  switch (node.type) {
    case "crossref":
      // full-vellum §3.2 — a link-styled placeholder; resolution is 0007's job.
      return <CrossRef key={key} node={node} />;
    case "text":
      return node.value;
    case "paragraph":
      return <p key={key}>{renderNodes(node.children)}</p>;
    case "heading": {
      const depth = Math.min(node.depth, 6);
      const Tag = `h${depth}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      return <Tag key={key}>{renderNodes(node.children)}</Tag>;
    }
    case "strong":
      return <strong key={key}>{renderNodes(node.children)}</strong>;
    case "emphasis":
      return <em key={key}>{renderNodes(node.children)}</em>;
    case "delete":
      return <del key={key}>{renderNodes(node.children)}</del>;
    case "inlineCode":
      return <code key={key}>{node.value}</code>;
    case "code":
      return (
        <pre key={key}>
          <code>{node.value}</code>
        </pre>
      );
    case "break":
      return <br key={key} />;
    case "thematicBreak":
      return <hr key={key} />;
    case "blockquote":
      return <blockquote key={key}>{renderNodes(node.children)}</blockquote>;
    case "list":
      return node.ordered ? (
        <ol key={key} start={node.start ?? undefined}>
          {renderNodes(node.children)}
        </ol>
      ) : (
        <ul key={key}>{renderNodes(node.children)}</ul>
      );
    case "listItem":
      // GFM task list: `- [x]` / `- [ ]` carry a boolean `checked`.
      if (typeof node.checked === "boolean") {
        return (
          <li key={key} data-task="">
            <input type="checkbox" checked={node.checked} readOnly disabled />{" "}
            {renderNodes(node.children)}
          </li>
        );
      }
      return <li key={key}>{renderNodes(node.children)}</li>;
    case "table": {
      // GFM table. First row is the header; `align` is per-column.
      const [head, ...body] = node.children;
      const cellAlign = (i: number) => {
        const a = node.align?.[i];
        return a ? { textAlign: a } : undefined;
      };
      return (
        <table key={key}>
          {head ? (
            <thead>
              <tr>
                {head.children.map((cell, i) => (
                  <th key={i} style={cellAlign(i)}>
                    {renderNodes(cell.children)}
                  </th>
                ))}
              </tr>
            </thead>
          ) : null}
          <tbody>
            {body.map((row, r) => (
              <tr key={r}>
                {row.children.map((cell, i) => (
                  <td key={i} style={cellAlign(i)}>
                    {renderNodes(cell.children)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    case "tableRow":
      return <tr key={key}>{renderNodes(node.children)}</tr>;
    case "tableCell":
      return <td key={key}>{renderNodes(node.children)}</td>;
    case "footnoteReference":
      return (
        <sup key={key} data-footnote-ref="">
          [{node.label ?? node.identifier}]
        </sup>
      );
    case "footnoteDefinition":
      return (
        <div key={key} data-footnote="">
          <sup>[{node.label ?? node.identifier}]</sup> {renderNodes(node.children)}
        </div>
      );
    case "link":
      return (
        <a key={key} href={node.url}>
          {renderNodes(node.children)}
        </a>
      );
    case "image":
      // No-SSRF rule: never emit an external fetch — render the alt text only.
      return <span key={key}>{node.alt ?? ""}</span>;
    case "html":
      // Security rule: never inject raw HTML. Render escaped as text.
      return <code key={key}>{node.value}</code>;
    case "textDirective":
    case "leafDirective":
      return <span key={key}>{renderDirective(node.name, node.children, node.attributes)}</span>;
    case "containerDirective":
      // `:::columns`/`:::column` only mean something to the document-level parser.
      // If one reaches the renderer it's misplaced — nested inside a `:::kind`
      // block, or an orphan `:::column`. Flag it but still render the content.
      if (node.name === "columns" || node.name === "column") {
        return (
          <div key={key}>
            <ErrorChip message={`?${node.name} — only at top level`} />
            {renderNodes(node.children)}
          </div>
        );
      }
      return <div key={key}>{renderNodes(node.children)}</div>;
    default:
      // Any node type without a case (incl. reference-style `linkReference`/
      // `imageReference`/`definition`, which the corpus uses inline forms of)
      // degrades to a visible chip — totality over the open mdast union.
      return <ErrorChip key={key} message={`?${(node as { type: string }).type}`} />;
  }
}

/** Render a list of mdast (+ crossref) nodes to React. Pure, total (never throws). */
export function renderNodes(nodes: readonly RenderableNode[]): ReactNode {
  return nodes.map((node, i) => renderNode(node, i));
}
