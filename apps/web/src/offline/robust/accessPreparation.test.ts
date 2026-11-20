import { describe, expect, it } from "vitest";
import type { RegionManifest } from "./regionDownload";
import type { InventoryCell, RegionInventory } from "./regionInventory";
import {
  addPreparationEntry, assessPreparationCopies, newPreparationNotebook, pagePreparationEntries,
  parsePreparationNotebook, preparationTotals, removePreparationEntry, serializePreparationNotebook,
  updatePreparationEntry, validatePreparationNotebook, PREPARATION_MAX_ENTRIES,
  PREPARATION_MAX_EVENTS, PREPARATION_MAX_JSON_BYTES, PREPARATION_PROMPTS,
  PREPARATION_TOPICS, type PreparationNotebook,
} from "./accessPreparation";

const day = "2026-11-20T12:00:00.000Z";
const later = "2026-11-20T13:00:00.000Z";
const after = "2026-11-20T14:00:00.000Z";
const source = { source: "Ontario catalogue", licence: "Open Government Licence", date: "2026-11-01" };
const manifest: RegionManifest = { regionId: "ontario-demo", cells: [
  { id: "north", bytes: 120, provenance: source },
  { id: "south", bytes: 240, provenance: source },
  { id: "west", bytes: 360, provenance: source },
] };
const empty = (): PreparationNotebook => newPreparationNotebook("ontario-demo", day);
const one = (): PreparationNotebook => addPreparationEntry(empty(), {
  id: "question-1", topic: "entry", question: "What is known about the entrance?", cellId: "north",
}, later);
const answered = (): PreparationNotebook => updatePreparationEntry(one(), "question-1", {
  answer: "The source lists an entrance but no dimensions", status: "answered",
  evidence: "source-note", sourceName: "Ontario catalogue", sourceDate: "2026-11-01",
}, after);
function reading(causes: readonly ("present" | "missing" | "stale" | "unreadable")[]): RegionInventory {
  const cells: InventoryCell[] = manifest.cells.map((cell, i) => {
    const cause = causes[i] ?? "unreadable";
    return { id: cell.id, expectedBytes: cell.bytes, provenance: cell.provenance,
      state: cause === "present" ? "saved" : "unknown", cause };
  });
  const saved = cells.filter((cell) => cell.state === "saved");
  return { regionId: manifest.regionId, cells, savedCount: saved.length,
    unknownCount: cells.length - saved.length,
    savedBytes: saved.reduce((total, cell) => total + cell.expectedBytes, 0),
    expectedBytes: 720, complete: saved.length === cells.length };
}

const query = { search: "", filter: "all" as const, topic: "all" as const,
  sort: "created" as const, offset: 0, limit: 12 };

describe("new local preparation notebook", () => {
  it("starts with an explicit version and region", () => {
    expect(empty()).toMatchObject({ format: "offline-access-preparation-v1", regionId: "ontario-demo" });
  });
  it("begins with no evidence and no entries", () => {
    expect(empty()).toMatchObject({ entries: [], history: [] });
  });
  it("rejects an empty region", () => {
    expect(() => newPreparationNotebook("", day)).toThrow();
  });
  it("rejects invalid region characters", () => {
    expect(() => newPreparationNotebook("two words", day)).toThrow();
  });
  it("rejects a malformed timestamp", () => {
    expect(() => newPreparationNotebook("area", "today")).toThrow();
  });
  it("rejects a noncanonical UTC timestamp", () => {
    expect(() => newPreparationNotebook("area", "2026-11-20T12:00:00Z")).toThrow();
  });
  it("does not fabricate entries from prompts", () => {
    expect(empty().entries).toHaveLength(0);
    expect(PREPARATION_PROMPTS.length).toBeGreaterThan(12);
  });
  it("has unique suggested prompt codes", () => {
    expect(new Set(PREPARATION_PROMPTS.map((prompt) => prompt.code)).size).toBe(PREPARATION_PROMPTS.length);
  });
  it("covers each topic with a suggested question", () => {
    for (const topic of PREPARATION_TOPICS.filter((value) => value !== "other")) {
      expect(PREPARATION_PROMPTS.some((prompt) => prompt.topic === topic)).toBe(true);
    }
  });
  it("suggestions remain questions, not factual claims", () => {
    expect(PREPARATION_PROMPTS.every((prompt) => prompt.question.endsWith("?"))).toBe(true);
  });
});

describe("question authoring and revision history", () => {
  it("adds an unanswered question as UNKNOWN", () => {
    expect(one().entries[0]).toMatchObject({ status: "UNKNOWN", evidence: "UNKNOWN", answer: "" });
  });
  it("records first revision as a deliberate add", () => {
    expect(one().history).toEqual([{ entryId: "question-1", at: later, operation: "add", revision: 1 }]);
  });
  it("does not change the original empty notebook", () => {
    const before = empty();
    addPreparationEntry(before, { id: "a", topic: "route", question: "Which approach?" }, later);
    expect(before.entries).toEqual([]);
  });
  it("records a dated source note without turning it into physical evidence", () => {
    expect(answered().entries[0]).toMatchObject({ evidence: "source-note", sourceDate: "2026-11-01" });
  });
  it("keeps status as a user-authored label", () => {
    expect(answered().entries[0]?.status).toBe("answered");
  });
  it("preserves original creation timestamp after updates", () => {
    expect(answered().entries[0]?.createdAt).toBe(later);
  });
  it("advances revision and update time on every explicit change", () => {
    expect(answered().entries[0]).toMatchObject({ revision: 2, updatedAt: after });
  });
  it("supports a user marking a question as open", () => {
    const value = updatePreparationEntry(one(), "question-1", { status: "open" }, after);
    expect(value.entries[0]?.status).toBe("open");
    expect(value.history.at(-1)?.operation).toBe("reopen");
  });
  it("supports an explicit not-needed decision", () => {
    const value = updatePreparationEntry(one(), "question-1", { status: "not-needed" }, after);
    expect(value.entries[0]?.status).toBe("not-needed");
    expect(value.history.at(-1)?.operation).toBe("skip");
  });
  it("requires written text for answered status", () => {
    expect(() => updatePreparationEntry(one(), "question-1", { status: "answered" }, after)).toThrow();
  });
  it("rejects a source-note without a source date", () => {
    expect(() => updatePreparationEntry(one(), "question-1", {
      evidence: "source-note", sourceName: "Open records", sourceDate: "",
    }, after)).toThrow();
  });
  it("rejects a source-note without a source name", () => {
    expect(() => updatePreparationEntry(one(), "question-1", {
      evidence: "source-note", sourceName: "", sourceDate: "2026-11-01",
    }, after)).toThrow();
  });
  it("rejects inconsistent non-source attribution", () => {
    expect(() => updatePreparationEntry(one(), "question-1", {
      evidence: "personal-note", sourceName: "Other", sourceDate: "2026-11-01",
    }, after)).toThrow();
  });
  it("rejects a nonexistent question", () => {
    expect(() => updatePreparationEntry(empty(), "not-listed", { status: "open" }, later)).toThrow();
  });
  it("rejects changing history backwards", () => {
    expect(() => updatePreparationEntry(one(), "question-1", { status: "open" }, day)).toThrow();
  });
  it("rejects two entries with the same identifier", () => {
    expect(() => addPreparationEntry(one(), {
      id: "question-1", topic: "transport", question: "Boarding details?",
    }, after)).toThrow();
  });
  it("rejects an empty question", () => {
    expect(() => addPreparationEntry(empty(), { id: "x", topic: "route", question: " " }, later)).toThrow();
  });
  it("rejects unsafe identifier characters", () => {
    expect(() => addPreparationEntry(empty(), { id: "a/b", topic: "entry", question: "Door?" }, later)).toThrow();
  });
  it("rejects a control character in notes", () => {
    expect(() => updatePreparationEntry(one(), "question-1", { answer: "first\u0000second" }, after)).toThrow();
  });
  it("rejects excessive answer length", () => {
    expect(() => updatePreparationEntry(one(), "question-1", { answer: "x".repeat(1601) }, after)).toThrow();
  });
  it("accepts multiline personal notes without losing line breaks", () => {
    const value = updatePreparationEntry(one(), "question-1", { answer: "First line\nSecond line" }, after);
    expect(value.entries[0]?.answer).toBe("First line\nSecond line");
  });
  it("does not accept embedded control bytes in multiline notes", () => {
    expect(() => updatePreparationEntry(one(), "question-1", { answer: "Line\n\u0001" }, after)).toThrow();
  });
  it("rejects a nonexistent topic", () => {
    expect(() => addPreparationEntry(empty(), { id: "a", topic: "unlisted" as "entry", question: "Door?" }, later)).toThrow();
  });
  it("supports question deletion without retaining entry content", () => {
    const value = removePreparationEntry(one(), "question-1", after);
    expect(value.entries).toEqual([]);
    expect(value.history.at(-1)).toMatchObject({ operation: "delete", revision: 2 });
  });
  it("does not recycle deleted identifiers", () => {
    const value = removePreparationEntry(one(), "question-1", after);
    expect(() => addPreparationEntry(value, { id: "question-1", topic: "entry", question: "Other?" }, after)).toThrow();
  });
  it("rejects deleting unknown entries", () => {
    expect(() => removePreparationEntry(one(), "other", after)).toThrow();
  });
  it("does not mutate the original on deletion", () => {
    const initial = one();
    removePreparationEntry(initial, "question-1", after);
    expect(initial.entries).toHaveLength(1);
  });
});

describe("counts, filtering and deterministic ordering", () => {
  const notebook = (() => {
    let value = empty();
    for (const [i, topic] of PREPARATION_TOPICS.entries()) {
      value = addPreparationEntry(value, {
        id: `topic-${i}`, topic, question: `Question about ${topic}?`,
      }, later);
    }
    value = updatePreparationEntry(value, "topic-0", { status: "open" }, after);
    value = updatePreparationEntry(value, "topic-1", { status: "not-needed" }, after);
    value = updatePreparationEntry(value, "topic-2", { status: "answered", answer: "My own note" }, after);
    return value;
  })();
  it("counts every question", () => {
    expect(preparationTotals(notebook).total).toBe(PREPARATION_TOPICS.length);
  });
  it("counts UNKNOWN separately", () => {
    expect(preparationTotals(notebook).UNKNOWN).toBe(PREPARATION_TOPICS.length - 3);
  });
  it("counts answered, open and skipped separately", () => {
    expect(preparationTotals(notebook)).toMatchObject({ answered: 1, open: 1, notNeeded: 1 });
  });
  it("filters only currently open questions", () => {
    expect(pagePreparationEntries(notebook, { ...query, filter: "open" }).total).toBe(1);
  });
  it("filters answered without treating UNKNOWN as answered", () => {
    expect(pagePreparationEntries(notebook, { ...query, filter: "answered" }).total).toBe(1);
  });
  it("filters not-needed without treating it as a successful answer", () => {
    expect(pagePreparationEntries(notebook, { ...query, filter: "not-needed" }).total).toBe(1);
  });
  it("filters a single topic", () => {
    expect(pagePreparationEntries(notebook, { ...query, topic: "transport" }).total).toBe(1);
  });
  it("supports case-insensitive question search", () => {
    expect(pagePreparationEntries(notebook, { ...query, search: "WASHROOM" }).total).toBe(1);
  });
  it("supports searching answer text", () => {
    expect(pagePreparationEntries(notebook, { ...query, search: "own note" }).total).toBe(1);
  });
  it("keeps insertion order in default view", () => {
    expect(pagePreparationEntries(notebook, query).rows[0]?.id).toBe("topic-0");
  });
  it("shows recent changes before older questions", () => {
    expect(pagePreparationEntries(notebook, { ...query, sort: "updated" }).rows[0]?.updatedAt).toBe(after);
  });
  it("sorts topic names deterministically", () => {
    const result = pagePreparationEntries(notebook, { ...query, sort: "topic" });
    expect(result.rows[0]?.topic).toBe("communication");
  });
  it("paginates without losing total", () => {
    const result = pagePreparationEntries(notebook, { ...query, limit: 3 });
    expect(result.rows).toHaveLength(3);
    expect(result.total).toBe(PREPARATION_TOPICS.length);
    expect(result.next).toBe(true);
  });
  it("shows previous flag on later pages", () => {
    expect(pagePreparationEntries(notebook, { ...query, offset: 3, limit: 3 }).previous).toBe(true);
  });
  it("returns an empty page after the end", () => {
    expect(pagePreparationEntries(notebook, { ...query, offset: 100 }).rows).toEqual([]);
  });
  it("does not mutate the underlying entries while sorting", () => {
    pagePreparationEntries(notebook, { ...query, sort: "status" });
    expect(notebook.entries[0]?.id).toBe("topic-0");
  });
  it("rejects fractional pagination", () => {
    expect(() => pagePreparationEntries(notebook, { ...query, offset: 0.5 })).toThrow();
  });
  it("rejects negative pagination", () => {
    expect(() => pagePreparationEntries(notebook, { ...query, offset: -1 })).toThrow();
  });
  it("rejects an unbounded page", () => {
    expect(() => pagePreparationEntries(notebook, { ...query, limit: 26 })).toThrow();
  });
  it("rejects unknown filters", () => {
    expect(() => pagePreparationEntries(notebook, { ...query, filter: "other" as "all" })).toThrow();
  });
  it("rejects unknown sorts", () => {
    expect(() => pagePreparationEntries(notebook, { ...query, sort: "random" as "created" })).toThrow();
  });
});

describe("local copy evidence remains conservative", () => {
  const statuses = ["present", "missing", "stale", "unreadable"] as const;
  for (const cause of statuses) {
    it(`shows a ${cause} copy as ${cause === "present" ? "saved" : "UNKNOWN"}`, () => {
      const assessment = assessPreparationCopies(manifest, reading([cause, "missing", "missing"]), one());
      expect(assessment.linked[0]?.status).toBe(cause === "present" ? "saved" : "UNKNOWN");
    });
  }
  it("returns UNKNOWN without an inventory", () => {
    expect(assessPreparationCopies(manifest, null, one()).status).toBe("UNKNOWN");
  });
  it("does not call an empty inventory saved", () => {
    const value: RegionManifest = { regionId: "ontario-demo", cells: [] };
    const emptyReading: RegionInventory = { regionId: value.regionId, cells: [], savedCount: 0,
      unknownCount: 0, savedBytes: 0, expectedBytes: 0, complete: true };
    expect(assessPreparationCopies(value, emptyReading, empty()).status).toBe("UNKNOWN");
  });
  it("does not call duplicated manifest cells saved", () => {
    const first = manifest.cells[0];
    if (!first) throw new Error("Missing fixture cell");
    const repeated: RegionManifest = { ...manifest, cells: [first, first, first] };
    expect(assessPreparationCopies(repeated, reading(["present", "present", "present"]), one()).status).toBe("UNKNOWN");
  });
  it("does not borrow status from a different region", () => {
    const wrong = { ...reading(["present", "present", "present"]), regionId: "different" };
    expect(assessPreparationCopies(manifest, wrong, one()).savedCells).toBe(0);
  });
  it("does not treat unlisted cell links as saved", () => {
    const value = addPreparationEntry(empty(), {
      id: "link", topic: "storage", question: "What is saved?", cellId: "unlisted",
    }, later);
    expect(assessPreparationCopies(manifest, reading(["present", "present", "present"]), value).linked[0]?.status).toBe("UNKNOWN");
  });
  it("rejects a mismatched source date", () => {
    const value = reading(["present", "present", "present"]);
    const cells = value.cells.map((item) => item.id === "north" ?
      { ...item, provenance: { ...item.provenance, date: "2025-01-01" } } : item);
    expect(assessPreparationCopies(manifest, { ...value, cells }, one()).linked[0]?.status).toBe("UNKNOWN");
  });
  it("rejects a mismatched source licence", () => {
    const value = reading(["present", "present", "present"]);
    const cells = value.cells.map((item) => item.id === "north" ?
      { ...item, provenance: { ...item.provenance, licence: "Other" } } : item);
    expect(assessPreparationCopies(manifest, { ...value, cells }, one()).linked[0]?.status).toBe("UNKNOWN");
  });
  it("rejects mismatched listed byte sizes", () => {
    const value = reading(["present", "present", "present"]);
    const cells = value.cells.map((item) => item.id === "north" ?
      { ...item, expectedBytes: 1 } : item);
    expect(assessPreparationCopies(manifest, { ...value, cells }, one()).linked[0]?.status).toBe("UNKNOWN");
  });
  it("rejects a partial inventory as complete", () => {
    const value = reading(["present", "present", "present"]);
    const assessment = assessPreparationCopies(manifest, { ...value, cells: value.cells.slice(1) }, one());
    expect(assessment.savedCells).toBe(0);
    expect(assessment.status).toBe("UNKNOWN");
  });
  it("rejects duplicated inventory cell IDs", () => {
    const value = reading(["present", "present", "present"]);
    const first = value.cells[0];
    if (!first) throw new Error("Missing fixture cell");
    const assessment = assessPreparationCopies(manifest, { ...value, cells: [first, first, first] }, one());
    expect(assessment.savedCells).toBe(0);
  });
  it("does not assert saved status from an inconsistent local state", () => {
    const value = reading(["present", "present", "present"]);
    const cells = value.cells.map((item) => item.id === "north" ?
      { ...item, state: "unknown" as const } : item);
    expect(assessPreparationCopies(manifest, { ...value, cells }, one()).linked[0]?.status).toBe("UNKNOWN");
  });
  it("keeps physical-place claims separate from saved local bytes", () => {
    const assessment = assessPreparationCopies(manifest, reading(["present", "present", "present"]), one());
    expect(assessment.status).toBe("saved");
    expect(Object.keys(assessment).includes("accessibility")).toBe(false);
  });
});

describe("import/export bounds and tampering", () => {
  it("round trips a new notebook", () => {
    expect(parsePreparationNotebook(serializePreparationNotebook(empty()), "ontario-demo")).toEqual(empty());
  });
  it("round trips answers and source notes", () => {
    const book = answered();
    expect(parsePreparationNotebook(serializePreparationNotebook(book), "ontario-demo")).toEqual(book);
  });
  it("round trips deleted entries as history only", () => {
    const book = removePreparationEntry(one(), "question-1", after);
    expect(parsePreparationNotebook(serializePreparationNotebook(book), "ontario-demo")).toEqual(book);
  });
  it("rejects another region on import", () => {
    expect(() => parsePreparationNotebook(serializePreparationNotebook(one()), "another-region")).toThrow();
  });
  it("rejects malformed JSON", () => {
    expect(() => parsePreparationNotebook("{", "ontario-demo")).toThrow();
  });
  it("rejects imports above the size limit", () => {
    expect(() => parsePreparationNotebook("x".repeat(PREPARATION_MAX_JSON_BYTES + 1), "ontario-demo")).toThrow();
  });
  it("rejects a future format", () => {
    expect(() => validatePreparationNotebook({ ...empty(), format: "future" })).toThrow();
  });
  it("rejects duplicated entry IDs", () => {
    const book = one();
    expect(() => validatePreparationNotebook({ ...book, entries: [book.entries[0], book.entries[0]] })).toThrow();
  });
  it("rejects a missing original history event", () => {
    expect(() => validatePreparationNotebook({ ...one(), history: [] })).toThrow();
  });
  it("rejects reversed history dates", () => {
    const book = answered();
    expect(() => validatePreparationNotebook({ ...book, history: [
      book.history[1], book.history[0],
    ] })).toThrow();
  });
  it("rejects orphaned entry content", () => {
    const book = one();
    expect(() => validatePreparationNotebook({ ...book, history: [
      { entryId: "elsewhere", at: later, operation: "add", revision: 1 },
    ] })).toThrow();
  });
  it("rejects a fabricated revision", () => {
    const book = one();
    expect(() => validatePreparationNotebook({ ...book, entries: book.entries.map((entry) =>
      ({ ...entry, revision: 42 })) })).toThrow();
  });
  it("rejects inconsistent note attribution", () => {
    const book = one();
    expect(() => validatePreparationNotebook({ ...book, entries: book.entries.map((entry) =>
      ({ ...entry, evidence: "source-note", sourceName: "", sourceDate: "" })) })).toThrow();
  });
  it("rejects a malformed source date", () => {
    const book = answered();
    expect(() => validatePreparationNotebook({ ...book, entries: book.entries.map((entry) =>
      ({ ...entry, sourceDate: "2026-02-31" })) })).toThrow();
  });
  it("rejects fabricated answered status without an answer", () => {
    const book = one();
    expect(() => validatePreparationNotebook({ ...book, entries: book.entries.map((entry) =>
      ({ ...entry, status: "answered" })) })).toThrow();
  });
  it("rejects too many entries", () => {
    const book = one();
    expect(() => validatePreparationNotebook({ ...book, entries: Array.from({ length: PREPARATION_MAX_ENTRIES + 1 }, () => book.entries[0]) })).toThrow();
  });
  it("rejects too many events", () => {
    const book = one();
    expect(() => validatePreparationNotebook({ ...book, history: Array.from({ length: PREPARATION_MAX_EVENTS + 1 }, () => book.history[0]) })).toThrow();
  });
  it("preserves HTML-like notes as inert text", () => {
    const book = updatePreparationEntry(one(), "question-1", { answer: "<script>not code</script>" }, after);
    expect(parsePreparationNotebook(serializePreparationNotebook(book), book.regionId).entries[0]?.answer).toBe("<script>not code</script>");
  });
  it("never rewrites the UNKNOWN token", () => {
    const book = parsePreparationNotebook(serializePreparationNotebook(one()), "ontario-demo");
    expect(book.entries[0]?.status).toBe("UNKNOWN");
  });
});

// Meaningful exhaustive transitions: each local condition is evaluated independently
// for each of the three manifest positions, with unchanged sources and drift.
describe("offline inventory transition matrix", () => {
  const variants = ["present", "missing", "stale", "unreadable"] as const;
  for (const position of [0, 1, 2]) {
    for (const cause of variants) {
      for (const drift of [false, true]) {
        it(`position ${position}, ${cause}, source drift ${String(drift)}`, () => {
          const cell = manifest.cells[position];
          if (!cell) throw new Error("Missing fixture cell");
          const book = addPreparationEntry(empty(), {
            id: `linked-${position}`, topic: "storage", question: "Is a local copy saved?", cellId: cell.id,
          }, later);
          const causes: (typeof variants)[number][] = ["missing", "missing", "missing"];
          causes[position] = cause;
          const value = reading(causes);
          const cells = drift ? value.cells.map((item) => item.id === cell.id ?
            { ...item, provenance: { ...item.provenance, source: "Different source" } } : item) : value.cells;
          const assessment = assessPreparationCopies(manifest, { ...value, cells }, book);
          const expected = cause === "present" && !drift ? "saved" : "UNKNOWN";
          expect(assessment.linked[0]?.status).toBe(expected);
          expect(assessment.savedCells).toBe(expected === "saved" ? 1 : 0);
          expect(assessment.totalCells).toBe(3);
        });
      }
    }
  }
});
