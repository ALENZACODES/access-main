// Reads files for the repository audit. Node only (tests and CI), never shipped to the browser.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { SourceFile } from "./repoAudit";

const SKIP_DIRS = new Set(["node_modules", "dist", "build", "coverage", ".git", ".next", ".turbo", "playwright-report", "test-results"]);
const MAX_BYTES = 1_000_000;

function walk(dir: string, root: string, out: SourceFile[]): void {
  for (const name of readdirSync(dir).sort()) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, root, out);
    else if (st.isFile() && st.size <= MAX_BYTES) {
      out.push({ path: relative(root, full).split(sep).join("/"), text: readFileSync(full, "utf8") });
    }
  }
}

/** Files under the given repo-relative folders. A folder that does not exist is skipped. */
export function loadFiles(root: string, folders: readonly string[]): SourceFile[] {
  const out: SourceFile[] = [];
  for (const f of folders) {
    const dir = join(root, f);
    if (existsSync(dir) && statSync(dir).isDirectory()) walk(dir, root, out);
  }
  return out;
}
