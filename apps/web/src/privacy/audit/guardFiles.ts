// Reads the files the strictness audit looks at from a checkout. Node only (tests and CI), never shipped.

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { scanConfig, type ConfigFacts } from "./configScan";
import { loadFiles } from "./repoFiles";
import type { SourceFile } from "./repoAudit";
import { scanScripts, type ScriptFinding } from "./scriptScan";
import { scanSuppressions, type Suppression } from "./suppressScan";
import { parseTsConfig, type TsConfig } from "./tsModel";

/** The folders that hold the App's own code. */
export const CODE_FOLDERS = ["apps", "packages", "scripts", "deploy"] as const;
/** The configuration files at the top of the repository that the audit reads. */
export const CONFIG_FILES = ["vitest.config.ts", "eslint.config.js"] as const;

export interface GuardLoaded {
  tsconfigs: TsConfig[];
  suppressions: Suppression[];
  scripts: ScriptFinding[];
  /** The package.json files read. */
  packageFiles: string[];
  configs: ConfigFacts[];
  /** How many code files were read for the suppression scan. */
  codeFiles: number;
}

const isTsConfig = (p: string): boolean => /(?:^|\/)tsconfig(?:\.[\w-]+)?\.json$/.test(p);
const isPackage = (p: string): boolean => /(?:^|\/)package\.json$/.test(p);
const notSkipped = (p: string): boolean => !/(?:^|\/)(?:node_modules|dist|\.lanes)\//.test(p);

function readIfThere(root: string, rel: string): SourceFile | null {
  const full = join(root, rel);
  return existsSync(full) && statSync(full).isFile() ? { path: rel, text: readFileSync(full, "utf8") } : null;
}

/** Reads and scans everything. A file that is not there is skipped. */
export function loadGuard(root: string): GuardLoaded {
  const all = loadFiles(root, CODE_FOLDERS);
  const top = [readIfThere(root, "tsconfig.json"), readIfThere(root, "package.json")].filter((f): f is SourceFile => f !== null);
  const tsFiles = [...all, ...top].filter((f) => isTsConfig(f.path) && notSkipped(f.path));
  const pkgFiles = [...all, ...top].filter((f) => isPackage(f.path) && notSkipped(f.path));
  const code = all.filter((f) => !isTsConfig(f.path) && !isPackage(f.path));
  const configs = CONFIG_FILES.map((p) => readIfThere(root, p)).filter((f): f is SourceFile => f !== null);
  return {
    tsconfigs: tsFiles.map((f) => parseTsConfig(f.path, f.text)).sort((a, b) => (a.path < b.path ? -1 : 1)),
    suppressions: scanSuppressions(code),
    scripts: pkgFiles.flatMap((f) => scanScripts(f.path, f.text)),
    packageFiles: pkgFiles.map((f) => f.path).sort(),
    configs: configs.map((f) => scanConfig(f.path, f.text)),
    codeFiles: code.length,
  };
}
