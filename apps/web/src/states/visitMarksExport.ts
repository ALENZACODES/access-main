/** The marks as text or CSV, made on this device. Places stay in the order they were listed; nothing is ranked. */
import { csvCell } from "./exportData";
import { formatDate } from "./provenance";
import type { Locale } from "./stateCopy";
import { t } from "./typography";
import { type MarkedPlace, VISIT_STATUSES, summariseMarks } from "./visitMarks";
import { marksLead, marksSummaryLine, noMarkName, statusName } from "./visitMarksCopy";

export const MARKS_CSV_COLUMNS = ["id", "name", "mark", "marked_on", "address"] as const;

const cell = (v: string | null): string => (v === null ? "UNKNOWN" : v);

export function marksToCsv(rows: readonly MarkedPlace[], opts: { bom?: boolean } = {}): string {
  const lines = [MARKS_CSV_COLUMNS.join(",")];
  for (const r of rows) {
    const cells = [r.place.id, cell(r.place.name), r.mark === null ? "none" : r.mark.status, cell(r.mark?.markedOn ?? null), cell(r.place.address)];
    lines.push(cells.map(csvCell).join(","));
  }
  return `${opts.bom ? "﻿" : ""}${lines.join("\r\n")}\r\n`;
}

export function marksToText(rows: readonly MarkedPlace[], today: string, locale: Locale): string {
  const title = t(locale, "My marks on the listed places", "Mes marques sur les lieux de la liste");
  const out = [title, "=".repeat(title.length), t(locale, `As of ${formatDate(today, locale)}.`, `En date du ${formatDate(today, locale)}.`), marksLead(locale), ""];
  if (rows.length === 0) {
    out.push(t(locale, "No place is on the list.", "Aucun lieu n’est dans la liste."));
    return `${out.join("\n")}\n`;
  }
  const marks = rows.flatMap((r) => (r.mark === null ? [] : [r.mark]));
  out.push(marksSummaryLine(summariseMarks(marks, rows.map((r) => r.place.id)), locale), "");
  const groups: { name: string; rows: readonly MarkedPlace[] }[] = [
    ...VISIT_STATUSES.map((s) => ({ name: statusName(s, locale), rows: rows.filter((r) => r.mark?.status === s) })),
    { name: noMarkName(locale), rows: rows.filter((r) => r.mark === null) },
  ];
  for (const g of groups) {
    if (g.rows.length === 0) continue;
    out.push(g.name, "-".repeat(g.name.length));
    for (const r of g.rows) {
      const name = r.place.name ?? t(locale, `Unnamed place ${r.place.id}`, `Lieu sans nom ${r.place.id}`);
      const address = r.place.address === null ? "" : `, ${r.place.address}`;
      const day = r.mark?.markedOn ? ` (${formatDate(r.mark.markedOn, locale)})` : "";
      out.push(`- ${name}${address}${day}`);
    }
    out.push("");
  }
  return `${out.join("\n").trimEnd()}\n`;
}

export function marksFileName(kind: "csv" | "txt", today: string): string {
  return `visit-marks-${today}.${kind}`;
}
