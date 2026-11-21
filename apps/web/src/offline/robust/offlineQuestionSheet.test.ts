import { describe, expect, it } from "vitest";
import type { RegionManifest } from "./regionDownload";
import type { RegionInventory } from "./regionInventory";
import {
  SHEET_CATEGORIES, SHEET_MAX_ITEMS, SHEET_PRIORITIES, SHEET_REPLIES, SHEET_VERSION,
  addSheetItem, assessQuestionSheet, changeSheetTitle, emptyQuestionSheet, encodeQuestionSheet,
  moveSheetItem, pageQuestionSheet, parseQuestionSheet, removeSheetItem,
  summarizeQuestionSheet, updateSheetItem, type QuestionSheet,
} from "./offlineQuestionSheet";
import { auditSheetCopy, SHEET_COPY, SHEET_TOPIC_COPY, SHEET_PRIORITY_COPY, SHEET_REPLY_COPY, questionSheetCopy } from "./offlineQuestionSheetCopy";
import { createQuestionBackup, createQuestionHandout } from "./offlineQuestionSheetExport";
const source = { source: "Municipal open data", licence: "OGL", date: "2026-03-11" };
const manifest: RegionManifest = { regionId: "region-one", cells: [
  { id: "first", bytes: 100, provenance: source }, { id: "second", bytes: 250, provenance: { ...source, date: "2026-05-01" } },
  { id: "third", bytes: 500, provenance: { source: "Public source", licence: "CC BY 4.0", date: "2026-05-02" } },
] };
const inventory: RegionInventory = { regionId: "region-one", cells: [
  { id: "first", expectedBytes: 100, state: "saved", cause: "present", provenance: source },
  { id: "second", expectedBytes: 250, state: "unknown", cause: "missing", provenance: manifest.cells[1]!.provenance },
  { id: "third", expectedBytes: 500, state: "saved", cause: "present", provenance: manifest.cells[2]!.provenance },
], savedCount: 2, unknownCount: 1, savedBytes: 600, expectedBytes: 850, complete: false };
const initial = () => emptyQuestionSheet(manifest, "Questions");
const one = () => addSheetItem(initial(), manifest, { cellId: "first", category: "entrance", priority: "essential", question: "Is the entrance step-free?", note: "Ask directly" });
const two = () => addSheetItem(one(), manifest, { cellId: "second", category: "arrival", priority: "helpful", question: "Where should I arrive?" });
const three = () => addSheetItem(two(), manifest, { category: "rest", priority: "optional", question: "Where are the seats?" });
const rows = (sheet: QuestionSheet = three(), observed: RegionInventory | null = inventory) => assessQuestionSheet(sheet, manifest, observed);
function mutate(sheet: QuestionSheet, change: (value: Record<string, unknown>) => void): string {
  const value = JSON.parse(JSON.stringify(sheet)) as Record<string, unknown>;
  change(value);
  return JSON.stringify(value);
}
const expectBad = (json: string) => expect(() => parseQuestionSheet(json, manifest)).toThrow();

describe("offline question sheet state and provenance", () => {
  it("starts empty with a version and region", () => { const s = initial(); expect(s.schema).toBe(SHEET_VERSION); expect(s.regionId).toBe("region-one"); expect(s.items).toHaveLength(0); });
  it("creates distinct question IDs", () => expect(three().items.map((x) => x.id)).toEqual(["q-1", "q-2", "q-3"]));
  it("does not mutate a previous sheet", () => { const before = initial(); addSheetItem(before, manifest, { category: "rest", priority: "optional", question: "Seats?" }); expect(before.items).toHaveLength(0); });
  it("keeps user order separate from ID", () => { const s = moveSheetItem(three(), "q-3", "up"); expect(s.items.map((x) => x.id)).toEqual(["q-1", "q-3", "q-2"]); expect(s.items.map((x) => x.position)).toEqual([0, 1, 2]); });
  it("does nothing when moving the first row up", () => { const s = one(); expect(moveSheetItem(s, "q-1", "up")).toBe(s); });
  it("rejects a missing row for reorder", () => expect(() => moveSheetItem(one(), "q-z", "down")).toThrow());
  it("removes a question and normalizes positions", () => { const s = removeSheetItem(three(), "q-2"); expect(s.items.map((x) => x.position)).toEqual([0, 1]); });
  it("reuses available generated IDs without collision", () => { const s = addSheetItem(removeSheetItem(two(), "q-1"), manifest, { question: "Another?", category: "other", priority: "helpful" }); expect(new Set(s.items.map((x) => x.id)).size).toBe(2); });
  it("rejects empty question text", () => expect(() => addSheetItem(initial(), manifest, { question: "  ", category: "rest", priority: "helpful" })).toThrow());
  it("rejects overly long questions", () => expect(() => addSheetItem(initial(), manifest, { question: "X".repeat(401), category: "rest", priority: "helpful" })).toThrow());
  it("rejects cell references not in manifest", () => expect(() => addSheetItem(initial(), manifest, { question: "Question?", cellId: "else", category: "rest", priority: "helpful" })).toThrow());
  it("rejects additions to a mismatching region", () => expect(() => addSheetItem(initial(), { ...manifest, regionId: "other" }, { question: "Question?", category: "rest", priority: "helpful" })).toThrow());
  it("normalizes whitespace in questions", () => expect(addSheetItem(initial(), manifest, { question: "  What\n about  this? ", category: "rest", priority: "optional" }).items[0]?.question).toBe("What about this?"));
  it("records asked without pretending a reply", () => expect(updateSheetItem(one(), "q-1", { reply: "asked" }).items[0]?.replyText).toBe(""));
  it("records replies only with text", () => expect(() => updateSheetItem(one(), "q-1", { reply: "reply-noted" })).toThrow());
  it("does not attach replies to unasked questions", () => expect(() => updateSheetItem(one(), "q-1", { replyText: "Yes" })).toThrow());
  it("clears a reply before moving back to not asked", () => {
    const answered = updateSheetItem(one(), "q-1", { reply: "reply-noted", replyText: "Person said to ask upon arrival" });
    expect(() => updateSheetItem(answered, "q-1", { reply: "not-asked" })).toThrow();
    expect(updateSheetItem(answered, "q-1", { reply: "not-asked", replyText: "" }).items[0]?.reply).toBe("not-asked");
  });
  it("retains a personal note separately from a reply", () => expect(one().items[0]?.note).toBe("Ask directly"));
  it("does not allow an unknown question edit", () => expect(() => updateSheetItem(one(), "nobody", { note: "Note" })).toThrow());
  it("allows title changes without changing questions", () => { const s = changeSheetTitle(one(), "My plan"); expect(s.items).toEqual(one().items); expect(s.title).toBe("My plan"); });
  it("limits sheet length", () => { let s = initial(); for (let n = 0; n < SHEET_MAX_ITEMS; n++) s = addSheetItem(s, manifest, { category: "other", priority: "optional", question: `Question ${n}` }); expect(() => addSheetItem(s, manifest, { category: "other", priority: "optional", question: "Another" })).toThrow(); });
  it("does not interpret a saved cell as physical access", () => { expect(rows()[0]?.storage).toBe("saved"); expect(rows()[0]?.physical).toBe("UNKNOWN"); });
  it("marks unsaved cells UNKNOWN", () => expect(rows()[1]?.storage).toBe("UNKNOWN"));
  it("keeps unlinked cells UNKNOWN", () => { expect(rows()[2]?.source).toBe("UNKNOWN"); expect(rows()[2]?.physical).toBe("UNKNOWN"); });
  it("handles absent inventory conservatively", () => expect(rows(three(), null).every((x) => x.storage === "UNKNOWN")).toBe(true));
  it("handles inventory from a different region", () => expect(rows(three(), { ...inventory, regionId: "wrong" }).every((x) => x.storage === "UNKNOWN")).toBe(true));
  it("detects changed expected bytes", () => { const changed = { ...inventory, cells: inventory.cells.map((x) => x.id === "first" ? { ...x, expectedBytes: 101 } : x) }; expect(rows(three(), changed)[0]?.reason).toBe("source-conflict"); });
  it("detects changed licence", () => { const changed = { ...inventory, cells: inventory.cells.map((x) => x.id === "first" ? { ...x, provenance: { ...x.provenance, licence: "other" } } : x) }; expect(rows(three(), changed)[0]?.storage).toBe("UNKNOWN"); });
  it("detects changed source date", () => { const changed = { ...inventory, cells: inventory.cells.map((x) => x.id === "first" ? { ...x, provenance: { ...x.provenance, date: "2020-01-01" } } : x) }; expect(rows(three(), changed)[0]?.storage).toBe("UNKNOWN"); });
  it("does not mark unreadable cells saved", () => { const changed = { ...inventory, cells: inventory.cells.map((x) => x.id === "first" ? { ...x, state: "unknown" as const, cause: "unreadable" as const } : x) }; expect(rows(three(), changed)[0]?.storage).toBe("UNKNOWN"); });
  it("counts replies separately from saved data", () => { const summary = summarizeQuestionSheet(rows()); expect(summary).toEqual({ total: 3, savedData: 1, unknownData: 2, essential: 1, unanswered: 3, repliesNoted: 0, physical: "UNKNOWN" }); });
  it("counts recorded reply but never changes physical state", () => { const s = updateSheetItem(one(), "q-1", { reply: "reply-noted", replyText: "Asked by phone" }); const sum = summarizeQuestionSheet(rows(s)); expect(sum.repliesNoted).toBe(1); expect(sum.physical).toBe("UNKNOWN"); });
  it("returns stable ordered pages", () => expect(pageQuestionSheet(rows(), { filter: "all", sort: "ordered", query: "", offset: 1, limit: 1 }).rows[0]?.id).toBe("q-2"));
  it("filters essential questions", () => expect(pageQuestionSheet(rows(), { filter: "essential", sort: "ordered", query: "", offset: 0, limit: 10 }).total).toBe(1));
  it("filters missing local data", () => expect(pageQuestionSheet(rows(), { filter: "UNKNOWN", sort: "ordered", query: "", offset: 0, limit: 10 }).total).toBe(2));
  it("filters saved local data", () => expect(pageQuestionSheet(rows(), { filter: "saved", sort: "ordered", query: "", offset: 0, limit: 10 }).total).toBe(1));
  it("searches private notes without exposing other rows", () => expect(pageQuestionSheet(rows(), { filter: "all", sort: "ordered", query: "ask directly", offset: 0, limit: 10 }).total).toBe(1));
  it("rejects invalid page limits", () => expect(() => pageQuestionSheet(rows(), { filter: "all", sort: "ordered", query: "", offset: 0, limit: 101 })).toThrow());
  it("provides next and previous flags", () => { const r = pageQuestionSheet(rows(), { filter: "all", sort: "ordered", query: "", offset: 1, limit: 1 }); expect(r.next).toBe(true); expect(r.previous).toBe(true); });
  it("does not mutate the original order when sorting", () => { const r = rows(); pageQuestionSheet(r, { filter: "all", sort: "category", query: "", offset: 0, limit: 10 }); expect(r.map((x) => x.id)).toEqual(["q-1", "q-2", "q-3"]); });
  it("rejects invalid JSON", () => expectBad("not json"));
  it("round trips a valid backup", () => expect(parseQuestionSheet(encodeQuestionSheet(three(), manifest), manifest)).toEqual(three()));
  it("rejects a different region", () => expectBad(mutate(one(), (x) => { x.regionId = "other"; })));
  it("rejects a different schema", () => expectBad(mutate(one(), (x) => { x.schema = "v2"; })));
  it("rejects extra top-level data", () => expectBad(mutate(one(), (x) => { x.verified = true; })));
  it("rejects a fabricated physical accessibility field", () => expectBad(mutate(one(), (x) => { const items = x.items as Array<Record<string, unknown>>; items[0]!.physical = "accessible"; })));
  it("rejects a duplicate question ID", () => expectBad(mutate(two(), (x) => { const items = x.items as Array<Record<string, unknown>>; items[1]!.id = items[0]!.id; })));
  it("rejects invalid positions", () => expectBad(mutate(two(), (x) => { const items = x.items as Array<Record<string, unknown>>; items[1]!.position = 0; })));
  it("rejects unknown question categories", () => expectBad(mutate(one(), (x) => { (x.items as Array<Record<string, unknown>>)[0]!.category = "unsafe"; })));
  it("rejects unknown priority values", () => expectBad(mutate(one(), (x) => { (x.items as Array<Record<string, unknown>>)[0]!.priority = "urgent"; })));
  it("rejects invalid reply states", () => expectBad(mutate(one(), (x) => { (x.items as Array<Record<string, unknown>>)[0]!.reply = "yes"; })));
  it("rejects missing linked cells", () => expectBad(mutate(one(), (x) => { (x.items as Array<Record<string, unknown>>)[0]!.cellId = "missing"; })));
  it("rejects reply text without a recorded reply", () => expectBad(mutate(one(), (x) => { (x.items as Array<Record<string, unknown>>)[0]!.replyText = "Hello"; })));
  it("rejects empty questions", () => expectBad(mutate(one(), (x) => { (x.items as Array<Record<string, unknown>>)[0]!.question = ""; })));
  it("rejects title with path controls", () => expectBad(mutate(one(), (x) => { x.title = "a\u202e"; })));
  it("rejects oversized backups", () => expectBad(" ".repeat(131073)));
  it("produces a stable backup filename", () => expect(createQuestionBackup(one(), manifest, "en").filename).toBe("offline-questions-region-one.json"));
  it("creates private-free text by default", () => { const text = createQuestionHandout(one(), manifest, inventory, "en", false).content; expect(text).not.toContain("Ask directly"); expect(text).toContain("Physical access: UNKNOWN"); });
  it("includes private notes on explicit choice", () => expect(createQuestionHandout(one(), manifest, inventory, "en", true).content).toContain("Ask directly"));
  it("uses French nonbreaking colon spacing", () => expect(createQuestionHandout(one(), manifest, inventory, "fr", true).content).toContain("Source\u00a0: Municipal"));
  it("never includes downloaded payloads in handouts", () => expect(createQuestionHandout(one(), manifest, inventory, "en", false).content).not.toContain("Uint8Array"));
  it("keeps source metadata in text", () => expect(createQuestionHandout(one(), manifest, inventory, "en", false).content).toContain("OGL"));
  it("has matching translated copy keys", () => expect(Object.keys(SHEET_COPY.en)).toEqual(Object.keys(SHEET_COPY.fr)));
  it("has no bilingual copy audit findings", () => expect(auditSheetCopy()).toEqual([]));
  it("chooses the correct locale", () => expect(questionSheetCopy("fr").title).toBe(SHEET_COPY.fr.title));
  it("always retains UNKNOWN", () => expect(SHEET_COPY.en.unknown).toBe("UNKNOWN"));
  for (const category of SHEET_CATEGORIES) it(`has both translations for ${category}`, () => {
    expect(SHEET_TOPIC_COPY.en[category].length > 0).toBe(true);
    expect(SHEET_TOPIC_COPY.fr[category].length > 0).toBe(true);
  });
  for (const priority of SHEET_PRIORITIES) it(`has both priority labels for ${priority}`, () => {
    expect(SHEET_PRIORITY_COPY.en[priority].length > 0).toBe(true);
    expect(SHEET_PRIORITY_COPY.fr[priority].length > 0).toBe(true);
  });
  for (const reply of SHEET_REPLIES) it(`has both reply labels for ${reply}`, () => {
    expect(SHEET_REPLY_COPY.en[reply].length > 0).toBe(true);
    expect(SHEET_REPLY_COPY.fr[reply].length > 0).toBe(true);
  });
});
