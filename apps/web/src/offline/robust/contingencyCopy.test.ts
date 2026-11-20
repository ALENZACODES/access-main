import { describe, expect, it } from "vitest";
import {
  CONTINGENCY_COPY, CONTINGENCY_FILTERS, CONTINGENCY_FOLLOWUPS,
  CONTINGENCY_KINDS, CONTINGENCY_QUESTIONS, CONTINGENCY_SIGNALS, CONTINGENCY_SORTS,
  auditContingencyCopy, contingencyFilterText, contingencyFollowupText,
  contingencyKindText, contingencySignalText, contingencySortText,
} from "./contingencyCopy";

describe("contingency bilingual copy", () => {
  it("keeps all user-visible field keys in both languages", () => {
    expect(Object.keys(CONTINGENCY_COPY.en).sort()).toEqual(Object.keys(CONTINGENCY_COPY.fr).sort());
  });
  it("contains only nonempty strings", () => {
    expect(Object.values(CONTINGENCY_COPY.en).every((value) => value.trim().length > 0)).toBe(true);
    expect(Object.values(CONTINGENCY_COPY.fr).every((value) => value.trim().length > 0)).toBe(true);
  });
  it("preserves the literal UNKNOWN value", () => {
    expect(CONTINGENCY_COPY.en.unknown).toBe("UNKNOWN");
    expect(CONTINGENCY_COPY.fr.unknown).toBe("UNKNOWN");
  });
  it("does not convert the unknown status into another language", () => {
    expect(JSON.stringify(CONTINGENCY_COPY.fr)).not.toContain("INCONNU");
  });
  it("keeps French apostrophes typographic", () => {
    expect(Object.values(CONTINGENCY_COPY.fr).some((value) => value.includes("’"))).toBe(true);
    expect(Object.values(CONTINGENCY_COPY.fr).some((value) => value.includes("'"))).toBe(false);
  });
  it("has a complete punctuation audit", () => {
    expect(auditContingencyCopy()).toEqual([]);
  });
  it("does not promise physical accessibility", () => {
    expect(CONTINGENCY_COPY.en.caution).toContain("not a statement");
  });
  it("says that exported notes can be personal", () => {
    expect(CONTINGENCY_COPY.en.privacy).toContain("personal");
  });
  it("requires explicit import actions", () => {
    expect(CONTINGENCY_COPY.en.importNotice).toContain("replaces");
  });
  it("warns users about losing notes", () => {
    expect(CONTINGENCY_COPY.en.resetNotice).toContain("lost");
  });
  it("translates every checkpoint kind", () => {
    for (const kind of CONTINGENCY_KINDS) {
      expect(contingencyKindText(kind, "en").length).toBeGreaterThan(2);
      expect(contingencyKindText(kind, "fr").length).toBeGreaterThan(2);
    }
  });
  it("translates every observation", () => {
    for (const signal of CONTINGENCY_SIGNALS) {
      expect(contingencySignalText(signal, "en")).toBeTruthy();
      expect(contingencySignalText(signal, "fr")).toBeTruthy();
    }
  });
  it("translates each follow-up note", () => {
    for (const value of CONTINGENCY_FOLLOWUPS) {
      expect(contingencyFollowupText(value, "en")).toBeTruthy();
      expect(contingencyFollowupText(value, "fr")).toBeTruthy();
    }
  });
  it("translates each filter", () => {
    for (const value of CONTINGENCY_FILTERS) {
      expect(contingencyFilterText(value, "en")).toBeTruthy();
      expect(contingencyFilterText(value, "fr")).toBeTruthy();
    }
  });
  it("translates all sort options", () => {
    for (const value of CONTINGENCY_SORTS) {
      expect(contingencySortText(value, "en")).toBeTruthy();
      expect(contingencySortText(value, "fr")).toBeTruthy();
    }
  });
  it("keeps unknown observation identical in both languages", () => {
    expect(contingencySignalText("UNKNOWN", "en")).toBe("UNKNOWN");
    expect(contingencySignalText("UNKNOWN", "fr")).toBe("UNKNOWN");
  });
  it("keeps unknown filtering identical in both languages", () => {
    expect(contingencyFilterText("UNKNOWN", "en")).toBe("UNKNOWN");
    expect(contingencyFilterText("UNKNOWN", "fr")).toBe("UNKNOWN");
  });
  it("does not use English labels for French washrooms", () => {
    expect(contingencyKindText("washroom", "fr")).toBe("Toilettes");
  });
  it("does not equate closing a note with available physical access", () => {
    expect(contingencyFollowupText("closed-note", "en")).toContain("Note");
  });
  it("includes a question for every checkpoint category", () => {
    for (const kind of CONTINGENCY_KINDS) {
      expect(CONTINGENCY_QUESTIONS.en[kind].length).toBeGreaterThanOrEqual(3);
      expect(CONTINGENCY_QUESTIONS.fr[kind].length).toBeGreaterThanOrEqual(3);
    }
  });
  it("avoids empty suggested questions", () => {
    for (const kind of CONTINGENCY_KINDS) {
      expect(CONTINGENCY_QUESTIONS.en[kind].every((question) => question.length > 15)).toBe(true);
      expect(CONTINGENCY_QUESTIONS.fr[kind].every((question) => question.length > 15)).toBe(true);
    }
  });
  it("keeps all French question marks narrow-spaced", () => {
    for (const kind of CONTINGENCY_KINDS) {
      for (const question of CONTINGENCY_QUESTIONS.fr[kind]) {
        expect(question).not.toMatch(/(?<!\u202f)[?!;]/u);
      }
    }
  });
  it("does not use straight apostrophes in suggested questions", () => {
    for (const kind of CONTINGENCY_KINDS) {
      expect(CONTINGENCY_QUESTIONS.fr[kind].some((question) => question.includes("'"))).toBe(false);
    }
  });
  it("has predictable English/French question counts", () => {
    for (const kind of CONTINGENCY_KINDS) {
      expect(CONTINGENCY_QUESTIONS.en[kind]).toHaveLength(CONTINGENCY_QUESTIONS.fr[kind].length);
    }
  });
});
