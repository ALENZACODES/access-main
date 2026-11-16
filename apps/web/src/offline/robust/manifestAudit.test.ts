import { describe, expect, it } from "vitest";
import {
  OPEN_LICENCES,
  auditManifest,
  auditCounts,
  findingCounts,
  groupedSources,
  requireAuditedManifest,
  type AuditCode,
  type AuditLimits,
} from "./manifestAudit";
import { type RegionManifest, type RegionCell } from "./regionDownload";

const today = "2026-11-15";
const attribution = { source: "Province public data", licence: "CC BY 4.0", date: "2026-01-01" };
const second = { source: "Municipal open map", licence: "CC0 1.0", date: "2025-05-01" };

function cell(id: string, bytes = 30, provenance = attribution): RegionCell {
  return { id, bytes, provenance };
}
function region(...cells: RegionCell[]): RegionManifest {
  return { regionId: "ontario-sample", cells };
}
function issues(manifest: RegionManifest): AuditCode[] {
  return auditManifest(manifest, today).findings.map((finding) => finding.code);
}

describe("open-source metadata audit", () => {
  it("accepts a finite, documented open-data manifest", () => {
    const manifest = region(cell("one"), cell("two"));
    const audit = auditManifest(manifest, today);
    expect(audit.ready).toBe(true);
    expect(audit.count).toBe(2);
    expect(audit.totalBytes).toBe(60);
    expect(audit.findings).toEqual([]);
    expect(audit.sources).toEqual([attribution]);
    expect(requireAuditedManifest(manifest, today)).toBe(manifest);
  });

  it.each(OPEN_LICENCES)("allows an explicitly supported open licence: %s", (licence) => {
    const manifest = region(cell("a", 1, { ...attribution, licence }));
    expect(auditManifest(manifest, today).ready).toBe(true);
  });

  it.each([
    "", "Proprietary", "CC BY-NC 4.0", "CC BY-ND 4.0", "All rights reserved",
    "ODbL 1.0", "Unknown", "© Open data", "MIT license + custom terms",
  ])("rejects an unlisted licence: %s", (licence) => {
    expect(issues(region(cell("a", 1, { ...attribution, licence })))).toContain("licence");
  });

  it("does not silently treat an unsupported share-alike data licence as open", () => {
    const audit = auditManifest(region(cell("a", 12, {
      ...attribution, licence: "ODbL 1.0",
    })), today);
    expect(audit.ready).toBe(false);
    expect(audit.findings[0]?.severity).toBe("error");
  });

  it("rejects missing provenance source", () => {
    expect(issues(region(cell("a", 1, { ...attribution, source: "" })))).toContain("source");
    expect(issues(region(cell("a", 1, { ...attribution, source: "  " })))).toContain("source");
  });

  it("rejects a source description beyond the retention bound", () => {
    expect(issues(region(cell("a", 1, { ...attribution, source: "x".repeat(501) })))).toContain("source");
  });

  it.each(["2026-02-30", "2026-11-31", "2025-13-01", "2026-00-01", "x", "", "2026-1-1"])(
    "rejects non-calendar source date: %s", (date) => {
      expect(issues(region(cell("a", 1, { ...attribution, date })))).toContain("date");
    },
  );

  it("accepts leap day and rejects a leap day in a common year", () => {
    expect(issues(region(cell("a", 1, { ...attribution, date: "2024-02-29" })))).not.toContain("date");
    expect(issues(region(cell("a", 1, { ...attribution, date: "2025-02-29" })))).toContain("date");
  });

  it("flags future provenance dates without inferring content freshness", () => {
    const audit = auditManifest(region(cell("a", 1, {
      ...attribution, date: "2026-11-16",
    })), today);
    expect(audit.ready).toBe(false);
    expect(audit.findings).toContainEqual({
      code: "future-date", severity: "error", cellId: "a",
    });
  });

  it("allows a source dated on the audit date", () => {
    expect(issues(region(cell("a", 1, { ...attribution, date: today })))).toEqual([]);
  });

  it.each(["", "../a", "a/b", ".", "..", "a..b", "a%2Fb", "spaces here", "é"])(
    "rejects risky cell identifier: %s", (id) => {
      expect(issues(region(cell(id)))).toContain("cell-id");
    },
  );

  it.each(["", "/path", "a b", "a..b", "c%2Fd"])(
    "rejects risky region identifier: %s", (regionId) => {
      const audit = auditManifest({ regionId, cells: [cell("a")] }, today);
      expect(audit.findings.map((entry) => entry.code)).toContain("region-id");
    },
  );

  it("reports duplicate cell IDs even with distinct source metadata", () => {
    const audit = auditManifest(region(cell("a"), cell("a", 3, second)), today);
    expect(audit.ready).toBe(false);
    expect(audit.findings).toContainEqual({
      code: "duplicate-id", severity: "error", cellId: "a",
    });
  });

  it.each([-1, 0.1, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects an invalid byte count: %s", (bytes) => {
      expect(issues(region(cell("a", bytes)))).toContain("size");
    },
  );

  it("accepts a listed zero-byte cell", () => {
    expect(auditManifest(region(cell("a", 0)), today).ready).toBe(true);
  });

  it("rejects a cell larger than the configured cap", () => {
    const audit = auditManifest(region(cell("a", 300)), today, {
      maxCellBytes: 100, maxRegionBytes: 1000, maxCells: 10,
    });
    expect(audit.ready).toBe(false);
    expect(audit.findings.some((finding) => finding.code === "size-limit")).toBe(true);
  });

  it("rejects aggregate size even with individually acceptable cells", () => {
    const audit = auditManifest(region(cell("a", 80), cell("b", 80)), today, {
      maxCellBytes: 100, maxRegionBytes: 150, maxCells: 10,
    });
    expect(audit.findings.map((finding) => finding.code)).toContain("total-limit");
  });

  it("limits manifest count without requiring huge fixture data", () => {
    const audit = auditManifest(region(cell("a"), cell("b")), today, {
      maxCellBytes: 100, maxRegionBytes: 1000, maxCells: 1,
    });
    expect(audit.findings.map((finding) => finding.code)).toContain("too-many-cells");
  });

  it("rejects total overflow", () => {
    const audit = auditManifest(region(cell("a", Number.MAX_SAFE_INTEGER), cell("b", 2)), today, {
      maxCellBytes: Number.MAX_SAFE_INTEGER,
      maxRegionBytes: Number.MAX_SAFE_INTEGER,
      maxCells: 10,
    });
    expect(audit.totalBytes).toBeNull();
    expect(audit.ready).toBe(false);
  });

  it.each(["\u0000", "\n", "\r", "\u202e", "\u2066"])(
    "blocks control characters in source metadata: %s", (character) => {
      expect(issues(region(cell("a", 1, {
        ...attribution, source: `Safe${character}other`,
      })))).toContain("unsafe-text");
    },
  );

  it("also rejects control characters in otherwise invalid IDs", () => {
    const audit = auditManifest(region(cell("a\nb")), today);
    expect(audit.findings.map((entry) => entry.code)).toEqual(
      expect.arrayContaining(["cell-id", "unsafe-text"]),
    );
  });

  it("counts findings and groups shared provenance", () => {
    const audit = auditManifest(region(
      cell("a", 2), cell("b", 2), cell("c", 5, second),
      cell("d", 1, { ...second, licence: "Proprietary" }),
    ), today);
    expect(auditCounts(audit)).toEqual({ errors: 1, notices: 0, sources: 3 });
    expect(findingCounts(audit).get("licence")).toBe(1);
    expect(groupedSources(audit).get("CC BY 4.0")).toEqual([attribution]);
    expect(groupedSources(audit).get("CC0 1.0")).toEqual([second]);
  });

  it("does not label an empty manifest as inaccessible", () => {
    const audit = auditManifest(region(), today);
    expect(audit.count).toBe(0);
    expect(audit.totalBytes).toBe(0);
    expect(audit.ready).toBe(true);
  });

  it("rejects invalid audit date and impossible limits", () => {
    expect(() => auditManifest(region(cell("a")), "yesterday")).toThrow(RangeError);
    const bad: AuditLimits = { maxCellBytes: 0, maxRegionBytes: 10, maxCells: 1 };
    expect(() => auditManifest(region(cell("a")), today, bad)).toThrow(RangeError);
  });

  it("an invalid manifest cannot pass the download guard", () => {
    const bad = region(cell("a", 1, { ...attribution, licence: "Private" }));
    expect(() => requireAuditedManifest(bad, today)).toThrow();
  });
});
