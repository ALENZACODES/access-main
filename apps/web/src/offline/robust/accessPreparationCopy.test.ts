import { describe, expect, it } from "vitest";
import {
  PREPARATION_COPY, TOPIC_LABELS, STATUS_LABELS, EVIDENCE_LABELS,
  FILTER_LABELS, SORT_LABELS, auditPreparationCopy, preparationCopy,
  evidenceLabel, filterLabel, sortLabel, statusLabel, topicLabel,
} from "./accessPreparationCopy";
import {
  PREPARATION_TOPICS, PREPARATION_FILTERS, PREPARATION_SORTS,
  PREPARATION_PROMPTS,
} from "./accessPreparation";

describe("personal preparation bilingual interface", () => {
  it("has the same copy keys in English and French", () => {
    expect(Object.keys(PREPARATION_COPY.en).sort()).toEqual(Object.keys(PREPARATION_COPY.fr).sort());
  });
  it("has no blank English fields", () => {
    expect(Object.values(PREPARATION_COPY.en).every((text) => text.trim().length > 0)).toBe(true);
  });
  it("has no blank French fields", () => {
    expect(Object.values(PREPARATION_COPY.fr).every((text) => text.trim().length > 0)).toBe(true);
  });
  it("uses curly apostrophes in all French copy", () => {
    for (const item of Object.values(PREPARATION_COPY.fr)) expect(item).not.toContain("'");
  });
  it("uses the French nonbreaking space before a colon", () => {
    for (const item of Object.values(PREPARATION_COPY.fr)) expect(item).not.toMatch(/(?<!\u00a0):/u);
  });
  it("uses a narrow nonbreaking space before French punctuation", () => {
    for (const item of Object.values(PREPARATION_COPY.fr)) expect(item).not.toMatch(/(?<!\u202f)[;!?]/u);
  });
  it("preserves UNKNOWN in the primary English text", () => {
    expect(PREPARATION_COPY.en.unknown).toBe("UNKNOWN");
  });
  it("preserves UNKNOWN in the primary French text", () => {
    expect(PREPARATION_COPY.fr.unknown).toBe("UNKNOWN");
  });
  it("does not translate unknown records to a presumed observation", () => {
    expect(PREPARATION_COPY.fr.reminder).toContain("UNKNOWN");
  });
  it("explains local information limitations", () => {
    expect(PREPARATION_COPY.en.intro).toContain("do not establish physical accessibility");
  });
  it("explains that exported notes can be private", () => {
    expect(PREPARATION_COPY.fr.privacy).toContain("privés");
  });
  it("gives the person explicit import and export controls", () => {
    expect(PREPARATION_COPY.en.import).toContain("Import");
    expect(PREPARATION_COPY.en.exportJson).toContain("JSON");
    expect(PREPARATION_COPY.fr.exportText).toContain("texte");
  });
  it("retains a manual local-copy review action", () => {
    expect(PREPARATION_COPY.en.refresh).toContain("Review");
  });
  it("does not call imported history current evidence", () => {
    expect(PREPARATION_COPY.en.imported).toContain("not inferred");
  });
  it("keeps labels available without a translation service", () => {
    expect(preparationCopy("en")).toBe(PREPARATION_COPY.en);
    expect(preparationCopy("fr")).toBe(PREPARATION_COPY.fr);
  });
  it("passes the deterministic localization audit", () => {
    expect(auditPreparationCopy()).toEqual([]);
  });
});

describe("topic and status label completeness", () => {
  for (const topic of PREPARATION_TOPICS) {
    it(`has meaningful English and French labels for ${topic}`, () => {
      expect(topicLabel(topic, "en").trim().length).toBeGreaterThan(2);
      expect(topicLabel(topic, "fr").trim().length).toBeGreaterThan(2);
    });
  }
  it("covers the entire topic enum in English", () => {
    expect(Object.keys(TOPIC_LABELS.en).sort()).toEqual([...PREPARATION_TOPICS].sort());
  });
  it("covers the entire topic enum in French", () => {
    expect(Object.keys(TOPIC_LABELS.fr).sort()).toEqual([...PREPARATION_TOPICS].sort());
  });
  it("preserves UNKNOWN for both status translations", () => {
    expect(statusLabel("UNKNOWN", "en")).toBe("UNKNOWN");
    expect(statusLabel("UNKNOWN", "fr")).toBe("UNKNOWN");
  });
  it("distinguishes unanswered questions from answered questions", () => {
    expect(statusLabel("answered", "en")).not.toBe(statusLabel("open", "en"));
  });
  it("distinguishes not-needed from answered", () => {
    expect(statusLabel("not-needed", "fr")).not.toBe(statusLabel("answered", "fr"));
  });
  it("keeps complete status sets in both languages", () => {
    expect(Object.keys(STATUS_LABELS.en).sort()).toEqual(Object.keys(STATUS_LABELS.fr).sort());
  });
  it("distinguishes a personal observation from a named source note", () => {
    expect(evidenceLabel("personal-note", "en")).not.toBe(evidenceLabel("source-note", "en"));
  });
  it("does not relabel unspecified evidence", () => {
    expect(evidenceLabel("UNKNOWN", "en")).toBe("UNKNOWN");
    expect(evidenceLabel("UNKNOWN", "fr")).toBe("UNKNOWN");
  });
  it("keeps the same evidence types in both languages", () => {
    expect(Object.keys(EVIDENCE_LABELS.en).sort()).toEqual(Object.keys(EVIDENCE_LABELS.fr).sort());
  });
  it("keeps all filter choices available", () => {
    expect(Object.keys(FILTER_LABELS.en).sort()).toEqual([...PREPARATION_FILTERS].sort());
  });
  it("keeps all sort choices available", () => {
    expect(Object.keys(SORT_LABELS.fr).sort()).toEqual([...PREPARATION_SORTS].sort());
  });
  it("labels UNKNOWN filtering literally", () => {
    expect(filterLabel("UNKNOWN", "fr")).toBe("UNKNOWN");
  });
  it("provides distinct sorting choices", () => {
    expect(sortLabel("created", "en")).not.toBe(sortLabel("updated", "en"));
  });
  it("uses French names for French sorting", () => {
    expect(sortLabel("topic", "fr")).toBe("Sujet");
  });
});

describe("question library scope", () => {
  it("includes entry questions", () => {
    expect(PREPARATION_PROMPTS.some((item) => item.topic === "entry")).toBe(true);
  });
  it("includes transport questions", () => {
    expect(PREPARATION_PROMPTS.some((item) => item.topic === "transport")).toBe(true);
  });
  it("includes washroom questions", () => {
    expect(PREPARATION_PROMPTS.some((item) => item.topic === "washroom")).toBe(true);
  });
  it("includes an offline information question", () => {
    expect(PREPARATION_PROMPTS.some((item) => item.topic === "storage")).toBe(true);
  });
  it("does not embed a user's own medical assumptions", () => {
    for (const prompt of PREPARATION_PROMPTS) {
      expect(prompt.question.toLowerCase()).not.toContain("diagnosis");
      expect(prompt.question.toLowerCase()).not.toContain("eligible");
    }
  });
  it("does not embed assertions of available facilities", () => {
    expect(PREPARATION_PROMPTS.every((item) => item.question.includes("?"))).toBe(true);
  });
  it("limits all prompt identifiers to readable machine keys", () => {
    expect(PREPARATION_PROMPTS.every((item) => /^[a-z][a-z-]+$/u.test(item.code))).toBe(true);
  });
});
