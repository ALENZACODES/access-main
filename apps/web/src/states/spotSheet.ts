/**
 * The spot-check sheet as data: one entry per chosen place, with what the pack reports for it,
 * and the same short list of questions for every place. Nothing here is a finding. A value the
 * pack does not give is written UNKNOWN, never guessed or left blank.
 */
import type { PackPlaceRecord } from "./packPlaces";
import { formatDate } from "./provenance";
import { MAX_SEED_CHARS, type Sample } from "./spotSample";
import { CHECK_ANSWERS, CHECK_KEYS, type AnswerKey, type CheckKey, answerWord, checkQuestion, labels, sheetFooter, sheetIntro, sheetTitle, sourceLine, tagWord } from "./spotSheetCopy";
import type { Locale } from "./stateCopy";

/** The longest pack note put on the sheet. Longer notes are cut and say so. */
export const MAX_SHEET_NOTE = 200;

export interface SheetLine {
  readonly label: string;
  readonly value: string;
}

export interface SheetEntry {
  readonly n: number;
  readonly id: string;
  readonly heading: string;
  readonly lines: readonly SheetLine[];
  /** The tag the pack reports, as a fixed token, for the CSV. */
  readonly tag: string;
  readonly source: string;
  readonly retrievedOn: string;
}

export interface SheetCheck {
  readonly key: CheckKey;
  readonly question: string;
  readonly answers: readonly { readonly key: AnswerKey; readonly label: string }[];
}

export interface SpotSheet {
  readonly locale: Locale;
  readonly title: string;
  readonly intro: string;
  readonly seed: string;
  readonly today: string;
  readonly entries: readonly SheetEntry[];
  readonly checks: readonly SheetCheck[];
  readonly footer: readonly string[];
}

function clipNote(note: string, locale: Locale): string {
  if (note.length <= MAX_SHEET_NOTE) return note;
  return `${note.slice(0, MAX_SHEET_NOTE - 1).trimEnd()}… ${locale === "fr" ? "(coupée)" : "(cut)"}`;
}

export function sheetEntry(n: number, place: PackPlaceRecord, locale: Locale): SheetEntry {
  const name = place.name ?? "UNKNOWN";
  const p = place.provenance;
  const tagText = place.tag === "unknown" ? "UNKNOWN" : `${tagWord(place.tag, locale)} (${p ? sourceLine(p.source, formatDate(p.retrievedOn, locale), locale) : "UNKNOWN"})`;
  const lines: SheetLine[] = [
    { label: labels.name(locale), value: name },
    { label: labels.id(locale), value: place.id },
    { label: labels.tag(locale), value: tagText },
    { label: labels.address(locale), value: place.address ?? "UNKNOWN" },
    { label: labels.category(locale), value: place.category ?? "UNKNOWN" },
  ];
  if (place.note !== null) lines.push({ label: labels.note(locale), value: clipNote(place.note, locale) });
  return { n, id: place.id, heading: `${n}. ${name}`, lines, tag: place.tag === "unknown" ? "UNKNOWN" : place.tag, source: p?.source ?? "UNKNOWN", retrievedOn: p?.retrievedOn ?? "UNKNOWN" };
}

export function sheetChecks(locale: Locale): SheetCheck[] {
  return CHECK_KEYS.map((key) => ({ key, question: checkQuestion(key, locale), answers: CHECK_ANSWERS[key].map((a) => ({ key: a, label: answerWord(a, locale) })) }));
}

/** A seed shown on the sheet: control characters out and cut to the limit, whatever the caller passes. */
function shownSeed(seed: string): string {
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is removed
  return seed.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_SEED_CHARS);
}

export function buildSpotSheet(sample: Sample, seed: string, balanced: boolean, locale: Locale, today: string): SpotSheet {
  const shown = shownSeed(seed);
  return {
    locale,
    title: sheetTitle(sample.picks.length, locale),
    intro: sheetIntro(shown, balanced, locale),
    seed: shown,
    today,
    entries: sample.picks.map((pick, i) => sheetEntry(i + 1, pick.place, locale)),
    checks: sheetChecks(locale),
    footer: [...sheetFooter(locale)],
  };
}
