import { describe, expect, it } from "vitest";
import {
  CHECKPOINT_CONDITIONS, CHECKPOINT_LIMITS, CHECKPOINT_OPERATIONS,
  CHECKPOINT_PHASES, CHECKPOINT_TIERS, addCheckpoint, checkpointDate,
  checkpointInstant, checkpointSummary, emptyCheckpointDocument,
  filterCheckpoints, mergeCheckpointDocuments, nextCheckpointId,
  parseCheckpointDocument, previewCheckpointMerge, reviewCheckpoint,
  serializeCheckpointDocument, validateCheckpoint,
  validateCheckpointDocument, validateCheckpointSource, validateFileObservation,
  type CheckpointDocument, type CheckpointEntry, type CheckpointSource,
  type FileObservation,
} from "./recoveryCheckpoint";

const SOURCE: CheckpointSource = {
  name: "Public document", licence: "CC-BY-4.0", date: "2026-11-19",
  tier: "UNKNOWN", reference: "open-reference",
};
const OBSERVATION: FileObservation = {
  bytes: null, digest: null, condition: "UNKNOWN", note: "No byte evidence",
};
const entry = (patch: Partial<CheckpointEntry> = {}): CheckpointEntry => ({
  id: "checkpoint-1", packId: "region-1", operation: "pack",
  capturedAt: "2026-11-19T12:00:00.000Z",
  source: { ...SOURCE }, observation: { ...OBSERVATION }, phase: "draft", ...patch,
});
const withEntries = (...entries: CheckpointEntry[]): CheckpointDocument => ({
  ...emptyCheckpointDocument(), entries,
});
function value<T>(result: { ok: boolean; value?: T }): T {
  expect(result.ok).toBe(true);
  if (result.value === undefined) throw new Error("Expected success");
  return result.value;
}

describe("checkpoint formats and bounds", () => {
  it("creates an empty local document", () => {
    expect(emptyCheckpointDocument()).toEqual({ format: "local-recovery-checkpoints", version: 1, entries: [] });
  });
  it("accepts the empty document", () => {
    expect(validateCheckpointDocument(emptyCheckpointDocument()).ok).toBe(true);
  });
  it("rejects null documents", () => {
    expect(validateCheckpointDocument(null)).toEqual({ ok: false, issue: "format" });
  });
  it("rejects array documents", () => {
    expect(validateCheckpointDocument([])).toEqual({ ok: false, issue: "format" });
  });
  it("rejects missing version", () => {
    expect(validateCheckpointDocument({ format: "local-recovery-checkpoints", entries: [] }).ok).toBe(false);
  });
  it("rejects a newer version without guessing", () => {
    expect(validateCheckpointDocument({ ...emptyCheckpointDocument(), version: 2 }).ok).toBe(false);
  });
  it("rejects a different format", () => {
    expect(validateCheckpointDocument({ ...emptyCheckpointDocument(), format: "other" }).ok).toBe(false);
  });
  it("rejects unexpected top-level fields", () => {
    expect(validateCheckpointDocument({ ...emptyCheckpointDocument(), private: "x" }).ok).toBe(false);
  });
  it("rejects missing entries", () => {
    expect(validateCheckpointDocument({ format: "local-recovery-checkpoints", version: 1 }).ok).toBe(false);
  });
  it("rejects entries that are not arrays", () => {
    expect(validateCheckpointDocument({ ...emptyCheckpointDocument(), entries: {} }).ok).toBe(false);
  });
  it("rejects too many entries", () => {
    expect(validateCheckpointDocument({ ...emptyCheckpointDocument(), entries: Array(CHECKPOINT_LIMITS.entries + 1).fill(entry()) })).toEqual({ ok: false, issue: "limit" });
  });
  it("accepts a single entry", () => {
    expect(validateCheckpointDocument(withEntries(entry())).ok).toBe(true);
  });
  it("rejects duplicate entry IDs", () => {
    expect(validateCheckpointDocument(withEntries(entry(), entry()))).toEqual({ ok: false, issue: "duplicate" });
  });
  it("rejects invalid entries inside a valid array", () => {
    expect(validateCheckpointDocument({ ...emptyCheckpointDocument(), entries: [entry(), null] }).ok).toBe(false);
  });
  it("exports newline-terminated JSON", () => {
    expect(value(serializeCheckpointDocument(withEntries(entry()))).endsWith("\n")).toBe(true);
  });
  it("round-trips observations and metadata", () => {
    const document = withEntries(entry());
    expect(value(parseCheckpointDocument(value(serializeCheckpointDocument(document))))).toEqual(document);
  });
  it("rejects malformed JSON", () => {
    expect(parseCheckpointDocument("{")).toEqual({ ok: false, issue: "format" });
  });
  it("rejects an unrecognized imported format", () => {
    expect(parseCheckpointDocument('{"format":"unknown"}').ok).toBe(false);
  });
  it("rejects a file larger than the byte limit", () => {
    expect(parseCheckpointDocument(" ".repeat(CHECKPOINT_LIMITS.bytes + 1))).toEqual({ ok: false, issue: "limit" });
  });
  it("does not modify the supplied JSON string", () => {
    const raw = value(serializeCheckpointDocument(withEntries(entry())));
    parseCheckpointDocument(raw);
    expect(raw).toContain("No byte evidence");
  });
  it("preserves UNKNOWN on round-trip", () => {
    const parsed = value(parseCheckpointDocument(value(serializeCheckpointDocument(withEntries(entry())))));
    expect(parsed.entries[0]?.observation.condition).toBe("UNKNOWN");
  });
  it("preserves null byte counts", () => {
    const parsed = value(parseCheckpointDocument(value(serializeCheckpointDocument(withEntries(entry())))));
    expect(parsed.entries[0]?.observation.bytes).toBeNull();
  });
  it("preserves null digests", () => {
    const parsed = value(parseCheckpointDocument(value(serializeCheckpointDocument(withEntries(entry())))));
    expect(parsed.entries[0]?.observation.digest).toBeNull();
  });
  it("does not add an accessibility property", () => {
    expect(JSON.stringify(value(serializeCheckpointDocument(withEntries(entry()))))).not.toContain("accessibilityRating");
  });
});

describe("source provenance", () => {
  it("accepts complete open provenance", () => {
    expect(validateCheckpointSource(SOURCE)).toBeNull();
  });
  for (const licence of ["CC0-1.0", "CC-BY-4.0", "ODbL-1.0", "OGL-Canada-2.0", "OGL-ON-1.0"]) {
    it(`accepts open licence ${licence}`, () => {
      expect(validateCheckpointSource({ ...SOURCE, licence })).toBeNull();
    });
  }
  for (const licence of ["private", "commercial", "", "MIT", "GPL-3.0", null, 9]) {
    it(`rejects unsupported licence ${String(licence)}`, () => {
      expect(validateCheckpointSource({ ...SOURCE, licence })).toBe("licence");
    });
  }
  for (const name of ["", " ", "<script>", "source\nother", "x".repeat(CHECKPOINT_LIMITS.name + 1)]) {
    it(`rejects unsafe source name ${JSON.stringify(name).slice(0, 20)}`, () => {
      expect(validateCheckpointSource({ ...SOURCE, name })).toBe("source");
    });
  }
  for (const date of ["2026-02-31", "2026-00-01", "2026-13-01", "yesterday", "", null]) {
    it(`rejects invalid source date ${String(date)}`, () => {
      expect(validateCheckpointSource({ ...SOURCE, date })).toBe("date");
    });
  }
  for (const tier of CHECKPOINT_TIERS) {
    it(`preserves explicitly supplied tier ${tier}`, () => {
      expect(validateCheckpointSource({ ...SOURCE, tier })).toBeNull();
    });
  }
  it("rejects a guessed evidence tier", () => {
    expect(validateCheckpointSource({ ...SOURCE, tier: "assumed" })).toBe("tier");
  });
  it("accepts an empty optional reference", () => {
    expect(validateCheckpointSource({ ...SOURCE, reference: "" })).toBeNull();
  });
  it("rejects markup in a reference", () => {
    expect(validateCheckpointSource({ ...SOURCE, reference: "<ref>" })).toBe("source");
  });
  it("rejects a long reference", () => {
    expect(validateCheckpointSource({ ...SOURCE, reference: "x".repeat(CHECKPOINT_LIMITS.reference + 1) })).toBe("source");
  });
  it("rejects extra metadata fields", () => {
    expect(validateCheckpointSource({ ...SOURCE, inferred: true })).toBe("source");
  });
  it("rejects absent source provenance", () => {
    expect(validateCheckpointSource(undefined)).toBe("source");
  });
  it("rejects array provenance", () => {
    expect(validateCheckpointSource([])).toBe("source");
  });
  it("rejects numeric provenance", () => {
    expect(validateCheckpointSource(12)).toBe("source");
  });
});

describe("observation validation", () => {
  it("accepts UNKNOWN with no file measurements", () => {
    expect(validateFileObservation(OBSERVATION)).toBeNull();
  });
  it("accepts a zero-byte report as a reported number", () => {
    expect(validateFileObservation({ ...OBSERVATION, bytes: 0 })).toBeNull();
  });
  it("accepts a positive byte report", () => {
    expect(validateFileObservation({ ...OBSERVATION, bytes: 200 })).toBeNull();
  });
  for (const bytes of [-1, 1.5, NaN, Infinity, "3", undefined, {}, 2 ** 54]) {
    it(`rejects invalid byte measurement ${String(bytes)}`, () => {
      expect(validateFileObservation({ ...OBSERVATION, bytes })).toBe("shape");
    });
  }
  it("accepts a valid supplied SHA-256", () => {
    expect(validateFileObservation({ ...OBSERVATION, digest: "a".repeat(64) })).toBeNull();
  });
  for (const digest of ["short", "x".repeat(64), "0".repeat(65), "", false, 4]) {
    it(`rejects invalid digest ${String(digest).slice(0, 16)}`, () => {
      expect(validateFileObservation({ ...OBSERVATION, digest })).toBe("shape");
    });
  }
  for (const condition of CHECKPOINT_CONDITIONS) {
    it(`accepts explicitly reported condition ${condition}`, () => {
      expect(validateFileObservation({ ...OBSERVATION, condition })).toBeNull();
    });
  }
  it("rejects inferred complete status", () => {
    expect(validateFileObservation({ ...OBSERVATION, condition: "ready" })).toBe("condition");
  });
  it("accepts a deliberately empty note", () => {
    expect(validateFileObservation({ ...OBSERVATION, note: "" })).toBeNull();
  });
  it("rejects markup notes", () => {
    expect(validateFileObservation({ ...OBSERVATION, note: "<div>" })).toBe("text");
  });
  it("rejects control characters in notes", () => {
    expect(validateFileObservation({ ...OBSERVATION, note: "first\nsecond" })).toBe("text");
  });
  it("rejects long notes", () => {
    expect(validateFileObservation({ ...OBSERVATION, note: "x".repeat(CHECKPOINT_LIMITS.note + 1) })).toBe("text");
  });
  it("rejects unexpected observation keys", () => {
    expect(validateFileObservation({ ...OBSERVATION, autoRetry: true })).toBe("shape");
  });
  it("rejects arrays", () => {
    expect(validateFileObservation([])).toBe("shape");
  });
  it("rejects null", () => {
    expect(validateFileObservation(null)).toBe("shape");
  });
});

describe("record identity and timestamp", () => {
  for (const operation of CHECKPOINT_OPERATIONS) {
    it(`accepts operation ${operation}`, () => {
      expect(validateCheckpoint(entry({ operation }))).toBeNull();
    });
  }
  for (const phase of CHECKPOINT_PHASES) {
    it(`accepts review phase ${phase}`, () => {
      expect(validateCheckpoint(entry({ phase }))).toBeNull();
    });
  }
  for (const id of ["", ".", "..", "../unsafe", "with space", "<tag>", "x".repeat(97)]) {
    it(`rejects unsafe checkpoint id ${id.slice(0, 20)}`, () => {
      expect(validateCheckpoint(entry({ id }))).toBe("identity");
    });
  }
  it("rejects invalid pack IDs", () => {
    expect(validateCheckpoint(entry({ packId: "../unsafe" }))).toBe("identity");
  });
  it("rejects invalid operations", () => {
    expect(validateCheckpoint({ ...entry(), operation: "erase" })).toBe("shape");
  });
  for (const instant of ["2026-02-31T12:00:00.000Z", "2026-11-19T29:00:00.000Z", "today", "2026-11-19T12:00:00Z", ""]) {
    it(`rejects invalid timestamp ${instant}`, () => {
      expect(checkpointInstant(instant)).toBe(false);
    });
  }
  it("accepts a normalized timestamp", () => {
    expect(checkpointInstant("2026-11-19T12:00:00.000Z")).toBe(true);
  });
  it("rejects bogus calendar days", () => {
    expect(checkpointDate("2026-02-31")).toBe(false);
  });
  it("rejects extra entry keys", () => {
    expect(validateCheckpoint({ ...entry(), metadata: "extra" })).toBe("shape");
  });
});

describe("append-only and manual review", () => {
  it("adds without changing the existing document", () => {
    const initial = emptyCheckpointDocument();
    const result = value(addCheckpoint(initial, entry()));
    expect(result.entries).toHaveLength(1);
    expect(initial.entries).toHaveLength(0);
  });
  it("preserves UNKNOWN condition", () => {
    expect(value(addCheckpoint(emptyCheckpointDocument(), entry())).entries[0]?.observation.condition).toBe("UNKNOWN");
  });
  it("rejects duplicate IDs on append", () => {
    expect(addCheckpoint(withEntries(entry()), entry())).toEqual({ ok: false, issue: "duplicate" });
  });
  it("accepts distinct entries for the same pack", () => {
    expect(value(addCheckpoint(withEntries(entry()), entry({ id: "checkpoint-2" }))).entries).toHaveLength(2);
  });
  it("does not alter source evidence", () => {
    const result = value(addCheckpoint(emptyCheckpointDocument(), entry()));
    expect(result.entries[0]?.source).toEqual(SOURCE);
  });
  it("does not alter user note", () => {
    const result = value(addCheckpoint(emptyCheckpointDocument(), entry()));
    expect(result.entries[0]?.observation.note).toBe(OBSERVATION.note);
  });
  it("allows a draft to be marked reviewed", () => {
    expect(value(reviewCheckpoint(withEntries(entry()), "checkpoint-1", "reviewed")).entries[0]?.phase).toBe("reviewed");
  });
  it("allows a draft to be marked disputed", () => {
    expect(value(reviewCheckpoint(withEntries(entry()), "checkpoint-1", "disputed")).entries[0]?.phase).toBe("disputed");
  });
  it("does not change reported condition when reviewed", () => {
    const result = value(reviewCheckpoint(withEntries(entry()), "checkpoint-1", "reviewed"));
    expect(result.entries[0]?.observation.condition).toBe("UNKNOWN");
  });
  it("does not change the prior draft object", () => {
    const original = withEntries(entry());
    reviewCheckpoint(original, "checkpoint-1", "reviewed");
    expect(original.entries[0]?.phase).toBe("draft");
  });
  it("rejects review of missing ID", () => {
    expect(reviewCheckpoint(withEntries(entry()), "missing", "reviewed")).toEqual({ ok: false, issue: "missing" });
  });
  it("rejects re-review", () => {
    expect(reviewCheckpoint(withEntries(entry({ phase: "reviewed" })), "checkpoint-1", "disputed")).toEqual({ ok: false, issue: "transition" });
  });
  it("rejects clearing a dispute through the review API", () => {
    expect(reviewCheckpoint(withEntries(entry({ phase: "disputed" })), "checkpoint-1", "reviewed")).toEqual({ ok: false, issue: "transition" });
  });
  it("generates the first unused ID", () => {
    expect(nextCheckpointId(withEntries(entry()))).toBe("checkpoint-2");
  });
  it("reuses a gap without reusing a live ID", () => {
    expect(nextCheckpointId(withEntries(entry({ id: "checkpoint-2" })))).toBe("checkpoint-1");
  });
  it("counts UNKNOWN without treating it as ready", () => {
    expect(checkpointSummary(withEntries(entry())).unknown).toBe(1);
  });
  it("counts missing byte observations separately", () => {
    expect(checkpointSummary(withEntries(entry())).withoutBytes).toBe(1);
  });
  it("counts supplied byte totals", () => {
    expect(checkpointSummary(withEntries(entry({ observation: { ...OBSERVATION, bytes: 1024 } }))).recordedBytes).toBe(1024);
  });
  it("filters by condition without changing the model", () => {
    const doc = withEntries(entry());
    expect(filterCheckpoints(doc, { condition: "UNKNOWN" })).toHaveLength(1);
    expect(filterCheckpoints(doc, { condition: "damaged" })).toHaveLength(0);
  });
  it("filters by text in the user's note", () => {
    expect(filterCheckpoints(withEntries(entry()), { search: "BYTE EVIDENCE" })).toHaveLength(1);
  });
  it("filters by pack", () => {
    expect(filterCheckpoints(withEntries(entry()), { packId: "region-2" })).toHaveLength(0);
  });
});

describe("safe non-destructive merging", () => {
  it("previews identical histories as unchanged", () => {
    expect(previewCheckpointMerge(withEntries(entry()), withEntries(entry()))).toEqual({
      ok: true, value: { added: [], unchanged: ["checkpoint-1"], conflicts: [] },
    });
  });
  it("previews a new entry", () => {
    const preview = value(previewCheckpointMerge(withEntries(entry()), withEntries(entry({ id: "checkpoint-2" }))));
    expect(preview.added).toEqual(["checkpoint-2"]);
  });
  it("previews a changed note as a conflict", () => {
    const changed = entry({ observation: { ...OBSERVATION, note: "different" } });
    expect(value(previewCheckpointMerge(withEntries(entry()), withEntries(changed))).conflicts).toEqual(["checkpoint-1"]);
  });
  it("previews changed source information as a conflict", () => {
    const changed = entry({ source: { ...SOURCE, name: "Alternative source" } });
    expect(value(previewCheckpointMerge(withEntries(entry()), withEntries(changed))).conflicts).toEqual(["checkpoint-1"]);
  });
  it("rejects a conflicting merge entirely", () => {
    const changed = entry({ phase: "disputed" });
    expect(mergeCheckpointDocuments(withEntries(entry()), withEntries(changed))).toEqual({ ok: false, issue: "conflict" });
  });
  it("merges a new entry without mutating the old one", () => {
    const current = withEntries(entry());
    const incoming = withEntries(entry({ id: "checkpoint-2" }));
    const result = value(mergeCheckpointDocuments(current, incoming));
    expect(result.entries).toHaveLength(2);
    expect(current.entries).toHaveLength(1);
  });
  it("does not duplicate identical IDs", () => {
    expect(value(mergeCheckpointDocuments(withEntries(entry()), withEntries(entry()))).entries).toHaveLength(1);
  });
  it("rejects invalid current documents", () => {
    const invalid = { ...withEntries(entry()), version: 2 } as unknown as CheckpointDocument;
    expect(previewCheckpointMerge(invalid, withEntries(entry())).ok).toBe(false);
  });
  it("rejects invalid imported documents", () => {
    const invalid = { ...withEntries(entry()), entries: [null] } as unknown as CheckpointDocument;
    expect(mergeCheckpointDocuments(withEntries(entry()), invalid).ok).toBe(false);
  });
  it("keeps each retained source independent", () => {
    const merged = value(mergeCheckpointDocuments(withEntries(entry()), withEntries(entry({ id: "checkpoint-2" }))));
    expect(merged.entries[0]?.source).not.toBe(merged.entries[1]?.source);
  });
});
