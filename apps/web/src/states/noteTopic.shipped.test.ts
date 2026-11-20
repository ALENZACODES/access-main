import { describe, expect, it } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";
import { lintCopy } from "./copyLint";
import { parseCsv } from "./csvParse";
import { OSM_CREDIT } from "./dataCredits";
import { TOPIC_CSV_HEADER, topicEntriesToCsv, topicTableToCsv, topicsToText } from "./noteTopicExport";
import { NO_TOPIC_FILTER, TOPIC_ORDERS, filterTopicEntries, orderTopicEntries } from "./noteTopicFilter";
import { buildTopicIndex, topicTallyAddsUp } from "./noteTopicIndex";
import { TOPIC_IDS } from "./noteTopicLexicon";
import { scanTopics, topicMarkSegments } from "./noteTopicScan";
import { parsePackPlaces } from "./packPlaces";

const raw = (JSON.parse(contentText) as { places: Array<Record<string, unknown>> }).places;
const { places } = parsePackPlaces(raw);
const index = buildTopicIndex(places);

describe("the words reader on the shipped pack", () => {
  it("reads every place of the pack and adds up", () => {
    expect(index.total).toBe(places.length);
    expect(index.total).toBeGreaterThan(10);
    expect(topicTallyAddsUp(index)).toBe(true);
  });
  it("has as many notes as the pack file holds, and no more", () => {
    const want = raw.filter((p) => typeof p.wheelchair_description === "string" && p.wheelchair_description.trim() !== "" && p.wheelchair_description !== "UNKNOWN").length;
    expect(index.withNote).toBe(want);
    expect(want).toBeGreaterThan(0);
  });
  it("gives each note exactly as the pack file wrote it, and the marked pieces join back to it", () => {
    for (const e of index.entries) {
      const original = (raw.find((p) => p.id === e.id)!.wheelchair_description as string).trim();
      expect(e.note).toBe(original);
      expect(topicMarkSegments(e.note, e.mentions).map((s) => s.text).join("")).toBe(e.note);
    }
  });
  it("finds the washroom and floor words in the note the pack has today", () => {
    const e = index.entries.find((x) => x.note.includes("10 Dundas Street"))!;
    expect(e.topics).toEqual(["washroom", "floor"]);
    expect(e.negatedOnly).toEqual([]);
  });
  it("finds, again, exactly what a fresh scan of each note finds", () => {
    for (const e of index.entries) expect(e.mentions).toEqual(scanTopics(e.note));
  });
  it("filters and orders without losing or inventing a note", () => {
    for (const o of TOPIC_ORDERS) expect(orderTopicEntries(index.entries, o).map((e) => e.id).sort()).toEqual(index.entries.map((e) => e.id).sort());
    expect(filterTopicEntries(index.entries, NO_TOPIC_FILTER)).toEqual(index.entries);
    for (const id of TOPIC_IDS) expect(filterTopicEntries(index.entries, { ...NO_TOPIC_FILTER, topics: [id] })).toHaveLength(index.byTopic[id].places);
  });
  it("writes a text file and CSV files that carry the credit and read back", () => {
    for (const locale of ["en", "fr"] as const) {
      const text = topicsToText(index, index.entries, locale);
      expect(text.split(OSM_CREDIT)).toHaveLength(2);
      for (const line of text.split("\n")) if (!/^ {3}/.test(line) && !/^\d+\. /.test(line)) expect(lintCopy(line, locale), line).toEqual([]);
    }
    const csv = parseCsv(topicEntriesToCsv(index.entries));
    expect(csv.ok && csv.rows[0]).toEqual([...TOPIC_CSV_HEADER]);
    expect(csv.ok && csv.rows.length).toBe(1 + index.withNote);
    const table = parseCsv(topicTableToCsv(index));
    expect(table.ok && table.rows.length).toBe(1 + TOPIC_IDS.length);
  });
  it("does not change when the places arrive in another order", () => {
    const rev = buildTopicIndex([...places].reverse());
    expect({ ...rev, entries: [] }).toEqual({ ...index, entries: [] });
  });
});
