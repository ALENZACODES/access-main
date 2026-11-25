// Turns the sites found by dgScan into findings. A console call, a debugger statement, a browser dialog, the stack
// of an error, a hook for errors nobody caught and the text of a caught error are findings; a thrown message that
// writes a value with a name like a person's input is one too. Some may be accepted with a reason (dgRegister).

import type { DgSite } from "./dgScan";

export type DgCode =
  | "dg-console"
  | "dg-debugger"
  | "dg-dialog"
  | "dg-error-hook"
  | "dg-boundary"
  | "dg-error-text"
  | "dg-error-stack"
  | "dg-error-string"
  | "dg-throw-user-name";

export const DG_CODES: readonly DgCode[] = ["dg-console", "dg-debugger", "dg-dialog", "dg-error-hook", "dg-boundary", "dg-error-text", "dg-error-stack", "dg-error-string", "dg-throw-user-name"];

export interface DgFinding {
  code: DgCode;
  path: string;
  line: number;
  detail: string;
}

const CODE_OF: Record<DgSite["kind"], DgCode | null> = {
  console: "dg-console",
  debugger: "dg-debugger",
  dialog: "dg-dialog",
  "error-hook": "dg-error-hook",
  boundary: "dg-boundary",
  "error-text": "dg-error-text",
  "error-stack": "dg-error-stack",
  "error-string": "dg-error-string",
  "throw-template": null,
};

/** Findings for the sites, in path and line order. A thrown message is a finding only when it names user values. */
export function auditSites(sites: readonly DgSite[]): DgFinding[] {
  const out: DgFinding[] = [];
  for (const s of sites) {
    if (s.kind === "throw-template") {
      if (s.userNames.length > 0) out.push({ code: "dg-throw-user-name", path: s.path, line: s.line, detail: `${s.detail} (names: ${s.userNames.join(", ")})` });
      continue;
    }
    const code = CODE_OF[s.kind];
    if (code !== null) out.push({ code, path: s.path, line: s.line, detail: s.detail });
  }
  return sortFindings(out);
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function sortFindings(list: readonly DgFinding[]): DgFinding[] {
  return [...list].sort((a, b) => cmp(a.path, b.path) || a.line - b.line || cmp(a.code, b.code) || cmp(a.detail, b.detail));
}

export const formatFinding = (f: DgFinding): string => `${f.path}:${f.line} ${f.code}: ${f.detail}`;

/** The count of findings for each path and code, in path then code order. */
export function countFindings(list: readonly DgFinding[]): Array<{ path: string; code: DgCode; count: number }> {
  const m = new Map<string, { path: string; code: DgCode; count: number }>();
  for (const f of list) {
    const k = `${f.path}\u0000${f.code}`;
    const row = m.get(k);
    if (row) row.count += 1;
    else m.set(k, { path: f.path, code: f.code, count: 1 });
  }
  return [...m.values()].sort((a, b) => cmp(a.path, b.path) || cmp(a.code, b.code));
}
