/** The reading scores of the notes on screen as text or CSV. Made on this device from what is listed. */
import { csvCell } from "./exportData";
import type { SavedFile } from "./downloadFile";
import { READ_CSV_HEADER, READ_CSV_NAME, READ_TEXT_NAME, readingBandLabel, readNoName, readTextCaveat } from "./noteReadabilityCopy";
import type { ReadingEntry } from "./noteReadabilityIndex";
import type { Locale } from "./stateCopy";

const round1 = (n: number): string => (Math.round(n * 10) / 10).toString();

export interface ReadingCsvOptions {
  readonly bom?: boolean;
}

/** One row per listed note. Band names are fixed English tokens so the file reads the same on any page. */
export function readingsToCsv(entries: readonly ReadingEntry[], opts: ReadingCsvOptions = {}): string {
  const rows: string[][] = [[...READ_CSV_HEADER]];
  for (const e of entries) {
    const r = e.reading;
    rows.push([e.id, e.name ?? "", r.locale, r.score === null ? "" : String(r.score), r.band ?? "", String(r.words), String(r.sentences), round1(r.wordsPerSentence), r.longWords.join(" "), String(r.longSentences.length)]);
  }
  return (opts.bom ? "﻿" : "") + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function readingsToText(entries: readonly ReadingEntry[], locale: Locale): string {
  const out: string[] = [readTextCaveat(locale), ""];
  for (const e of entries) {
    const r = e.reading;
    out.push(`${e.name ?? readNoName(locale)} (${e.id})`);
    out.push(`  ${r.score === null ? "-" : `${r.score}/100, ${readingBandLabel(r.band!, locale)}`}; ${r.words} / ${r.sentences}; ${round1(r.wordsPerSentence)}`);
    out.push(`  ${e.note}`);
    out.push("");
  }
  return out.join("\n");
}

export const readingCsvFile = (entries: readonly ReadingEntry[], locale: Locale): SavedFile => ({ name: READ_CSV_NAME[locale], mime: "text/csv;charset=utf-8", content: readingsToCsv(entries, { bom: true }) });
export const readingTextFile = (entries: readonly ReadingEntry[], locale: Locale): SavedFile => ({ name: READ_TEXT_NAME[locale], mime: "text/plain;charset=utf-8", content: readingsToText(entries, locale) });
