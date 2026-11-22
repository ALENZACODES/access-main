/** The by-kind table as CSV or text, made on this device. */
import type { SavedFile } from "./downloadFile";
import { csvCell } from "./exportData";
import type { Locale } from "./stateCopy";
import { TS_CSV_HEADER, TS_CSV_NAME, tsCaption, tsColumns, tsPercent } from "./tagNoteMoreCopy";
import type { SpreadRow } from "./tagNoteSpread";

/** One row per kind. Numbers are plain digits; the share is a whole number without a percent sign. */
export function spreadToCsv(rows: readonly SpreadRow[], opts: { bom?: boolean } = {}): string {
  const lines: string[][] = [[...TS_CSV_HEADER]];
  for (const r of rows) lines.push([r.label, String(r.checked), String(r.flagged), String(r.clear), String(r.percent)]);
  return (opts.bom ? "﻿" : "") + lines.map((l) => l.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function spreadToText(rows: readonly SpreadRow[], locale: Locale): string {
  const c = tsColumns(locale);
  const out = [tsCaption(locale), ""];
  for (const r of rows) out.push(`${r.label}: ${c.checked} ${r.checked}, ${c.flagged} ${r.flagged}, ${c.clear} ${r.clear}, ${c.share} ${tsPercent(r.percent, locale)}`);
  return out.join("\n") + "\n";
}

export const spreadCsvFile = (rows: readonly SpreadRow[], locale: Locale): SavedFile => ({ name: TS_CSV_NAME[locale], mime: "text/csv;charset=utf-8", content: spreadToCsv(rows, { bom: true }) });
