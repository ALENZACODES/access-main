// The data list as a file a person can keep, print or open in a spreadsheet,
// without a network. CSV cells that a spreadsheet could read as a formula are
// defused, and every missing field is written as the word for "unknown".

import { EXTRA_STRINGS } from "./copyExtra";
import type { Locale } from "./copyLint";
import type { InventoryEntry } from "./inventory";
import { sortInventory } from "./inventory";
import type { ExportFile } from "./localData";
import { PANEL_STRINGS } from "./strings";
import { STRINGS as NOTICE_STRINGS } from "../onDeviceNotice";

function localDate(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Quotes a cell for CSV and defuses a leading =, +, -, @, tab or carriage return. */
export function csvCell(value: string, delimiter = ","): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /["\r\n]/.test(safe) || safe.includes(delimiter) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function row(cells: readonly string[], delimiter: string): string {
  return `${cells.map((c) => csvCell(c, delimiter)).join(delimiter)}\r\n`;
}

function fields(locale: Locale, e: InventoryEntry): string[] {
  const unknown = PANEL_STRINGS[locale].unknown;
  const keys = e.storageKeys ?? [];
  return [
    e.label[locale],
    NOTICE_STRINGS[locale].where[e.where ?? "unknown"],
    e.purpose?.[locale] ?? unknown,
    e.keptFor?.[locale] ?? unknown,
    e.source[locale],
    e.recordedOn,
    e.licence ?? "",
    keys.length > 0 ? keys.join(" ") : e.where === "on-device" ? unknown : "",
  ];
}

const NAMES: Record<Locale, string> = { en: "the-app-data-list", fr: "l-app-liste-des-donnees" };

export function inventoryAsCsv(
  locale: Locale,
  entries: readonly InventoryEntry[],
  now: Date,
  delimiter: "," | ";" = ",",
): ExportFile {
  const sorted = sortInventory(entries, locale);
  const text = row(EXTRA_STRINGS[locale].csvHeader, delimiter) + sorted.map((e) => row(fields(locale, e), delimiter)).join("");
  return { filename: `${NAMES[locale]}-${localDate(now)}.csv`, mime: "text/csv", text, count: sorted.length };
}

export function inventoryAsText(
  locale: Locale,
  entries: readonly InventoryEntry[],
  now: Date,
  reviewedOn?: string,
): ExportFile {
  const x = EXTRA_STRINGS[locale];
  const colon = locale === "fr" ? "\u00a0:" : ":";
  const head = x.csvHeader;
  const sorted = sortInventory(entries, locale);
  const lines: string[] = [x.list.title];
  if (reviewedOn !== undefined) lines.push(NOTICE_STRINGS[locale].reviewed(reviewedOn));
  lines.push("");
  for (const e of sorted) {
    const f = fields(locale, e);
    lines.push(f[0] ?? "");
    // columns 1..7 are where, why, how long, source, date, licence, stored names
    for (let i = 1; i < f.length; i += 1) {
      const value = f[i] ?? "";
      if (value !== "") lines.push(`  ${head[i] ?? ""}${colon} ${value}`);
    }
    lines.push("");
  }
  return {
    filename: `${NAMES[locale]}-${localDate(now)}.txt`,
    mime: "text/plain",
    text: `${lines.join("\n").trimEnd()}\n`,
    count: sorted.length,
  };
}
