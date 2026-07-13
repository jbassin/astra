import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export interface WalkedFile {
  /** POSIX-separated path relative to the walk root — stable across OSes. */
  relPath: string;
  absPath: string;
}

/**
 * Recursively lists every regular file under `root`, sorted by `relPath`. Shared by
 * both fetchers' counting/hashing/copy logic (`hash.ts`, `foundrySnapshot.ts`) — pure
 * filesystem traversal, no git, no network, so it's fully testable against a temp-dir
 * fixture tree.
 */
export function walkFiles(root: string): WalkedFile[] {
  const out: WalkedFile[] = [];
  const stack: string[] = [root];
  for (let dir = stack.pop(); dir !== undefined; dir = stack.pop()) {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      const st = statSync(abs);
      if (st.isDirectory()) {
        stack.push(abs);
      } else if (st.isFile()) {
        out.push({ absPath: abs, relPath: relative(root, abs).split(sep).join("/") });
      }
    }
  }
  out.sort((a, b) => a.relPath.localeCompare(b.relPath));
  return out;
}
