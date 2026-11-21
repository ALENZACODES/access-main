import { describe, expect, it } from "vitest";
import { DEPENDENCY_COPY, DEPENDENCY_AVAILABILITY, DEPENDENCY_CATEGORIES, DEPENDENCY_FILTERS,
  DEPENDENCY_PRIORITIES, DEPENDENCY_PROGRESS, DEPENDENCY_PROMPTS, DEPENDENCY_REASONS, DEPENDENCY_SORTS,
  auditDependencyCopy, dependencyCopy, dependencyReason } from "./dependencyPlannerCopy";

describe("offline dependency copy in English and French", () => {
  it("has no reported copy errors", () => expect(auditDependencyCopy()).toEqual([]));
  it("has matching copy keys", () => expect(Object.keys(DEPENDENCY_COPY.en)).toEqual(Object.keys(DEPENDENCY_COPY.fr)));
  it("offers at least 20 actual question topics", () => expect(DEPENDENCY_PROMPTS.length >= 20).toBe(true));
  it("gives every suggested topic a unique stable key", () => {
    expect(new Set(DEPENDENCY_PROMPTS.map((prompt) => prompt.key)).size).toBe(DEPENDENCY_PROMPTS.length);
  });
  it("contains exactly UNKNOWN when availability is unknown", () => {
    expect(DEPENDENCY_AVAILABILITY.fr.UNKNOWN).toBe("UNKNOWN");
    expect(DEPENDENCY_AVAILABILITY.en.UNKNOWN).toBe("UNKNOWN");
  });
  it("states the physical uncertainty in both languages", () => {
    expect(DEPENDENCY_COPY.fr.unknownPhysical).toContain("UNKNOWN");
    expect(DEPENDENCY_COPY.en.unknownPhysical).toContain("UNKNOWN");
  });
  it("uses the language chosen by the caller", () => {
    expect(dependencyCopy("en").title).toBe(DEPENDENCY_COPY.en.title);
    expect(dependencyCopy("fr").title).toBe(DEPENDENCY_COPY.fr.title);
  });
  it("translates all listed cell reasons", () => {
    for (const reason of ["present", "missing", "stale", "unreadable", "not-listed", "source-conflict", "inventory-unavailable"])
      expect(dependencyReason(reason, "fr")).not.toBe("UNKNOWN");
  });
  it("keeps unrecognized reason UNKNOWN", () => {
    expect(dependencyReason("fabricated", "fr")).toBe("UNKNOWN");
  });
  it("matches category keys", () => expect(Object.keys(DEPENDENCY_CATEGORIES.en)).toEqual(Object.keys(DEPENDENCY_CATEGORIES.fr)));
  it("matches importance keys", () => expect(Object.keys(DEPENDENCY_PRIORITIES.en)).toEqual(Object.keys(DEPENDENCY_PRIORITIES.fr)));
  it("matches progress keys", () => expect(Object.keys(DEPENDENCY_PROGRESS.en)).toEqual(Object.keys(DEPENDENCY_PROGRESS.fr)));
  it("matches filter keys", () => expect(Object.keys(DEPENDENCY_FILTERS.en)).toEqual(Object.keys(DEPENDENCY_FILTERS.fr)));
  it("matches sorting keys", () => expect(Object.keys(DEPENDENCY_SORTS.en)).toEqual(Object.keys(DEPENDENCY_SORTS.fr)));
  it("matches reason keys", () => expect(Object.keys(DEPENDENCY_REASONS.en)).toEqual(Object.keys(DEPENDENCY_REASONS.fr)));
  it("contains no unauthorized agency endorsement statement", () => {
    const combined = JSON.stringify(DEPENDENCY_COPY).toLowerCase();
    expect(combined.includes("endorses")).toBe(false);
    expect(combined.includes("partnership")).toBe(false);
    expect(combined.includes("guaranteed")).toBe(false);
  });
  it("does not change the physical access field from UNKNOWN", () => {
    expect(DEPENDENCY_COPY.en.caution).toContain("UNKNOWN");
    expect(DEPENDENCY_COPY.fr.caution).toContain("UNKNOWN");
  });
  it("provides a privacy reminder for exported notes", () => {
    expect(DEPENDENCY_COPY.en.privacy).toContain("personal notes");
    expect(DEPENDENCY_COPY.fr.privacy).toContain("notes personnelles");
  });
  it("uses French curly apostrophes", () => {
    expect(Object.values(DEPENDENCY_COPY.fr).every((entry) => !entry.includes("'"))).toBe(true);
  });
  it("provides labels for all prompts", () => {
    expect(DEPENDENCY_PROMPTS.every((prompt) => prompt.en.trim() && prompt.fr.trim())).toBe(true);
  });
  for (const category of ["arrival", "entrance", "indoor", "washroom", "transit", "communication"] as const) it(`provides a ${category} topic`, () => {
    expect(DEPENDENCY_PROMPTS.some((prompt) => prompt.category === category)).toBe(true);
  });
});
