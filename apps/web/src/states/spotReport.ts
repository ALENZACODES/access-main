/**
 * A short note of the differences a person saw, to keep or to pass to whoever looks after the
 * data. It says what the pack reported, with its source and date, and what the person wrote. It
 * says it is one person's view on one day and not a correction. The App sends nothing: the note is
 * text the person chooses to copy or save.
 */
import { formatDate } from "./provenance";
import { CHECK_KEYS, answerWord, checkQuestion, labels, sheetFooter, sourceLine, spotTagWord } from "./spotSheetCopy";
import { type ResultRow } from "./spotResults";
import type { SpotSummary } from "./spotSummary";
import type { Locale } from "./stateCopy";
import { t } from "./typography";
import { differencesHeading, noDifferences, noRateNote, spotSummaryLine } from "./spotResultsCopy";

const EOL = "\r\n";
const PACK_TAGS = ["yes", "limited", "no", "designated"] as const;

/** The tag the sheet carried, in words. UNKNOWN stays UNKNOWN. */
function tagText(tag: string, locale: Locale): string {
  return (PACK_TAGS as readonly string[]).includes(tag) ? spotTagWord(tag as (typeof PACK_TAGS)[number], locale) : "UNKNOWN";
}

function sourceText(row: ResultRow, locale: Locale): string {
  if (row.source === "UNKNOWN") return "UNKNOWN";
  return sourceLine(row.source, /^\d{4}-\d{2}-\d{2}$/.test(row.retrievedOn) ? formatDate(row.retrievedOn, locale) : "UNKNOWN", locale);
}

function rowLines(row: ResultRow, locale: Locale): string[] {
  const out = [
    `${row.n === "" ? "-" : `${row.n}.`} ${row.name} (${labels.id(locale)}: ${row.id})`,
    `  ${labels.tag(locale)}: ${tagText(row.tag, locale)} (${sourceText(row, locale)})`,
  ];
  for (const key of CHECK_KEYS) {
    const a = row.answers[key];
    if (a !== undefined) out.push(`  ${checkQuestion(key, locale)} ${answerWord(a, locale)}`);
  }
  if (row.dateLooked) out.push(`  ${labels.visitedOn(locale)}: ${row.dateLooked}`);
  if (row.notes !== "") out.push(`  ${labels.notes(locale)}: ${row.notes}`);
  return out;
}

export function differencesNote(summary: SpotSummary, locale: Locale, today: string): string {
  const out: string[] = [
    t(locale, "Spot-check differences", "Différences relevées sur place"),
    t(locale, `Made on ${today}`, `Produite le ${today}`),
    "",
    spotSummaryLine(summary, locale),
    "",
    differencesHeading(summary.differences.length, locale),
  ];
  if (summary.differences.length === 0) out.push(noDifferences(locale));
  for (const row of summary.differences) out.push("", ...rowLines(row, locale));
  out.push("", noRateNote(locale), t(locale, "This is one person’s view on the day they looked. It is not a correction to the pack.", "C’est le constat d’une personne le jour de sa visite. Ce n’est pas une correction du jeu de lieux."), ...sheetFooter(locale).slice(0, 1));
  return out.join(EOL) + EOL;
}
