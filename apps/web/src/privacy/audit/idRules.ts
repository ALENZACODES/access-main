// Turns the sites of the identifier scan into findings and says which findings may ever be accepted. A read that
// reveals a lot about the device is never acceptable. An identifier made with Math.random is never acceptable on a
// line that also stores or sends something, because Math.random is not a source of unguessable values.

import type { IdKind, IdSite } from "./idScan";

export type IdCode = "id-uuid" | "id-random-bytes" | "id-math-random" | "id-math-random-moves" | "id-time-id" | "id-device-high" | "id-device-low";

export const ID_CODES: readonly IdCode[] = ["id-uuid", "id-random-bytes", "id-math-random", "id-math-random-moves", "id-time-id", "id-device-high", "id-device-low"];

/** Codes that may be accepted with a reason. The other two never may. */
export const ID_ACCEPTABLE: readonly IdCode[] = ["id-uuid", "id-random-bytes", "id-math-random", "id-time-id", "id-device-low"];

export interface IdFinding {
  path: string;
  line: number;
  code: IdCode;
  detail: string;
}

const BY_KIND: Record<IdKind, IdCode> = {
  uuid: "id-uuid",
  "random-bytes": "id-random-bytes",
  "math-random": "id-math-random",
  "time-id": "id-time-id",
  "device-high": "id-device-high",
  "device-low": "id-device-low",
};

export function codeFor(site: IdSite): IdCode {
  if (site.kind === "math-random" && site.moves) return "id-math-random-moves";
  return BY_KIND[site.kind];
}

export function auditSites(sites: readonly IdSite[]): IdFinding[] {
  return sites.map((s) => ({ path: s.path, line: s.line, code: codeFor(s), detail: s.detail }));
}

export function isAcceptable(code: IdCode): boolean {
  return ID_ACCEPTABLE.includes(code);
}

export function countFindings(findings: readonly IdFinding[]): Record<IdCode, number> {
  const out = Object.fromEntries(ID_CODES.map((c) => [c, 0])) as Record<IdCode, number>;
  for (const f of findings) out[f.code]++;
  return out;
}

export function formatFinding(f: IdFinding): string {
  return `${f.path}:${f.line}: ${f.code}: ${f.detail}`;
}

/** Findings in the order of path, then line, then code. */
export function sortFindings(findings: readonly IdFinding[]): IdFinding[] {
  return [...findings].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.line - b.line || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0)));
}
