// Compares what was read from the shipped packs with the register, in both directions.

import type { PkAcceptRow, PkPackRow } from "./pkRegister";
import { PK_ACCEPTABLE } from "./pkRegister";
import type { PkFinding } from "./pkRules";

export type PkProblemCode =
  | "pack-added"
  | "pack-gone"
  | "host-added"
  | "host-gone"
  | "source-added"
  | "source-gone"
  | "source-licence-changed"
  | "finding-not-accepted"
  | "accepted-gone"
  | "count-changed"
  | "unacceptable-code";

export interface PkProblem {
  code: PkProblemCode;
  key: string;
  detail: string;
}

/** What was read from one pack. */
export interface PkRead {
  id: string;
  hosts: readonly string[];
  sources: ReadonlyArray<{ name: string; licence: string }>;
  findings: readonly PkFinding[];
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Every host a pack's addresses use, once each, in order. */
export function hostsOf(urls: readonly string[]): string[] {
  const hosts = new Set<string>();
  for (const u of urls) {
    const m = /^[a-z][a-z0-9+.-]*:\/\/(?:[^/?#@]*@)?([^/?#:]+)/i.exec(u);
    if (m?.[1]) hosts.add(m[1].toLowerCase());
  }
  return [...hosts].sort();
}

export function comparePacks(read: readonly PkRead[], register: readonly PkPackRow[]): PkProblem[] {
  const out: PkProblem[] = [];
  const row = new Map(register.map((r) => [r.id, r]));
  const got = new Map(read.map((r) => [r.id, r]));
  for (const id of [...got.keys()].sort()) {
    const r = got.get(id);
    const reg = row.get(id);
    if (!r) continue;
    if (!reg) {
      out.push({ code: "pack-added", key: id, detail: "the pack is not in the register" });
      continue;
    }
    for (const h of r.hosts) if (!reg.hosts.includes(h)) out.push({ code: "host-added", key: `${id} ${h}`, detail: "the pack links to a host the register does not list" });
    for (const h of reg.hosts) if (!r.hosts.includes(h)) out.push({ code: "host-gone", key: `${id} ${h}`, detail: "the register lists a host the pack no longer links to" });
    for (const s of r.sources) {
      const l = reg.sources.find((x) => x.name === s.name);
      if (!l) out.push({ code: "source-added", key: `${id} ${s.name}`, detail: `licence ${s.licence}` });
      else if (l.licence !== s.licence) out.push({ code: "source-licence-changed", key: `${id} ${s.name}`, detail: `register ${l.licence}; manifest ${s.licence}` });
    }
    for (const s of reg.sources) if (!r.sources.some((x) => x.name === s.name)) out.push({ code: "source-gone", key: `${id} ${s.name}`, detail: "the register lists it; the manifest does not" });
  }
  for (const id of [...row.keys()].sort()) if (!got.has(id)) out.push({ code: "pack-gone", key: id, detail: "the register lists a pack that is not there" });
  return out;
}

/** Findings against the accepted list: exactly the accepted ones, with the accepted counts. */
export function compareAccepted(read: readonly PkRead[], accepted: readonly PkAcceptRow[]): PkProblem[] {
  const out: PkProblem[] = [];
  const found = new Map<string, number>();
  for (const r of read) for (const f of r.findings) found.set(`${r.id} ${f.code}`, (found.get(`${r.id} ${f.code}`) ?? 0) + 1);
  const acc = new Map(accepted.map((a) => [`${a.pack} ${a.code}`, a]));
  for (const a of accepted) if (!PK_ACCEPTABLE.includes(a.code)) out.push({ code: "unacceptable-code", key: `${a.pack} ${a.code}`, detail: "this code may not be accepted" });
  for (const [key, n] of [...found.entries()].sort((a, b) => cmp(a[0], b[0]))) {
    const a = acc.get(key);
    if (!a) out.push({ code: "finding-not-accepted", key, detail: `${n} finding${n === 1 ? "" : "s"} not on the accepted list` });
    else if (a.count !== n) out.push({ code: "count-changed", key, detail: `accepted ×${a.count}, found ×${n}` });
  }
  for (const [key, a] of [...acc.entries()].sort((x, y) => cmp(x[0], y[0]))) if (!found.has(key)) out.push({ code: "accepted-gone", key, detail: `accepted ×${a.count}; none found` });
  return out;
}

export const formatPkProblem = (p: PkProblem): string => `${p.code} ${p.key}: ${p.detail}`;
export const formatPkProblems = (list: readonly PkProblem[]): string => list.map(formatPkProblem).join("\n");
