import { describe, expect, it } from "vitest";
import type { RegionManifest } from "./regionDownload";
import {
  addPreparationEntry, assessPreparationCopies, newPreparationNotebook,
  parsePreparationNotebook, updatePreparationEntry,
} from "./accessPreparation";
import { createPreparationExport, preparationTextReport } from "./accessPreparationExport";

const start = "2026-11-20T12:00:00.000Z";
const next = "2026-11-20T13:00:00.000Z";
const manifest: RegionManifest = { regionId: "ontario-demo", cells: [
  { id: "a", bytes: 200, provenance: { source: "Ontario records", licence: "Open Government Licence", date: "2026-11-01" } },
] };
const make = () => addPreparationEntry(newPreparationNotebook("ontario-demo", start), {
  id: "one", topic: "entry", question: "What is known about the entrance?", cellId: "a",
}, next);
const assessment = () => assessPreparationCopies(manifest, null, make());

describe("metadata-only preparation report", () => {
  it("has an English title", () => {
    expect(preparationTextReport(make(), assessment(), "en")).toContain("My access preparation notes");
  });
  it("has a French title", () => {
    expect(preparationTextReport(make(), assessment(), "fr")).toContain("Mes notes de préparation");
  });
  it("preserves UNKNOWN when copy evidence is absent", () => {
    expect(preparationTextReport(make(), assessment(), "en")).toContain("Offline information state: UNKNOWN");
  });
  it("reports UNKNOWN source for an unattributed question", () => {
    expect(preparationTextReport(make(), assessment(), "en")).toContain("Source name: UNKNOWN");
  });
  it("uses the French nonbreaking colon", () => {
    expect(preparationTextReport(make(), assessment(), "fr")).toContain("Région\u00a0:");
  });
  it("does not add a physical-accessibility conclusion", () => {
    expect(preparationTextReport(make(), assessment(), "en")).toContain("do not establish physical accessibility");
  });
  it("does not export local cell payload bytes", () => {
    expect(preparationTextReport(make(), assessment(), "en")).not.toContain("payloadBytes");
  });
  it("preserves user-authored answers as text", () => {
    const value = updatePreparationEntry(make(), "one", {
      status: "answered", answer: "A personal note about the entry",
    }, "2026-11-20T14:00:00.000Z");
    expect(preparationTextReport(value, assessment(), "en")).toContain("A personal note about the entry");
  });
  it("requires the matching region for copy details", () => {
    expect(() => preparationTextReport(make(), { ...assessment(), regionId: "elsewhere" }, "en")).toThrow();
  });
  it("uses a stable deterministic text report", () => {
    const first = preparationTextReport(make(), assessment(), "en");
    expect(preparationTextReport(make(), assessment(), "en")).toBe(first);
  });
  it("does not collapse the source and answer into a misleading combined field", () => {
    const value = updatePreparationEntry(make(), "one", {
      evidence: "source-note", sourceName: "Ontario records", sourceDate: "2026-11-01",
      answer: "The listing has no entrance measurements", status: "answered",
    }, "2026-11-20T14:00:00.000Z");
    const text = preparationTextReport(value, assessment(), "en");
    expect(text).toContain("Source name: Ontario records");
    expect(text).toContain("Your note: The listing has no entrance measurements");
  });
});

describe("explicit file preparation", () => {
  it("produces a JSON filename with the region", () => {
    expect(createPreparationExport(make(), assessment(), "en", "json").fileName).toContain("ontario-demo");
  });
  it("uses a text extension when text is selected", () => {
    expect(createPreparationExport(make(), assessment(), "fr", "txt").fileName.endsWith(".txt")).toBe(true);
  });
  it("uses a JSON extension when JSON is selected", () => {
    expect(createPreparationExport(make(), assessment(), "en", "json").fileName.endsWith(".json")).toBe(true);
  });
  it("marks the file as containing user content", () => {
    expect(createPreparationExport(make(), assessment(), "en", "json").containsUserNotes).toBe(true);
  });
  it("round trips JSON through the import parser", () => {
    const book = make();
    const file = createPreparationExport(book, assessment(), "en", "json");
    expect(parsePreparationNotebook(file.text, book.regionId)).toEqual(book);
  });
  it("keeps JSON independent of the interface language", () => {
    const en = createPreparationExport(make(), assessment(), "en", "json");
    const fr = createPreparationExport(make(), assessment(), "fr", "json");
    expect(en.text).toBe(fr.text);
  });
  it("does not add local copy status to the historical JSON record", () => {
    const file = createPreparationExport(make(), assessment(), "en", "json");
    expect(file.text).not.toContain("savedCells");
  });
  it("retains the correct notebook version in JSON", () => {
    const file = createPreparationExport(make(), assessment(), "en", "json");
    expect(JSON.parse(file.text).format).toBe("offline-access-preparation-v1");
  });
  it("does not mutate the notebook during export", () => {
    const book = make();
    createPreparationExport(book, assessment(), "en", "txt");
    expect(book.entries[0]?.status).toBe("UNKNOWN");
  });
  it("provides an explicit filename without relying on a server", () => {
    expect(createPreparationExport(make(), assessment(), "en", "txt").fileName).toContain("2026-11-20");
  });
});
