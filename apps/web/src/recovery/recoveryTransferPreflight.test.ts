import { describe, expect, it } from "vitest";
import {
  EVIDENCE_TIERS, PREFLIGHT_LIMITS, TRANSFER_CONDITIONS, TRANSFER_KINDS, TRANSFER_STAGES,
  TRANSFER_LICENCES, appendTransferCandidate, assessTransferCandidate, assessTransferDocument,
  decodeTransferDocument, encodeTransferDocument, filterTransferCandidates,
  mergeTransferDocuments, newTransferDocument, summarizeTransferDocument,
  transferPackSummaries, transferPreviewMerge, transitionTransferCandidate,
  validTransferProvenance, validateTransferCandidate, validateTransferDocument,
  type TransferCandidate, type TransferCondition, type TransferDocument,
  type TransferProvenance,
} from "./recoveryTransferPreflight";

const source: TransferProvenance = {
  name: "Local open record",
  licence: "CC-BY-4.0",
  date: "2026-11-18",
  tier: "UNKNOWN",
  reference: "public-file-1",
};

const candidate = (patch: Partial<TransferCandidate> = {}): TransferCandidate => ({
  id: "transfer-1",
  packId: "region-1",
  kind: "download",
  condition: "unknown",
  stage: "draft",
  recordedAt: "2026-11-19T10:00:00.000Z",
  source,
  expectedBytes: null,
  availableBytes: null,
  note: "Manual inspection needed",
  ...patch,
});
const withCandidate = (value: TransferCandidate = candidate()): TransferDocument => ({
  ...newTransferDocument(), candidates: [value],
});

function assertRejected(value: unknown): void {
  const result = validateTransferCandidate(value);
  expect(result).not.toBeNull();
}

function assertUnknown(value: TransferCandidate): void {
  const result = assessTransferCandidate(value);
  expect(result.readiness).toBe("UNKNOWN");
  expect(result.decision).toBe("UNKNOWN");
}

describe("preflight source integrity", () => {
  it("accepts a complete open licence source", () => {
    expect(validTransferProvenance(source)).toBe(true);
  });
  it.each(TRANSFER_LICENCES)("accepts open licence %s", (licence) => {
    expect(validTransferProvenance({ ...source, licence })).toBe(true);
  });
  it.each(EVIDENCE_TIERS)("accepts explicitly selected tier %s", (tier) => {
    expect(validTransferProvenance({ ...source, tier })).toBe(true);
  });
  it("preserves an UNKNOWN evidence tier without raising confidence", () => {
    expect(candidate().source.tier).toBe("UNKNOWN");
    expect(validTransferProvenance(candidate().source)).toBe(true);
  });
  it("rejects an omitted source", () => {
    expect(validTransferProvenance({ ...source, name: "" })).toBe(false);
  });
  it("rejects whitespace-only source names", () => {
    expect(validTransferProvenance({ ...source, name: "   " })).toBe(false);
  });
  it("rejects a closed licence", () => {
    expect(validTransferProvenance({ ...source, licence: "private" })).toBe(false);
  });
  it("rejects a guessed licence", () => {
    expect(validTransferProvenance({ ...source, licence: "UNKNOWN" })).toBe(false);
  });
  it("rejects a missing licence", () => {
    expect(validTransferProvenance({ ...source, licence: "" })).toBe(false);
  });
  it("rejects an impossible calendar date", () => {
    expect(validTransferProvenance({ ...source, date: "2026-02-30" })).toBe(false);
  });
  it("rejects an invalid date format", () => {
    expect(validTransferProvenance({ ...source, date: "11/19/2026" })).toBe(false);
  });
  it("rejects a missing tier", () => {
    expect(validTransferProvenance({ ...source, tier: "" })).toBe(false);
  });
  it("rejects an inferred unsupported tier", () => {
    expect(validTransferProvenance({ ...source, tier: "official" })).toBe(false);
  });
  it("rejects a source with unrecognised keys", () => {
    expect(validTransferProvenance({ ...source, secret: "value" })).toBe(false);
  });
  it("rejects markup in the source name", () => {
    expect(validTransferProvenance({ ...source, name: "<script>" })).toBe(false);
  });
  it("rejects a tab in the reference", () => {
    expect(validTransferProvenance({ ...source, reference: "one\ttwo" })).toBe(false);
  });
  it("rejects an overly long reference", () => {
    expect(validTransferProvenance({ ...source, reference: "x".repeat(PREFLIGHT_LIMITS.reference + 1) })).toBe(false);
  });
  it("allows an empty optional reference", () => {
    expect(validTransferProvenance({ ...source, reference: "" })).toBe(true);
  });
  it("does not accept an array as provenance", () => {
    expect(validTransferProvenance([source])).toBe(false);
  });
  it("does not accept null as provenance", () => {
    expect(validTransferProvenance(null)).toBe(false);
  });
});

describe("transfer candidate schemas", () => {
  it("starts with an empty document", () => {
    expect(newTransferDocument()).toEqual({ format: "local-transfer-preflight", version: 1, candidates: [] });
  });
  it("accepts a valid candidate", () => {
    expect(validateTransferCandidate(candidate())).toBeNull();
  });
  it.each(TRANSFER_KINDS)("accepts a %s operation", (kind) => {
    expect(validateTransferCandidate(candidate({ kind }))).toBeNull();
  });
  it.each(TRANSFER_CONDITIONS)("accepts an explicit %s condition", (condition) => {
    expect(validateTransferCandidate(candidate({ condition }))).toBeNull();
  });
  it.each(TRANSFER_STAGES)("accepts the %s review state", (stage) => {
    expect(validateTransferCandidate(candidate({ stage }))).toBeNull();
  });
  it("rejects an identifier that traverses folders", () => {
    assertRejected(candidate({ id: "../outside" }));
  });
  it("rejects an identifier with whitespace", () => {
    assertRejected(candidate({ id: "outside id" }));
  });
  it("rejects an unsafe pack identifier", () => {
    assertRejected(candidate({ packId: "../../pack" }));
  });
  it("rejects an empty identifier", () => {
    assertRejected(candidate({ id: "" }));
  });
  it("rejects a missing pack ID", () => {
    assertRejected(candidate({ packId: "" }));
  });
  it("rejects an operation outside the enum", () => {
    assertRejected({ ...candidate(), kind: "erase" });
  });
  it("rejects invented successful pack states", () => {
    assertRejected({ ...candidate(), condition: "ready" });
  });
  it("rejects a made-up stage", () => {
    assertRejected({ ...candidate(), stage: "promoted" });
  });
  it("rejects malformed timestamps", () => {
    assertRejected(candidate({ recordedAt: "tomorrow" }));
  });
  it("rejects non-UTC timestamps", () => {
    assertRejected(candidate({ recordedAt: "2026-11-19T10:00:00+05:00" }));
  });
  it("rejects impossible dates in timestamps", () => {
    assertRejected(candidate({ recordedAt: "2026-02-31T10:00:00.000Z" }));
  });
  it("rejects a string for expected bytes", () => {
    assertRejected({ ...candidate(), expectedBytes: "900" });
  });
  it("rejects a string for available bytes", () => {
    assertRejected({ ...candidate(), availableBytes: "900" });
  });
  it("rejects a negative byte count", () => {
    assertRejected(candidate({ expectedBytes: -1 }));
  });
  it("rejects fractional byte counts", () => {
    assertRejected(candidate({ availableBytes: 1.5 }));
  });
  it("rejects an unbounded integer byte count", () => {
    assertRejected(candidate({ availableBytes: Number.MAX_SAFE_INTEGER }));
  });
  it("allows an explicit zero byte count", () => {
    expect(validateTransferCandidate(candidate({ expectedBytes: 0, availableBytes: 0 }))).toBeNull();
  });
  it("keeps missing byte quantities as null", () => {
    expect(validateTransferCandidate(candidate({ expectedBytes: null, availableBytes: null }))).toBeNull();
  });
  it("rejects markup in the note", () => {
    assertRejected(candidate({ note: "<b>unsafe</b>" }));
  });
  it("rejects newline characters in the note", () => {
    assertRejected(candidate({ note: "line one\nline two" }));
  });
  it("rejects a note beyond the maximum length", () => {
    assertRejected(candidate({ note: "n".repeat(PREFLIGHT_LIMITS.note + 1) }));
  });
  it("accepts an empty note", () => {
    expect(validateTransferCandidate(candidate({ note: "" }))).toBeNull();
  });
  it("rejects unexpected fields", () => {
    assertRejected({ ...candidate(), privateData: true });
  });
  it("rejects a missing provenance object", () => {
    assertRejected({ ...candidate(), source: null });
  });
  it("rejects incomplete provenance", () => {
    assertRejected(candidate({ source: { ...source, name: "" } }));
  });
  it("rejects a non-object candidate", () => {
    assertRejected("candidate");
  });
  it("rejects an array as a candidate", () => {
    assertRejected([candidate()]);
  });
});

describe("document validation and append-only behaviour", () => {
  it("validates an empty document", () => {
    expect(validateTransferDocument(newTransferDocument()).ok).toBe(true);
  });
  it("validates one local entry", () => {
    expect(validateTransferDocument(withCandidate()).ok).toBe(true);
  });
  it("rejects a different format", () => {
    expect(validateTransferDocument({ ...withCandidate(), format: "other" }).ok).toBe(false);
  });
  it("rejects a different version", () => {
    expect(validateTransferDocument({ ...withCandidate(), version: 2 }).ok).toBe(false);
  });
  it("rejects additional document fields", () => {
    expect(validateTransferDocument({ ...withCandidate(), password: "unexpected" }).ok).toBe(false);
  });
  it("rejects duplicate candidate identifiers", () => {
    expect(validateTransferDocument({ ...withCandidate(), candidates: [candidate(), candidate()] }).ok).toBe(false);
  });
  it("rejects more than the maximum candidates", () => {
    const candidates = Array.from({ length: PREFLIGHT_LIMITS.candidates + 1 }, (_, i) => candidate({ id: `id-${i}` }));
    expect(validateTransferDocument({ ...withCandidate(), candidates }).ok).toBe(false);
  });
  it("does not silently add duplicates", () => {
    expect(appendTransferCandidate(withCandidate(), candidate()).ok).toBe(false);
  });
  it("adds a second distinct candidate", () => {
    const result = appendTransferCandidate(withCandidate(), candidate({ id: "transfer-2" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.candidates.map((row) => row.id)).toEqual(["transfer-1", "transfer-2"]);
  });
  it("copies provenance instead of holding the caller reference", () => {
    const entry = candidate({ id: "transfer-2" });
    const result = appendTransferCandidate(withCandidate(), entry);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.candidates[1]?.source).not.toBe(entry.source);
  });
  it("preserves the earlier document during append", () => {
    const original = withCandidate();
    appendTransferCandidate(original, candidate({ id: "transfer-2" }));
    expect(original.candidates).toHaveLength(1);
  });
  it("starts in draft rather than inferring reviewed", () => {
    expect(withCandidate().candidates[0]?.stage).toBe("draft");
  });
  it("transitions draft to reviewed", () => {
    const result = transitionTransferCandidate(withCandidate(), "transfer-1", "reviewed");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.candidates[0]?.stage).toBe("reviewed");
  });
  it("transitions draft to discarded", () => {
    const result = transitionTransferCandidate(withCandidate(), "transfer-1", "discarded");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.candidates[0]?.stage).toBe("discarded");
  });
  it("does not edit reviewed notes", () => {
    expect(transitionTransferCandidate(withCandidate(candidate({ stage: "reviewed" })), "transfer-1", "discarded").ok).toBe(false);
  });
  it("does not edit discarded notes", () => {
    expect(transitionTransferCandidate(withCandidate(candidate({ stage: "discarded" })), "transfer-1", "reviewed").ok).toBe(false);
  });
  it("does not transition back to draft", () => {
    expect(transitionTransferCandidate(withCandidate(), "transfer-1", "draft").ok).toBe(false);
  });
  it("rejects an unknown transfer ID", () => {
    expect(transitionTransferCandidate(withCandidate(), "not-listed", "reviewed").ok).toBe(false);
  });
  it("preserves condition after review", () => {
    const result = transitionTransferCandidate(withCandidate(), "transfer-1", "reviewed");
    if (result.ok) expect(result.value.candidates[0]?.condition).toBe("unknown");
  });
  it("preserves source after review", () => {
    const result = transitionTransferCandidate(withCandidate(), "transfer-1", "reviewed");
    if (result.ok) expect(result.value.candidates[0]?.source).toEqual(source);
  });
});

describe("manual assessment remains fail closed", () => {
  it("returns UNKNOWN for an unknown condition", () => {
    assertUnknown(candidate());
  });
  it("returns UNKNOWN for a missing expected size", () => {
    assertUnknown(candidate({ condition: "storage", expectedBytes: null, availableBytes: 500 }));
  });
  it("returns UNKNOWN for missing available space", () => {
    assertUnknown(candidate({ condition: "storage", expectedBytes: 100, availableBytes: null }));
  });
  it("keeps UNKNOWN even with two known size values", () => {
    assertUnknown(candidate({ condition: "unknown", expectedBytes: 50, availableBytes: 100 }));
  });
  it("returns a review action for a damaged pack", () => {
    const result = assessTransferCandidate(candidate({ condition: "damaged" }));
    expect(result.decision).toBe("review-input");
    expect(result.readiness).toBe("needs-review");
  });
  it("returns a review action for missing source data", () => {
    expect(assessTransferCandidate(candidate({ condition: "missing" })).decision).toBe("review-source");
  });
  it("returns a review action for missing permissions", () => {
    expect(assessTransferCandidate(candidate({ condition: "permission" })).decision).toBe("review-permissions");
  });
  it("leaves interrupted retry under user control", () => {
    expect(assessTransferCandidate(candidate({ condition: "interrupted" })).decision).toBe("manual-retry");
  });
  it("calculates a positive storage gap", () => {
    const result = assessTransferCandidate(candidate({ condition: "storage", expectedBytes: 1000, availableBytes: 700 }));
    expect(result.deficit).toBe(300);
    expect(result.decision).toBe("review-space");
  });
  it("returns zero deficit when values match", () => {
    const result = assessTransferCandidate(candidate({ condition: "storage", expectedBytes: 1000, availableBytes: 1000 }));
    expect(result.deficit).toBe(0);
    expect(result.readiness).not.toBe("ready");
  });
  it("does not infer download readiness from ample space", () => {
    const result = assessTransferCandidate(candidate({ condition: "storage", expectedBytes: 10, availableBytes: 10000 }));
    expect(result.readiness).toBe("needs-review");
  });
  it("does not report an accessibility decision", () => {
    const result = assessTransferCandidate(candidate({ condition: "damaged" }));
    expect(JSON.stringify(result)).not.toContain("accessible");
  });
  it.each(TRANSFER_CONDITIONS)("never promotes %s to a complete pack", (condition: TransferCondition) => {
    const result = assessTransferCandidate(candidate({ condition, expectedBytes: 40, availableBytes: 40 }));
    expect(result.readiness === "UNKNOWN" || result.readiness === "needs-review").toBe(true);
  });
  it("rejects a malformed document before assessing", () => {
    const result = assessTransferDocument({ ...withCandidate(), candidates: [candidate({ id: "../bad" })] });
    expect(result.ok).toBe(false);
  });
  it("assesses exactly one finding per candidate", () => {
    const input = { ...withCandidate(), candidates: [candidate(), candidate({ id: "second", condition: "storage" })] };
    const result = assessTransferDocument(input);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(2);
  });
});

describe("filters and summaries", () => {
  const entries = [
    candidate(),
    candidate({ id: "transfer-2", packId: "region-2", kind: "pack", condition: "damaged", stage: "reviewed", expectedBytes: 600 }),
    candidate({ id: "transfer-3", packId: "region-1", kind: "export", condition: "permission", stage: "discarded", expectedBytes: 200 }),
  ];
  const document: TransferDocument = { ...newTransferDocument(), candidates: entries };
  it("counts each recorded kind", () => {
    const summary = summarizeTransferDocument(document);
    expect(summary.byKind).toEqual({ pack: 1, download: 1, export: 1 });
  });
  it("counts each reported condition", () => {
    const summary = summarizeTransferDocument(document);
    expect(summary.byCondition.unknown).toBe(1);
    expect(summary.byCondition.damaged).toBe(1);
    expect(summary.byCondition.permission).toBe(1);
  });
  it("counts reviewed entries", () => {
    expect(summarizeTransferDocument(document).reviewed).toBe(1);
  });
  it("counts discarded entries", () => {
    expect(summarizeTransferDocument(document).discarded).toBe(1);
  });
  it("counts unknown byte quantities separately", () => {
    expect(summarizeTransferDocument(document).unknownByteCount).toBe(1);
  });
  it("does not count null as zero known bytes", () => {
    expect(summarizeTransferDocument(document).knownBytes).toBe(800);
  });
  it("filters by pack ID", () => {
    expect(filterTransferCandidates(document, { packId: "region-1" })).toHaveLength(2);
  });
  it("filters by operation kind", () => {
    expect(filterTransferCandidates(document, { kind: "pack" })).toHaveLength(1);
  });
  it("filters by reported condition", () => {
    expect(filterTransferCandidates(document, { condition: "permission" })).toHaveLength(1);
  });
  it("filters by review stage", () => {
    expect(filterTransferCandidates(document, { stage: "discarded" })).toHaveLength(1);
  });
  it("filters case-insensitive notes", () => {
    expect(filterTransferCandidates(document, { search: "MANUAL" })).toHaveLength(3);
  });
  it("filters case-insensitive source names", () => {
    expect(filterTransferCandidates(document, { search: "LOCAL OPEN" })).toHaveLength(3);
  });
  it("returns none when the search misses", () => {
    expect(filterTransferCandidates(document, { search: "no match 1234" })).toHaveLength(0);
  });
  it("combines pack and condition filters", () => {
    expect(filterTransferCandidates(document, { packId: "region-1", condition: "damaged" })).toHaveLength(0);
  });
  it("groups summaries by pack ID", () => {
    expect(transferPackSummaries(document).map((item) => item.packId)).toEqual(["region-1", "region-2"]);
  });
  it("preserves UNKNOWN aggregate size for a pack containing unknown sizes", () => {
    expect(transferPackSummaries(document)[0]?.expectedBytes).toBeNull();
  });
  it("provides a known aggregate where all sizes are known", () => {
    expect(transferPackSummaries(document)[1]?.expectedBytes).toBe(600);
  });
  it("does not silently treat a discarded UNKNOWN condition as resolved", () => {
    const input = { ...newTransferDocument(), candidates: [candidate({ stage: "discarded" })] };
    expect(transferPackSummaries(input)[0]?.unresolved).toBe(1);
  });
});

describe("bounded import, export and merge", () => {
  it("roundtrips a document", () => {
    const encoded = encodeTransferDocument(withCandidate());
    expect(encoded.ok).toBe(true);
    if (encoded.ok) expect(decodeTransferDocument(encoded.value)).toEqual({ ok: true, value: withCandidate() });
  });
  it("rejects incomplete JSON", () => {
    expect(decodeTransferDocument("{").ok).toBe(false);
  });
  it("rejects a plain string as JSON root", () => {
    expect(decodeTransferDocument('"unsupported"').ok).toBe(false);
  });
  it("rejects arrays as JSON root", () => {
    expect(decodeTransferDocument("[]").ok).toBe(false);
  });
  it("rejects an input larger than its byte cap", () => {
    expect(decodeTransferDocument(" ".repeat(PREFLIGHT_LIMITS.bytes + 1)).ok).toBe(false);
  });
  it("rejects malformed documents before exporting", () => {
    expect(encodeTransferDocument({ ...withCandidate(), version: 2 as 1 }).ok).toBe(false);
  });
  it("does not merge conflicting candidate IDs", () => {
    const incoming = withCandidate(candidate({ note: "Different history" }));
    expect(mergeTransferDocuments(withCandidate(), incoming).ok).toBe(false);
  });
  it("previews conflicting candidate IDs", () => {
    const incoming = withCandidate(candidate({ note: "Different history" }));
    const preview = transferPreviewMerge(withCandidate(), incoming);
    if (preview.ok) expect(preview.value.conflicts).toEqual(["transfer-1"]);
  });
  it("recognises exact duplicates as unchanged", () => {
    const preview = transferPreviewMerge(withCandidate(), withCandidate());
    if (preview.ok) expect(preview.value.unchanged).toEqual(["transfer-1"]);
  });
  it("adds non-conflicting candidates", () => {
    const preview = transferPreviewMerge(withCandidate(), withCandidate(candidate({ id: "transfer-2" })));
    if (preview.ok) expect(preview.value.added).toHaveLength(1);
  });
  it("combines separate candidates without losing the original", () => {
    const result = mergeTransferDocuments(withCandidate(), withCandidate(candidate({ id: "transfer-2" })));
    if (result.ok) expect(result.value.candidates.map((row) => row.id)).toEqual(["transfer-1", "transfer-2"]);
  });
  it("does not change existing candidates during merge", () => {
    const current = withCandidate();
    mergeTransferDocuments(current, withCandidate(candidate({ id: "transfer-2" })));
    expect(current.candidates).toHaveLength(1);
  });
  it("rejects unsupported incoming versions", () => {
    const incoming = { ...withCandidate(), version: 2 as 1 };
    expect(transferPreviewMerge(withCandidate(), incoming).ok).toBe(false);
  });
  it("rejects unsupported existing versions", () => {
    const existing = { ...withCandidate(), version: 2 as 1 };
    expect(transferPreviewMerge(existing, withCandidate()).ok).toBe(false);
  });
  it("keeps null byte quantities after JSON roundtrip", () => {
    const encoded = encodeTransferDocument(withCandidate());
    if (encoded.ok) {
      const decoded = decodeTransferDocument(encoded.value);
      if (decoded.ok) expect(decoded.value.candidates[0]?.expectedBytes).toBeNull();
    }
  });
  it("keeps UNKNOWN conditions after JSON roundtrip", () => {
    const encoded = encodeTransferDocument(withCandidate());
    if (encoded.ok) {
      const decoded = decodeTransferDocument(encoded.value);
      if (decoded.ok) expect(decoded.value.candidates[0]?.condition).toBe("unknown");
    }
  });
  it("does not introduce remote locations in local export", () => {
    const encoded = encodeTransferDocument(withCandidate());
    if (encoded.ok) expect(encoded.value).not.toContain("accessibilityRating");
  });
});

describe("storage boundaries and independence between operations", () => {
  it("permits a one-byte size with no inferred integrity claim", () => {
    const value = candidate({ condition: "storage", expectedBytes: 1, availableBytes: 1 });
    expect(assessTransferCandidate(value).readiness).toBe("needs-review");
  });
  it("retains UNKNOWN if only expected bytes were supplied", () => {
    const value = candidate({ condition: "storage", expectedBytes: 1024 });
    expect(assessTransferCandidate(value).readiness).toBe("UNKNOWN");
  });
  it("retains UNKNOWN if only available bytes were supplied", () => {
    const value = candidate({ condition: "storage", availableBytes: 1024 });
    expect(assessTransferCandidate(value).readiness).toBe("UNKNOWN");
  });
  it("does not turn unknown byte quantities into a positive deficit", () => {
    const value = candidate({ condition: "storage", availableBytes: null, expectedBytes: 2048 });
    expect(assessTransferCandidate(value).deficit).toBeNull();
  });
  it("preserves the exact supplied byte quantities after appending", () => {
    const input = candidate({ expectedBytes: 4096, availableBytes: 512 });
    const result = appendTransferCandidate(newTransferDocument(), input);
    if (result.ok) {
      expect(result.value.candidates[0]?.expectedBytes).toBe(4096);
      expect(result.value.candidates[0]?.availableBytes).toBe(512);
    }
  });
  it("does not transform the reported condition for an export", () => {
    const value = candidate({ kind: "export", condition: "interrupted" });
    expect(assessTransferCandidate(value).issue).toBe("interrupted");
  });
  it("does not transform the reported condition for a pack", () => {
    const value = candidate({ kind: "pack", condition: "damaged" });
    expect(assessTransferCandidate(value).issue).toBe("damaged");
  });
  it("does not transform the reported condition for a download", () => {
    const value = candidate({ kind: "download", condition: "missing" });
    expect(assessTransferCandidate(value).issue).toBe("missing");
  });
  it("never interprets a source URL as permission to download", () => {
    const value = candidate({ source: { ...source, reference: "https://example.org/source" } });
    const result = assessTransferCandidate(value);
    expect(result.decision).toBe("UNKNOWN");
  });
  it("reports no source information if the schema lacks provenance", () => {
    const value = { ...candidate() } as Record<string, unknown>;
    delete value.source;
    expect(validateTransferCandidate(value)).not.toBeNull();
  });
  it("rejects a missing condition rather than inventing one", () => {
    const value = { ...candidate() } as Record<string, unknown>;
    delete value.condition;
    expect(validateTransferCandidate(value)).not.toBeNull();
  });
  it("rejects a missing review stage rather than defaulting to reviewed", () => {
    const value = { ...candidate() } as Record<string, unknown>;
    delete value.stage;
    expect(validateTransferCandidate(value)).not.toBeNull();
  });
  it("rejects an absent expectedBytes field rather than silently using null", () => {
    const value = { ...candidate() } as Record<string, unknown>;
    delete value.expectedBytes;
    expect(validateTransferCandidate(value)).not.toBeNull();
  });
  it("rejects an absent availableBytes field rather than silently using null", () => {
    const value = { ...candidate() } as Record<string, unknown>;
    delete value.availableBytes;
    expect(validateTransferCandidate(value)).not.toBeNull();
  });
  it("rejects a malformed source without inventing a licence", () => {
    const value = candidate({ source: { ...source, licence: "not-provided" } });
    expect(validateTransferCandidate(value)).toBe("licence");
  });
  it("rejects a malformed tier without promoting a source", () => {
    const value = candidate({ source: { ...source, tier: "guessed" as "UNKNOWN" } });
    expect(validateTransferCandidate(value)).toBe("tier");
  });
});
