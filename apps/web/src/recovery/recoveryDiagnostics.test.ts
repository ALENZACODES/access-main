import { describe, expect, it } from "vitest";
import { diagnoseInventory, diagnosticsCopy, isOpenLicence, parseCalendarDate, sourceDiagnostics } from "./recoveryDiagnostics";
import type { LocalPackRecord } from "./packInventory";
import type { RecoverySource } from "./index";

const source: RecoverySource = {
  name: "Ontario sample catalogue", licence: "OGL-ON-1.0", date: "2026-11-01",
};
const today = "2026-11-15";
function pack(id: string, state: LocalPackRecord["state"] = "ready", bytes = 100): LocalPackRecord {
  return { id, state, byteLength: bytes, source };
}
function inspect(records: LocalPackRecord[], options: Record<string, number> = {}) {
  return diagnoseInventory(records, { today, ...options });
}

describe("strict calendar source date", () => {
  it.each([
    "2026-11-15", "2024-02-29", "2000-01-01", "2026-12-31",
  ])("accepts %s", (date) => {
    expect(parseCalendarDate(date)).not.toBeNull();
  });
  it.each([
    "", "2026-02-29", "2025-02-30", "2026-13-01", "2026-00-01",
    "2026-11-00", "2026-11-32", "2026-1-1", "2026-11-1",
    "1900-01-01", "2026-11-15T12:00:00Z", " 2026-11-15",
    "2026-11-15 ", "2025-04-31", "0000-00-00", "99999-01-01",
  ])("rejects invalid date %s", (date) => {
    expect(parseCalendarDate(date)).toBeNull();
  });
  it("preserves UTC day spacing during daylight saving changes", () => {
    const first = parseCalendarDate("2026-03-07");
    const last = parseCalendarDate("2026-03-09");
    expect(first).not.toBeNull();
    expect(last).not.toBeNull();
    expect((last ?? 0) - (first ?? 0)).toBe(2 * 86_400_000);
  });
});

describe("source licence gate", () => {
  it.each([
    "CC0-1.0", "CC-BY-4.0", "ODbL-1.0", "OGL-Canada-2.0", "OGL-ON-1.0",
  ])("accepts known open licence %s", (licence) => {
    expect(isOpenLicence(licence)).toBe(true);
  });
  it.each(["", "proprietary", "CC-BY-NC-4.0", "CC-BY-ND-4.0", "other", null, 5])(
    "rejects unsupported licence %s", (licence) => {
      expect(isOpenLicence(licence)).toBe(false);
    },
  );
  it("does not guess source name", () => {
    expect(sourceDiagnostics(undefined, "a", parseCalendarDate(today), 365)).toEqual([
      { code: "source-missing", severity: "blocked", packId: "a" },
    ]);
  });
  it("does not infer open licence from source name", () => {
    const findings = sourceDiagnostics({ ...source, licence: "UNKNOWN" }, "a", parseCalendarDate(today), 365);
    expect(findings).toContainEqual({ code: "licence-unknown", severity: "blocked", packId: "a" });
  });
  it("flags future publication dates without replacing the date", () => {
    const findings = sourceDiagnostics({ ...source, date: "2026-11-16" }, "a", parseCalendarDate(today), 365);
    expect(findings).toContainEqual({ code: "date-future", severity: "attention", packId: "a" });
  });
  it("flags older source dates and records exact age", () => {
    const findings = sourceDiagnostics({ ...source, date: "2024-11-14" }, "a", parseCalendarDate(today), 365);
    expect(findings.some((finding) => finding.code === "date-old" && (finding.detail ?? 0) > 365)).toBe(true);
  });
  it("does not assign age to invalid dates", () => {
    const findings = sourceDiagnostics({ ...source, date: "2026-02-30" }, "a", parseCalendarDate(today), 365);
    expect(findings.map((finding) => finding.code)).toEqual(["date-invalid"]);
  });
});

describe("local inventory diagnostic", () => {
  it("returns UNKNOWN for an empty list", () => {
    const result = inspect([]);
    expect(result.status).toBe("unknown");
    expect(result.packCount).toBe(0);
    expect(result.totalKnownBytes).toBe(0);
  });
  it("has a narrow clear result for listed pack metadata", () => {
    const result = inspect([pack("east"), pack("west")]);
    expect(result.status).toBe("clear");
    expect(result.findings).toEqual([]);
    expect(result.totalKnownBytes).toBe(200);
  });
  it("rejects a damaged file even with metadata", () => {
    const result = inspect([pack("east", "corrupt")]);
    expect(result.status).toBe("blocked");
    expect(result.findings[0]?.code).toBe("pack-damaged");
  });
  it("keeps a missing file unavailable", () => {
    const result = inspect([pack("east", "absent")]);
    expect(result.status).toBe("attention");
    expect(result.findings.some((finding) => finding.code === "pack-missing")).toBe(true);
  });
  it("never promotes UNKNOWN to clear", () => {
    const result = inspect([pack("east", "unknown")]);
    expect(result.status).toBe("blocked");
    expect(result.findings.some((finding) => finding.code === "pack-unknown")).toBe(true);
  });
  it("reports unknown source instead of supplying provenance", () => {
    const result = inspect([{ id: "east", state: "ready", byteLength: 10 }]);
    expect(result.status).toBe("blocked");
    expect(result.findings).toContainEqual({ code: "source-missing", severity: "blocked", packId: "east" });
  });
  it("rejects unsafe IDs, and never exposes their text in findings", () => {
    const result = inspect([pack("../../secret")]);
    expect(result.status).toBe("blocked");
    expect(result.findings).toEqual([{ code: "id-unsafe", severity: "blocked", packId: null }]);
  });
  it("rejects duplicates without counting duplicate bytes twice", () => {
    const result = inspect([pack("east", "ready", 10), pack("east", "ready", 500)]);
    expect(result.totalKnownBytes).toBe(10);
    expect(result.findings.map((finding) => finding.code)).toContain("duplicate-id");
  });
  it("tracks UNKNOWN sizes independently from known sizes", () => {
    const result = inspect([{ id: "east", source, state: "ready" }, pack("west")]);
    expect(result.status).toBe("unknown");
    expect(result.totalKnownBytes).toBe(100);
    expect(result.missingSizeCount).toBe(1);
    expect(result.findings.map((finding) => finding.code)).toContain("size-unavailable");
  });
  it("blocks a negative size", () => {
    const result = inspect([pack("east", "ready", -1)]);
    expect(result.status).toBe("blocked");
  });
  it("blocks fractional and unsafe sizes", () => {
    for (const size of [0.5, Number.MAX_SAFE_INTEGER + 10, Infinity, NaN]) {
      expect(inspect([pack("east", "ready", size)]).status).toBe("blocked");
    }
  });
  it("blocks a size beyond the local budget", () => {
    const result = inspect([pack("east", "ready", 101)], { maximumBytes: 100 });
    expect(result.findings.some((finding) => finding.code === "size-too-large")).toBe(true);
  });
  it("does not overflow an accumulated budget", () => {
    const result = inspect([pack("east", "ready", 70), pack("west", "ready", 70)], { maximumBytes: 100 });
    expect(result.totalKnownBytes).toBe(70);
    expect(result.findings.some((finding) => finding.code === "capacity-exceeded")).toBe(true);
  });
  it("bounds the total number of inspected records", () => {
    const records = Array.from({ length: 100 }, (_, i) => pack(`pack-${i}`));
    const result = inspect(records, { maximumPacks: 10 });
    expect(result.packCount).toBe(100);
    expect(result.totalKnownBytes).toBe(1_000);
    expect(result.status).toBe("blocked");
  });
  it("rejects an impossible inspection date rather than assuming today", () => {
    const result = diagnoseInventory([pack("east")], { today: "tomorrow" });
    expect(result.status).toBe("unknown");
    expect(result.checkedOn).toBeNull();
  });
  it("orders blocked findings before informational ones", () => {
    const result = inspect([pack("east", "ready", 10), { id: "west", state: "unknown", source }]);
    expect(result.findings[0]?.severity).toBe("blocked");
  });
  it("returns the same findings regardless of iteration order", () => {
    const records = [pack("west", "unknown"), pack("east", "absent"), pack("north", "corrupt")];
    expect(inspect([...records].reverse()).findings).toEqual(inspect(records).findings);
  });
});

describe("diagnostic copy coverage", () => {
  it("has an English and French message for every finding and state", () => {
    const en = diagnosticsCopy("en");
    const fr = diagnosticsCopy("fr");
    for (const code of Object.keys(en.problems) as Array<keyof typeof en.problems>) {
      expect(en.problems[code].trim()).not.toBe("");
      expect(fr.problems[code].trim()).not.toBe("");
    }
    for (const status of Object.keys(en.states) as Array<keyof typeof en.states>) {
      expect(en.states[status].trim()).not.toBe("");
      expect(fr.states[status].trim()).not.toBe("");
    }
  });
  it("retains an explicit unknown label in both languages", () => {
    expect(diagnosticsCopy("en").states.unknown).toBe("UNKNOWN");
    expect(diagnosticsCopy("fr").states.unknown).toBe("INCONNU");
  });
});
