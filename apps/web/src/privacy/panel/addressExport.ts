// "Web addresses and network requests in the App" as a file: one block of lines for the addresses the code names
// and one for the places that make network requests. Written offline from the same rows the panel shows. A
// destination the code does not fix is written as unknown, never as a guess.

import { ADDRESS_STRINGS } from "./addressSection";
import type { AddressRegisterView } from "./addressView";
import type { Locale } from "./copyLint";
import { csvCell } from "./inventoryExport";
import type { ExportFile } from "./localData";

const NBSP = "\u00a0";

export const ADDRESS_EXPORT_STRINGS = {
  en: {
    title: "Web addresses and network requests in the App",
    header: ["Part", "Address or place", "What it is", "What it is for", "Where it goes", "Places in the code", "Source", "Recorded on"],
    partLink: "Address named in the App",
    partCall: "Place that makes network requests",
    line: { what: "What it is", holds: "What it is for", where: "Where it goes", count: "Places in the code", source: "Source", date: "Recorded on" },
    linksTitle: "Addresses named in the App",
    callsTitle: "Places where the App makes network requests",
    none: "None found.",
  },
  fr: {
    title: "Adresses web et requêtes réseau dans l’App",
    header: ["Partie", "Adresse ou endroit", "De quoi il s’agit", "À quoi cela sert", "Où cela va", "Endroits dans le code", "Source", "Date d’inscription"],
    partLink: "Adresse nommée dans l’App",
    partCall: "Endroit qui fait des requêtes réseau",
    line: { what: "De quoi il s’agit", holds: "À quoi cela sert", where: "Où cela va", count: "Endroits dans le code", source: "Source", date: "Date d’inscription" },
    linksTitle: "Adresses nommées dans l’App",
    callsTitle: "Endroits où l’App fait des requêtes réseau",
    none: "Aucun trouvé.",
  },
} as const;

export interface AddressLine {
  part: "link" | "call";
  name: string;
  what: string;
  holds: string;
  where: string;
  count: string;
  source: string;
  recordedOn: string;
}

function localDate(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Addresses first, then places that make requests; each group keeps the register's order. */
export function addressLines(locale: Locale, v: AddressRegisterView): AddressLine[] {
  const s = ADDRESS_STRINGS[locale];
  return [
    ...v.addresses.map((a): AddressLine => ({ part: "link", name: a.host, what: s.kinds[a.kind], holds: a.holds[locale], where: "", count: "", source: a.source, recordedOn: a.recordedOn })),
    ...v.calls.map((c): AddressLine => ({ part: "call", name: c.path, what: "", holds: c.holds[locale], where: s.destinations[c.destination], count: String(c.calls), source: c.source, recordedOn: c.recordedOn })),
  ];
}

const stem = (locale: Locale): string => (locale === "fr" ? "l-app-adresses-et-requetes" : "the-app-addresses-and-requests");

export function addressesAsCsv(locale: Locale, v: AddressRegisterView, now: Date, delimiter: "," | ";" = ","): ExportFile {
  const e = ADDRESS_EXPORT_STRINGS[locale];
  const lines = addressLines(locale, v);
  const row = (cells: readonly string[]): string => `${cells.map((c) => csvCell(c, delimiter)).join(delimiter)}\r\n`;
  const text = row(e.header) + lines.map((l) => row([l.part === "link" ? e.partLink : e.partCall, l.name, l.what, l.holds, l.where, l.count, l.source, l.recordedOn])).join("");
  return { filename: `${stem(locale)}-${localDate(now)}.csv`, mime: "text/csv", text, count: lines.length };
}

export function addressesAsText(locale: Locale, v: AddressRegisterView, now: Date): ExportFile {
  const e = ADDRESS_EXPORT_STRINGS[locale];
  const colon = locale === "fr" ? `${NBSP}:` : ":";
  const lines = addressLines(locale, v);
  const out: string[] = [e.title, ""];
  const group = (title: string, part: "link" | "call"): void => {
    out.push(title, "");
    const mine = lines.filter((l) => l.part === part);
    if (mine.length === 0) out.push(e.none, "");
    for (const l of mine) {
      out.push(l.name);
      const fields: Array<readonly [string, string]> = part === "link" ? [[e.line.what, l.what], [e.line.holds, l.holds]] : [[e.line.holds, l.holds], [e.line.where, l.where], [e.line.count, l.count]];
      fields.push([e.line.source, l.source], [e.line.date, l.recordedOn]);
      for (const [label, value] of fields) out.push(`  ${label}${colon} ${value}`);
      out.push("");
    }
  };
  group(e.linksTitle, "link");
  group(e.callsTitle, "call");
  return { filename: `${stem(locale)}-${localDate(now)}.txt`, mime: "text/plain", text: `${out.join("\n")}\n`, count: lines.length };
}
