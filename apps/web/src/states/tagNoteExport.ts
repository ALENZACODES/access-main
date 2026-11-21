/**
 * Plain-text and CSV copies of the tags-and-notes list. Notes are written exactly as the pack gives them.
 * CSV column names, reading names and tag names are fixed tokens, the same in both languages. Both files
 * carry the OpenStreetMap credit and the line that a place on the list is a place to read, not a mistake.
 */
import { OSM_CREDIT } from "./dataCredits";
import { type CsvOptions, csvCell } from "./exportData";
import { topicColon } from "./noteTopicCopy";
import type { Locale } from "./stateCopy";
import type { TagNoteIndex } from "./tagNoteIndex";
import { tagNoteCountLine, tagNoteKindLabel, tagNoteNoteAsWritten, tagNoteRuleLine, tagNoteRulesExtra, tagNoteRulesHeading, tagNoteWhyLine, tagNotesHeading, tagNotesIntro } from "./tagNoteCopy";
import { TAG_NOTE_KINDS, type TagNoteRead } from "./tagNoteRules";

export const TAG_NOTE_CSV_HEADER = ["place_id", "place_name", "wheelchair_tag", "kind", "address", "reading", "word_groups", "note"] as const;
export const TAG_NOTE_CSV_FILENAMES: Readonly<Record<Locale, string>> = { en: "pack-tags-and-notes.csv", fr: "indications-et-notes-du-pack.csv" };
export const TAG_NOTE_TEXT_FILENAMES: Readonly<Record<Locale, string>> = { en: "pack-tags-and-notes.txt", fr: "indications-et-notes-du-pack.txt" };

export function tagNotesToCsv(shown: readonly TagNoteRead[], opts: CsvOptions = {}): string {
  const rows: string[][] = [[...TAG_NOTE_CSV_HEADER]];
  for (const r of shown) {
    rows.push([r.id, r.name ?? "UNKNOWN", r.tag === "unknown" ? "UNKNOWN" : r.tag, r.category ?? "UNKNOWN", r.address ?? "UNKNOWN", r.kind, r.topics.join(" "), r.note]);
  }
  return (opts.bom ? "\uFEFF" : "") + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function tagNotesToText(index: TagNoteIndex, shown: readonly TagNoteRead[], locale: Locale): string {
  const lines = [tagNotesHeading(locale), "", tagNotesIntro(locale), "", tagNoteRulesHeading(locale)];
  for (const kind of TAG_NOTE_KINDS) lines.push(`   ${tagNoteRuleLine(kind, locale)}`);
  lines.push(`   ${tagNoteRulesExtra(locale)}`, "", tagNoteCountLine(index.reads.length, index.withNote, locale), "");
  for (const r of shown) {
    lines.push(r.name ?? "UNKNOWN");
    lines.push(`   ${tagNoteKindLabel(r.kind, locale)}`);
    lines.push(`   ${tagNoteWhyLine(r, locale)}`);
    if (r.address !== null) lines.push(`   ${r.address}`);
    lines.push(`   ${tagNoteNoteAsWritten(locale)}${topicColon(locale).trimEnd()}`);
    for (const line of r.note.split(/\r\n|\r|\n/)) lines.push(`     ${line}`);
    lines.push("");
  }
  lines.push(OSM_CREDIT);
  return lines.join("\r\n") + "\r\n";
}
