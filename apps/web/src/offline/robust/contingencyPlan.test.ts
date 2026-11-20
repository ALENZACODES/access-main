import { describe, expect, it } from "vitest";
import type { RegionManifest } from "./regionDownload";
import type { InventoryCause, InventoryCell, RegionInventory } from "./regionInventory";
import {
  addContingencyStep, attachContingencySource, captureSource, createContingencyPlan,
  emptySource, moveContingencyStep, pageContingency, parseContingencyPlan,
  serializeContingencyPlan, summaryContingency, updateContingencyStep,
  validateContingencyPlan, CONTINGENCY_MAX_EVENTS, CONTINGENCY_MAX_FILE_BYTES,
  CONTINGENCY_MAX_STEPS, type ContingencyPlan, type ContingencyStep,
  type CheckpointKind, type CheckpointSignal, type FollowUp, type PlanFilter,
} from "./contingencyPlan";

const at = "2026-11-20T12:00:00.000Z";
const next = "2026-11-20T13:00:00.000Z";
const after = "2026-11-20T14:00:00.000Z";
const provenance = { source: "Ontario open information", licence: "Open Government Licence", date: "2026-11-01" };
const manifest: RegionManifest = { regionId: "ontario", cells: [
  { id: "entrance-east", bytes: 1024, provenance },
  { id: "platform", bytes: 2048, provenance },
  { id: "lift", bytes: 4096, provenance: { ...provenance, date: "2026-10-30" } },
] };
function inventory(causes: readonly InventoryCause[]): RegionInventory {
  const cells: InventoryCell[] = manifest.cells.map((entry, index): InventoryCell => {
    const cause = causes[index] ?? "unreadable";
    return { id: entry.id, expectedBytes: entry.bytes, provenance: entry.provenance,
      state: cause === "present" ? "saved" : "unknown", cause };
  });
  const saved = cells.filter((entry) => entry.state === "saved");
  return { regionId: manifest.regionId, cells, savedCount: saved.length,
    unknownCount: cells.length - saved.length,
    savedBytes: saved.reduce((sum, entry) => sum + entry.expectedBytes, 0),
    expectedBytes: cells.reduce((sum, entry) => sum + entry.expectedBytes, 0),
    complete: saved.length === cells.length };
}
function start(): ContingencyPlan { return createContingencyPlan("ontario", at); }
function add(plan: ContingencyPlan, id: string, atValue = next,
  kind: CheckpointKind = "entrance"): ContingencyPlan {
  return addContingencyStep(plan, { id, kind, title: `Check ${id}`, question: `What about ${id}?`,
    at: atValue, eventId: `event-${id}` });
}
function fixture(): ContingencyPlan {
  return add(add(start(), "front"), "lift", next, "lift");
}
function patch(plan: ContingencyPlan, id: string, value: Parameters<typeof updateContingencyStep>[2],
  atValue = after, eventId = "patch-1"): ContingencyPlan {
  return updateContingencyStep(plan, id, value, atValue, eventId);
}

// These tests intentionally inspect the public domain API, not private helpers.
describe("new contingency plan", () => {
  it("starts with a versioned empty record", () => {
    expect(start()).toMatchObject({ schema: "offline-contingency-v1", regionId: "ontario", steps: [], events: [] });
  });
  it("does not infer any source from the region name", () => {
    expect(summaryContingency(start()).savedSources).toBe(0);
  });
  it("preserves the user-provided start timestamp", () => {
    expect(start().createdAt).toBe(at);
    expect(start().updatedAt).toBe(at);
  });
  it("rejects an empty region", () => {
    expect(() => createContingencyPlan("", at)).toThrow();
  });
  it("rejects whitespace-only region", () => {
    expect(() => createContingencyPlan("   ", at)).toThrow();
  });
  it("rejects an invalid start timestamp", () => {
    expect(() => createContingencyPlan("ontario", "tomorrow")).toThrow();
  });
  it("rejects non-UTC timestamps", () => {
    expect(() => createContingencyPlan("ontario", "2026-11-20T12:00:00-05:00")).toThrow();
  });
  it("requires millisecond timestamp precision", () => {
    expect(() => createContingencyPlan("ontario", "2026-11-20T12:00:00Z")).toThrow();
  });
  it("rejects embedded control characters in region IDs", () => {
    expect(() => createContingencyPlan("on\u0000tario", at)).toThrow();
  });
});

describe("manual checkpoint creation", () => {
  it("preserves ordering and metadata", () => {
    expect(fixture().steps.map((step) => step.id)).toEqual(["front", "lift"]);
  });
  it("starts every physical observation UNKNOWN", () => {
    expect(fixture().steps.every((step) => step.signal === "UNKNOWN")).toBe(true);
  });
  it("starts with UNKNOWN device evidence", () => {
    expect(fixture().steps.every((step) => step.source.state === "UNKNOWN")).toBe(true);
  });
  it("keeps follow-up notes open by default", () => {
    expect(fixture().steps.every((step) => step.followUp === "open")).toBe(true);
  });
  it("adds one manual history event per entry", () => {
    expect(fixture().events.map((entry) => entry.action)).toEqual(["created", "created"]);
  });
  it("does not alter previous plan objects", () => {
    const initial = start();
    add(initial, "front");
    expect(initial.steps).toEqual([]);
  });
  it("rejects duplicate step IDs", () => {
    expect(() => add(fixture(), "front", after)).toThrow();
  });
  it("rejects duplicate event identifiers", () => {
    expect(() => add(fixture(), "new", after, "path")).not.toThrow();
    expect(() => addContingencyStep(fixture(), { id: "new", title: "New", kind: "path", question: "Q", at: after, eventId: "event-front" })).toThrow();
  });
  it("rejects an empty question", () => {
    expect(() => addContingencyStep(start(), { id: "new", title: "Name", kind: "path", question: "", at: next, eventId: "e" })).toThrow();
  });
  it("rejects blank titles", () => {
    expect(() => addContingencyStep(start(), { id: "new", title: "  ", kind: "path", question: "Q", at: next, eventId: "e" })).toThrow();
  });
  it("rejects an unsupported checkpoint kind", () => {
    expect(() => addContingencyStep(start(), { id: "new", title: "Name", kind: "airport" as CheckpointKind, question: "Q", at: next, eventId: "e" })).toThrow();
  });
  it("rejects notes recorded before the plan began", () => {
    expect(() => add(start(), "bad", "2026-11-19T00:00:00.000Z")).toThrow();
  });
  it("enforces the maximum checkpoint count", () => {
    let plan = start();
    for (let i = 0; i < CONTINGENCY_MAX_STEPS; i++) plan = add(plan, `step-${i}`);
    expect(plan.steps).toHaveLength(CONTINGENCY_MAX_STEPS);
    expect(() => add(plan, "extra")).toThrow();
  });
  it("enforces the event budget independently", () => {
    let plan = add(start(), "front");
    for (let i = 0; i < CONTINGENCY_MAX_EVENTS - 1; i++) {
      plan = patch(plan, "front", { note: `Entry ${i}` }, next, `edit-${i}`);
    }
    expect(plan.events).toHaveLength(CONTINGENCY_MAX_EVENTS);
    expect(() => patch(plan, "front", { note: "Extra" }, next, "last")).toThrow();
  });
});

describe("manual updates", () => {
  it("records a note without altering the source", () => {
    const result = patch(fixture(), "front", { note: "Ask at entrance" });
    expect(result.steps[0]?.note).toBe("Ask at entrance");
    expect(result.steps[0]?.source.state).toBe("UNKNOWN");
  });
  it("records a possible alternative without claiming it exists", () => {
    const result = patch(fixture(), "front", { alternative: "Ask about south entrance" });
    expect(result.steps[0]?.alternative).toContain("south entrance");
    expect(result.steps[0]?.signal).toBe("UNKNOWN");
  });
  it("allows questions to be edited deliberately", () => {
    expect(patch(fixture(), "front", { question: "Is there another entrance?" }).steps[0]?.question).toContain("another");
  });
  it("allows title edits", () => {
    expect(patch(fixture(), "front", { title: "East entrance" }).steps[0]?.title).toBe("East entrance");
  });
  it("does not interpret a closed note as evidence", () => {
    const result = patch(fixture(), "front", { followUp: "closed-note" });
    expect(result.steps[0]?.signal).toBe("UNKNOWN");
    expect(result.steps[0]?.source.state).toBe("UNKNOWN");
  });
  it("records observations as manually-entered values", () => {
    const result = patch(fixture(), "front", { signal: "issue" });
    expect(result.steps[0]?.signal).toBe("issue");
    expect(result.events.at(-1)?.action).toBe("observed");
  });
  it("separates changed observations from known data", () => {
    const result = patch(fixture(), "front", { signal: "changed" });
    expect(result.steps[0]?.source.state).toBe("UNKNOWN");
  });
  it("does not remove other checkpoints when editing one", () => {
    const result = patch(fixture(), "front", { signal: "noted" });
    expect(result.steps[1]?.signal).toBe("UNKNOWN");
  });
  it("records edit timestamps without modifying previous records", () => {
    const original = fixture();
    const updated = patch(original, "front", { note: "Update" });
    expect(original.updatedAt).toBe(next);
    expect(updated.updatedAt).toBe(after);
    expect(updated.steps[0]?.editedAt).toBe(after);
  });
  it("rejects unsupported signals", () => {
    expect(() => patch(fixture(), "front", { signal: "certain" as CheckpointSignal })).toThrow();
  });
  it("rejects unsupported follow-up categories", () => {
    expect(() => patch(fixture(), "front", { followUp: "approved" as FollowUp })).toThrow();
  });
  it("rejects unknown step identifiers", () => {
    expect(() => patch(fixture(), "unlisted", { note: "Note" })).toThrow();
  });
  it("rejects empty patches", () => {
    expect(() => patch(fixture(), "front", {})).toThrow();
  });
  it("rejects blank edited titles", () => {
    expect(() => patch(fixture(), "front", { title: "  " })).toThrow();
  });
  it("rejects blank edited questions", () => {
    expect(() => patch(fixture(), "front", { question: " " })).toThrow();
  });
  it("enforces text limits", () => {
    expect(() => patch(fixture(), "front", { note: "x".repeat(1201) })).toThrow();
  });
  it("rejects an earlier event timestamp", () => {
    expect(() => patch(fixture(), "front", { note: "Wrong date" }, at)).toThrow();
  });
  it("rejects event IDs previously used", () => {
    expect(() => patch(fixture(), "front", { note: "Repeat" }, after, "event-front")).toThrow();
  });
  it("keeps a closed note from rewriting manual history", () => {
    const result = patch(fixture(), "front", { followUp: "closed-note" });
    expect(result.events.length).toBe(3);
  });
});

describe("source alignment", () => {
  it("makes an absent source explicitly UNKNOWN", () => {
    expect(emptySource()).toMatchObject({ cellId: null, state: "UNKNOWN", expectedBytes: null });
  });
  it("does not interpret manifest presence as saved status", () => {
    expect(captureSource(manifest, null, "entrance-east").state).toBe("UNKNOWN");
  });
  it("recognises a listed matching local copy", () => {
    expect(captureSource(manifest, inventory(["present", "missing", "stale"]), "entrance-east").state).toBe("saved");
  });
  it("does not promote missing bytes to saved", () => {
    expect(captureSource(manifest, inventory(["missing"]), "entrance-east").state).toBe("UNKNOWN");
  });
  it("does not promote unreadable copies", () => {
    expect(captureSource(manifest, inventory(["unreadable"]), "entrance-east").state).toBe("UNKNOWN");
  });
  it("does not promote stale copies", () => {
    expect(captureSource(manifest, inventory(["stale"]), "entrance-east").state).toBe("UNKNOWN");
  });
  it("does not infer status from an unlisted ID", () => {
    expect(captureSource(manifest, inventory(["present"]), "another").state).toBe("UNKNOWN");
  });
  it("does not infer status from another region", () => {
    const changed = { ...inventory(["present"]), regionId: "elsewhere" };
    expect(captureSource(manifest, changed, "entrance-east").state).toBe("UNKNOWN");
  });
  it("requires complete inventory coverage", () => {
    const incomplete = { ...inventory(["present"]), cells: inventory(["present"]).cells.slice(1) };
    expect(captureSource(manifest, incomplete, "entrance-east").state).toBe("UNKNOWN");
  });
  it("rejects changed expected bytes", () => {
    const value = inventory(["present"]);
    const changed = { ...value, cells: value.cells.map((item) => item.id === "entrance-east" ? { ...item, expectedBytes: 5 } : item) };
    expect(captureSource(manifest, changed, "entrance-east").state).toBe("UNKNOWN");
  });
  it("rejects changed source names", () => {
    const value = inventory(["present"]);
    const changed = { ...value, cells: value.cells.map((item) => item.id === "entrance-east" ?
      { ...item, provenance: { ...item.provenance, source: "Different provider" } } : item) };
    expect(captureSource(manifest, changed, "entrance-east").state).toBe("UNKNOWN");
  });
  it("rejects changed licence names", () => {
    const value = inventory(["present"]);
    const changed = { ...value, cells: value.cells.map((item) => item.id === "entrance-east" ?
      { ...item, provenance: { ...item.provenance, licence: "Different licence" } } : item) };
    expect(captureSource(manifest, changed, "entrance-east").state).toBe("UNKNOWN");
  });
  it("rejects changed provenance dates", () => {
    const value = inventory(["present"]);
    const changed = { ...value, cells: value.cells.map((item) => item.id === "entrance-east" ?
      { ...item, provenance: { ...item.provenance, date: "2026-09-01" } } : item) };
    expect(captureSource(manifest, changed, "entrance-east").state).toBe("UNKNOWN");
  });
  it("supports manually attaching a matching source reading", () => {
    const value = captureSource(manifest, inventory(["present"]), "entrance-east");
    const result = attachContingencySource(fixture(), "front", value, after, "attach-1");
    expect(result.steps[0]?.source.state).toBe("saved");
  });
  it("attaching saved bytes does not change physical signal", () => {
    const value = captureSource(manifest, inventory(["present"]), "entrance-east");
    const result = attachContingencySource(fixture(), "front", value, after, "attach-1");
    expect(result.steps[0]?.signal).toBe("UNKNOWN");
  });
  it("preserves exact source metadata", () => {
    const value = captureSource(manifest, inventory(["present"]), "entrance-east");
    expect(value.source).toBe(provenance.source);
    expect(value.date).toBe(provenance.date);
  });
  it("rejects a fabricated saved source without a cell ID", () => {
    expect(() => attachContingencySource(fixture(), "front", { ...emptySource(), state: "saved" }, after, "attach-1")).toThrow();
  });
  it("rejects a negative expected-byte count", () => {
    expect(() => attachContingencySource(fixture(), "front", { ...emptySource(), cellId: "a", expectedBytes: -1 }, after, "attach-1")).toThrow();
  });
  it("rejects unknown step references", () => {
    expect(() => attachContingencySource(fixture(), "outside", emptySource(), after, "attach-1")).toThrow();
  });
  it("rejects earlier manual-source attachment times", () => {
    expect(() => attachContingencySource(fixture(), "front", emptySource(), at, "attach-1")).toThrow();
  });
});

describe("ordering and pagination", () => {
  it("moves a checkpoint up", () => {
    expect(moveContingencyStep(fixture(), "lift", "up", after, "move-1").steps.map((step) => step.id)).toEqual(["lift", "front"]);
  });
  it("moves a checkpoint down", () => {
    expect(moveContingencyStep(fixture(), "front", "down", after, "move-1").steps.map((step) => step.id)).toEqual(["lift", "front"]);
  });
  it("does not change original ordering", () => {
    const original = fixture();
    moveContingencyStep(original, "front", "down", after, "move-1");
    expect(original.steps.map((step) => step.id)).toEqual(["front", "lift"]);
  });
  it("does not move the first checkpoint beyond start", () => {
    const original = fixture();
    expect(moveContingencyStep(original, "front", "up", after, "move-1")).toBe(original);
  });
  it("does not move the last checkpoint past end", () => {
    const original = fixture();
    expect(moveContingencyStep(original, "lift", "down", after, "move-1")).toBe(original);
  });
  it("raises for unknown checkpoint IDs", () => {
    expect(() => moveContingencyStep(fixture(), "missing", "up", after, "move-1")).toThrow();
  });
  const page = (plan: ContingencyPlan, overrides: Partial<Parameters<typeof pageContingency>[1]> = {}) =>
    pageContingency(plan, { filter: "all", sort: "listed", search: "", offset: 0, limit: 10, ...overrides });
  it("preserves listed order", () => {
    expect(page(fixture()).rows.map((step) => step.id)).toEqual(["front", "lift"]);
  });
  it("filters open notes", () => {
    const closed = patch(fixture(), "front", { followUp: "closed-note" });
    expect(page(closed, { filter: "open" }).rows.map((step) => step.id)).toEqual(["lift"]);
  });
  it("filters closed notes", () => {
    const closed = patch(fixture(), "front", { followUp: "closed-note" });
    expect(page(closed, { filter: "closed-note" }).rows.map((step) => step.id)).toEqual(["front"]);
  });
  it("filters manually entered issues", () => {
    const flagged = patch(fixture(), "front", { signal: "issue" });
    expect(page(flagged, { filter: "issue" }).rows.map((step) => step.id)).toEqual(["front"]);
  });
  it("filters unknown observations conservatively", () => {
    expect(page(fixture(), { filter: "UNKNOWN" }).total).toBe(2);
  });
  it("searches questions", () => {
    expect(page(fixture(), { search: "what about lift" }).total).toBe(1);
  });
  it("searches notes", () => {
    const edited = patch(fixture(), "front", { note: "Ask about manual door" });
    expect(page(edited, { search: "manual door" }).total).toBe(1);
  });
  it("searches alternatives", () => {
    const edited = patch(fixture(), "front", { alternative: "Use another entry" });
    expect(page(edited, { search: "another entry" }).total).toBe(1);
  });
  it("searches checkpoint types", () => {
    expect(page(fixture(), { search: "lift" }).total).toBe(1);
  });
  it("uses case-insensitive queries", () => {
    expect(page(fixture(), { search: "FRONT" }).total).toBe(1);
  });
  it("paginates without changing total", () => {
    expect(page(fixture(), { limit: 1 })).toMatchObject({ total: 2, next: true, previous: false });
  });
  it("ends on the second page", () => {
    expect(page(fixture(), { limit: 1, offset: 1 })).toMatchObject({ total: 2, next: false, previous: true });
  });
  it("gives empty result past the end", () => {
    expect(page(fixture(), { offset: 30 }).rows).toEqual([]);
  });
  it("sorts by latest edit", () => {
    const edited = patch(fixture(), "front", { note: "Recent" });
    expect(page(edited, { sort: "recent" }).rows[0]?.id).toBe("front");
  });
  it("rejects negative offsets", () => {
    expect(() => page(fixture(), { offset: -1 })).toThrow();
  });
  it("rejects oversized page limits", () => {
    expect(() => page(fixture(), { limit: 26 })).toThrow();
  });
  it("rejects unsupported filters", () => {
    expect(() => page(fixture(), { filter: "suitable" as PlanFilter })).toThrow();
  });
  it("does not change plan order during sorting", () => {
    const input = fixture();
    page(input, { sort: "kind" });
    expect(input.steps.map((step) => step.id)).toEqual(["front", "lift"]);
  });
});

describe("import validation", () => {
  const round = (): ContingencyPlan => patch(fixture(), "front", { signal: "issue", note: "Ask for details" });
  it("round-trips a complete plan", () => {
    expect(parseContingencyPlan(serializeContingencyPlan(round()), "ontario")).toEqual(round());
  });
  it("does not infer present conditions from imported notes", () => {
    expect(parseContingencyPlan(serializeContingencyPlan(round()), "ontario").steps[0]?.source.state).toBe("UNKNOWN");
  });
  it("preserves historical events", () => {
    expect(parseContingencyPlan(serializeContingencyPlan(round()), "ontario").events).toEqual(round().events);
  });
  it("rejects another region", () => {
    expect(() => parseContingencyPlan(serializeContingencyPlan(round()), "another-region")).toThrow();
  });
  it("rejects invalid JSON", () => {
    expect(() => parseContingencyPlan("{", "ontario")).toThrow();
  });
  it("rejects oversized imports", () => {
    expect(() => parseContingencyPlan("x".repeat(CONTINGENCY_MAX_FILE_BYTES + 1), "ontario")).toThrow();
  });
  it("rejects unknown schema revisions", () => {
    expect(() => validateContingencyPlan({ ...round(), schema: "legacy" })).toThrow();
  });
  it("rejects an invalid step signal", () => {
    const value = round();
    const altered = { ...value, steps: value.steps.map((step) => ({ ...step, signal: "confirmed" })) };
    expect(() => validateContingencyPlan(altered)).toThrow();
  });
  it("rejects duplicated step IDs", () => {
    const value = round();
    expect(() => validateContingencyPlan({ ...value, steps: [value.steps[0], value.steps[0]] })).toThrow();
  });
  it("rejects missing source data", () => {
    const value = round();
    const altered = { ...value, steps: value.steps.map((step) => ({ ...step, source: null })) };
    expect(() => validateContingencyPlan(altered)).toThrow();
  });
  it("rejects impossible event chronology", () => {
    const value = round();
    const altered = { ...value, events: value.events.map((event, index) => ({ ...event, at: index === 0 ? after : at })) };
    expect(() => validateContingencyPlan(altered)).toThrow();
  });
  it("rejects events pointing outside the plan", () => {
    const value = round();
    const altered = { ...value, events: value.events.map((event) => ({ ...event, stepId: "outside" })) };
    expect(() => validateContingencyPlan(altered)).toThrow();
  });
  it("rejects history with duplicate event IDs", () => {
    const value = round();
    const altered = { ...value, events: [...value.events, value.events[0]] };
    expect(() => validateContingencyPlan(altered)).toThrow();
  });
  it("rejects empty source names for saved records only when absent", () => {
    const value = round();
    const altered = { ...value, steps: value.steps.map((step) => ({ ...step, source: { ...step.source, state: "saved", cellId: null } })) };
    expect(() => validateContingencyPlan(altered)).toThrow();
  });
  it("rejects unsupported event actions", () => {
    const value = round();
    const altered = { ...value, events: value.events.map((event) => ({ ...event, action: "download" })) };
    expect(() => validateContingencyPlan(altered)).toThrow();
  });
  it("returns a typed, independent plan object", () => {
    const value = round();
    const parsed = validateContingencyPlan(value);
    expect(parsed).not.toBe(value);
    expect(parsed).toEqual(value);
  });
  it("does not allow events after plan update", () => {
    const value = round();
    const altered = { ...value, events: value.events.map((event) => ({ ...event, at: "2026-11-21T00:00:00.000Z" })) };
    expect(() => validateContingencyPlan(altered)).toThrow();
  });
});

describe("exhaustive manual state matrix", () => {
  // Every combination is a different user action, never a claim about venue conditions.
  const signals: readonly CheckpointSignal[] = ["UNKNOWN", "noted", "issue", "changed", "not-applicable"];
  const statuses: readonly FollowUp[] = ["open", "question-ready", "alternative-noted", "closed-note"];
  const kinds: readonly CheckpointKind[] = ["arrival", "entrance", "path", "lift", "transport", "washroom", "rest", "departure", "other"];
  for (const kind of kinds) {
    for (const signal of signals) {
      for (const followUp of statuses) {
        it(`keeps user-entered ${kind}/${signal}/${followUp} distinct from local evidence`, () => {
          const plan = add(start(), `step-${kind}`, next, kind);
          const changed = patch(plan, `step-${kind}`, { signal, followUp });
          const item: ContingencyStep | undefined = changed.steps[0];
          expect(item?.kind).toBe(kind);
          expect(item?.signal).toBe(signal);
          expect(item?.followUp).toBe(followUp);
          expect(item?.source.state).toBe("UNKNOWN");
          expect(changed.events).toHaveLength(2);
        });
      }
    }
  }
});
