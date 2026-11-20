import { describe, expect, it } from "vitest";
import type { RegionManifest, Provenance } from "./regionDownload";
import type { RegionInventory, InventoryCell } from "./regionInventory";
import {
  addCaseNote, casebookId, casebookRows, casebookSummary, caseNextStep,
  changeCaseStatus, emptyCasebook, encodeCasebook, importCasebook, inspectCaseEvidence,
  openCase, pageCasebook, reconcileCasebook, validCaseProvenance, validateCasebook,
  CASEBOOK_MAX_CASES, CASEBOOK_MAX_EVENTS, CASEBOOK_MAX_NOTE_LENGTH,
  type OfflineCase, type Casebook, type CasebookQuery,
} from "./offlineCasebook";

const source: Provenance = { source: "Ontario public information", licence: "CC BY 4.0", date: "2026-03-01" };
const second: Provenance = { source: "City public information", licence: "CC0 1.0", date: "2026-04-02" };
const manifest: RegionManifest = {
  regionId: "eastern",
  cells: [
    { id: "alpha", bytes: 10, provenance: source },
    { id: "beta", bytes: 25, provenance: source },
    { id: "gamma", bytes: 50, provenance: second },
    { id: "delta", bytes: 0, provenance: second },
  ],
};
const timestamp = "2026-11-19T20:00:00.000Z";
const later = "2026-11-19T20:01:00.000Z";
const latest = "2026-11-19T20:02:00.000Z";

function cell(id: string, cause: InventoryCell["cause"] = "present"): InventoryCell {
  const listed = manifest.cells.find((row) => row.id === id);
  if (!listed) throw new Error("Invalid test fixture");
  return {
    id, expectedBytes: listed.bytes, provenance: listed.provenance,
    cause, state: cause === "present" ? "saved" : "unknown",
  };
}

function inventory(rows: readonly InventoryCell[] = [
  cell("alpha"), cell("beta", "missing"), cell("gamma", "stale"), cell("delta", "unreadable"),
]): RegionInventory {
  const saved = rows.filter((row) => row.state === "saved");
  return {
    regionId: "eastern", cells: rows, savedCount: saved.length,
    unknownCount: rows.length - saved.length,
    savedBytes: saved.reduce((sum, row) => sum + row.expectedBytes, 0),
    expectedBytes: rows.reduce((sum, row) => sum + row.expectedBytes, 0),
    complete: saved.length === rows.length,
  };
}

function single(id = "beta", reason = "not-downloaded" as const): Casebook {
  return openCase(emptyCasebook("eastern"), manifest, inventory(), id, reason, timestamp, "Initial note");
}

function record(book: Casebook): OfflineCase {
  const item = book.cases[0];
  if (!item) throw new Error("Test casebook is empty");
  return item;
}

function query(change: Partial<CasebookQuery> = {}): CasebookQuery {
  return { filter: "all", order: "newest", search: "", offset: 0, limit: 12, ...change };
}

describe("offline casebook metadata and provenance", () => {
  it("constructs an empty, versioned casebook", () => {
    expect(emptyCasebook("eastern")).toEqual({
      schema: "offline-casebook-v1", regionId: "eastern", cases: [], revision: 0,
    });
  });

  it("rejects blank region identifiers", () => {
    expect(() => emptyCasebook("")).toThrow();
    expect(() => emptyCasebook(" ")).toThrow();
  });

  it("rejects path traversal in region identifiers", () => {
    expect(() => emptyCasebook("../outside")).toThrow();
    expect(() => emptyCasebook("region..copy")).toThrow();
  });

  it("constructs case IDs without clock or personal identifier", () => {
    expect(casebookId("eastern", "beta", 1)).toBe("case-1");
    expect(casebookId("eastern", "gamma", 5)).toBe("case-5");
  });

  it("rejects nonintegral case IDs", () => {
    expect(() => casebookId("eastern", "alpha", 0)).toThrow();
    expect(() => casebookId("eastern", "alpha", 1.5)).toThrow();
    expect(() => casebookId("eastern", "alpha", Number.NaN)).toThrow();
  });

  it("requires listed provenance with an open licence", () => {
    expect(validCaseProvenance(source)).toBe(true);
    expect(validCaseProvenance(second)).toBe(true);
    expect(validCaseProvenance({ ...source, licence: "Private" })).toBe(false);
  });

  it("rejects empty source and malformed dates", () => {
    expect(validCaseProvenance({ ...source, source: "" })).toBe(false);
    expect(validCaseProvenance({ ...source, date: "2026-02-30" })).toBe(false);
    expect(validCaseProvenance({ ...source, date: "2026-2-3" })).toBe(false);
  });

  it("rejects control codes and direction overrides in source names", () => {
    expect(validCaseProvenance({ ...source, source: "x\nvalue" })).toBe(false);
    expect(validCaseProvenance({ ...source, source: "x\u202evalue" })).toBe(false);
  });

  it("opens a case with matching source/licence/date and a first event", () => {
    const book = single();
    expect(record(book)).toMatchObject({
      cellId: "beta", reason: "not-downloaded", status: "open", evidence: "missing",
      source, expectedBytes: 25, createdAt: timestamp, updatedAt: timestamp,
    });
    expect(record(book).sourceTier).toBe("UNKNOWN");
    expect(record(book).events).toHaveLength(1);
    expect(record(book).events[0]).toMatchObject({ sequence: 1, action: "opened" });
  });

  it("never treats an opening note as a new local download", () => {
    const before = inventory();
    const book = openCase(emptyCasebook("eastern"), manifest, before, "beta", "not-downloaded", timestamp);
    expect(record(book).evidence).toBe("missing");
    expect(before.cells.find((row) => row.id === "beta")?.state).toBe("unknown");
  });

  it("reports unreadable and stale states independently", () => {
    expect(inspectCaseEvidence(manifest, inventory(), "alpha")).toBe("matching");
    expect(inspectCaseEvidence(manifest, inventory(), "beta")).toBe("missing");
    expect(inspectCaseEvidence(manifest, inventory(), "gamma")).toBe("stale");
    expect(inspectCaseEvidence(manifest, inventory(), "delta")).toBe("unreadable");
  });

  it("returns UNKNOWN when the device inventory cannot be read", () => {
    expect(inspectCaseEvidence(manifest, null, "alpha")).toBe("UNKNOWN");
    expect(inspectCaseEvidence(manifest, null, "beta")).toBe("UNKNOWN");
  });

  it("returns UNKNOWN for a different region", () => {
    const other = { ...inventory(), regionId: "west" };
    expect(inspectCaseEvidence(manifest, other, "alpha")).toBe("UNKNOWN");
  });

  it("returns UNKNOWN if a listed cell was never inspected", () => {
    const rows = inventory().cells.filter((row) => row.id !== "beta");
    expect(inspectCaseEvidence(manifest, inventory(rows), "beta")).toBe("UNKNOWN");
  });

  it("returns UNKNOWN if the local inventory includes a duplicate", () => {
    const rows = inventory().cells;
    expect(inspectCaseEvidence(manifest, inventory([...rows, rows[0]!] ), "alpha")).toBe("UNKNOWN");
  });

  it("returns UNKNOWN for a byte count mismatch", () => {
    const rows = inventory().cells.map((row) => row.id === "alpha" ? { ...row, expectedBytes: 11 } : row);
    expect(inspectCaseEvidence(manifest, inventory(rows), "alpha")).toBe("UNKNOWN");
  });

  it("returns UNKNOWN for a source name mismatch", () => {
    const rows = inventory().cells.map((row) => row.id === "alpha" ? {
      ...row, provenance: { ...source, source: "Changed source" },
    } : row);
    expect(inspectCaseEvidence(manifest, inventory(rows), "alpha")).toBe("UNKNOWN");
  });

  it("returns UNKNOWN for a licence mismatch", () => {
    const rows = inventory().cells.map((row) => row.id === "alpha" ? {
      ...row, provenance: { ...source, licence: "CC0 1.0" },
    } : row);
    expect(inspectCaseEvidence(manifest, inventory(rows), "alpha")).toBe("UNKNOWN");
  });

  it("returns UNKNOWN for a date mismatch", () => {
    const rows = inventory().cells.map((row) => row.id === "alpha" ? {
      ...row, provenance: { ...source, date: "2026-03-02" },
    } : row);
    expect(inspectCaseEvidence(manifest, inventory(rows), "alpha")).toBe("UNKNOWN");
  });

  it("rejects duplicate cell identifiers in a manifest", () => {
    const invalid = { ...manifest, cells: [manifest.cells[0]!, manifest.cells[0]!] };
    expect(() => inspectCaseEvidence(invalid, inventory(), "alpha")).toThrow();
  });

  it("rejects unsupported licences in the manifest", () => {
    const invalid = { ...manifest, cells: [
      { ...manifest.cells[0]!, provenance: { ...source, licence: "Proprietary" } },
    ] };
    expect(() => inspectCaseEvidence(invalid, inventory(), "alpha")).toThrow();
  });

  it("rejects nonintegral listed byte counts", () => {
    const invalid = { ...manifest, cells: [{ ...manifest.cells[0]!, bytes: 0.5 }] };
    expect(() => inspectCaseEvidence(invalid, inventory(), "alpha")).toThrow();
  });

  it("requires an explicitly enumerated cell before opening a case", () => {
    expect(() => openCase(emptyCasebook("eastern"), manifest, inventory(),
      "not-listed", "other", timestamp)).toThrow();
  });

  it("rejects opening a case in a different region", () => {
    expect(() => openCase(emptyCasebook("other"), manifest, inventory(),
      "alpha", "other", timestamp)).toThrow();
  });

  it("rejects invalid opening timestamps", () => {
    expect(() => openCase(emptyCasebook("eastern"), manifest, inventory(), "alpha", "other", "2026-02-30T20:00:00.000Z")).toThrow();
    expect(() => openCase(emptyCasebook("eastern"), manifest, inventory(), "alpha", "other", "tomorrow")).toThrow();
  });
});

describe("case event history and manual reconciliation", () => {
  it("records notes with a stable incrementing sequence", () => {
    const book = addCaseNote(single(), "case-1", later, "New information");
    expect(record(book).events.map((event) => event.sequence)).toEqual([1, 2]);
    expect(record(book).events[1]).toMatchObject({
      action: "commented", note: "New information", evidence: "missing",
    });
  });

  it("does not erase the opening note", () => {
    const book = addCaseNote(single(), "case-1", later, "Follow-up note");
    expect(record(book).events[0]?.note).toBe("Initial note");
    expect(record(book).events[1]?.note).toBe("Follow-up note");
  });

  it("rejects empty follow-up notes", () => {
    expect(() => addCaseNote(single(), "case-1", later, " ")).toThrow();
  });

  it("rejects oversized notes", () => {
    expect(() => addCaseNote(single(), "case-1", later, "x".repeat(CASEBOOK_MAX_NOTE_LENGTH + 1))).toThrow();
  });

  it("rejects control characters in notes", () => {
    expect(() => addCaseNote(single(), "case-1", later, "first\nsecond")).toThrow();
    expect(() => addCaseNote(single(), "case-1", later, "first\u202e second")).toThrow();
  });

  it("rejects writing an event before the previous event", () => {
    expect(() => addCaseNote(single(), "case-1", "2026-01-01T00:00:00.000Z", "Old note")).toThrow();
  });

  it("rejects adding a note to an unknown case", () => {
    expect(() => addCaseNote(single(), "not-a-case", later, "Note")).toThrow();
  });

  it("allows an explicit transition to in review", () => {
    const book = changeCaseStatus(single(), "case-1", later, "in-review");
    expect(record(book).status).toBe("in-review");
    expect(record(book).events.at(-1)?.action).toBe("status-changed");
  });

  it("allows an explicit transition to closed", () => {
    const book = changeCaseStatus(single(), "case-1", later, "closed");
    expect(record(book).status).toBe("closed");
  });

  it("does not add an event when a status is unchanged", () => {
    const book = single();
    expect(changeCaseStatus(book, "case-1", later, "open")).toBe(book);
  });

  it("does not assert a missing cell became saved when a case is closed", () => {
    const closed = changeCaseStatus(single(), "case-1", later, "closed");
    expect(record(closed).evidence).toBe("missing");
    expect(caseNextStep(record(closed))).toBe("none");
  });

  it("blocks invalid case status values at runtime", () => {
    expect(() => changeCaseStatus(single(), "case-1", later, "unlisted" as never)).toThrow();
  });

  it("reconciliation only changes evidence after an explicit call", () => {
    const book = single();
    const updated = reconcileCasebook(book, manifest, inventory([
      cell("alpha"), cell("beta"), cell("gamma", "stale"), cell("delta", "unreadable"),
    ]), later);
    expect(updated.changed).toEqual(["case-1"]);
    expect(updated.book.cases[0]?.evidence).toBe("matching");
    expect(book.cases[0]?.evidence).toBe("missing");
  });

  it("records no redundant events when observed evidence is unchanged", () => {
    const book = single();
    const result = reconcileCasebook(book, manifest, inventory(), later);
    expect(result.changed).toEqual([]);
    expect(result.unchanged).toEqual(["case-1"]);
    expect(result.book).toBe(book);
  });

  it("keeps UNKNOWN when reconciliation has no inventory", () => {
    const result = reconcileCasebook(single(), manifest, null, later);
    expect(result.book.cases[0]?.evidence).toBe("UNKNOWN");
    expect(result.changed).toEqual(["case-1"]);
  });

  it("does not reconcile a changed source into a historical case", () => {
    const book = single();
    const updated: RegionManifest = { ...manifest, cells: manifest.cells.map((item) =>
      item.id === "beta" ? { ...item, provenance: { ...source, date: "2026-06-01" } } : item) };
    const result = reconcileCasebook(book, updated, inventory(), later);
    expect(result.blocked).toContain("case-1");
    expect(result.book.cases[0]?.evidence).toBe("missing");
  });

  it("does not reconcile a changed listed byte count", () => {
    const book = single();
    const updated: RegionManifest = { ...manifest, cells: manifest.cells.map((item) =>
      item.id === "beta" ? { ...item, bytes: 26 } : item) };
    expect(reconcileCasebook(book, updated, inventory(), later).blocked).toEqual(["case-1"]);
  });

  it("preserves the status throughout an evidence update", () => {
    const book = changeCaseStatus(single(), "case-1", later, "in-review");
    const result = reconcileCasebook(book, manifest, null, latest);
    expect(result.book.cases[0]?.status).toBe("in-review");
    expect(result.book.cases[0]?.events.at(-1)?.status).toBe("in-review");
  });

  it("retains source, licence and date in every historical case", () => {
    const result = reconcileCasebook(single(), manifest, null, later);
    expect(result.book.cases[0]?.source).toEqual(source);
  });

  it("limits event history to a bounded number", () => {
    let book = single();
    for (let i = 1; i < CASEBOOK_MAX_EVENTS; i += 1) {
      book = addCaseNote(book, "case-1", later, `Note ${i}`);
    }
    expect(record(book).events).toHaveLength(CASEBOOK_MAX_EVENTS);
    expect(() => addCaseNote(book, "case-1", latest, "Too many")).toThrow();
  });

  it("validates status and evidence consistency with last event", () => {
    const book = single();
    const bad = { ...book, cases: [{ ...record(book), status: "closed" as const }] };
    expect(() => validateCasebook(bad)).toThrow();
  });

  it("validates timestamps on imported case events", () => {
    const book = single();
    const bad = { ...book, cases: [{ ...record(book), events: [{ ...record(book).events[0]!, at: "bad" }] }] };
    expect(() => validateCasebook(bad)).toThrow();
  });
});

describe("casebook summaries, browsing and safe import", () => {
  function multiple(): Casebook {
    let book = emptyCasebook("eastern");
    book = openCase(book, manifest, inventory(), "alpha", "other", timestamp, "Alpha");
    book = openCase(book, manifest, inventory(), "beta", "not-downloaded", later, "Beta");
    book = openCase(book, manifest, inventory(), "gamma", "out-of-date", latest, "Gamma");
    return book;
  }

  it("counts open cases and byte size without treating a note as a saved copy", () => {
    const totals = casebookSummary(multiple());
    expect(totals).toMatchObject({ total: 3, open: 3, closed: 0, recordedBytes: 85 });
    expect(totals.potentialRetry).toBe(2);
  });

  it("exposes explicit next steps without silently performing them", () => {
    const rows = casebookRows(multiple());
    expect(rows.map((row) => row.nextStep)).toEqual(["none", "retry-manually", "retry-manually"]);
  });

  it("counts unknown evidence separately from missing", () => {
    const book = openCase(emptyCasebook("eastern"), manifest, null, "alpha", "other", timestamp);
    expect(casebookSummary(book).unknown).toBe(1);
    expect(casebookSummary(book).potentialRetry).toBe(0);
  });

  it("sorts by most recently updated by default", () => {
    expect(pageCasebook(multiple(), query()).rows.map((row) => row.cellId)).toEqual(["gamma", "beta", "alpha"]);
  });

  it("sorts by oldest date and ID deterministically", () => {
    expect(pageCasebook(multiple(), query({ order: "oldest" })).rows.map((row) => row.cellId)).toEqual(["alpha", "beta", "gamma"]);
    expect(pageCasebook(multiple(), query({ order: "cell" })).rows.map((row) => row.cellId)).toEqual(["alpha", "beta", "gamma"]);
  });

  it("searches source names without treating them as accessibility facts", () => {
    expect(pageCasebook(multiple(), query({ search: "city public" })).rows.map((row) => row.cellId)).toEqual(["gamma"]);
  });

  it("searches licence and date", () => {
    expect(pageCasebook(multiple(), query({ search: "CC0" })).total).toBe(1);
    expect(pageCasebook(multiple(), query({ search: "2026-03" })).total).toBe(2);
  });

  it("searches cell IDs without case sensitivity", () => {
    expect(pageCasebook(multiple(), query({ search: " ALPHA " })).rows.map((row) => row.cellId)).toEqual(["alpha"]);
  });

  it("filters open and in-review cases accurately", () => {
    const book = changeCaseStatus(multiple(), "case-2", latest, "in-review");
    expect(pageCasebook(book, query({ filter: "open" })).total).toBe(2);
    expect(pageCasebook(book, query({ filter: "in-review" })).total).toBe(1);
  });

  it("filters cases needing attention", () => {
    expect(pageCasebook(multiple(), query({ filter: "attention" })).total).toBe(2);
  });

  it("filters UNKNOWN evidence", () => {
    const book = openCase(emptyCasebook("eastern"), manifest, null, "alpha", "other", timestamp);
    expect(pageCasebook(book, query({ filter: "unknown" })).total).toBe(1);
  });

  it("paginates without losing or duplicating cases", () => {
    const book = multiple();
    const ids: string[] = [];
    for (let offset = 0; offset < 3; offset += 1) {
      const page = pageCasebook(book, query({ order: "oldest", offset, limit: 1 }));
      expect(page.rows).toHaveLength(1);
      ids.push(page.rows[0]!.id);
      expect(page.previous).toBe(offset > 0);
      expect(page.next).toBe(offset < 2);
    }
    expect(ids).toEqual(["case-1", "case-2", "case-3"]);
  });

  it("caps page size", () => {
    expect(pageCasebook(multiple(), query({ limit: 10_000 })).limit).toBe(100);
    expect(pageCasebook(multiple(), query({ limit: -1 })).limit).toBe(1);
  });

  it("normalizes negative and nonintegral offsets", () => {
    expect(pageCasebook(multiple(), query({ offset: -7 })).offset).toBe(0);
    expect(pageCasebook(multiple(), query({ offset: Number.NaN })).offset).toBe(0);
  });

  it("encodes stable JSON that contains no downloaded cell payloads", () => {
    const json = encodeCasebook(multiple());
    expect(json).toContain('"source": "Ontario public information"');
    expect(json).not.toContain("Uint8Array");
    expect(json).not.toContain("data:application");
    expect(json.endsWith("\n")).toBe(true);
  });

  it("round trips the casebook without losing events", () => {
    const book = multiple();
    expect(importCasebook(encodeCasebook(book), "eastern")).toEqual(book);
  });

  it("rejects a casebook from the wrong region", () => {
    expect(() => importCasebook(encodeCasebook(multiple()), "west")).toThrow();
  });

  it("rejects malformed and non-object JSON", () => {
    expect(() => importCasebook("{", "eastern")).toThrow();
    expect(() => importCasebook("null", "eastern")).toThrow();
    expect(() => importCasebook("[]", "eastern")).toThrow();
  });

  it("rejects duplicate case IDs from an untrusted file", () => {
    const book = multiple();
    const altered = { ...book, cases: [book.cases[0]!, book.cases[0]!] };
    expect(() => importCasebook(JSON.stringify(altered), "eastern")).toThrow();
  });

  it("rejects an untrusted file that rewrites the licence", () => {
    const book = multiple();
    const altered = { ...book, cases: [{ ...book.cases[0]!, source: { ...source, licence: "Private" } }] };
    expect(() => importCasebook(JSON.stringify(altered), "eastern")).toThrow();
  });

  it("rejects a note with hidden control characters", () => {
    const book = single();
    const altered = { ...book, cases: [{ ...record(book), events: [{ ...record(book).events[0]!, note: "x\u202e y" }] }] };
    expect(() => importCasebook(JSON.stringify(altered), "eastern")).toThrow();
  });

  it("does not read downloaded bytes or browser keys to restore a casebook", () => {
    const parsed = importCasebook(encodeCasebook(single()), "eastern");
    expect(Object.keys(parsed)).toEqual(["schema", "regionId", "cases", "revision"]);
  });

  it("rejects too many case entries", () => {
    const base = single();
    const cases = Array.from({ length: CASEBOOK_MAX_CASES + 1 }, (_, index) => ({
      ...record(base), id: `case-${index + 1}`,
    }));
    expect(() => validateCasebook({ ...base, cases })).toThrow();
  });

  it("is deterministic for equal-input browsing queries", () => {
    const book = multiple();
    expect(pageCasebook(book, query({ order: "status" }))).toEqual(pageCasebook(book, query({ order: "status" })));
  });

  it("marks changed evidence since opening without guessing why", () => {
    const result = reconcileCasebook(single(), manifest, null, later);
    expect(casebookRows(result.book)[0]).toMatchObject({ changedSinceOpening: true, evidence: "UNKNOWN" });
  });

  it("keeps imported UNKNOWN as historical rather than current inventory", () => {
    const book = openCase(emptyCasebook("eastern"), manifest, null, "alpha", "other", timestamp);
    const parsed = importCasebook(encodeCasebook(book), "eastern");
    expect(parsed.cases[0]?.evidence).toBe("UNKNOWN");
    expect(inspectCaseEvidence(manifest, inventory(), "alpha")).toBe("matching");
  });
});
