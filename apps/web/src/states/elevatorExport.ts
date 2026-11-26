/**
 * The elevator notices as a plain-text page or a CSV file. Both carry the operator's words as they
 * are held, the time of the check, how old that is on the day of the export, and the source,
 * licence, retrieval date and tier. What the notice does not state is written UNKNOWN.
 */
import { ageLine, noticeAge } from "./elevatorAge";
import { readingLines, stationName } from "./elevatorCopy";
import { elevatorHeading, elevatorLead, noticeSourceLine, stopIdsLine } from "./elevatorCopy";
import type { ElevatorQuery, StationGroup } from "./elevatorView";
import { csvCell } from "./exportData";
import type { ElevatorNotice } from "./packElevators";
import { readNotice } from "./elevatorRead";
import { formatDate } from "./provenance";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

const UNKNOWN = "UNKNOWN";

export const CSV_COLUMNS = ["station", "elevator", "notice_says", "between", "notice_text", "checked_at", "days_since_check", "stop_ids", "source", "licence", "retrieved", "tier"] as const;

function stateWord(state: string | null): string {
  return state ?? UNKNOWN;
}

/** One row per notice, in the order given. `today` fixes the days-since-check column. */
export function noticesToCsv(notices: readonly ElevatorNotice[], today: string, opts: { readonly bom?: boolean } = {}): string {
  const lines: string[] = [CSV_COLUMNS.join(",")];
  for (const n of notices) {
    const r = readNotice(n);
    const age = noticeAge(n, today);
    const cells = [
      n.station ?? UNKNOWN,
      r.elevator ?? UNKNOWN,
      stateWord(r.state),
      r.between ?? UNKNOWN,
      n.text ?? UNKNOWN,
      n.checkedAt ?? UNKNOWN,
      age.days === null ? UNKNOWN : String(age.days),
      n.stopIds.length === 0 ? UNKNOWN : n.stopIds.join(" "),
      n.sourceName ?? UNKNOWN,
      n.licence ?? UNKNOWN,
      n.retrievedOn ?? UNKNOWN,
      n.tier === null ? UNKNOWN : String(n.tier),
    ];
    lines.push(cells.map(csvCell).join(","));
  }
  return `${opts.bom ? "\uFEFF" : ""}${lines.join("\r\n")}\r\n`;
}

/** What the search and filters were, in a line, so a saved page says what it holds. */
export function queryLine(q: ElevatorQuery, locale: Locale): string {
  const parts: string[] = [];
  if (q.text.trim() !== "") parts.push(t(locale, `search "${q.text.trim()}"`, `recherche «\u00a0${q.text.trim()}\u00a0»`));
  if (q.band !== "all") parts.push(t(locale, `age filter: ${q.band}`, `filtre d’ancienneté\u00a0: ${q.band}`));
  return parts.length === 0 ? t(locale, "All saved notices.", "Tous les avis enregistrés.") : `${parts.join("; ")}.`;
}

/** A page to read, print or share: station by station, with the operator's words as written. */
export function noticesToText(groups: readonly StationGroup[], today: string, locale: Locale, query?: ElevatorQuery): string {
  const title = elevatorHeading(locale);
  const lines: string[] = [title, "=".repeat(Math.min(title.length, 60)), elevatorLead(locale), ""];
  lines.push(t(locale, `As of ${formatDate(today, locale)}.`, `En date du ${formatDate(today, locale)}.`));
  if (query) lines.push(queryLine(query, locale));
  lines.push("");
  if (groups.length === 0) lines.push(t(locale, "No notices to show.", "Aucun avis à afficher."), "");
  for (const g of groups) {
    const name = stationName(g.station, locale);
    lines.push(name, "-".repeat(Math.min(name.length, 60)));
    for (const row of g.rows) {
      lines.push(row.notice.text ?? t(locale, "The notice has no words.", "L’avis ne contient pas de texte."));
      for (const l of readingLines(row.reading, locale)) lines.push(t(locale, `${l.label}: ${l.value}`, `${l.label}\u00a0: ${l.value}`));
      lines.push(ageLine(row.notice, row.age, locale));
      const stops = stopIdsLine(row.notice.stopIds, locale);
      if (stops) lines.push(stops);
      lines.push(noticeSourceLine(row.notice, locale), "");
    }
  }
  return lines.join("\n");
}

export function exportFileName(kind: "csv" | "txt", today: string): string {
  return `elevator-notices-${today}.${kind}`;
}
