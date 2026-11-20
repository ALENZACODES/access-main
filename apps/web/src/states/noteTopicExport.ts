/**
 * Plain-text and CSV copies of the words reader. Notes are written exactly as the pack gives them.
 * CSV column names, topic ids and tag names are fixed tokens, the same in both languages. Both files
 * carry the OpenStreetMap credit and the line that a note only uses a word, whatever it goes on to say.
 */
import { OSM_CREDIT } from "./dataCredits";
import { type CsvOptions, csvCell } from "./exportData";
import { TOPIC_TAG_ORDER, type TopicEntry, type TopicIndex } from "./noteTopicIndex";
import { TOPIC_IDS, topicLabel } from "./noteTopicLexicon";
import { topicColon, topicCoverageLine, topicMentionsLine, topicNegatedLine, topicNoName, topicNoWordsLine, topicNoteAsWritten, topicPairsHeading, topicPairsLine, topicTagLine, topicTableTagHeader, topicsHeading, topicWordsUsedLine } from "./noteTopicCopy";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

export const TOPIC_CSV_HEADER = ["place_id", "place_name", "wheelchair_tag", "kind", "address", "word_groups", "only_after_no", "note"] as const;
export const TOPIC_CSV_FILENAMES: Readonly<Record<Locale, string>> = { en: "pack-note-words.csv", fr: "mots-des-notes-du-pack.csv" };
export const TOPIC_TEXT_FILENAMES: Readonly<Record<Locale, string>> = { en: "pack-note-words.txt", fr: "mots-des-notes-du-pack.txt" };
export const TOPIC_TABLE_CSV_HEADER = ["word_group", "places", "uses", "places_only_after_no", ...TOPIC_TAG_ORDER.map((x) => `tag_${x}`)] as const;
export const TOPIC_TABLE_CSV_FILENAMES: Readonly<Record<Locale, string>> = { en: "pack-note-words-table.csv", fr: "tableau-mots-des-notes-du-pack.csv" };

const join = (rows: string[][], opts: CsvOptions): string => (opts.bom ? "\uFEFF" : "") + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";

/** One row per shown note. Word groups are topic ids joined with a space; the note is last, as written. */
export function topicEntriesToCsv(shown: readonly TopicEntry[], opts: CsvOptions = {}): string {
  const rows: string[][] = [[...TOPIC_CSV_HEADER]];
  for (const e of shown) {
    rows.push([e.id, e.name ?? "UNKNOWN", e.tag === "unknown" ? "UNKNOWN" : e.tag, e.category ?? "UNKNOWN", e.address ?? "UNKNOWN", e.topics.join(" "), e.negatedOnly.join(" "), e.note]);
  }
  return join(rows, opts);
}

/** One row per word group: places, uses, places that only use it after "no", then places by tag. */
export function topicTableToCsv(index: TopicIndex, opts: CsvOptions = {}): string {
  const rows: string[][] = [[...TOPIC_TABLE_CSV_HEADER]];
  for (const id of TOPIC_IDS) {
    const c = index.byTopic[id];
    rows.push([id, String(c.places), String(c.mentions), String(c.negatedOnly), ...TOPIC_TAG_ORDER.map((x) => String(index.tagTable[id][x]))]);
  }
  return join(rows, opts);
}

function indent(note: string): string[] {
  return note.split(/\r\n|\r|\n/).map((line) => `     ${line}`);
}

export function topicsToText(index: TopicIndex, shown: readonly TopicEntry[], locale: Locale): string {
  const lines: string[] = [topicsHeading(locale), "", topicCoverageLine(index.withTopic, index.withNote, locale)];
  lines.push(t(locale, "A note only uses a word. Whatever it goes on to say is in the note, which is shown as written.", "Une note emploie seulement un mot. Ce qu’elle en dit se trouve dans la note, affichée telle qu’écrite."));
  lines.push("");
  for (const id of TOPIC_IDS) {
    const c = index.byTopic[id];
    if (c.places === 0) continue;
    lines.push(`${topicLabel(id, locale)}${topicColon(locale)}${topicMentionsLine(c.places, c.mentions, locale)}`);
    const tags = TOPIC_TAG_ORDER.filter((x) => index.tagTable[id][x] > 0).map((x) => `${topicTableTagHeader(x, locale)} ${index.tagTable[id][x]}`);
    lines.push(`   ${tags.join(", ")}`);
  }
  if (index.pairs.length > 0) {
    lines.push("", topicPairsHeading(locale));
    for (const p of index.pairs.slice(0, 5)) lines.push(`   ${topicPairsLine(p.a, p.b, p.places, locale)}`);
  }
  lines.push("");
  if (shown.length === 0) lines.push(t(locale, "No notes to list.", "Aucune note à lister."));
  shown.forEach((e, i) => {
    lines.push(`${i + 1}. ${e.name ?? topicNoName(locale)}`);
    lines.push(`   ${topicTagLine(e.tag, locale)}`);
    if (e.category !== null) lines.push(`   ${t(locale, "Kind", "Genre")}${topicColon(locale)}${e.category.replace(/_/g, " ")}`);
    if (e.address !== null) lines.push(`   ${t(locale, "Address", "Adresse")}${topicColon(locale)}${e.address}`);
    lines.push(`   ${e.topics.length > 0 ? topicWordsUsedLine(e.topics, locale) : topicNoWordsLine(locale)}`);
    if (e.negatedOnly.length > 0) lines.push(`   ${topicNegatedLine(e.negatedOnly, locale)}`);
    lines.push(`   ${topicNoteAsWritten(locale)}${topicColon(locale)}`.trimEnd());
    lines.push(...indent(e.note));
    lines.push("");
  });
  lines.push(OSM_CREDIT);
  return lines.join("\n") + "\n";
}

