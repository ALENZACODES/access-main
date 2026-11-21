import { describe, expect, it } from "vitest";
import {
  CHECKLIST_STEPS, FAILURE_CHECKLIST_COPY, MAX_CHECKLIST_BYTES,
  changeChecklistStep, checklistCounts, defaultChecklist,
  exportChecklist, importChecklist, previewChecklistReplacement,
  validChecklistProvenance, validateChecklist,
  type ChecklistProvenance, type FailureChecklist,
} from "./recoveryFailureChecklist";

const provenance: ChecklistProvenance = {
  source: "User supplied open record", licence: "CC0-1.0",
  date: "2026-11-19", tier: "UNKNOWN",
};
const sample = (): FailureChecklist => defaultChecklist("region-1", "download", "unknown", "2026-11-19", provenance);

const changed = (item: FailureChecklist, patch: Record<string, unknown>): unknown => ({ ...item, ...patch });

describe("manual recovery checklist", () => {
  it("starts every step UNKNOWN", () => {
    const value = sample();
    expect(value.steps).toHaveLength(CHECKLIST_STEPS.length);
    expect(value.steps.every((step) => step.state === "unknown")).toBe(true);
  });
  it("keeps the reported cause unknown", () => {
    expect(sample().cause).toBe("unknown");
  });
  it("never claims that a pack is ready", () => {
    const result = validateChecklist(sample());
    expect(result.ok).toBe(true);
    if (result.ok) expect(JSON.stringify(result.value)).not.toContain('"ready"');
  });
  it("accepts a complete open-licence provenance", () => {
    expect(validChecklistProvenance(provenance)).toBe(true);
  });
  it("rejects missing source information", () => {
    expect(validChecklistProvenance({ ...provenance, source: "" })).toBe(false);
  });
  it("rejects whitespace-only source", () => {
    expect(validChecklistProvenance({ ...provenance, source: "   " })).toBe(false);
  });
  it("rejects unsupported licence", () => {
    expect(validChecklistProvenance({ ...provenance, licence: "private" })).toBe(false);
  });
  it("rejects malformed provenance date", () => {
    expect(validChecklistProvenance({ ...provenance, date: "2026-02-31" })).toBe(false);
  });
  it("rejects absent evidence tier", () => {
    expect(validChecklistProvenance({ ...provenance, tier: "" })).toBe(false);
  });
  it("rejects inferred evidence tier", () => {
    expect(validChecklistProvenance({ ...provenance, tier: "approved" })).toBe(false);
  });
  it("rejects markup in source", () => {
    expect(validChecklistProvenance({ ...provenance, source: "<img>" })).toBe(false);
  });
  it("accepts the expected document", () => {
    expect(validateChecklist(sample()).ok).toBe(true);
  });
  it("rejects unsupported version", () => {
    expect(validateChecklist(changed(sample(), { version: 2 })).ok).toBe(false);
  });
  it("rejects unsupported format", () => {
    expect(validateChecklist(changed(sample(), { format: "other" })).ok).toBe(false);
  });
  it("rejects an unexpected document field", () => {
    expect(validateChecklist(changed(sample(), { deviceId: "secret" })).ok).toBe(false);
  });
  it("rejects an unsafe pack ID", () => {
    expect(validateChecklist(changed(sample(), { packId: "../unsafe" })).ok).toBe(false);
  });
  it("rejects a missing pack ID", () => {
    expect(validateChecklist(changed(sample(), { packId: "" })).ok).toBe(false);
  });
  it("rejects an invalid creation date", () => {
    expect(validateChecklist(changed(sample(), { createdOn: "yesterday" })).ok).toBe(false);
  });
  it("rejects an unknown operation type", () => {
    expect(validateChecklist(changed(sample(), { kind: "delete" })).ok).toBe(false);
  });
  it("rejects an unsupported failure cause", () => {
    expect(validateChecklist(changed(sample(), { cause: "all-clear" })).ok).toBe(false);
  });
  it("rejects missing steps", () => {
    expect(validateChecklist(changed(sample(), { steps: [] })).ok).toBe(false);
  });
  it("rejects duplicate steps", () => {
    const value = sample();
    expect(validateChecklist(changed(value, { steps: value.steps.map(() => value.steps[0]) })).ok).toBe(false);
  });
  it("rejects a foreign step", () => {
    const value = sample();
    expect(validateChecklist(changed(value, { steps: [{ step: "unknown-step", state: "unknown", note: "" }, ...value.steps.slice(1)] })).ok).toBe(false);
  });
  it("rejects an invalid step state", () => {
    const value = sample();
    expect(validateChecklist(changed(value, { steps: [{ ...value.steps[0], state: "ready" }, ...value.steps.slice(1)] })).ok).toBe(false);
  });
  it("rejects HTML in a step note", () => {
    const value = sample();
    expect(validateChecklist(changed(value, { steps: [{ ...value.steps[0], note: "<script>" }, ...value.steps.slice(1)] })).ok).toBe(false);
  });
  it("rejects newline in a step note", () => {
    const value = sample();
    expect(validateChecklist(changed(value, { steps: [{ ...value.steps[0], note: "a\nb" }, ...value.steps.slice(1)] })).ok).toBe(false);
  });
  it("rejects long step notes", () => {
    const value = sample();
    expect(validateChecklist(changed(value, { steps: [{ ...value.steps[0], note: "x".repeat(501) }, ...value.steps.slice(1)] })).ok).toBe(false);
  });
  it("accepts a manual step update", () => {
    const result = changeChecklistStep(sample(), "check-space", "noted", "Space observed locally");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.steps.find((step) => step.step === "check-space")?.state).toBe("noted");
      expect(result.value.steps[0]?.state).toBe("unknown");
    }
  });
  it("preserves the source metadata after a step update", () => {
    const result = changeChecklistStep(sample(), "check-space", "noted", "Examined");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.provenance).toEqual(provenance);
  });
  it("keeps unchanged steps UNKNOWN", () => {
    const result = changeChecklistStep(sample(), "check-input", "skipped", "Not applicable");
    expect(result.ok).toBe(true);
    if (result.ok) expect(checklistCounts(result.value).unknown).toBe(CHECKLIST_STEPS.length - 1);
  });
  it("does not mutate earlier documents", () => {
    const source = sample();
    const result = changeChecklistStep(source, "review-source", "noted", "Observed");
    expect(result.ok).toBe(true);
    expect(source.steps[0]?.state).toBe("unknown");
  });
  it("rejects unsafe manual notes", () => {
    expect(changeChecklistStep(sample(), "review-source", "noted", "<b>markup</b>").ok).toBe(false);
  });
  it("counts unknown, noted and skipped separately", () => {
    const first = changeChecklistStep(sample(), "review-source", "noted", "Looked at source");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = changeChecklistStep(first.value, "check-space", "skipped", "No local estimate");
    expect(second.ok).toBe(true);
    if (second.ok) expect(checklistCounts(second.value)).toEqual({ unknown: 3, noted: 1, skipped: 1 });
  });
  it("exports and re-imports without changing status", () => {
    const serialized = exportChecklist(sample());
    expect(serialized.ok).toBe(true);
    if (serialized.ok) expect(importChecklist(serialized.value)).toEqual({ ok: true, value: sample() });
  });
  it("rejects malformed JSON", () => {
    expect(importChecklist("{").ok).toBe(false);
  });
  it("rejects oversized input", () => {
    const text = "x".repeat(MAX_CHECKLIST_BYTES + 1);
    expect(importChecklist(text)).toEqual({ ok: false, reason: "too-large" });
  });
  it("preserves a valid same-pack import preview", () => {
    const result = previewChecklistReplacement(sample(), sample());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.unknownSteps).toBe(CHECKLIST_STEPS.length);
  });
  it("allows a first import without existing data", () => {
    expect(previewChecklistReplacement(null, sample()).ok).toBe(true);
  });
  it("refuses to silently switch pack IDs", () => {
    expect(previewChecklistReplacement(sample(), defaultChecklist("region-2", "download", "unknown", "2026-11-19", provenance))).toEqual({ ok: false, reason: "conflict" });
  });
  it("refuses to silently switch operation types", () => {
    expect(previewChecklistReplacement(sample(), defaultChecklist("region-1", "export", "unknown", "2026-11-19", provenance))).toEqual({ ok: false, reason: "conflict" });
  });
  it("keeps the UNKNOWN label in English and French", () => {
    expect(FAILURE_CHECKLIST_COPY.en.status.unknown).toBe("UNKNOWN");
    expect(FAILURE_CHECKLIST_COPY.fr.status.unknown).toBe("UNKNOWN");
  });
  it("provides bilingual labels for each operation and cause", () => {
    for (const kind of ["pack", "download", "export"] as const) {
      expect(FAILURE_CHECKLIST_COPY.en.kinds[kind].length).toBeGreaterThan(0);
      expect(FAILURE_CHECKLIST_COPY.fr.kinds[kind].length).toBeGreaterThan(0);
    }
    for (const cause of ["unknown", "offline", "storage", "permission", "damaged", "interrupted"] as const) {
      expect(FAILURE_CHECKLIST_COPY.en.causes[cause].length).toBeGreaterThan(0);
      expect(FAILURE_CHECKLIST_COPY.fr.causes[cause].length).toBeGreaterThan(0);
    }
  });
  it("has an English and French label for each step", () => {
    for (const step of CHECKLIST_STEPS) {
      expect(FAILURE_CHECKLIST_COPY.en.steps[step].length).toBeGreaterThan(0);
      expect(FAILURE_CHECKLIST_COPY.fr.steps[step].length).toBeGreaterThan(0);
    }
  });
  it("does not start recovery automatically", () => {
    const exported = exportChecklist(sample());
    expect(exported.ok).toBe(true);
    expect(checklistCounts(sample()).noted).toBe(0);
  });
});
