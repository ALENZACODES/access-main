// Reads the workflow files from a checkout: the ones GitHub runs (.github/workflows) and the ones kept ready elsewhere
// (deploy). Node only (tests and CI), never shipped.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { SourceFile } from "./repoAudit";
import { parseWorkflow, type Workflow } from "./wfModel";

const FOLDERS = [".github/workflows", "deploy"];
const YAML = /\.ya?ml$/;

/** The .yml and .yaml files directly inside the workflow folders, in path order. A missing folder is skipped. */
export function loadWorkflowFiles(root: string): SourceFile[] {
  const out: SourceFile[] = [];
  for (const dir of FOLDERS) {
    const full = join(root, dir);
    if (!existsSync(full) || !statSync(full).isDirectory()) continue;
    for (const name of readdirSync(full).sort()) {
      const p = join(full, name);
      if (YAML.test(name) && statSync(p).isFile()) out.push({ path: `${dir}/${name}`, text: readFileSync(p, "utf8") });
    }
  }
  return out;
}

export function loadWorkflows(root: string): Workflow[] {
  return loadWorkflowFiles(root).map((f) => parseWorkflow(f.path, f.text));
}
