// Puts the rules for the text, the addresses, the points and the manifest together into one list of findings for a pack.

import { checkHelpNumber, type PkHelpCode } from "./pkHelp";
import { checkPlaceGeo, TORONTO_BOX, type PkBox, type PkGeoCode } from "./pkGeo";
import { checkIntegrity, type PkIntegrityCode, type PkMeasured } from "./pkIntegrity";
import { checkText, isUrlKey, type PkTextCode } from "./pkText";
import { checkUrl, type PkUrlCode } from "./pkUrl";
import { isRecord, walkPack } from "./pkWalk";

export type PkCode = PkTextCode | PkUrlCode | PkGeoCode | PkIntegrityCode | PkHelpCode | "pk-file-truncated";

export interface PkFinding {
  code: PkCode;
  /** The file the finding is in: "manifest" or "content". */
  file: "manifest" | "content" | "pack";
  /** Where in the file. */
  path: string;
  detail: string;
}

export interface PkOptions {
  /** The hosts the pack may link to. */
  hosts: readonly string[];
  box?: PkBox;
}

export interface PkInput {
  manifest: unknown;
  content: unknown;
  measured: PkMeasured | null;
}

function textAndUrlFindings(file: "manifest" | "content", value: unknown, hosts: readonly string[]): PkFinding[] {
  const out: PkFinding[] = [];
  const walked = walkPack(value);
  if (walked.truncated) out.push({ code: "pk-file-truncated", file, path: "", detail: "the file is deeper or larger than the audit reads" });
  for (const leaf of walked.leaves) {
    if (isUrlKey(leaf.key)) {
      if (leaf.key === "content_path") continue;
      for (const p of checkUrl(leaf.text, hosts)) out.push({ code: p.code, file, path: leaf.path, detail: p.detail });
    } else {
      for (const p of checkText(leaf)) out.push({ code: p.code, file, path: leaf.path, detail: p.detail });
    }
  }
  return out;
}

/** Every finding for one pack, in a stable order. */
export function auditPack(input: PkInput, options: PkOptions): PkFinding[] {
  const out: PkFinding[] = [];
  out.push(...textAndUrlFindings("manifest", input.manifest, options.hosts));
  out.push(...textAndUrlFindings("content", input.content, options.hosts));
  if (isRecord(input.content) && Array.isArray(input.content["places"])) {
    input.content["places"].forEach((p, i) => {
      for (const g of checkPlaceGeo(p, options.box ?? TORONTO_BOX)) out.push({ code: g.code, file: "content", path: `places[${i}]`, detail: g.detail });
    });
  }
  if (isRecord(input.content) && Array.isArray(input.content["help_numbers"])) {
    input.content["help_numbers"].forEach((h, i) => {
      for (const p of checkHelpNumber(h)) out.push({ code: p.code, file: "content", path: `help_numbers[${i}]`, detail: p.detail });
    });
  }
  for (const p of checkIntegrity(input.manifest, input.content, input.measured)) out.push({ code: p.code, file: "pack", path: p.path, detail: p.detail });
  return sortPkFindings(out);
}

export function sortPkFindings(list: readonly PkFinding[]): PkFinding[] {
  return [...list].sort((a, b) => cmp(a.file, b.file) || cmp(a.path, b.path) || cmp(a.code, b.code) || cmp(a.detail, b.detail));
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export const formatPkFinding = (f: PkFinding): string => `${f.file}${f.path === "" ? "" : ` ${f.path}`} ${f.code}: ${f.detail}`;

/** The count of findings for each code, in code order. */
export function countByCode(list: readonly PkFinding[]): Array<[PkCode, number]> {
  const m = new Map<PkCode, number>();
  for (const f of list) m.set(f.code, (m.get(f.code) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => cmp(a[0], b[0]));
}
