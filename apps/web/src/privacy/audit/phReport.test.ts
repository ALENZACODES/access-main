import { describe, expect, it } from "vitest";
import { ascTag, baselineSegments, bytes, exifSegment, gpsTags, jpegBytes } from "./phBuild";
import { compareStrip } from "./phDiff";
import { reportAll, reportFile, summaryLine, tally } from "./phReport";
import { auditJpeg } from "./phRules";
import { referenceStrip } from "./phStrip";

const base = baselineSegments();
const dirty = jpegBytes({ before: [exifSegment({ ifd0: [ascTag(0x010f, "A")], gps: gpsTags(1, 2) }), ...base] });
const input = (name: string, data: Uint8Array, withDiff = false) => ({ name, size: data.length, findings: auditJpeg(data), ...(withDiff ? { diff: compareStrip(data, referenceStrip(data)) } : {}) });

describe("summaryLine", () => {
  it("says no findings for a clean file", () => expect(summaryLine(input("a.jpg", jpegBytes({ before: base })))).toMatch(/^a\.jpg \(\d+ bytes\) — no findings$/));
  it("counts leaks", () => expect(summaryLine(input("a.jpg", dirty))).toMatch(/possible leaks$/));
  it("says leak in the singular for one", () => expect(summaryLine(input("b.jpg", jpegBytes({ before: [{ marker: 0xfe, payload: bytes(65) }, ...base] })))).toMatch(/1 possible leak$/));
  it("counts a structure problem apart from leaks", () => expect(summaryLine(input("c.jpg", bytes(1, 2, 3)))).toMatch(/1 structure problem$/));
});

describe("reportFile", () => {
  it("lists each code with a count, then each finding", () => {
    const r = reportFile(input("a.jpg", dirty));
    expect(r).toContain("ph-exif-gps × 1");
    expect(r.split("\n").filter((l) => l.startsWith("  - ")).length).toBe(auditJpeg(dirty).length);
  });
  it("adds what cleaning removed and kept", () => {
    const r = reportFile(input("a.jpg", dirty, true));
    expect(r).toContain("removed: APP1");
    expect(r).toContain("kept: DQT, SOF0, DHT, SOS");
  });
  it("says nothing was removed from a clean file", () => expect(reportFile(input("a.jpg", jpegBytes({ before: base }), true))).toContain("removed: nothing"));
  it("marks a problem found by the comparison", () => {
    const before = jpegBytes({ before: base });
    const after = jpegBytes({ before: base, trailer: bytes(1) });
    expect(reportFile({ name: "x", size: 1, findings: [], diff: compareStrip(before, after) })).toMatch(/\n {2}! /);
  });
});

describe("reportAll and tally", () => {
  const set = [input("a.jpg", dirty), input("b.jpg", jpegBytes({ before: base })), input("c.jpg", dirty)];
  it("heads the report with the counts", () => expect(reportAll(set).split("\n")[0]).toBe("3 files checked, 2 with findings"));
  it("uses the singular for one file", () => expect(reportAll([set[1] as (typeof set)[number]]).split("\n")[0]).toBe("1 file checked, 0 with findings"));
  it("counts files with each code, most common first", () => {
    const t = tally(set);
    expect(t[0]?.[1]).toBe(2);
    expect(t.map((r) => r[0])).toContain("ph-exif-gps");
  });
  it("is empty when nothing was found", () => expect(tally([set[1] as (typeof set)[number]])).toEqual([]));
});
