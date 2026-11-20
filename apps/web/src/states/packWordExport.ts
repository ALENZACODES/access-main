/**
 * Plain-text and CSV copies of the pack's word list. The CSV has one row per word for the part of the places
 * chosen; its column names and field names are fixed tokens, the same in both languages. Both files carry the
 * OpenStreetMap credit. A word's count says how many places have it, never anything about those places.
 */
import { OSM_CREDIT } from "./dataCredits";
import { type CsvOptions, csvCell } from "./exportData";
import type { WordEntry, WordField } from "./packWordIndex";
import { wordFieldLabel, wordsHeading, wordsIntro } from "./packWordCopy";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

export const WORD_CSV_HEADER = ["word", "field", "places"] as const;
export const WORD_CSV_FILENAMES: Readonly<Record<Locale, string>> = { en: "pack-words.csv", fr: "mots-du-pack.csv" };
export const WORD_TEXT_FILENAMES: Readonly<Record<Locale, string>> = { en: "pack-words.txt", fr: "mots-du-pack.txt" };

export function wordsToCsv(entries: readonly WordEntry[], field: WordField, opts: CsvOptions = {}): string {
  const rows: string[][] = [[...WORD_CSV_HEADER], ...entries.map((e) => [e.word, field, String(e.places)])];
  return (opts.bom ? "\uFEFF" : "") + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function wordsToText(entries: readonly WordEntry[], field: WordField, locale: Locale): string {
  const lines = [wordsHeading(locale), "", wordsIntro(locale), `${t(locale, "Part of the places: ", "Partie des lieux\u00a0: ")}${wordFieldLabel(field, locale)}`, ""];
  for (const e of entries) lines.push(`${e.word}${locale === "fr" ? "\u00a0: " : ": "}${e.places}`);
  lines.push("", OSM_CREDIT);
  return lines.join("\r\n") + "\r\n";
}
