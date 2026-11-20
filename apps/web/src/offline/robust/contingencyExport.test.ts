import { describe, expect, it } from "vitest";
import { addContingencyStep, createContingencyPlan, updateContingencyStep } from "./contingencyPlan";
import {
  contingencyFilename, contingencyReportJson, contingencyReportText, createContingencyReport,
} from "./contingencyExport";
const at = "2026-11-20T12:00:00.000Z";
const later = "2026-11-20T13:00:00.000Z";
const exportAt = "2026-11-20T14:00:00.000Z";
const blank = () => createContingencyPlan("ontario", at);
const plan = () => updateContingencyStep(addContingencyStep(blank(), {
  id: "arrival", eventId: "create-arrival", title: "West entrance", kind: "entrance",
  question: "Who can describe the current entrance conditions?", at: later,
}), "arrival", { signal: "issue", alternative: "Ask about another entry", note: "No assumptions" }, later, "edit-arrival");

describe("contingency export", () => {
  it("returns a bounded region filename", () => {
    expect(contingencyFilename("Ontario", "json")).toBe("offline-contingency-ontario.json");
  });
  it("normalizes path separators in filenames", () => {
    expect(contingencyFilename("../West/East", "txt")).toBe("offline-contingency-west-east.txt");
  });
  it("does not permit extremely long file names", () => {
    expect(contingencyFilename("a".repeat(500), "txt").length).toBeLessThan(90);
  });
  it("uses a fallback for an empty filename region", () => {
    expect(contingencyFilename("", "json")).toContain("region");
  });
  it("records an explicit export date", () => {
    expect(createContingencyReport(plan(), exportAt).exportedAt).toBe(exportAt);
  });
  it("rejects unparseable export dates", () => {
    expect(() => createContingencyReport(plan(), "today")).toThrow();
  });
  it("never replaces the physical condition with a personal note", () => {
    expect(createContingencyReport(plan(), exportAt).status).toBe("UNKNOWN");
  });
  it("preserves manually noted issues", () => {
    expect(createContingencyReport(plan(), exportAt).counts.issues).toBe(1);
  });
  it("does not change the source when exporting", () => {
    expect(createContingencyReport(plan(), exportAt).steps[0]?.source.state).toBe("UNKNOWN");
  });
  it("has a versioned JSON schema", () => {
    expect(JSON.parse(contingencyReportJson(plan(), exportAt)).schema).toBe("offline-contingency-report-v1");
  });
  it("contains a trailing newline in JSON", () => {
    expect(contingencyReportJson(plan(), exportAt).endsWith("\n")).toBe(true);
  });
  it("does not embed offline payload bytes", () => {
    expect(contingencyReportJson(plan(), exportAt)).not.toContain("payloadBytes");
  });
  it("does not embed client identifiers", () => {
    expect(contingencyReportJson(plan(), exportAt)).not.toContain("userAgent");
  });
  it("does not add location coordinates", () => {
    expect(contingencyReportJson(plan(), exportAt)).not.toContain("latitude");
    expect(contingencyReportJson(plan(), exportAt)).not.toContain("longitude");
  });
  it("preserves user-entered questions", () => {
    expect(contingencyReportJson(plan(), exportAt)).toContain("current entrance conditions");
  });
  it("includes a caution in the English text", () => {
    expect(contingencyReportText(plan(), "en", exportAt)).toContain("not a statement");
  });
  it("includes a caution in the French text", () => {
    expect(contingencyReportText(plan(), "fr", exportAt)).toContain("accessibilité");
  });
  it("shows UNKNOWN in English text", () => {
    expect(contingencyReportText(plan(), "en", exportAt)).toContain("UNKNOWN");
  });
  it("shows UNKNOWN in French text", () => {
    expect(contingencyReportText(plan(), "fr", exportAt)).toContain("UNKNOWN");
  });
  it("uses nonbreaking French colon punctuation", () => {
    expect(contingencyReportText(plan(), "fr", exportAt)).toContain("Région\u00a0: ontario");
  });
  it("includes suggested alternate questions as notes only", () => {
    expect(contingencyReportText(plan(), "en", exportAt)).toContain("Ask about another entry");
  });
  it("never confuses an alternate note with saved data", () => {
    expect(contingencyReportText(plan(), "en", exportAt)).toContain("Local-copy evidence: UNKNOWN");
  });
  it("keeps exact manual status", () => {
    expect(contingencyReportText(plan(), "en", exportAt)).toContain("Possible issue noted");
  });
  it("keeps a known count of notes", () => {
    expect(createContingencyReport(plan(), exportAt).counts.listed).toBe(1);
  });
  it("does not mutate the source plan", () => {
    const value = plan();
    const before = JSON.stringify(value);
    contingencyReportText(value, "en", exportAt);
    expect(JSON.stringify(value)).toBe(before);
  });
  it("does not invent records in an empty report", () => {
    expect(createContingencyReport(blank(), exportAt).steps).toEqual([]);
  });
  it("requires a valid time even for an empty plan", () => {
    expect(() => contingencyReportJson(blank(), "not-a-time")).toThrow();
  });
  it("contains a plain-text summary with the listed count", () => {
    expect(contingencyReportText(plan(), "en", exportAt)).toContain("Checkpoints: 1");
  });
  it("includes the French source status", () => {
    expect(contingencyReportText(plan(), "fr", exportAt)).toContain("Données de copie locale\u00a0: UNKNOWN");
  });
});
