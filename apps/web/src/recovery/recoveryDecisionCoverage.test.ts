import { describe, expect, it } from "vitest";
import {
  coverageDetails, coverageWarnings, decisionCoverage,
  type CoverageLine,
} from "./recoveryDecisionCoverage";
import {
  MATRIX_OPERATIONS, addMatrixReview, type MatrixCandidate,
  type MatrixDocument, type MatrixReview,
} from "./recoveryDecisionMatrix";

const make = (id: string, patch: Partial<MatrixCandidate> = {}): MatrixCandidate => ({
  id, packId: "region-1", operation: "pack", condition: "UNKNOWN", choice: "inspect",
  reason: "Local issue", createdAt: "2026-11-19T12:00:00.000Z",
  source: { name: "Source A", licence: "CC0-1.0", date: "2026-11-18", tier: "UNKNOWN", reference: "" },
  ...patch,
});
const doc = (...candidates: MatrixCandidate[]): MatrixDocument => ({
  format: "local-recovery-decision-matrix", version: 1, candidates, reviews: [],
});
const review: MatrixReview = {
  id: "review-1", candidateId: "item-1", status: "reviewed", note: "",
  at: "2026-11-19T12:01:00.000Z",
};
const row = (items: readonly MatrixCandidate[], operation = "pack" as const): CoverageLine => {
  const result = decisionCoverage(doc(...items), { packIds: ["region-1"], operations: [operation] });
  expect(result.ok).toBe(true);
  const first = result.lines[0];
  if (!first) throw new Error("No coverage row");
  return first;
};

describe("field coverage never infers readiness", () => {
  it("has no rows for a fully empty default query", () => {
    expect(decisionCoverage(doc()).lines).toEqual([]);
  });
  it("can report missing pairs explicitly", () => {
    const report = decisionCoverage(doc(), { packIds: ["region-1"] });
    expect(report.lines).toHaveLength(3);
    expect(report.lines.every((line) => line.finding === "UNKNOWN")).toBe(true);
  });
  it("returns UNKNOWN when a pack has only a missing condition", () => {
    expect(row([make("item-1")]).finding).toBe("UNKNOWN");
  });
  it("keeps UNKNOWN when a second source reports the same unknown", () => {
    expect(row([make("item-1"), make("item-2", { source: { ...make("item-2").source, name: "Source B" } })]).finding).toBe("UNKNOWN");
  });
  it("records a distinct known single source", () => {
    expect(row([make("item-1", { condition: "missing" })]).finding).toBe("single-source");
  });
  it("does not count UNKNOWN as a supporting source", () => {
    const item = row([make("item-1")]);
    expect(item.sourceCount).toBe(0);
  });
  it("counts one recorded source once", () => {
    const item = row([make("item-1", { condition: "damaged" })]);
    expect(item.sourceCount).toBe(1);
  });
  it("combines the same source's two statements without extra support", () => {
    const item = row([make("item-1", { condition: "damaged" }), make("item-2", { condition: "damaged" })]);
    expect(item.sourceCount).toBe(1);
  });
  it("distinguishes two different sources that agree", () => {
    const a = make("item-1", { condition: "missing" });
    const b = make("item-2", { condition: "missing", source: { ...a.source, name: "Source B" } });
    const item = row([a, b]);
    expect(item.finding).toBe("multiple-sources");
    expect(item.sourceCount).toBe(2);
  });
  it("does not suppress contradictory reports", () => {
    const item = row([make("item-1", { condition: "missing" }), make("item-2", { condition: "damaged" })]);
    expect(item.finding).toBe("disputed");
  });
  it("does not resolve two different reports by majority", () => {
    const item = row([
      make("item-1", { condition: "missing" }),
      make("item-2", { condition: "missing" }),
      make("item-3", { condition: "damaged" }),
    ]);
    expect(item.finding).toBe("disputed");
  });
  it("does not let review state erase a dispute", () => {
    const original = doc(make("item-1", { condition: "missing" }), make("item-2", { condition: "damaged" }));
    const revised = addMatrixReview(original, review);
    expect(revised.ok).toBe(true);
    if (revised.ok) expect(decisionCoverage(revised.value).lines[0]?.finding).toBe("disputed");
  });
  it("does not turn a deferred entry into an absent one", () => {
    const original = doc(make("item-1", { condition: "damaged" }));
    const revised = addMatrixReview(original, { ...review, status: "deferred" });
    expect(revised.ok).toBe(true);
    if (revised.ok) expect(decisionCoverage(revised.value).lines[0]?.deferred).toBe(1);
  });
});

describe("source and tier reconciliation", () => {
  it("reports candidate totals", () => expect(row([make("item-1"), make("item-2")]).candidateCount).toBe(2));
  it("reports unknown totals", () => expect(row([make("item-1"), make("item-2", { condition: "damaged" })]).unknown).toBe(1));
  it("records the latest known source date", () => {
    const items = [make("item-1"), make("item-2", { source: { ...make("item-2").source, date: "2026-11-19" } })];
    expect(row(items).latestSourceDate).toBe("2026-11-19");
  });
  it("does not synthesize a date for no entries", () => expect(row([]).latestSourceDate).toBeNull());
  it("retains the literal UNKNOWN tier", () => expect(row([make("item-1")]).tiers).toContain("UNKNOWN"));
  it("retains source-document tier", () => {
    expect(row([make("item-1", { source: { ...make("item-1").source, tier: "source-document" } })]).tiers).toContain("source-document");
  });
  it("does not invent extra tiers", () => {
    expect(row([make("item-1")]).tiers).toEqual(["UNKNOWN"]);
  });
  it("deduplicates source tiers", () => {
    const result = row([make("item-1"), make("item-2")]);
    expect(result.tiers).toEqual(["UNKNOWN"]);
  });
  it("counts unknown tier in the summary", () => {
    const result = decisionCoverage(doc(make("item-1")));
    expect(result.summary.byTier.UNKNOWN).toBe(1);
  });
  it("counts an explicitly provided tier", () => {
    const item = make("item-1", { source: { ...make("item-1").source, tier: "file-metadata" } });
    expect(decisionCoverage(doc(item)).summary.byTier["file-metadata"]).toBe(1);
  });
  it("does not treat file metadata as an accessibility result", () => {
    const result = decisionCoverage(doc(make("item-1", { source: { ...make("item-1").source, tier: "file-metadata" } })));
    expect(result.lines[0]?.finding).toBe("UNKNOWN");
  });
});

describe("request filters and output shape", () => {
  const a = make("item-1");
  const b = make("item-2", { packId: "region-2", operation: "download", condition: "damaged" });
  const c = make("item-3", { packId: "region-3", operation: "export", condition: "storage" });
  const document = doc(a, b, c);
  it("generates one row per pack and operation", () => expect(decisionCoverage(document).lines).toHaveLength(9));
  it("generates three rows for a selected pack", () => {
    expect(decisionCoverage(document, { packIds: ["region-2"] }).lines).toHaveLength(3);
  });
  it("generates one row for a selected operation", () => {
    expect(decisionCoverage(document, { packIds: ["region-2"], operations: ["download"] }).lines).toHaveLength(1);
  });
  it("returns zero rows for no selected operations", () => {
    expect(decisionCoverage(document, { operations: [] }).lines).toHaveLength(0);
  });
  it("deduplicates repeated pack IDs", () => {
    expect(decisionCoverage(document, { packIds: ["region-2", "region-2"] }).lines).toHaveLength(3);
  });
  it("deduplicates repeated operations", () => {
    expect(decisionCoverage(document, { packIds: ["region-2"], operations: ["pack", "pack"] }).lines).toHaveLength(1);
  });
  it("sorts pack IDs predictably", () => {
    const result = decisionCoverage(document, { packIds: ["region-3", "region-1", "region-2"], operations: ["pack"] });
    expect(result.lines.map((line) => line.packId)).toEqual(["region-1", "region-2", "region-3"]);
  });
  it("preserves operation order from the domain", () => {
    const result = decisionCoverage(document, { packIds: ["region-1"] });
    expect(result.lines.map((line) => line.operation)).toEqual([...MATRIX_OPERATIONS]);
  });
  it("rejects invalid requested operation", () => {
    const result = decisionCoverage(document, { operations: ["unsupported" as never] });
    expect(result.ok).toBe(false);
    expect(result.lines).toEqual([]);
  });
  it("rejects empty requested pack ID", () => expect(decisionCoverage(document, { packIds: [""] }).ok).toBe(false));
  it("reports number of known packs", () => expect(decisionCoverage(document).summary.knownPacks).toBe(3));
  it("does not count a requested pack as a known data record", () => {
    const result = decisionCoverage(document, { packIds: ["unlisted"] });
    expect(result.lines.every((line) => line.finding === "UNKNOWN")).toBe(true);
  });
  it("reports three kinds of source tiers separately", () => {
    const result = decisionCoverage(document);
    expect(Object.keys(result.summary.byTier)).toEqual(["UNKNOWN", "user-observation", "source-document", "file-metadata"]);
  });
});

describe("coverage details", () => {
  const a = make("item-1", { condition: "missing" });
  const b = make("item-2", { packId: "region-2", operation: "download", condition: "damaged" });
  const document = doc(a, b);
  it("lists the exact local source", () => {
    expect(coverageDetails(document, "region-1")[0]?.source).toBe(a.source.name);
  });
  it("includes open licence on each detail", () => expect(coverageDetails(document, "region-1")[0]?.licence).toBe("CC0-1.0"));
  it("includes source date on each detail", () => expect(coverageDetails(document, "region-1")[0]?.date).toBe("2026-11-18"));
  it("includes the explicit tier", () => expect(coverageDetails(document, "region-1")[0]?.tier).toBe("UNKNOWN"));
  it("includes the user-reported condition", () => expect(coverageDetails(document, "region-1")[0]?.condition).toBe("missing"));
  it("includes the corresponding status", () => expect(coverageDetails(document, "region-1")[0]?.status).toBe("draft"));
  it("lists records for a requested pack", () => expect(coverageDetails(document, "region-2")).toHaveLength(1));
  it("filters by operation", () => expect(coverageDetails(document, "region-2", "pack")).toEqual([]));
  it("returns no details for unknown pack", () => expect(coverageDetails(document, "not-listed")).toEqual([]));
  it("rejects malformed document rather than guessing details", () => {
    const malformed = { ...document, version: 7 } as unknown as MatrixDocument;
    expect(coverageDetails(malformed, "region-1")).toEqual([]);
  });
});

describe("coverage warnings", () => {
  const disputed: CoverageLine = {
    packId: "region-1", operation: "pack", finding: "disputed", sourceCount: 2,
    candidateCount: 2, reviewed: 0, deferred: 0, unknown: 0,
    conditions: ["damaged", "missing"], latestSourceDate: "2026-11-19", tiers: ["UNKNOWN"],
  };
  const unknown: CoverageLine = { ...disputed, finding: "UNKNOWN", operation: "download", unknown: 1 };
  it("produces one warning for disputed statements", () => expect(coverageWarnings([disputed])).toEqual(["region-1/pack:conflict"]));
  it("produces one warning for UNKNOWN", () => expect(coverageWarnings([unknown])).toEqual(["region-1/download:UNKNOWN"]));
  it("marks deferred entries separately", () => {
    expect(coverageWarnings([{ ...disputed, finding: "single-source", deferred: 1 }])).toEqual(["region-1/pack:deferred"]);
  });
  it("can report UNKNOWN and deferral on the same row", () => {
    expect(coverageWarnings([{ ...unknown, deferred: 1 }])).toEqual(["region-1/download:UNKNOWN", "region-1/download:deferred"]);
  });
  it("does not warn for a single non-UNKNOWN report", () => {
    expect(coverageWarnings([{ ...disputed, finding: "single-source" }])).toEqual([]);
  });
  it("does not warn merely because sources agree", () => {
    expect(coverageWarnings([{ ...disputed, finding: "multiple-sources" }])).toEqual([]);
  });
  it("does not mutate the provided rows", () => {
    const input = [unknown, disputed];
    const raw = JSON.stringify(input);
    coverageWarnings(input);
    expect(JSON.stringify(input)).toBe(raw);
  });
  it("preserves stable ordering in warnings", () => {
    expect(coverageWarnings([unknown, disputed])[0]).toBe("region-1/download:UNKNOWN");
  });
});

describe("summary counts and malformed documents", () => {
  const first = make("item-1", { condition: "missing" });
  const second = make("item-2", { packId: "region-2", condition: "damaged" });
  const third = make("item-3", { packId: "region-3" });
  const document = doc(first, second, third);
  it("counts single-source rows", () => expect(decisionCoverage(document).summary.singleSource).toBe(2));
  it("counts all missing operation rows as UNKNOWN", () => expect(decisionCoverage(document).summary.unknown).toBe(7));
  it("counts no disputes when conditions are isolated", () => expect(decisionCoverage(document).summary.disputed).toBe(0));
  it("counts no review events when none exist", () => expect(decisionCoverage(document).summary.reviewed).toBe(0));
  it("counts no deferrals when none exist", () => expect(decisionCoverage(document).summary.deferred).toBe(0));
  it("reports the fixed operation count", () => expect(decisionCoverage(document).summary.rows).toBe(9));
  it("rejects malformed input without throwing", () => {
    const result = decisionCoverage({ ...document, candidates: [null] } as unknown as MatrixDocument);
    expect(result.ok).toBe(false);
    expect(result.lines).toEqual([]);
  });
  it("rejects unsupported schema version", () => {
    const result = decisionCoverage({ ...document, version: 2 } as unknown as MatrixDocument);
    expect(result.ok).toBe(false);
  });
  it("does not reuse a previous result on malformed input", () => {
    const valid = decisionCoverage(document);
    expect(valid.ok).toBe(true);
    const invalid = decisionCoverage({} as MatrixDocument);
    expect(invalid.summary.rows).toBe(0);
    expect(invalid.summary.knownPacks).toBe(0);
  });
  it("still counts a fully UNKNOWN report as unknown", () => {
    const result = decisionCoverage(doc(make("item-1")), { operations: ["pack"] });
    expect(result.summary.unknown).toBe(1);
  });
});

describe("condition combinations remain conservative", () => {
  const conditions = ["UNKNOWN", "missing", "damaged", "interrupted", "storage", "permission"] as const;
  for (const condition of conditions) {
    it(`returns the original condition when ${condition} is the only report`, () => {
      const result = row([make("item-1", { condition })]);
      expect(result.conditions).toEqual([condition]);
      expect(result.finding).toBe(condition === "UNKNOWN" ? "UNKNOWN" : "single-source");
    });
  }
  for (const condition of conditions.filter((value) => value !== "UNKNOWN")) {
    it(`does not resolve ${condition} when another report is UNKNOWN`, () => {
      const result = row([make("item-1", { condition }), make("item-2")]);
      expect(result.finding).toBe("UNKNOWN");
    });
  }
  for (const condition of conditions.filter((value) => value !== "UNKNOWN" && value !== "damaged")) {
    it(`flags a contradiction between ${condition} and damaged`, () => {
      const result = row([make("item-1", { condition }), make("item-2", { condition: "damaged" })]);
      expect(result.finding).toBe("disputed");
    });
  }
  it("still reports a conflict when the two statements use one source", () => {
    const result = row([make("item-1", { condition: "damaged" }), make("item-2", { condition: "missing" })]);
    expect(result.finding).toBe("disputed");
    expect(result.sourceCount).toBe(1);
  });
  it("does not promote a reported-complete history to content readiness", () => {
    const result = decisionCoverage(doc(make("item-1", { condition: "UNKNOWN" })));
    expect(result.lines[0]?.finding).toBe("UNKNOWN");
  });
});
