import { describe, expect, it } from "vitest";
import {
  WORKBOOK_CAUSE_COPY, WORKBOOK_CHANGE_COPY, WORKBOOK_COPY,
  WORKBOOK_DISPOSITION_COPY, WORKBOOK_DISPOSITIONS, WORKBOOK_FILTER_COPY,
  WORKBOOK_FILTERS, WORKBOOK_KIND_COPY, WORKBOOK_KINDS,
  WORKBOOK_SORT_COPY, WORKBOOK_SORTS, workbookSummaryText,
} from "./reconciliationWorkbookCopy";
import type { WorkbookSummary } from "./reconciliationWorkbook";

const summary: WorkbookSummary = {
  listed: 4,
  beforeSaved: 2,
  afterSaved: 1,
  changed: 3,
  unknown: 1,
  bytesBefore: 3072,
  bytesAfter: 1024,
  openNotes: 2,
  reviewingNotes: 1,
  closedNotes: 1,
};

describe("bilingual reconciliation workbook copy", () => {
  it("has matching translation keys", () => {
    expect(Object.keys(WORKBOOK_COPY.en).sort()).toEqual(Object.keys(WORKBOOK_COPY.fr).sort());
  });
  it("does not include untranslated empty strings", () => {
    expect(Object.values(WORKBOOK_COPY.en).every((value) => value.trim())).toBe(true);
    expect(Object.values(WORKBOOK_COPY.fr).every((value) => value.trim())).toBe(true);
  });
  it("uses literal UNKNOWN in English", () => {
    expect(WORKBOOK_COPY.en.UNKNOWN).toBe("UNKNOWN");
  });
  it("uses literal UNKNOWN in French", () => {
    expect(WORKBOOK_COPY.fr.UNKNOWN).toBe("UNKNOWN");
  });
  it("uses the same required map attribution in both languages", () => {
    expect(WORKBOOK_COPY.en.credit).toBe("© OpenStreetMap contributors");
    expect(WORKBOOK_COPY.fr.credit).toBe("© OpenStreetMap contributors");
  });
  it("displays the local-history limitation in English", () => {
    expect(WORKBOOK_COPY.en.historical).toContain("historical");
  });
  it("displays the local-history limitation in French", () => {
    expect(WORKBOOK_COPY.fr.historical).toContain("historiques");
  });
  it("warns that exported notes are private information", () => {
    expect(WORKBOOK_COPY.en.privacy).toContain("private");
    expect(WORKBOOK_COPY.fr.privacy).toContain("privé");
  });
  it("does not claim that the tool changes stored files", () => {
    expect(WORKBOOK_COPY.en.readOnly).toContain("does not download, delete, or change");
  });
  it("includes no ASCII apostrophe in French copy", () => {
    for (const text of Object.values(WORKBOOK_COPY.fr)) expect(text.includes("'")).toBe(false);
  });
  it("uses narrow no-break spaces before French question marks", () => {
    for (const text of Object.values(WORKBOOK_COPY.fr)) expect(/(?<!\u202f)\?/.test(text)).toBe(false);
  });
  it("uses narrow no-break spaces before French exclamation marks", () => {
    for (const text of Object.values(WORKBOOK_COPY.fr)) expect(/(?<!\u202f)!/.test(text)).toBe(false);
  });
  it("uses narrow no-break spaces before French semicolons", () => {
    for (const text of Object.values(WORKBOOK_COPY.fr)) expect(/(?<!\u202f);/.test(text)).toBe(false);
  });
  it("uses no-break spaces before French colons", () => {
    for (const text of Object.values(WORKBOOK_COPY.fr)) expect(/(?<!\u00a0):/.test(text)).toBe(false);
  });
  it("has a label for each supported filter in English", () => {
    expect(WORKBOOK_FILTERS.every((key) => Boolean(WORKBOOK_FILTER_COPY.en[key]))).toBe(true);
  });
  it("has a label for each supported filter in French", () => {
    expect(WORKBOOK_FILTERS.every((key) => Boolean(WORKBOOK_FILTER_COPY.fr[key]))).toBe(true);
  });
  it("has labels for every sort in both languages", () => {
    for (const key of WORKBOOK_SORTS) {
      expect(WORKBOOK_SORT_COPY.en[key].trim()).not.toBe("");
      expect(WORKBOOK_SORT_COPY.fr[key].trim()).not.toBe("");
    }
  });
  it("has labels for every note category in both languages", () => {
    for (const key of WORKBOOK_KINDS) {
      expect(WORKBOOK_KIND_COPY.en[key].trim()).not.toBe("");
      expect(WORKBOOK_KIND_COPY.fr[key].trim()).not.toBe("");
    }
  });
  it("has labels for every note status in both languages", () => {
    for (const key of WORKBOOK_DISPOSITIONS) {
      expect(WORKBOOK_DISPOSITION_COPY.en[key].trim()).not.toBe("");
      expect(WORKBOOK_DISPOSITION_COPY.fr[key].trim()).not.toBe("");
    }
  });
  it("uses UNKNOWN for changes without evidence", () => {
    expect(WORKBOOK_CHANGE_COPY.en.UNKNOWN).toBe("UNKNOWN");
    expect(WORKBOOK_CHANGE_COPY.fr.UNKNOWN).toBe("UNKNOWN");
  });
  it("uses UNKNOWN for unreadable causes", () => {
    expect(WORKBOOK_CAUSE_COPY.en.UNKNOWN).toBe("UNKNOWN");
    expect(WORKBOOK_CAUSE_COPY.fr.UNKNOWN).toBe("UNKNOWN");
  });
  it("uses UNKNOWN for the uncertainty filter", () => {
    expect(WORKBOOK_FILTER_COPY.en.UNKNOWN).toBe("UNKNOWN");
    expect(WORKBOOK_FILTER_COPY.fr.UNKNOWN).toBe("UNKNOWN");
  });
  it("formats an English summary with visible counts", () => {
    const text = workbookSummaryText(summary, "en");
    expect(text).toContain("Listed cells: 4");
    expect(text).toContain("Saved in follow-up: 1");
  });
  it("formats a French summary with non-breaking colon spacing", () => {
    const text = workbookSummaryText(summary, "fr");
    expect(text).toContain("Cellules répertoriées\u00a0: 4");
    expect(text).toContain("Copies enregistrées ensuite\u00a0: 1");
  });
  it("formats an unavailable follow-up count as UNKNOWN in English", () => {
    expect(workbookSummaryText({ ...summary, afterSaved: null }, "en")).toContain("Saved in follow-up: UNKNOWN");
  });
  it("formats an unavailable follow-up count as UNKNOWN in French", () => {
    expect(workbookSummaryText({ ...summary, afterSaved: null }, "fr")).toContain("Copies enregistrées ensuite\u00a0: UNKNOWN");
  });
  it("does not display a French lower-case unknown token", () => {
    expect(workbookSummaryText({ ...summary, afterSaved: null }, "fr")).not.toContain("inconnu");
  });
  it("has distinct labels for lost and gained records", () => {
    expect(WORKBOOK_CHANGE_COPY.en.lost).not.toBe(WORKBOOK_CHANGE_COPY.en.gained);
    expect(WORKBOOK_CHANGE_COPY.fr.lost).not.toBe(WORKBOOK_CHANGE_COPY.fr.gained);
  });
  it("has distinct saved and unknown status copy", () => {
    expect(WORKBOOK_COPY.en.saved).not.toBe(WORKBOOK_COPY.en.UNKNOWN);
    expect(WORKBOOK_COPY.fr.saved).not.toBe(WORKBOOK_COPY.fr.UNKNOWN);
  });
  it("includes a visible status announcement for an invalid import", () => {
    expect(WORKBOOK_COPY.en.invalid).toContain("cannot be imported");
    expect(WORKBOOK_COPY.fr.invalid).toContain("Impossible d’importer");
  });
  it("announces an operation in progress", () => {
    expect(WORKBOOK_COPY.en.reading).toContain("Reading");
    expect(WORKBOOK_COPY.fr.reading).toContain("Lecture");
  });
  it("explains that an imported capture needs a new reading", () => {
    expect(WORKBOOK_COPY.en.imported).toContain("fresh reading");
    expect(WORKBOOK_COPY.fr.imported).toContain("nouveau relevé");
  });
  it("supports note privacy without network transmission language", () => {
    expect(WORKBOOK_COPY.en.note).toBe("Local note");
    expect(WORKBOOK_COPY.fr.note).toBe("Note locale");
  });
});
