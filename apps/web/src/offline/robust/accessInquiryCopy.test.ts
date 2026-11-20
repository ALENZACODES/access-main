import { describe, expect, it } from "vitest";
import {
  INQUIRY_CHANNEL_LABELS, INQUIRY_COPY, INQUIRY_FILTER_LABELS, INQUIRY_IMPORTANCE_LABELS,
  INQUIRY_PROGRESS_LABELS, INQUIRY_SORT_LABELS, INQUIRY_TOPIC_LABELS,
  INQUIRY_TEMPLATE_HINTS, INQUIRY_TEMPLATE_FR, auditInquiryCopy, inquiryCopy,
} from "./accessInquiryCopy";
import { INQUIRY_TOPICS, INQUIRY_TEMPLATES } from "./accessInquiry";

const copyKeys = Object.keys(INQUIRY_COPY.en);
describe("access inquiry English/French copy", () => {
  it("contains matching copy keys", () => {
    expect(Object.keys(INQUIRY_COPY.fr)).toEqual(copyKeys);
  });
  it("uses the same UNKNOWN token in both languages", () => {
    expect(INQUIRY_COPY.en.unknown).toBe("UNKNOWN");
    expect(INQUIRY_COPY.fr.unknown).toBe("UNKNOWN");
  });
  it("does not infer physical conditions from manually recorded replies", () => {
    expect(INQUIRY_COPY.en.condition).toContain("UNKNOWN");
    expect(INQUIRY_COPY.fr.condition).toContain("UNKNOWN");
  });
  it("states that no assumptions are made about an unasked question", () => {
    expect(INQUIRY_COPY.en.intro).toContain("No answers are assumed");
  });
  it("warns about export privacy", () => {
    expect(INQUIRY_COPY.en.private).toContain("personal information");
    expect(INQUIRY_COPY.fr.private).toContain("renseignements personnels");
  });
  it("leaves unsaved notes in page memory", () => {
    expect(INQUIRY_COPY.en.saved).toContain("page memory");
  });
  it("identifies imported information as historical", () => {
    expect(INQUIRY_COPY.en.imported).toContain("Historical");
  });
  it("retains French typography", () => {
    expect(auditInquiryCopy()).toEqual([]);
  });
  it("never uses a translated UNKNOWN", () => {
    expect(JSON.stringify(INQUIRY_COPY.fr)).not.toContain("INCONNU");
  });
  it("accesses copy without generating new objects", () => {
    expect(inquiryCopy("en")).toBe(INQUIRY_COPY.en);
    expect(inquiryCopy("fr")).toBe(INQUIRY_COPY.fr);
  });
  it("does not return English for a French request", () => {
    expect(inquiryCopy("fr").title).not.toBe(inquiryCopy("en").title);
  });
  it("contains a visible label for searching questions", () => {
    expect(INQUIRY_COPY.en.search.length).toBeGreaterThan(4);
    expect(INQUIRY_COPY.fr.search.length).toBeGreaterThan(4);
  });
  it("contains a visible privacy warning in both languages", () => {
    expect(INQUIRY_COPY.en.private).toBeTruthy();
    expect(INQUIRY_COPY.fr.private).toBeTruthy();
  });
  it("includes a follow-up hint without promising conditions", () => {
    expect(INQUIRY_COPY.en.hint).toContain("Follow up");
    expect(INQUIRY_COPY.fr.hint).toContain("Communiquez");
  });
  it("includes labels for both export formats", () => {
    expect(INQUIRY_COPY.en.exportJson).toContain("JSON");
    expect(INQUIRY_COPY.en.exportText).toContain("text");
    expect(INQUIRY_COPY.fr.exportText).toContain("texte");
  });
  it("provides an accessible name for pagination", () => {
    expect(INQUIRY_COPY.en.page).toContain("pages");
    expect(INQUIRY_COPY.fr.page).toContain("Pages");
  });
  it("has a French label for manual notes", () => {
    expect(INQUIRY_COPY.fr.addNote).toContain("note");
  });
  it("avoids unsupported claims in both languages", () => {
    for (const language of ["en", "fr"] as const) {
      expect(JSON.stringify(INQUIRY_COPY[language])).not.toContain("guarantee");
    }
  });
  for (const key of copyKeys) {
    it(`has nonempty paired copy for ${key}`, () => {
      const english = (INQUIRY_COPY.en as Record<string, string>)[key];
      const french = (INQUIRY_COPY.fr as Record<string, string>)[key];
      expect(english?.trim().length).toBeGreaterThan(0);
      expect(french?.trim().length).toBeGreaterThan(0);
    });
  }
});

describe("access inquiry labels and topic hints", () => {
  for (const topic of INQUIRY_TOPICS) {
    it(`labels the ${topic} topic in both languages`, () => {
      expect(INQUIRY_TOPIC_LABELS.en[topic]).toBeTruthy();
      expect(INQUIRY_TOPIC_LABELS.fr[topic]).toBeTruthy();
      expect(INQUIRY_TEMPLATE_HINTS.en[topic]).toBeTruthy();
      expect(INQUIRY_TEMPLATE_HINTS.fr[topic]).toBeTruthy();
    });
  }
  it("provides labels for each progress state", () => {
    expect(Object.keys(INQUIRY_PROGRESS_LABELS.en).sort()).toEqual(Object.keys(INQUIRY_PROGRESS_LABELS.fr).sort());
  });
  it("provides labels for each priority", () => {
    expect(Object.keys(INQUIRY_IMPORTANCE_LABELS.en).sort()).toEqual(Object.keys(INQUIRY_IMPORTANCE_LABELS.fr).sort());
  });
  it("provides labels for each channel", () => {
    expect(Object.keys(INQUIRY_CHANNEL_LABELS.en).sort()).toEqual(Object.keys(INQUIRY_CHANNEL_LABELS.fr).sort());
  });
  it("provides labels for each filter", () => {
    expect(Object.keys(INQUIRY_FILTER_LABELS.en).sort()).toEqual(Object.keys(INQUIRY_FILTER_LABELS.fr).sort());
  });
  it("provides labels for each sort order", () => {
    expect(Object.keys(INQUIRY_SORT_LABELS.en).sort()).toEqual(Object.keys(INQUIRY_SORT_LABELS.fr).sort());
  });
  it("distinguishes an unanswered question from a noted reply", () => {
    expect(INQUIRY_PROGRESS_LABELS.en["to-ask"]).not.toBe(INQUIRY_PROGRESS_LABELS.en["reply-noted"]);
  });
  it("does not assert that a question was answered when it was merely asked", () => {
    expect(INQUIRY_PROGRESS_LABELS.en.asked).not.toBe(INQUIRY_PROGRESS_LABELS.en["reply-noted"]);
  });
  it("does not mislabel web contacts as telephone calls", () => {
    expect(INQUIRY_CHANNEL_LABELS.en.web).not.toBe(INQUIRY_CHANNEL_LABELS.en.phone);
  });
  it("provides all topic template names", () => {
    const templates = INQUIRY_TEMPLATES.map((item) => item.topic);
    for (const topic of INQUIRY_TOPICS) expect(templates).toContain(topic);
  });
  it("keeps UNKNOWN uppercase in the language-neutral model", () => {
    expect(INQUIRY_COPY.fr.unknown).toBe(INQUIRY_COPY.en.unknown);
  });
});

describe("French question templates", () => {
  it("translates every suggested question", () => {
    for (const template of INQUIRY_TEMPLATES) expect(INQUIRY_TEMPLATE_FR[template.id]).toBeTruthy();
  });
  it("uses narrow nonbreaking spaces before question marks", () => {
    for (const value of Object.values(INQUIRY_TEMPLATE_FR)) expect(value).toContain("\u202f?");
  });
  it("does not leave straight apostrophes in suggested questions", () => {
    for (const value of Object.values(INQUIRY_TEMPLATE_FR)) expect(value).not.toContain("'");
  });
  it("keeps each French question distinct", () => {
    expect(new Set(Object.values(INQUIRY_TEMPLATE_FR)).size).toBe(INQUIRY_TEMPLATES.length);
  });
});
