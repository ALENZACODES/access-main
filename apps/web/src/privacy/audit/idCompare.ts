// Compares the findings of the scan with the accepted rows. A finding with no row, a row with no finding, a count
// that is not the same, and a row for a code that may never be accepted are problems.

import { ID_ACCEPTABLE } from "./idRules";
import type { IdCode, IdFinding } from "./idRules";
import type { IdAcceptRow } from "./idRegister";

export type IdProblemCode = "finding-not-accepted" | "accepted-gone" | "count-changed" | "unacceptable-code";

export interface IdProblem {
  code: IdProblemCode;
  path: string;
  idCode: IdCode;
  detail: string;
}

export function compareIds(findings: readonly IdFinding[], rows: readonly IdAcceptRow[]): IdProblem[] {
  const found = new Map<string, { path: string; code: IdCode; lines: number[] }>();
  for (const f of findings) {
    const key = `${f.path}\u0000${f.code}`;
    const e = found.get(key) ?? { path: f.path, code: f.code, lines: [] };
    e.lines.push(f.line);
    found.set(key, e);
  }
  const listed = new Map<string, IdAcceptRow>(rows.map((r) => [`${r.path}\u0000${r.code}`, r]));
  const out: IdProblem[] = [];
  for (const [key, e] of found) {
    if (!ID_ACCEPTABLE.includes(e.code)) {
      out.push({ code: "unacceptable-code", path: e.path, idCode: e.code, detail: `${e.code} at line ${e.lines.join(", ")} may never be accepted` });
      continue;
    }
    const row = listed.get(key);
    if (row === undefined) out.push({ code: "finding-not-accepted", path: e.path, idCode: e.code, detail: `${e.lines.length} at line ${e.lines.join(", ")}` });
    else if (row.count !== e.lines.length) out.push({ code: "count-changed", path: e.path, idCode: e.code, detail: `accepted ${row.count}, found ${e.lines.length}` });
  }
  for (const [key, r] of listed) if (!found.has(key)) out.push({ code: "accepted-gone", path: r.path, idCode: r.code, detail: `accepted ${r.count}, found none` });
  return out.sort((a, b) => (a.path + a.idCode + a.code < b.path + b.idCode + b.code ? -1 : 1));
}

export function formatIdProblem(p: IdProblem): string {
  return `${p.path}: ${p.code}: ${p.idCode}: ${p.detail}`;
}

export function formatIdProblems(ps: readonly IdProblem[]): string[] {
  return ps.map(formatIdProblem);
}
