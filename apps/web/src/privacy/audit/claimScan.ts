// Finds the statements in the App's own text that say data stays on the device or is not sent, so each one can
// be listed and checked against what the code does. Only lines that hold a quoted string are read, never comment
// lines, so a note to developers is not counted as a statement to a person. The patterns are the plain wordings
// the App uses; a statement worded some other way is not found. Node only, never shipped.

import type { SourceFile } from "./repoAudit";
import { isScannedSource } from "./storageKeys";

export interface FoundClaims {
  path: string;
  /** Lines with an English statement */
  en: number;
  /** Lines with a French statement */
  fr: number;
  /** 1-based lines of every statement, sorted */
  lines: number[];
}

const EN = /nothing (?:is )?(?:sent|uploaded|published|transmitted)|not (?:sent|uploaded) anywhere|(?:stays?|stay) on (?:this|your) device|does not upload|no uploads?|no data (?:is )?transmitted|\bno accounts?\b|never leaves?/i;
const FR = /rien (?:ici )?n['’]est (?:envoy|publi|transmis)|aucune donnée n['’]est envoy|envoy\p{L}*\s+(?:nulle part|ailleurs)|reste(?:nt)? sur (?:cet|votre) appareil|n['’]envoie (?:rien|jamais)|(?:ce panneau )?ne transmet aucune donnée|pas de serveur/iu;

const HAS_QUOTE = /["'`]/;
const isComment = (line: string): boolean => /^\s*(\/\/|\*|\/\*)/.test(line);

/** Files that hold test data or tool output, where a matching line is not a statement to a person. */
const SKIPPED: readonly RegExp[] = [/^apps\/web\/src\/privacy\//, /\.node\.mjs$/, /-testkit\.ts$/, /(^|\/)samples\.ts$/];

export function scanClaims(files: readonly SourceFile[]): FoundClaims[] {
  const out: FoundClaims[] = [];
  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    if (!isScannedSource(file.path) || SKIPPED.some((re) => re.test(file.path))) continue;
    let en = 0;
    let fr = 0;
    const lines: number[] = [];
    file.text.split("\n").forEach((line, i) => {
      if (isComment(line) || !HAS_QUOTE.test(line)) return;
      const isEn = EN.test(line);
      const isFr = FR.test(line);
      if (isEn) en += 1;
      if (isFr) fr += 1;
      if (isEn || isFr) lines.push(i + 1);
    });
    if (lines.length > 0) out.push({ path: file.path, en, fr, lines });
  }
  return out;
}

export interface StatementComparison {
  /** Files that hold statements and have no row */
  unlisted: FoundClaims[];
  /** Rows whose file no longer holds a statement */
  stale: StatementRowLike[];
  /** Files whose counts differ from the row */
  differences: string[];
}

export interface StatementRowLike {
  path: string;
  en: number;
  fr: number;
}

export function compareClaims(found: readonly FoundClaims[], rows: readonly StatementRowLike[]): StatementComparison {
  const byPath = new Map(rows.map((r) => [r.path, r]));
  const seen = new Map(found.map((f) => [f.path, f]));
  const differences: string[] = [];
  for (const f of found) {
    const r = byPath.get(f.path);
    if (r !== undefined && (r.en !== f.en || r.fr !== f.fr)) differences.push(`${f.path}: the register says ${r.en} English and ${r.fr} French, the source has ${f.en} and ${f.fr} (line ${f.lines.join(", ")})`);
  }
  return { unlisted: found.filter((f) => !byPath.has(f.path)), stale: rows.filter((r) => !seen.has(r.path)), differences };
}

export function formatClaimComparison(c: StatementComparison): string {
  const lines: string[] = [];
  for (const f of c.unlisted) lines.push(`${f.path}: holds ${f.en + f.fr} statement${f.en + f.fr === 1 ? "" : "s"} (line ${f.lines.join(", ")}) but has no row in statementRegister.ts`);
  for (const r of c.stale) lines.push(`${r.path}: in statementRegister.ts but the source holds no statement there`);
  lines.push(...c.differences);
  return lines.join("\n");
}
