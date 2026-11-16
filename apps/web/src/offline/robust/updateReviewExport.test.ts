import { describe, expect, it } from "vitest";
import { type RegionAssessment } from "./updateAssessment";
import { type Provenance } from "./regionDownload";
import {
  createUpdateReview, encodeUpdateReview, formatUpdateReview,
  safeReviewText, updateReviewFilename, type UpdateReviewReport,
} from "./updateReviewExport";

/** A fixture element must exist; fail the test rather than accepting undefined. */
function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing test fixture element");
  return value;
}

const provenance: Provenance = {
  source: "Ontario open data",
  licence: "CC BY 4.0",
  date: "2026-03-02",
};
const assessment: RegionAssessment = {
  regionId: "central",
  status: "partial",
  rows: [
    {
      id: "alpha", kind: "saved", severity: "information", offlineStatus: "saved",
      expectedBytes: 200, expected: provenance, observed: provenance, advice: "none",
    },
    {
      id: "beta", kind: "not-downloaded", severity: "attention", offlineStatus: "UNKNOWN",
      expectedBytes: 300, expected: provenance, observed: null, advice: "download",
    },
  ],
  counts: { saved: 1, unknown: 1, missing: 1, stale: 0, unreadable: 0, unlisted: 0 },
  listedBytes: 500,
  savedBytes: 200,
  remainingBytes: 300,
  sources: [provenance],
  notes: [],
};

function report(): UpdateReviewReport {
  return createUpdateReview(assessment, { quota: 2_000_000, usage: 0 }, "2026-11-16");
}

describe("local offline update review report", () => {
  it("exports provenance but never raw offline bytes", () => {
    const result = report();
    expect(required(result.cells[0]).source).toEqual(provenance);
    expect(required(result.cells[0]).expectedBytes).toBe(200);
    const json = encodeUpdateReview(result);
    expect(json).not.toContain("Uint8Array");
    expect(json).not.toContain("base64");
    expect(json).not.toContain("data:application");
    expect(json).toContain("Ontario open data");
    expect(json).toContain("CC BY 4.0");
    expect(json).toContain("2026-03-02");
  });

  it("uses a versioned local metadata schema", () => {
    const result = report();
    expect(result.schema).toBe("local-offline-copy-review-v1");
    expect(result.reportDate).toBe("2026-11-16");
    expect(result.state).toBe("partial");
    expect(result.listed).toBe(2);
    expect(result.saved).toBe(1);
    expect(result.unknown).toBe(1);
  });

  it("uses UNKNOWN if the estimate is absent", () => {
    const result = createUpdateReview(assessment, {}, "2026-11-16");
    expect(result.budget).toBe("UNKNOWN");
    expect(result.estimatedFreeBytes).toBeNull();
    expect(result.remainingBytes).toBe(300);
  });

  it("retains UNKNOWN for a missing cell even if estimated space is ample", () => {
    const result = report();
    expect(result.budget).toBe("yes");
    expect(required(result.cells[1]).status).toBe("UNKNOWN");
    expect(required(result.cells[1]).reason).toBe("not-downloaded");
  });

  it("rejects dates that could not appear on a calendar", () => {
    for (const date of ["", "2026-02-30", "2026-13-01", "2026-4-2", "2026-11-16\nother"]) {
      expect(() => createUpdateReview(assessment, {}, date)).toThrow();
    }
  });

  it("allows leap day in a leap year", () => {
    expect(createUpdateReview(assessment, {}, "2024-02-29").reportDate).toBe("2024-02-29");
  });

  it("keeps field order stable for deterministic comparison", () => {
    const first = encodeUpdateReview(report());
    const second = encodeUpdateReview(report());
    expect(first).toBe(second);
    expect(first.endsWith("\n")).toBe(true);
    expect(JSON.parse(first)).toMatchObject({ listed: 2, saved: 1, unknown: 1 });
  });

  it("renders English summary and cell-level UNKNOWN", () => {
    const text = formatUpdateReview(report(), "en");
    expect(text).toContain("Offline copy review");
    expect(text).toContain("Cells with UNKNOWN status: 1");
    expect(text).toContain("beta");
    expect(text).toContain("CC BY 4.0");
    expect(text).toContain("Ontario open data");
  });

  it("renders French labels with nonbreaking spaces", () => {
    const text = formatUpdateReview(report(), "fr");
    expect(text).toContain("Examen des copies hors ligne");
    expect(text).toContain("Cellules à état INCONNU\u00a0: 1");
    expect(text).toContain("Licence\u00a0: CC BY 4.0");
    expect(text).toContain("Date des données\u00a0: 2026-03-02");
  });

  it("rejects newlines and bidirectional control characters in text exports", () => {
    const source = "source\u202ehidden\nnext\t";
    const altered = { ...report(), cells: [{ ...required(report().cells[0]), source: { ...provenance, source } }] };
    const text = formatUpdateReview(altered, "en");
    expect(text).not.toContain("\u202e");
    expect(text).toContain("source hidden next");
    expect(safeReviewText("a\r\nb\t")).toBe("a  b ");
  });

  it("reports source changes with both observed and current metadata", () => {
    const older = { ...provenance, date: "2025-03-02" };
    const changed = {
      ...report(),
      cells: [{ ...required(report().cells[0]), reason: "metadata-changed" as const, observed: older }],
    };
    const english = formatUpdateReview(changed, "en");
    const french = formatUpdateReview(changed, "fr");
    expect(english).toContain("2025-03-02");
    expect(english).toContain("2026-03-02");
    expect(french).toContain("2025-03-02");
  });

  it("generates safe filenames from hostile region labels", () => {
    expect(updateReviewFilename("a/../../B C", "2026-11-16", "txt")).toBe(
      "offline-review-a-b-c-2026-11-16.txt",
    );
    expect(updateReviewFilename("", "2026-11-16", "json")).toBe(
      "offline-review-region-2026-11-16.json",
    );
  });

  it("bounds filename length and discards date path fragments", () => {
    const long = updateReviewFilename("x".repeat(1000), "../../x", "json");
    expect(long.length).toBeLessThan(115);
    expect(long).toContain("unknown-date.json");
  });

  it("retains the source and licence when another cell is unavailable", () => {
    const unknown = createUpdateReview({ ...assessment, status: "UNKNOWN" }, {}, "2026-11-16");
    expect(unknown.state).toBe("UNKNOWN");
    expect(required(unknown.cells[1]).source).toEqual(provenance);
  });

  it("does not invent publication dates for an unlisted cell", () => {
    const altered = {
      ...assessment,
      rows: [{
        id: "unlisted", kind: "unlisted" as const, severity: "unknown" as const,
        offlineStatus: "UNKNOWN" as const, expectedBytes: null, expected: null,
        observed: null, advice: "inspect" as const,
      }],
    };
    const record = required(createUpdateReview(altered, {}, "2026-11-16").cells[0]);
    expect(record.source).toBeNull();
    expect(record.expectedBytes).toBeNull();
    expect(formatUpdateReview({ ...report(), cells: [record] }, "en")).toContain("Source: UNKNOWN");
  });
});
