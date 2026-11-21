/**
 * The help numbers as a plain-text page or a CSV file. Both carry the number as the pack writes it,
 * the name and description in both languages (CSV) or the page's language (text), and the source,
 * licence, retrieval date and tier. What the pack does not give is written UNKNOWN.
 */
import { csvCell } from "./exportData";
import { helpHeading, helpLead, helpSourceLine, kindLine, nameOrId, noHowNote, noNumberNote, otherLanguageNote, pageLine, saidLine } from "./helpCopy";
import type { HelpQuery, HelpRow } from "./helpView";
import type { HelpNumber } from "./packHelp";
import { formatDate } from "./provenance";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

const UNKNOWN = "UNKNOWN";

export const HELP_CSV_COLUMNS = ["id", "name_en", "name_fr", "number", "description_en", "description_fr", "page", "source", "licence", "retrieved", "tier"] as const;

export function helpToCsv(items: readonly HelpNumber[], opts: { readonly bom?: boolean } = {}): string {
  const lines: string[] = [HELP_CSV_COLUMNS.join(",")];
  for (const i of items) {
    const cells = [
      i.id,
      i.name.en ?? UNKNOWN,
      i.name.fr ?? UNKNOWN,
      i.contact ?? UNKNOWN,
      i.how.en ?? UNKNOWN,
      i.how.fr ?? UNKNOWN,
      i.url ?? UNKNOWN,
      i.sourceName ?? UNKNOWN,
      i.licence ?? UNKNOWN,
      i.retrievedOn ?? UNKNOWN,
      i.tier === null ? UNKNOWN : String(i.tier),
    ];
    lines.push(cells.map(csvCell).join(","));
  }
  return `${opts.bom ? "\uFEFF" : ""}${lines.join("\r\n")}\r\n`;
}

export function helpQueryLine(q: HelpQuery, locale: Locale): string {
  const text = q.text.trim();
  return text === "" ? t(locale, "All saved help numbers.", "Tous les numéros d’aide enregistrés.") : t(locale, `search "${text}".`, `recherche «\u00a0${text}\u00a0».`);
}

/** A page to read, print or share. The number comes first on its own line, as the pack writes it. */
export function helpToText(rows: readonly HelpRow[], today: string, locale: Locale, query?: HelpQuery): string {
  const title = helpHeading(locale);
  const lines: string[] = [title, "=".repeat(Math.min(title.length, 60)), helpLead(locale), "", t(locale, `As of ${formatDate(today, locale)}.`, `En date du ${formatDate(today, locale)}.`)];
  if (query) lines.push(helpQueryLine(query, locale));
  lines.push("");
  if (rows.length === 0) lines.push(t(locale, "No help numbers to show.", "Aucun numéro d’aide à afficher."), "");
  for (const row of rows) {
    const name = nameOrId(row, locale);
    lines.push(name, "-".repeat(Math.min(name.length, 60)));
    lines.push(row.item.contact ?? noNumberNote(locale));
    const said = saidLine(row, locale);
    if (said) lines.push(said);
    const kind = kindLine(row, locale);
    if (kind) lines.push(kind);
    lines.push(row.how?.text ?? noHowNote(locale));
    const note = row.how ? otherLanguageNote(row.how.lang, locale) : "";
    if (note) lines.push(note);
    const page = pageLine(row.item, locale);
    if (page) lines.push(page);
    lines.push(helpSourceLine(row.item, locale), "");
  }
  return lines.join("\n");
}

export function helpFileName(kind: "csv" | "txt", today: string): string {
  return `help-numbers-${today}.${kind}`;
}
