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
/** The tag-and-note findings as text or CSV. Made on this device from what is listed. */
import type { SavedFile } from "./downloadFile";
import { csvCell } from "./exportData";
import type { Disagreement } from "./tagNoteCheck";
import { TN_CSV_HEADER, TN_CSV_NAME, TN_TEXT_NAME, tnCaveat, tnDirectionLabel, tnKindLine, tnNoName, tnTagLine, tnWeightLine } from "./tagNoteCopy";

export interface TagNoteCsvOptions {
  readonly bom?: boolean;
}

const words = (d: Disagreement, against: boolean): string => d.signals.filter((s) => d.against.includes(s) === against).map((s) => s.text).join(" | ");

/** One row per place. The kind, weight and tag are fixed English tokens. */
export function findingsToCsv(findings: readonly Disagreement[], opts: TagNoteCsvOptions = {}): string {
  const rows: string[][] = [[...TN_CSV_HEADER]];
  for (const d of findings) rows.push([d.id, d.name ?? "", d.tag, d.kind, d.weight, words(d, true), words(d, false), d.note]);
  return (opts.bom ? "﻿" : "") + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function findingsToText(findings: readonly Disagreement[], locale: Locale): string {
  const out: string[] = [tnCaveat(locale), ""];
  for (const d of findings) {
    out.push(`${d.name ?? tnNoName(locale)} (${d.id})`);
    out.push(`  ${tnTagLine(d.tag, locale)}`);
    out.push(`  ${tnKindLine(d.kind, locale)} ${tnWeightLine(d.weight, locale)}`);
    out.push(`  ${d.signals.map((s) => `${s.text} (${tnDirectionLabel(s.direction, locale)})`).join(", ")}`);
    out.push(`  ${d.note}`);
    out.push("");
  }
  return out.join("\n");
}

export const findingsCsvFile = (f: readonly Disagreement[], locale: Locale): SavedFile => ({ name: TN_CSV_NAME[locale], mime: "text/csv;charset=utf-8", content: findingsToCsv(f, { bom: true }) });
export const findingsTextFile = (f: readonly Disagreement[], locale: Locale): SavedFile => ({ name: TN_TEXT_NAME[locale], mime: "text/plain;charset=utf-8", content: findingsToText(f, locale) });
