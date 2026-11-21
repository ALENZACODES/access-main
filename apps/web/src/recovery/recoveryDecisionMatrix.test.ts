import { describe, expect, it } from "vitest";
import {
  MATRIX_CHOICES, MATRIX_CONDITIONS, MATRIX_LICENCES, MATRIX_LIMITS, MATRIX_OPERATIONS,
  MATRIX_STATUSES, MATRIX_TIERS, addMatrixCandidate, addMatrixReview, emptyMatrix,
  exportMatrix, filterMatrix, groupMatrix, importMatrix, matrixId, matrixInstant,
  matrixSource, matrixStatus, mergeMatrix, nextMatrixId, previewMatrixMerge,
  summarizeMatrix, validateCandidate, validateMatrix, validateReview,
  type MatrixCandidate, type MatrixDocument, type MatrixReview, type MatrixSource,
} from "./recoveryDecisionMatrix";
import { recoveryDecisionCopy } from "./recoveryDecisionCopy";

const source: MatrixSource = {
  name: "Public local record", licence: "CC0-1.0", date: "2026-11-19",
  tier: "UNKNOWN", reference: "Document page 2",
};
const candidate: MatrixCandidate = {
  id: "choice-1", packId: "region-1", operation: "pack", condition: "UNKNOWN",
  choice: "inspect", reason: "File status cannot be determined", source,
  createdAt: "2026-11-19T12:00:00.000Z",
};
const review: MatrixReview = {
  id: "review-1", candidateId: "choice-1", status: "reviewed", note: "Looked at local information",
  at: "2026-11-19T12:01:00.000Z",
};
const withCandidate = (...items: MatrixCandidate[]): MatrixDocument => ({ ...emptyMatrix(), candidates: items });
const withReview = (item: MatrixReview = review): MatrixDocument => ({ ...withCandidate(candidate), reviews: [item] });
const choice = (patch: Partial<MatrixCandidate> = {}): MatrixCandidate => ({ ...candidate, ...patch });
const sourcePatch = (patch: Partial<MatrixSource> = {}): MatrixSource => ({ ...source, ...patch });
const reviewPatch = (patch: Partial<MatrixReview> = {}): MatrixReview => ({ ...review, ...patch });
function success<T>(result: { ok: boolean; value?: T }): T {
  expect(result.ok).toBe(true);
  if (!("value" in result) || result.value === undefined) throw new Error("Expected a successful result");
  return result.value;
}

describe("recovery decision matrix baseline", () => {
  it("creates an empty local document", () => {
    expect(emptyMatrix()).toEqual({ format: "local-recovery-decision-matrix", version: 1, candidates: [], reviews: [] });
  });
  it("accepts the empty document", () => expect(validateMatrix(emptyMatrix()).ok).toBe(true));
  it("accepts a candidate with UNKNOWN condition", () => expect(validateCandidate(candidate)).toBeNull());
  it("retains the UNKNOWN source tier", () => expect(matrixSource(source)).toBe(true));
  it("accepts a review", () => expect(validateReview(review)).toBeNull());
  it("never starts any operation", () => {
    const names = JSON.stringify(emptyMatrix());
    expect(names).not.toContain("downloadRegion(");
    expect(names).not.toContain("commitCheckedRegion(");
  });
  it("does not infer pack availability from an outcome", () => {
    const document = withReview();
    expect(JSON.stringify(document)).not.toContain('"ready"');
  });
  it("records only user-selected choices", () => {
    const result = success(addMatrixCandidate(emptyMatrix(), candidate));
    expect(result.candidates).toEqual([candidate]);
  });
  it("keeps the input candidate unchanged", () => {
    const original = JSON.stringify(candidate);
    addMatrixCandidate(emptyMatrix(), candidate);
    expect(JSON.stringify(candidate)).toBe(original);
  });
  it("clones the source metadata", () => {
    const result = success(addMatrixCandidate(emptyMatrix(), candidate));
    expect(result.candidates[0]?.source).toEqual(source);
    expect(result.candidates[0]?.source).not.toBe(source);
  });
  it("defaults a new record to draft", () => expect(matrixStatus(withCandidate(candidate), candidate.id)).toBe("draft"));
  it("exposes the review status", () => expect(matrixStatus(withReview(), candidate.id)).toBe("reviewed"));
  it("reports draft when the requested ID is unknown", () => expect(matrixStatus(emptyMatrix(), "missing")).toBe("draft"));
  it("does not add a review without a matching candidate", () => {
    expect(addMatrixReview(emptyMatrix(), review)).toEqual({ ok: false, issue: "invalid-link" });
  });
  it("does not mutate an existing document when adding", () => {
    const original = withCandidate(candidate);
    const raw = JSON.stringify(original);
    addMatrixReview(original, review);
    expect(JSON.stringify(original)).toBe(raw);
  });
  it("holds the first review as terminal", () => {
    const result = addMatrixReview(withReview(), reviewPatch({ id: "review-2", status: "deferred", at: "2026-11-19T13:00:00.000Z" }));
    expect(result).toEqual({ ok: false, issue: "transition" });
  });
  it("rejects an unsupported copy schema", () => expect(validateMatrix({ format: "other", version: 1, candidates: [], reviews: [] }).ok).toBe(false));
});

describe("identifiers and timestamps", () => {
  for (const id of ["region-1", "a", "A_3", "a.b", "sample-0", "a".repeat(96)]) {
    it(`accepts safe identifier length ${id.length}`, () => expect(matrixId(id)).toBe(true));
  }
  for (const id of ["", ".", "..", "../local", "a/b", "a\\b", "space id", "a".repeat(97), "<tag>", "é", 4, null]) {
    it(`rejects unsafe identifier ${String(id).slice(0, 18)}`, () => expect(matrixId(id)).toBe(false));
  }
  for (const date of ["2026-11-19T12:00:00Z", "2026-11-19T12:00:00.0Z", "2026-11-19T12:00:00.123Z", "2026-02-28T00:00:00Z"]) {
    it(`accepts valid UTC timestamp ${date}`, () => expect(matrixInstant(date)).toBe(true));
  }
  for (const date of ["", "2026-02-31T00:00:00Z", "2026-11-19", "2026-11-19T12:00:00+00:00", "2026-13-01T00:00:00Z", "2026-11-19T24:00:00Z", "2026-11-19T12:00:00.1234Z", 2, null]) {
    it(`rejects invalid UTC timestamp ${String(date)}`, () => expect(matrixInstant(date)).toBe(false));
  }
  it("sorts IDs with a stable local prefix", () => {
    expect(nextMatrixId(withCandidate(candidate), "choice")).toBe("choice-2");
  });
  it("does not reuse review IDs", () => {
    expect(nextMatrixId(withReview(), "review")).toBe("review-2");
  });
});

describe("source metadata safeguards", () => {
  for (const licence of MATRIX_LICENCES) {
    it(`accepts the open licence ${licence}`, () => expect(matrixSource(sourcePatch({ licence }))).toBe(true));
  }
  for (const tier of MATRIX_TIERS) {
    it(`supports tier ${tier} without inference`, () => expect(matrixSource(sourcePatch({ tier }))).toBe(true));
  }
  for (const sourceValue of ["", " ", "\n", "<script>", "a".repeat(181)]) {
    it(`rejects invalid source text of length ${sourceValue.length}`, () => expect(matrixSource(sourcePatch({ name: sourceValue }))).toBe(false));
  }
  for (const date of ["", "2026-02-31", "2026-13-01", "yesterday"]) {
    it(`rejects malformed source date ${date}`, () => expect(matrixSource(sourcePatch({ date }))).toBe(false));
  }
  for (const licence of ["unknown", "proprietary", "all-rights-reserved", "", "CC-BY-NC-4.0"]) {
    it(`rejects unsupported licence ${licence}`, () => expect(matrixSource(sourcePatch({ licence }))).toBe(false));
  }
  it("rejects extra metadata", () => expect(matrixSource({ ...source, secret: "x" })).toBe(false));
  it("rejects missing metadata", () => expect(matrixSource({ name: source.name })).toBe(false));
  it("accepts an empty optional reference", () => expect(matrixSource(sourcePatch({ reference: "" }))).toBe(true));
  it("rejects excessive reference length", () => expect(matrixSource(sourcePatch({ reference: "x".repeat(241) }))).toBe(false));
  it("rejects control characters in references", () => expect(matrixSource(sourcePatch({ reference: "line\n2" }))).toBe(false));
  it("rejects markup in references", () => expect(matrixSource(sourcePatch({ reference: "<img>" }))).toBe(false));
});

describe("candidate schema", () => {
  for (const operation of MATRIX_OPERATIONS) {
    it(`supports operation ${operation}`, () => expect(validateCandidate(choice({ operation }))).toBeNull());
  }
  for (const condition of MATRIX_CONDITIONS) {
    it(`supports reported condition ${condition}`, () => expect(validateCandidate(choice({ condition }))).toBeNull());
  }
  for (const option of MATRIX_CHOICES) {
    it(`supports manual choice ${option}`, () => expect(validateCandidate(choice({ choice: option }))).toBeNull());
  }
  for (const condition of ["complete", "ready", "pass", "available"]) {
    it(`rejects implied readiness condition ${condition}`, () => expect(validateCandidate(choice({ condition: condition as never }))).toBe("condition"));
  }
  for (const operation of ["delete", "publish", "upload", "schedule"]) {
    it(`rejects unsupported operation ${operation}`, () => expect(validateCandidate(choice({ operation: operation as never }))).toBe("format"));
  }
  for (const option of ["complete", "auto-retry", "guaranteed", "clear-database"]) {
    it(`rejects unsupported choice ${option}`, () => expect(validateCandidate(choice({ choice: option as never }))).toBe("choice"));
  }
  it("rejects a missing pack identifier", () => expect(validateCandidate(choice({ packId: "" }))).toBe("identifier"));
  it("rejects an unsafe pack identifier", () => expect(validateCandidate(choice({ packId: "../other" }))).toBe("identifier"));
  it("rejects a missing entry identifier", () => expect(validateCandidate(choice({ id: "" }))).toBe("identifier"));
  it("rejects a missing source", () => expect(validateCandidate(choice({ source: sourcePatch({ name: "" }) }))).toBe("source"));
  it("rejects an invalid timestamp", () => expect(validateCandidate(choice({ createdAt: "later" }))).toBe("date"));
  it("rejects newline in reason", () => expect(validateCandidate(choice({ reason: "a\nb" }))).toBe("text"));
  it("rejects markup in reason", () => expect(validateCandidate(choice({ reason: "<b>" }))).toBe("text"));
  it("accepts optional empty reason", () => expect(validateCandidate(choice({ reason: "" }))).toBeNull());
  it("rejects an overlong reason", () => expect(validateCandidate(choice({ reason: "x".repeat(601) }))).toBe("text"));
  it("rejects an unexpected property", () => expect(validateCandidate({ ...candidate, extra: true })).toBe("format"));
});

describe("review validation and transition policy", () => {
  for (const status of ["reviewed", "deferred"] as const) {
    it(`accepts terminal status ${status}`, () => expect(validateReview(reviewPatch({ status }))).toBeNull());
  }
  for (const status of ["draft", "ready", "approved", "unknown"]) {
    it(`rejects unsupported review state ${status}`, () => expect(validateReview(reviewPatch({ status: status as never }))).toBe("state"));
  }
  it("rejects invalid review ID", () => expect(validateReview(reviewPatch({ id: "../x" }))).toBe("identifier"));
  it("rejects invalid candidate link", () => expect(validateReview(reviewPatch({ candidateId: "<invalid>" }))).toBe("identifier"));
  it("rejects invalid review time", () => expect(validateReview(reviewPatch({ at: "today" }))).toBe("time"));
  it("rejects unsafe note markup", () => expect(validateReview(reviewPatch({ note: "<div>" }))).toBe("text"));
  it("rejects unsafe note control", () => expect(validateReview(reviewPatch({ note: "a\tb" }))).toBe("text"));
  it("accepts a blank review note", () => expect(validateReview(reviewPatch({ note: "" }))).toBeNull());
  it("rejects extra review fields", () => expect(validateReview({ ...review, extra: 1 })).toBe("format"));
  it("rejects duplicate review IDs", () => expect(validateMatrix({ ...withReview(), reviews: [review, review] }).ok).toBe(false));
  it("rejects a review timestamp before the candidate", () => {
    expect(addMatrixReview(withCandidate(candidate), reviewPatch({ at: "2026-11-18T12:00:00.000Z" }))).toEqual({ ok: false, issue: "time" });
  });
  it("rejects a duplicate review ID in the current document", () => {
    expect(addMatrixReview(withReview(), review)).toEqual({ ok: false, issue: "duplicate" });
  });
  it("rejects an additional review after a terminal transition", () => {
    expect(validateMatrix({ ...withReview(), reviews: [review, reviewPatch({ id: "review-2", at: "2026-11-19T14:00:00.000Z" })] }).ok).toBe(false);
  });
  it("records a deferred decision", () => {
    const result = success(addMatrixReview(withCandidate(candidate), reviewPatch({ status: "deferred" })));
    expect(matrixStatus(result, candidate.id)).toBe("deferred");
  });
});

describe("bounded import and export", () => {
  it("round-trips an empty matrix", () => {
    const raw = success(exportMatrix(emptyMatrix()));
    expect(success(importMatrix(raw))).toEqual(emptyMatrix());
  });
  it("round-trips an UNKNOWN matrix", () => {
    const document = withCandidate(candidate);
    const raw = success(exportMatrix(document));
    expect(success(importMatrix(raw))).toEqual(document);
  });
  it("round-trips reviewed history", () => {
    const raw = success(exportMatrix(withReview()));
    expect(success(importMatrix(raw))).toEqual(withReview());
  });
  it("rejects malformed JSON", () => expect(importMatrix("{")).toEqual({ ok: false, issue: "format" }));
  it("rejects too much input", () => expect(importMatrix("x".repeat(MATRIX_LIMITS.bytes + 1))).toEqual({ ok: false, issue: "limit" }));
  it("rejects an incompatible format version", () => expect(validateMatrix({ ...emptyMatrix(), version: 2 }).ok).toBe(false));
  it("rejects extra top-level fields", () => expect(validateMatrix({ ...emptyMatrix(), secret: "data" }).ok).toBe(false));
  it("rejects more than the candidate limit", () => {
    const entries = Array.from({ length: MATRIX_LIMITS.candidates + 1 }, (_, i) => choice({ id: `choice-${i}` }));
    expect(validateMatrix({ ...emptyMatrix(), candidates: entries })).toEqual({ ok: false, issue: "limit" });
  });
  it("rejects more than the review limit", () => {
    const entries = Array.from({ length: MATRIX_LIMITS.reviews + 1 }, (_, i) => reviewPatch({ id: `review-${i}` }));
    expect(validateMatrix({ ...withCandidate(candidate), reviews: entries })).toEqual({ ok: false, issue: "limit" });
  });
  it("does not include private pack contents in an export", () => {
    const raw = success(exportMatrix(withCandidate(candidate)));
    expect(raw).not.toContain("fileBytes");
    expect(raw).not.toContain("locationCoordinates");
    expect(raw).not.toContain("deviceIdentifier");
  });
  it("keeps the supplied source on export", () => {
    const raw = success(exportMatrix(withCandidate(candidate)));
    expect(raw).toContain(source.name);
    expect(raw).toContain(source.licence);
    expect(raw).toContain(source.date);
    expect(raw).toContain(source.tier);
  });
});

describe("conflict-safe merging", () => {
  it("previews one new candidate", () => {
    const result = success(previewMatrixMerge(emptyMatrix(), withCandidate(candidate)));
    expect(result.additions).toEqual([candidate]);
    expect(result.conflicts).toEqual([]);
  });
  it("recognises an unchanged candidate", () => {
    const result = success(previewMatrixMerge(withCandidate(candidate), withCandidate(candidate)));
    expect(result.unchanged).toEqual([candidate.id]);
    expect(result.additions).toEqual([]);
  });
  it("rejects a candidate whose ID refers to a different history", () => {
    const incoming = withCandidate(choice({ reason: "Different reason" }));
    const preview = success(previewMatrixMerge(withCandidate(candidate), incoming));
    expect(preview.conflicts).toEqual([candidate.id]);
    expect(mergeMatrix(withCandidate(candidate), incoming)).toEqual({ ok: false, issue: "conflict" });
  });
  it("appends non-conflicting candidates", () => {
    const incoming = withCandidate(choice({ id: "choice-2" }));
    const result = success(mergeMatrix(withCandidate(candidate), incoming));
    expect(result.candidates.map((item) => item.id)).toEqual(["choice-1", "choice-2"]);
  });
  it("never modifies a local source when merging", () => {
    const original = withCandidate(candidate);
    const saved = JSON.stringify(original);
    mergeMatrix(original, withCandidate(choice({ id: "choice-2" })));
    expect(JSON.stringify(original)).toBe(saved);
  });
  it("preserves UNKNOWN in merged content", () => {
    const result = success(mergeMatrix(withCandidate(candidate), withCandidate(choice({ id: "choice-2" }))));
    expect(result.candidates.every((item) => item.condition === "UNKNOWN")).toBe(true);
  });
  it("recognises identical reviews", () => {
    const result = success(previewMatrixMerge(withReview(), withReview()));
    expect(result.unchanged).toContain("review-1");
  });
  it("blocks a conflicting review ID", () => {
    const incoming = withReview(reviewPatch({ note: "Different note" }));
    const result = success(previewMatrixMerge(withReview(), incoming));
    expect(result.conflicts).toContain(review.id);
  });
  it("does not overwrite a previous terminal review", () => {
    const incoming = { ...withReview(), reviews: [reviewPatch({ id: "review-2", status: "deferred" as const })] };
    const result = success(previewMatrixMerge(withReview(), incoming));
    expect(result.conflicts).toContain("review-2");
  });
  it("imports a new review for an unreviewed candidate", () => {
    const result = success(mergeMatrix(withCandidate(candidate), withReview()));
    expect(matrixStatus(result, candidate.id)).toBe("reviewed");
  });
  it("keeps existing status unchanged during conflicting review merge", () => {
    const original = withReview();
    mergeMatrix(original, { ...withReview(), reviews: [reviewPatch({ id: "review-2", status: "deferred" })] });
    expect(matrixStatus(original, candidate.id)).toBe("reviewed");
  });
});

describe("filters, summaries, and groups", () => {
  const second = choice({ id: "choice-2", packId: "region-2", condition: "damaged", operation: "download", choice: "retry-later", reason: "A saved part was unreadable" });
  const third = choice({ id: "choice-3", packId: "region-1", condition: "storage", operation: "export", choice: "free-space", reason: "Device capacity" });
  const document = withCandidate(candidate, second, third);
  it("reports total entries", () => expect(summarizeMatrix(document).total).toBe(3));
  it("reports the number with UNKNOWN conditions", () => expect(summarizeMatrix(document).unknown).toBe(1));
  it("reports unique packs", () => expect(summarizeMatrix(document).packs).toBe(2));
  it("reports counts by operation", () => expect(summarizeMatrix(document).byOperation).toEqual({ pack: 1, download: 1, export: 1 }));
  it("counts all items as drafts initially", () => expect(summarizeMatrix(document).draft).toBe(3));
  it("filters by pack", () => expect(filterMatrix(document, { packId: "region-1" }).length).toBe(2));
  it("filters by operation", () => expect(filterMatrix(document, { operation: "download" }).map((item) => item.id)).toEqual(["choice-2"]));
  it("filters by condition", () => expect(filterMatrix(document, { condition: "storage" }).map((item) => item.id)).toEqual(["choice-3"]));
  it("filters by UNKNOWN condition", () => expect(filterMatrix(document, { condition: "UNKNOWN" }).map((item) => item.id)).toEqual(["choice-1"]));
  it("filters by draft status", () => expect(filterMatrix(document, { status: "draft" }).length).toBe(3));
  it("filters by case-insensitive text", () => expect(filterMatrix(document, { query: "DEVICE CAPACITY" }).map((item) => item.id)).toEqual(["choice-3"]));
  it("filters by source name", () => expect(filterMatrix(document, { query: "PUBLIC LOCAL" }).length).toBe(3));
  it("filters by source reference", () => expect(filterMatrix(document, { query: "page 2" }).length).toBe(3));
  it("does not invent an UNKNOWN value for missing search matches", () => expect(filterMatrix(document, { query: "unmatched" })).toEqual([]));
  it("sorts groups by pack ID", () => expect(groupMatrix(document).map((item) => item.packId)).toEqual(["region-1", "region-2"]));
  it("preserves UNKNOWN at the grouped level", () => expect(groupMatrix(document)[0]?.unknown).toBe(true));
  it("does not mark a damaged-only pack as UNKNOWN", () => expect(groupMatrix(document)[1]?.unknown).toBe(false));
  it("keeps grouped items in original order", () => expect(groupMatrix(document)[0]?.entries.map((item) => item.id)).toEqual(["choice-1", "choice-3"]));
});

describe("English and French accessibility copy", () => {
  const en = recoveryDecisionCopy("en");
  const fr = recoveryDecisionCopy("fr");
  it("uses the literal UNKNOWN token in English", () => expect(en.unknown).toBe("UNKNOWN"));
  it("uses the literal UNKNOWN token in French", () => expect(fr.unknown).toBe("UNKNOWN"));
  it("preserves UNKNOWN in every translated condition", () => {
    expect(en.conditionNames.UNKNOWN).toBe("UNKNOWN");
    expect(fr.conditionNames.UNKNOWN).toBe("UNKNOWN");
  });
  it("preserves UNKNOWN in every translated tier", () => {
    expect(en.tierNames.UNKNOWN).toBe("UNKNOWN");
    expect(fr.tierNames.UNKNOWN).toBe("UNKNOWN");
  });
  for (const field of ["title", "introduction", "warning", "pack", "operation", "condition", "choice", "source", "licence", "date", "tier", "reference", "reason", "add", "review", "defer", "note", "import", "export", "apply", "cancel", "search", "all", "list", "empty", "status", "total", "unknown", "conflict", "saved", "failed", "staged", "inspect", "events", "matches"] as const) {
    it(`has English and French copy for ${field}`, () => {
      expect(en[field].trim()).not.toBe("");
      expect(fr[field].trim()).not.toBe("");
    });
  }
  for (const operation of MATRIX_OPERATIONS) {
    it(`translates operation ${operation}`, () => {
      expect(en.operationNames[operation].length).toBeGreaterThan(1);
      expect(fr.operationNames[operation].length).toBeGreaterThan(1);
    });
  }
  for (const condition of MATRIX_CONDITIONS) {
    it(`translates condition ${condition}`, () => {
      expect(en.conditionNames[condition].length).toBeGreaterThan(1);
      expect(fr.conditionNames[condition].length).toBeGreaterThan(1);
    });
  }
  for (const option of MATRIX_CHOICES) {
    it(`translates choice ${option}`, () => {
      expect(en.choiceNames[option].length).toBeGreaterThan(1);
      expect(fr.choiceNames[option].length).toBeGreaterThan(1);
    });
  }
  for (const status of MATRIX_STATUSES) {
    it(`translates status ${status}`, () => {
      expect(en.statusNames[status].length).toBeGreaterThan(1);
      expect(fr.statusNames[status].length).toBeGreaterThan(1);
    });
  }
  for (const tier of MATRIX_TIERS) {
    it(`translates tier ${tier}`, () => {
      expect(en.tierNames[tier].length).toBeGreaterThan(1);
      expect(fr.tierNames[tier].length).toBeGreaterThan(1);
    });
  }
  it("keeps the outcome as a manual suggestion", () => {
    expect(en.warning.toLowerCase()).toContain("not proof");
    expect(fr.warning).toContain("UNKNOWN");
  });
  it("does not make a physical-accessibility claim", () => {
    const values = JSON.stringify({ en, fr });
    expect(values).not.toContain("guaranteed access");
    expect(values).not.toContain("accessible locations");
  });
});
