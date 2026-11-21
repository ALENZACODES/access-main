import { describe, expect, it } from "vitest";
import { OFFLINE_QUESTION_TEMPLATES, questionTemplate, templateCategories } from "./offlineQuestionSheetTemplates";
import { SHEET_CATEGORIES } from "./offlineQuestionSheet";
describe("reusable bilingual question topics", () => {
  it("provides at least three questions per domain", () => expect(OFFLINE_QUESTION_TEMPLATES.length >= SHEET_CATEGORIES.length * 3).toBe(true));
  it("uses unique IDs", () => expect(new Set(OFFLINE_QUESTION_TEMPLATES.map((x) => x.id)).size).toBe(OFFLINE_QUESTION_TEMPLATES.length));
  it("includes all categories", () => expect(templateCategories().slice().sort()).toEqual(SHEET_CATEGORIES.slice().sort()));
  it("keeps each question an inquiry in both languages", () => expect(OFFLINE_QUESTION_TEMPLATES.every((x) => x.en.endsWith("?") && x.fr.endsWith("?"))).toBe(true));
  it("keeps French question-mark typography", () => expect(OFFLINE_QUESTION_TEMPLATES.every((x) => x.fr.endsWith("\u202f?"))).toBe(true));
  it("never asserts availability or access status", () => expect(JSON.stringify(OFFLINE_QUESTION_TEMPLATES)).not.toContain("verified"));
  it("rejects unknown templates", () => expect(questionTemplate("not-a-template", "en")).toBeNull());
  it("has stable retrieval", () => expect(questionTemplate("arrival-a", "en")?.category).toBe("arrival"));
  it("translates the same topic without changing priority", () => expect(questionTemplate("entrance-b", "en")?.priority).toBe(questionTemplate("entrance-b", "fr")?.priority));
  for (const category of SHEET_CATEGORIES) it(`covers ${category} with three distinct questions`, () => {
    const values = OFFLINE_QUESTION_TEMPLATES.filter((x) => x.category === category);
    expect(values).toHaveLength(3);
    expect(new Set(values.map((x) => x.en)).size).toBe(3);
  });
  for (const entry of OFFLINE_QUESTION_TEMPLATES) it(`can select ${entry.id} in both languages`, () => {
    expect(questionTemplate(entry.id, "en")?.text).toBe(entry.en);
    expect(questionTemplate(entry.id, "fr")?.text).toBe(entry.fr);
  });
});
