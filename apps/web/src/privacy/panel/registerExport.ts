// The storage register as a file a person can keep or open in a spreadsheet: what the App keeps in
// this browser, whether saving it needs the person's choice, whether the panel's Erase reaches it,
// and where the statement came from. Written offline. The App's own key names are left out because
// they mean nothing to the person; storage whose key is not known is listed and marked as such.

import type { Locale } from "./copyLint";
import { csvCell } from "./inventoryExport";
import type { ExportFile } from "./localData";
import type { RegisterRow, UnscannedRow } from "./storageRegister";

const NBSP = " ";

export const REGISTER_STRINGS = {
  en: {
    title: "What the App keeps on this device",
    header: ["Item", "Needs your choice before saving", "Reached by the erase button", "Source", "Recorded on"],
    yes: "Yes",
    no: "No",
    notConfirmed: "Not confirmed",
    unconfirmedSource: "The key is set inside another package, so it was not read",
    line: { choice: "Needs your choice before saving", erase: "Reached by the erase button", source: "Source", date: "Recorded on" },
  },
  fr: {
    title: "Ce que l’App conserve sur cet appareil",
    header: ["Élément", "Votre choix est requis avant l’enregistrement", "Touché par le bouton d’effacement", "Source", "Date d’inscription"],
    yes: "Oui",
    no: "Non",
    notConfirmed: "Non confirmé",
    unconfirmedSource: "La clé est définie dans un autre paquet, elle n’a donc pas été lue",
    line: { choice: "Votre choix est requis avant l’enregistrement", erase: "Touché par le bouton d’effacement", source: "Source", date: "Date d’inscription" },
  },
} as const;

export interface RegisterLine {
  item: string;
  choice: string;
  erase: string;
  source: string;
  recordedOn: string;
}

function localDate(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** One line per item. Rows come first, in the language's alphabetical order, then storage that could not be read. */
export function registerLines(locale: Locale, register: readonly RegisterRow[], unscanned: readonly UnscannedRow[], prefix: string): RegisterLine[] {
  const s = REGISTER_STRINGS[locale];
  const rows: RegisterLine[] = register.map((r) => ({
    item: r.holds[locale],
    choice: r.gated ? s.yes : s.no,
    erase: r.key.startsWith(prefix) ? s.yes : s.no,
    source: r.source,
    recordedOn: r.recordedOn,
  }));
  rows.sort((a, b) => a.item.localeCompare(b.item, locale));
  return [
    ...rows,
    ...unscanned.map((u) => ({ item: u.holds[locale], choice: s.notConfirmed, erase: s.notConfirmed, source: s.unconfirmedSource, recordedOn: u.recordedOn })),
  ];
}

export function registerAsCsv(
  locale: Locale,
  register: readonly RegisterRow[],
  unscanned: readonly UnscannedRow[],
  prefix: string,
  now: Date,
  delimiter: "," | ";" = ",",
): ExportFile {
  const lines = registerLines(locale, register, unscanned, prefix);
  const row = (cells: readonly string[]): string => `${cells.map((c) => csvCell(c, delimiter)).join(delimiter)}\r\n`;
  const text = row(REGISTER_STRINGS[locale].header) + lines.map((l) => row([l.item, l.choice, l.erase, l.source, l.recordedOn])).join("");
  const stem = locale === "fr" ? "l-app-ce-qui-est-conserve" : "the-app-what-is-kept";
  return { filename: `${stem}-${localDate(now)}.csv`, mime: "text/csv", text, count: lines.length };
}

export function registerAsText(
  locale: Locale,
  register: readonly RegisterRow[],
  unscanned: readonly UnscannedRow[],
  prefix: string,
  now: Date,
): ExportFile {
  const s = REGISTER_STRINGS[locale];
  const colon = locale === "fr" ? `${NBSP}:` : ":";
  const lines = registerLines(locale, register, unscanned, prefix);
  const out: string[] = [s.title, ""];
  for (const l of lines) {
    out.push(l.item);
    out.push(`  ${s.line.choice}${colon} ${l.choice}`);
    out.push(`  ${s.line.erase}${colon} ${l.erase}`);
    out.push(`  ${s.line.source}${colon} ${l.source}`);
    out.push(`  ${s.line.date}${colon} ${l.recordedOn}`);
    out.push("");
  }
  const stem = locale === "fr" ? "l-app-ce-qui-est-conserve" : "the-app-what-is-kept";
  return { filename: `${stem}-${localDate(now)}.txt`, mime: "text/plain", text: `${out.join("\n")}\n`, count: lines.length };
}
