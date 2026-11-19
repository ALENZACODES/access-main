// "What the App keeps on this device" as a file: every localStorage item, every cache and database the
// App's code names, and the storage whose name could not be read. One line per item, with where it is
// kept, whether saving it needs the person's choice, and which button removes it. The two registers it
// reads are the ones the CI audits check against the source, so the file cannot list less than the code
// uses. Cache and database lines never claim a consent choice they were not checked for: they say
// "Not confirmed". Written offline.

import type { Locale } from "./copyLint";
import { DEVICE_REGISTER, type DeviceRow } from "./deviceRegister";
import type { ClearOptions } from "./deviceStorage";
import { csvCell } from "./inventoryExport";
import type { ExportFile } from "./localData";
import { REGISTER_STRINGS } from "./registerExport";
import type { RegisterRow, UnscannedRow } from "./storageRegister";

const NBSP = "\u00a0";

export const KEPT_STRINGS = {
  en: {
    header: ["Item", "Where it is kept", "Needs your choice before saving", "Reached by the erase button", "Removed by the offline storage button", "Source", "Recorded on"],
    line: { where: "Where it is kept", choice: "Needs your choice before saving", erase: "Reached by the erase button", clear: "Removed by the offline storage button", source: "Source", date: "Recorded on" },
    where: { browser: "Settings and saved items", cache: "Saved files", database: "Saved records" },
  },
  fr: {
    header: ["Élément", "Où c’est conservé", "Votre choix est requis avant l’enregistrement", "Touché par le bouton d’effacement", "Retiré par le bouton du stockage hors ligne", "Source", "Date d’inscription"],
    line: { where: "Où c’est conservé", choice: "Votre choix est requis avant l’enregistrement", erase: "Touché par le bouton d’effacement", clear: "Retiré par le bouton du stockage hors ligne", source: "Source", date: "Date d’inscription" },
    where: { browser: "Réglages et éléments enregistrés", cache: "Fichiers enregistrés", database: "Enregistrements sauvegardés" },
  },
} as const;

export interface KeptLine {
  item: string;
  where: string;
  choice: string;
  erase: string;
  clear: string;
  source: string;
  recordedOn: string;
}

export interface KeptSources {
  register: readonly RegisterRow[];
  unscanned: readonly UnscannedRow[];
  /** Defaults to the App's own list of caches and databases */
  device?: readonly DeviceRow[];
  /** What the offline storage button was given. Without it, whether the button reaches a name is not confirmed. */
  clear?: ClearOptions;
}

function localDate(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Whether the offline storage button removes every name this row can produce. null: it was not given its prefixes. */
function reached(row: DeviceRow, clear: ClearOptions | undefined): boolean | null {
  if (clear === undefined) return null;
  const prefix = row.kind === "cache" ? clear.cachePrefix : clear.dbPrefix;
  return prefix !== undefined && prefix !== "" && row.name.startsWith(prefix);
}

/** Settings first, then caches, then databases, each in the language's alphabetical order; unreadable storage last. */
export function keptLines(locale: Locale, src: KeptSources): KeptLine[] {
  const s = REGISTER_STRINGS[locale];
  const k = KEPT_STRINGS[locale];
  const byItem = (a: KeptLine, b: KeptLine): number => a.item.localeCompare(b.item, locale);
  const browser: KeptLine[] = src.register
    .map((r) => ({ item: r.holds[locale], where: k.where.browser, choice: r.gated ? s.yes : s.no, erase: r.reach === "panel" ? s.yes : s.no, clear: s.no, source: r.source, recordedOn: r.recordedOn }))
    .sort(byItem);
  const device = (kind: "cache" | "database"): KeptLine[] =>
    (src.device ?? DEVICE_REGISTER)
      .filter((r) => r.kind === kind)
      .map((r) => {
        const hit = reached(r, src.clear);
        return { item: r.holds[locale], where: k.where[kind], choice: s.notConfirmed, erase: s.no, clear: hit === null ? s.notConfirmed : hit ? s.yes : s.no, source: r.source, recordedOn: r.recordedOn };
      })
      .sort(byItem);
  const unread: KeptLine[] = src.unscanned.map((u) => ({
    item: u.holds[locale],
    where: s.notConfirmed,
    choice: s.notConfirmed,
    erase: s.notConfirmed,
    clear: s.notConfirmed,
    source: s.unconfirmedSource,
    recordedOn: u.recordedOn,
  }));
  return [...browser, ...device("cache"), ...device("database"), ...unread];
}

const stem = (locale: Locale): string => (locale === "fr" ? "l-app-tout-ce-qui-est-conserve" : "the-app-everything-kept");

export function keptAsCsv(locale: Locale, src: KeptSources, now: Date, delimiter: "," | ";" = ","): ExportFile {
  const lines = keptLines(locale, src);
  const row = (cells: readonly string[]): string => `${cells.map((c) => csvCell(c, delimiter)).join(delimiter)}\r\n`;
  const text = row(KEPT_STRINGS[locale].header) + lines.map((l) => row([l.item, l.where, l.choice, l.erase, l.clear, l.source, l.recordedOn])).join("");
  return { filename: `${stem(locale)}-${localDate(now)}.csv`, mime: "text/csv", text, count: lines.length };
}

export function keptAsText(locale: Locale, src: KeptSources, now: Date): ExportFile {
  const k = KEPT_STRINGS[locale];
  const colon = locale === "fr" ? `${NBSP}:` : ":";
  const out: string[] = [REGISTER_STRINGS[locale].title, ""];
  const lines = keptLines(locale, src);
  for (const l of lines) {
    out.push(l.item);
    for (const [label, value] of [
      [k.line.where, l.where],
      [k.line.choice, l.choice],
      [k.line.erase, l.erase],
      [k.line.clear, l.clear],
      [k.line.source, l.source],
      [k.line.date, l.recordedOn],
    ] as const) {
      out.push(`  ${label}${colon} ${value}`);
    }
    out.push("");
  }
  return { filename: `${stem(locale)}-${localDate(now)}.txt`, mime: "text/plain", text: `${out.join("\n")}\n`, count: lines.length };
}
