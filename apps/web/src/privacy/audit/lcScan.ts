// Finds where the App's code writes a latitude or a longitude into text or data: a number cut to a set number of
// decimals, a number written as it is, and a number rounded with a power of ten. It reads text. A site says what the
// code does at that line; it does not follow the value to where it goes, and it does not know whether a coordinate
// belongs to a place in the pack or to a point the person typed.

import type { SourceFile } from "./repoAudit";
import { lineAt, maskCode } from "./lcMask";

export type LcKind =
  /** x.lat.toFixed(5): cut to a set number of decimals. The detail gives the number. */
  | "fixed"
  /** x.lat.toFixed(n): cut to a number of decimals that is not written in the call. */
  | "fixed-variable"
  /** String(x.lat), ${x.lat}, [x.lon, x.lat]: the number as it is, with as many decimals as it has. */
  | "raw"
  /** Math.round(n * 1e5) / 1e5: rounded with a power of ten. The detail gives the exponent. */
  | "rounded";

export const LC_KINDS: readonly LcKind[] = ["fixed", "fixed-variable", "raw", "rounded"];

export interface LcSite {
  path: string;
  line: number;
  kind: LcKind;
  /** For fixed and rounded, the number of decimals; otherwise 0. */
  digits: number;
  detail: string;
}

const CHAIN = String.raw`[A-Za-z_$][\w$]*(?:\s*\??\.\s*[A-Za-z_$][\w$]*|\[[^\]\n]*\])*`;
const COORD_NAME = /(?:^|[.\s?])(?:lat|lon|lng|latitude|longitude)$/i;
const COORD_ANY = /\b(?:lat|lon|lng|latitude|longitude)\b/i;

const FIXED = new RegExp(String.raw`(${CHAIN})\s*\.\s*toFixed\s*\(\s*([^()\n]*?)\s*\)`, "g");
const STRING_OF = new RegExp(String.raw`\bString\s*\(\s*(${CHAIN})\s*\)`, "g");
const IN_TEMPLATE = new RegExp(String.raw`\$\{\s*(${CHAIN})\s*\}`, "g");
const PAIR_LITERAL = new RegExp(String.raw`\[\s*(${CHAIN})\s*,\s*(${CHAIN})\s*\]`, "g");
const ROUND = /Math\s*\.\s*round\s*\(\s*([^()\n]*?)\*\s*1e(\d+)\s*\)/g;

/** The text of the line of the index and `n` lines before and after it. */
export function linesAround(text: string, index: number, n: number): string {
  const lines = text.split("\n");
  let start = 0;
  let row = 0;
  while (row < lines.length - 1 && start + (lines[row] as string).length < index) {
    start += (lines[row] as string).length + 1;
    row++;
  }
  return lines.slice(Math.max(0, row - n), row + n + 1).join("\n");
}

const endsLikeCoordinate = (chain: string): boolean => COORD_NAME.test(chain.replace(/\s+/g, ""));

export function scanCoordinatesFile(file: SourceFile): LcSite[] {
  const masked = maskCode(file.text);
  const out: LcSite[] = [];
  const add = (index: number, kind: LcKind, digits: number, detail: string): void => {
    out.push({ path: file.path, line: lineAt(file.text, index), kind, digits, detail: detail.replace(/\s+/g, " ").trim().slice(0, 60) });
  };
  for (const m of masked.matchAll(FIXED)) {
    const chain = (m[1] as string).replace(/\s+/g, "");
    if (!endsLikeCoordinate(chain) && !COORD_ANY.test(linesAround(masked, m.index ?? 0, 2))) continue;
    const arg = (m[2] as string).trim();
    if (/^\d+$/.test(arg)) add(m.index ?? 0, "fixed", Number(arg), `${chain}.toFixed(${arg})`);
    else add(m.index ?? 0, "fixed-variable", 0, `${chain}.toFixed(${arg})`);
  }
  for (const m of masked.matchAll(STRING_OF)) if (endsLikeCoordinate(m[1] as string)) add(m.index ?? 0, "raw", 0, `String(${(m[1] as string).replace(/\s+/g, "")})`);
  for (const m of masked.matchAll(IN_TEMPLATE)) if (endsLikeCoordinate(m[1] as string)) add(m.index ?? 0, "raw", 0, `\${${(m[1] as string).replace(/\s+/g, "")}}`);
  for (const m of masked.matchAll(PAIR_LITERAL)) {
    const [one, two] = [m[1] as string, m[2] as string];
    // A pair of plain names, such as the dependencies of a hook, is not a write of a point.
    if (one.includes(".") && two.includes(".") && endsLikeCoordinate(one) && endsLikeCoordinate(two)) add(m.index ?? 0, "raw", 0, `[${(m[1] as string).replace(/\s+/g, "")}, ${(m[2] as string).replace(/\s+/g, "")}]`);
  }
  for (const m of masked.matchAll(ROUND)) {
    const near = masked.slice(Math.max(0, (m.index ?? 0) - 200), (m.index ?? 0) + m[0].length + 200);
    if (COORD_ANY.test(near)) add(m.index ?? 0, "rounded", Number(m[2]), `Math.round(… * 1e${m[2]})`);
  }
  return out.sort((a, b) => a.line - b.line || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
}

/** Whether a repo-relative path is read: code of the App that ships, not tests and not the audit tooling. */
export function isCoordinateScanned(path: string): boolean {
  if (!path.startsWith("apps/web/src/")) return false;
  if (!/\.(ts|tsx|mjs|js)$/.test(path)) return false;
  if (/\.(test|spec)\.(ts|tsx|mjs|js)$/.test(path)) return false;
  if (path.startsWith("apps/web/src/privacy/audit/")) return false;
  if (/(^|\/)[A-Za-z]*[Ff]ixtures?\.(ts|tsx)$/.test(path)) return false;
  return true;
}

export function scanCoordinates(files: readonly SourceFile[]): LcSite[] {
  const out: LcSite[] = [];
  for (const f of files) if (isCoordinateScanned(f.path)) out.push(...scanCoordinatesFile(f));
  return out.sort((a, b) => (a.path === b.path ? a.line - b.line : a.path < b.path ? -1 : 1));
}

/** How many sites of each kind. */
export function countLcKinds(sites: readonly LcSite[]): Record<LcKind, number> {
  const out = Object.fromEntries(LC_KINDS.map((k) => [k, 0])) as Record<LcKind, number>;
  for (const s of sites) out[s.kind]++;
  return out;
}

/** How many sites write each number of decimals, for the sites that name one. */
export function digitsInUse(sites: readonly LcSite[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const s of sites) if (s.kind === "fixed" || s.kind === "rounded") m.set(s.digits, (m.get(s.digits) ?? 0) + 1);
  return new Map([...m.entries()].sort((a, b) => a[0] - b[0]));
}
