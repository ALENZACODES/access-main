import { describe, expect, it } from "vitest";
import { addInquiryEvent, addInquiryPlace, addInquiryQuestion, emptyInquiryBook,
  type InquiryBook } from "./accessInquiry";
import { createInquiryExport, createInquiryReport, decodeInquiryExport,
  formatInquiryReport, inquiryExportFilename, serializeInquiryReport } from "./accessInquiryExport";
const at = "2026-11-20T12:00:00.000Z";
const source = "2026-11-19";
const sample = (): InquiryBook => {
  let book = addInquiryPlace(emptyInquiryBook(), { id: "ontario-venue", label: "Community hall",
    area: "Ontario", plannedDate: null, createdAt: at, updatedAt: at });
  book = addInquiryQuestion(book, { id: "entry", placeId: "ontario-venue",
    topic: "entrance", prompt: "Which entrance avoids steps?", importance: "essential",
    progress: "to-ask", condition: "UNKNOWN", createdAt: at, updatedAt: at });
  book = addInquiryEvent(book, { id: "note-one", questionId: "entry", at,
    channel: "phone", note: "Caller was asked to follow up", sourceDate: source });
  return book;
};
describe("access inquiry export contracts", () => {
  it("creates a versioned report", () => {
    expect(createInquiryReport(sample(), "en", at).format).toBe("access-inquiry-report-v1");
  });
  it("retains the supplied observation date", () => {
    expect(createInquiryReport(sample(), "en", at).exportedAt).toBe(at);
  });
  it("does not infer a physical condition", () => {
    expect(createInquiryReport(sample(), "en", at).condition).toBe("UNKNOWN");
  });
  it("counts recorded questions separately from notes", () => {
    expect(createInquiryReport(sample(), "en", at)).toMatchObject({ questions: 1, notes: 1 });
  });
  it("does not confuse missing replies with lack of notes", () => {
    expect(createInquiryReport(sample(), "en", at).unanswered).toBe(1);
  });
  it("retains notes without converting their conditions", () => {
    expect(createInquiryReport(sample(), "en", at).book.questions[0]?.condition).toBe("UNKNOWN");
  });
  it("returns deterministic JSON", () => {
    const result = createInquiryReport(sample(), "en", at);
    expect(serializeInquiryReport(result)).toBe(serializeInquiryReport(result));
  });
  it("ends JSON with a newline", () => {
    expect(serializeInquiryReport(createInquiryReport(sample(), "en", at)).endsWith("\n")).toBe(true);
  });
  it("keeps JSON parseable", () => {
    const report = serializeInquiryReport(createInquiryReport(sample(), "en", at));
    expect(JSON.parse(report)).toMatchObject({ condition: "UNKNOWN", places: 1 });
  });
  it("retains the source date in exported JSON", () => {
    expect(serializeInquiryReport(createInquiryReport(sample(), "en", at))).toContain(source);
  });
  it("retains a manually entered note in exported JSON", () => {
    expect(serializeInquiryReport(createInquiryReport(sample(), "en", at))).toContain("follow up");
  });
  it("provides the expected English plain text", () => {
    expect(formatInquiryReport(createInquiryReport(sample(), "en", at))).toContain("Access inquiry planner");
  });
  it("provides a French plain-text title", () => {
    expect(formatInquiryReport(createInquiryReport(sample(), "fr", at))).toContain("Planificateur de questions");
  });
  it("uses a nonbreaking space before French colons", () => {
    expect(formatInquiryReport(createInquiryReport(sample(), "fr", at))).toContain("Conditions\u00a0: UNKNOWN");
  });
  it("keeps UNKNOWN in English plain text", () => {
    expect(formatInquiryReport(createInquiryReport(sample(), "en", at))).toContain("Condition: UNKNOWN");
  });
  it("keeps UNKNOWN in French plain text", () => {
    expect(formatInquiryReport(createInquiryReport(sample(), "fr", at))).toContain("Condition\u00a0: UNKNOWN");
  });
  it("includes the area in plain text", () => {
    expect(formatInquiryReport(createInquiryReport(sample(), "en", at))).toContain("Area: Ontario");
  });
  it("includes the note contact channel", () => {
    expect(formatInquiryReport(createInquiryReport(sample(), "en", at))).toContain("Channel: Telephone");
  });
  it("contains a privacy warning", () => {
    expect(formatInquiryReport(createInquiryReport(sample(), "en", at))).toContain("personal information");
  });
  it("reimports an exported book", () => {
    expect(decodeInquiryExport(serializeInquiryReport(createInquiryReport(sample(), "en", at)))).toEqual(sample());
  });
  it("accepts a plain book JSON export", () => {
    expect(decodeInquiryExport(JSON.stringify(sample()))).toEqual(sample());
  });
  it("rejects malformed JSON", () => {
    expect(() => decodeInquiryExport("invalid-json")).toThrow();
  });
  it("rejects files larger than 524288 bytes", () => {
    expect(() => decodeInquiryExport("x".repeat(524289))).toThrow();
  });
  it("does not silently import unsupported formats", () => {
    expect(() => decodeInquiryExport(JSON.stringify({ format: "other" }))).toThrow();
  });
  it("uses a predictable JSON filename", () => {
    expect(inquiryExportFilename("json", "2026-11-20")).toBe("access-inquiry-2026-11-20.json");
  });
  it("uses a predictable text filename", () => {
    expect(inquiryExportFilename("txt", "2026-11-20")).toBe("access-inquiry-2026-11-20.txt");
  });
  it("falls back for malformed date strings", () => {
    expect(inquiryExportFilename("json", "tomorrow")).toContain("unknown-date");
  });
  it("returns a MIME type for both file kinds", () => {
    expect(createInquiryExport(sample(), "en", "json", at).mime).toContain("json");
    expect(createInquiryExport(sample(), "en", "txt", at).mime).toContain("plain");
  });
  it("does not mutate the source book while exporting", () => {
    const original = sample();
    const previous = JSON.stringify(original);
    createInquiryExport(original, "en", "txt", at);
    expect(JSON.stringify(original)).toBe(previous);
  });
  it("removes invisible directional overrides in plain text", () => {
    const record = createInquiryReport(sample(), "en", at);
    const event = { ...record.book.events[0]!, note: "Before\u202eafter" };
    const altered = { ...record, book: { ...record.book, events: [event] } };
    expect(formatInquiryReport(altered)).not.toContain("\u202e");
  });
  it("reduces multiline source notes to display-safe lines", () => {
    const record = createInquiryReport(sample(), "en", at);
    const event = { ...record.book.events[0]!, note: "one\ntwo" };
    expect(formatInquiryReport({ ...record, book: { ...record.book, events: [event] } })).toContain("one two");
  });
  it("refuses invalid export timestamps", () => {
    expect(() => createInquiryReport(sample(), "fr", "tomorrow")).toThrow();
  });
  it("does not export location coordinates", () => {
    expect(serializeInquiryReport(createInquiryReport(sample(), "en", at))).not.toContain("latitude");
  });
  it("does not export browser identifiers", () => {
    expect(serializeInquiryReport(createInquiryReport(sample(), "en", at))).not.toContain("userAgent");
  });
  it("does not attach cell payload bytes", () => {
    expect(serializeInquiryReport(createInquiryReport(sample(), "en", at))).not.toContain("payloadBytes");
  });
});
