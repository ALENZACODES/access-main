import { describe, expect, it } from "vitest";
import type { RegionManifest, Provenance } from "./regionDownload";
import type { RegionInventory } from "./regionInventory";
import { buildRecoveryPlan, proposeRecoveryRequest } from "./recoveryGuide";
import {
  createRecoveryGuideReport, encodeRecoveryGuideReport, formatRecoveryGuideReport,
  recoveryGuideFilename, safeGuideText, validGuideDay,
} from "./recoveryGuideExport";

const source: Provenance = {
  source: "Open municipal data", licence: "CC BY 4.0", date: "2026-01-02",
};
const manifest: RegionManifest = {
  regionId: "city-west",
  cells: [
    { id: "saved", bytes: 10, provenance: source },
    { id: "missing", bytes: 20, provenance: source },
  ],
};
const inventory: RegionInventory = {
  regionId: "city-west",
  cells: [
    { id: "saved", expectedBytes: 10, state: "saved", cause: "present", provenance: source },
    { id: "missing", expectedBytes: 20, state: "unknown", cause: "missing", provenance: source },
  ],
  savedCount: 1, unknownCount: 1, savedBytes: 10,
  expectedBytes: 30, complete: false,
};

function plan() {
  return buildRecoveryPlan(manifest, inventory, { quota: 10_000_000, usage: 0 });
}
function report() {
  return createRecoveryGuideReport(plan(), "2026-11-19");
}

describe("device-local offline recovery guide export", () => {
  it("uses an explicit versioned schema", () => {
    expect(report().schema).toBe("offline-recovery-guide-v1");
  });

  it("records the region identifier", () => {
    expect(report().regionId).toBe("city-west");
  });

  it("records the supplied reporting date", () => {
    expect(report().day).toBe("2026-11-19");
  });

  it("records the current readiness gate without asserting success", () => {
    expect(report().readiness).toBe("ready");
    expect(report().cells[1]?.state).toBe("UNKNOWN");
  });

  it("records UNKNOWN cell counts", () => {
    expect(report().summary.saved).toBe(1);
    expect(report().summary.unknown).toBe(1);
  });

  it("records listed byte amounts", () => {
    expect(report().summary.listedBytes).toBe(30);
    expect(report().summary.retryBytes).toBe(20);
  });

  it("records the exact public source and licence", () => {
    expect(report().cells[0]?.provenance).toEqual(source);
    expect(report().cells[1]?.provenance?.licence).toBe("CC BY 4.0");
  });

  it("includes the published source date", () => {
    expect(report().cells[1]?.provenance?.date).toBe("2026-01-02");
  });

  it("does not include downloaded cell payload bytes", () => {
    const output = encodeRecoveryGuideReport(report());
    expect(output).not.toContain("Uint8Array");
    expect(output).not.toContain("base64");
    expect(output).not.toContain("data:application");
  });

  it("encodes deterministic JSON with a final newline", () => {
    const result = report();
    expect(encodeRecoveryGuideReport(result)).toBe(encodeRecoveryGuideReport(result));
    expect(encodeRecoveryGuideReport(result).endsWith("\n")).toBe(true);
  });

  it("produces parseable JSON", () => {
    const decoded: unknown = JSON.parse(encodeRecoveryGuideReport(report()));
    expect(decoded).toMatchObject({ schema: "offline-recovery-guide-v1", regionId: "city-west" });
  });

  it("does not include a future remote upload target", () => {
    const output = encodeRecoveryGuideReport(report());
    expect(output).not.toContain("uploadUrl");
    expect(output).not.toContain("telemetry");
  });

  it("does not include an unrequested selection", () => {
    expect(report().proposed).toEqual([]);
  });

  it("includes only explicitly eligible selected IDs", () => {
    const current = plan();
    const selection = proposeRecoveryRequest(current, ["missing"]);
    const result = createRecoveryGuideReport(current, "2026-11-19", selection);
    expect(result.proposed).toEqual(["missing"]);
  });

  it("does not export a blocked selection as a proposed download", () => {
    const current = plan();
    const selection = proposeRecoveryRequest(current, ["saved"]);
    const result = createRecoveryGuideReport(current, "2026-11-19", selection);
    expect(result.proposed).toEqual([]);
  });

  it("renders an English title and summary", () => {
    const output = formatRecoveryGuideReport(report(), "en");
    expect(output).toContain("Offline recovery guide");
    expect(output).toContain("Matching saved copies: 1");
    expect(output).toContain("UNKNOWN copies: 1");
  });

  it("renders French labels with nonbreaking colons", () => {
    const output = formatRecoveryGuideReport(report(), "fr");
    expect(output).toContain("Guide de récupération hors ligne");
    expect(output).toContain("Copies à état UNKNOWN\u00a0: 1");
    expect(output).toContain("Source\u00a0: Open municipal data");
  });

  it("never translates the UNKNOWN status into an inferred value", () => {
    const output = formatRecoveryGuideReport(report(), "fr");
    expect(output).toContain("UNKNOWN");
    expect(output).toContain("Niveau de preuve\u00a0: UNKNOWN");
  });

  it("exposes the open licence in English and French", () => {
    for (const language of ["en", "fr"] as const) {
      const output = formatRecoveryGuideReport(report(), language);
      expect(output).toContain("CC BY 4.0");
    }
  });

  it("exposes the source date in English and French", () => {
    for (const language of ["en", "fr"] as const) {
      const output = formatRecoveryGuideReport(report(), language);
      expect(output).toContain("2026-01-02");
    }
  });

  it("makes an invalid source name safe to copy as text", () => {
    expect(safeGuideText("hello\nworld")).toBe("hello world");
  });

  it("removes bidi overrides from copied source text", () => {
    expect(safeGuideText("safe\u202ebad")).toBe("safe bad");
  });

  it("removes tabs from copied source text", () => {
    expect(safeGuideText("one\ttwo")).toBe("one two");
  });

  it("bounds the length of displayed metadata", () => {
    expect(safeGuideText("x".repeat(10_000)).length).toBe(700);
  });

  it("accepts a canonical leap-year date", () => {
    expect(validGuideDay("2024-02-29")).toBe(true);
  });

  it("rejects impossible calendar dates", () => {
    expect(validGuideDay("2026-02-30")).toBe(false);
    expect(validGuideDay("2026-13-01")).toBe(false);
  });

  it("rejects partial date strings", () => {
    expect(validGuideDay("2026-2-3")).toBe(false);
  });

  it("rejects path-like dates", () => {
    expect(validGuideDay("../../escape")).toBe(false);
  });

  it("does not allow invalid report dates", () => {
    expect(() => createRecoveryGuideReport(plan(), "2026-02-30")).toThrow();
  });

  it("uses safe filenames", () => {
    expect(recoveryGuideFilename("../../City WEST", "2026-11-19", "json"))
      .toBe("offline-recovery-city-west-2026-11-19.json");
  });

  it("uses a neutral filename for an empty region ID", () => {
    expect(recoveryGuideFilename("", "2026-11-19", "txt"))
      .toBe("offline-recovery-region-2026-11-19.txt");
  });

  it("bounds the filename length", () => {
    expect(recoveryGuideFilename("X".repeat(500), "2026-11-19", "json").length)
      .toBeLessThan(110);
  });

  it("falls back to a neutral filename date when needed", () => {
    expect(recoveryGuideFilename("central", "bad-date", "txt"))
      .toContain("unknown-date.txt");
  });

  it("does not modify the source plan while encoding", () => {
    const current = plan();
    const before = JSON.stringify(current);
    createRecoveryGuideReport(current, "2026-11-19");
    expect(JSON.stringify(current)).toBe(before);
  });
});
