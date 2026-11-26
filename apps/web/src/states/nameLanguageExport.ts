/** The name readings as text or CSV, made on this device. Every row passed in is written, not only those shown. */
import { csvCell } from "./exportData";
import type { SavedFile } from "./downloadFile";
import { NL_CSV_HEADER, NL_CSV_NAME, NL_TEXT_NAME, nlCaveat, nlMatchLabel, nlNoName, nlReadingLabel, nlRowLine } from "./nameLanguageCopy";
import type { NameRow } from "./nameLanguageReport";
import type { Locale } from "./stateCopy";

export function namesToCsv(rows: readonly NameRow[], opts: { bom?: boolean } = {}): string {
  const lines: string[][] = [[...NL_CSV_HEADER]];
  for (const r of rows) {
    lines.push([r.id, r.name ?? "", r.kind, r.language.reading, r.language.french.join(" "), r.language.english.join(" "), String(r.language.accents), r.language.pair ? "yes" : "no", r.addressLanguage.reading, r.match]);
  }
  return (opts.bom ? "﻿" : "") + lines.map((l) => l.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function namesToText(rows: readonly NameRow[], locale: Locale): string {
  const out: string[] = [nlCaveat(locale), ""];
  for (const r of rows) {
    out.push(`${r.name ?? nlNoName(locale)} (${r.id})`);
    out.push(`  ${nlReadingLabel(r.language.reading, locale)}`);
    if (r.match === "differs") out.push(`  ${nlMatchLabel(r.match, locale)}`);
    if (r.language.french.length > 0 || r.language.english.length > 0) out.push(`  ${nlRowLine(r.language, locale)}`);
    out.push("");
  }
  return out.join("\n");
}

export const namesCsvFile = (rows: readonly NameRow[], l: Locale): SavedFile => ({ name: NL_CSV_NAME[l], mime: "text/csv;charset=utf-8", content: namesToCsv(rows, { bom: true }) });
export const namesTextFile = (rows: readonly NameRow[], l: Locale): SavedFile => ({ name: NL_TEXT_NAME[l], mime: "text/plain;charset=utf-8", content: namesToText(rows, l) });
