/**
 * Plain-text and CSV copies of the notes shown. Notes are written exactly as the pack gives them.
 * CSV column names and tag names are fixed tokens, the same in both languages. Both files carry the
 * OpenStreetMap credit and the line that a note is the pack's wording.
 */
import { OSM_CREDIT } from "./dataCredits";
import { type CsvOptions, csvCell } from "./exportData";
import { charsPhrase, colonFor, coverageSentence, noteNoName, noteAsWritten, noteHeading, repeatedLabel, tagLine } from "./packNoteCopy";
import type { NoteEntry, NoteIndex } from "./packNoteIndex";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

export const NOTE_CSV_HEADER = ["place_id", "place_name", "wheelchair_tag", "kind", "address", "note_characters", "places_with_same_note", "note"] as const;
export const NOTE_CSV_FILENAMES: Readonly<Record<Locale, string>> = { en: "pack-notes.csv", fr: "notes-du-pack.csv" };
export const NOTE_TEXT_FILENAMES: Readonly<Record<Locale, string>> = { en: "pack-notes.txt", fr: "notes-du-pack.txt" };

/** One row per shown note. With none, only the header row. The note is in the last column, as written. */
export function notesToCsv(shown: readonly NoteEntry[], opts: CsvOptions = {}): string {
  const rows: string[][] = [[...NOTE_CSV_HEADER]];
  for (const e of shown) {
    rows.push([e.id, e.name ?? "UNKNOWN", e.tag === "unknown" ? "UNKNOWN" : e.tag, e.category ?? "UNKNOWN", e.address ?? "UNKNOWN", String(e.chars), String(e.copies), e.note]);
  }
  return (opts.bom ? "\uFEFF" : "") + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** The note laid out on lines of its own, indented, with its own line breaks kept. */
function indentNote(note: string): string[] {
  return note.split(/\r\n|\r|\n/).map((line) => `     ${line}`);
}

export function notesToText(index: NoteIndex, shown: readonly NoteEntry[], locale: Locale): string {
  const lines: string[] = [noteHeading(locale), "", coverageSentence(index.withNote, index.total, locale)];
  lines.push(t(locale, "Each note is the pack's wording, shown as written.", "Chaque note reprend les mots du pack, telle qu’écrite."));
  lines.push("");
  if (shown.length === 0) lines.push(t(locale, "No notes to list.", "Aucune note à lister."));
  shown.forEach((e, i) => {
    lines.push(`${i + 1}. ${e.name ?? noteNoName(locale)}`);
    lines.push(`   ${tagLine(e.tag, locale)}`);
    if (e.category !== null) lines.push(`   ${t(locale, "Kind", "Genre")}${colonFor(locale)}${e.category.replace(/_/g, " ")}`);
    if (e.address !== null) lines.push(`   ${t(locale, "Address", "Adresse")}${colonFor(locale)}${e.address}`);
    lines.push(`   ${noteAsWritten(locale)} (${charsPhrase(e.chars, locale)})${colonFor(locale)}`.trimEnd());
    lines.push(...indentNote(e.note));
    if (e.copies > 1) lines.push(`   ${repeatedLabel(e.copies, locale)}`);
    lines.push("");
  });
  lines.push(OSM_CREDIT);
  return lines.join("\n") + "\n";
}
