import { describe, expect, it } from "vitest";
import { ascTag, baselineSegments, bytes, exifSegment, gpsTags, jpegBytes, scanData } from "./phBuild";
import { compareStrip, formatDiffProblem } from "./phDiff";

const base = baselineSegments();
const dirty = jpegBytes({ before: [{ marker: 0xe0, payload: bytes(1) }, exifSegment({ ifd0: [ascTag(0x010f, "A")], gps: gpsTags(1, 2) }), ...base, { marker: 0xfe, payload: bytes(65) }] });
const clean = jpegBytes({ before: base });

describe("compareStrip", () => {
  it("has no problem when only the metadata is gone", () => expect(compareStrip(dirty, clean).problems).toEqual([]));
  it("counts what was removed, by name", () => expect(compareStrip(dirty, clean).removed).toEqual({ APP0: 1, APP1: 1, COM: 1 }));
  it("lists the segments that stay, in order", () => expect(compareStrip(dirty, clean).kept).toEqual(["DQT", "SOF0", "DHT", "SOS"]));
  it("counts a removed segment of the same name once for each", () => {
    const two = jpegBytes({ before: [{ marker: 0xfe, payload: bytes(1) }, { marker: 0xfe, payload: bytes(2) }, ...base] });
    expect(compareStrip(two, jpegBytes({ before: [{ marker: 0xfe, payload: bytes(1) }, ...base] })).removed).toEqual({ COM: 1 });
  });
  it("says the metadata is left when nothing was removed", () => {
    const d = compareStrip(dirty, dirty);
    expect(d.problems.map((p) => p.code)).toEqual(["metadata-left", "metadata-left", "metadata-left", "metadata-left"]);
    expect(d.leaks.map((l) => l.code)).toContain("ph-exif-gps");
  });
  it("says the picture data changed", () => expect(compareStrip(dirty, jpegBytes({ before: base, scan: scanData(24, 99) })).problems.map((p) => p.code)).toEqual(["scan-changed"]));
  it("says a table was lost", () => expect(compareStrip(dirty, jpegBytes({ before: base.slice(0, 2) })).problems.map((p) => p.code)).toEqual(["segment-lost"]));
  it("says a segment was added", () => expect(compareStrip(clean, jpegBytes({ before: [...base, { marker: 0xdd, payload: bytes(0, 4) }] })).problems.map((p) => p.code)).toEqual(["segment-added"]));
  it("says a table changed", () => {
    const changed = base.map((s, i) => (i === 0 ? { ...s, payload: bytes(0, ...Array.from({ length: 64 }, () => 17)) } : s));
    expect(compareStrip(clean, jpegBytes({ before: changed })).problems.map((p) => p.code)).toEqual(["segment-changed"]);
  });
  it("reports two segments that swap places as one lost and one added", () => expect(compareStrip(clean, jpegBytes({ before: [base[1] as (typeof base)[number], base[0] as (typeof base)[number], base[2] as (typeof base)[number]] })).problems.map((p) => p.code)).toEqual(["segment-lost", "segment-added"]));
  it("says the order changed when a segment becomes a different one that is nowhere else", () => expect(compareStrip(jpegBytes({ before: [base[0] as (typeof base)[number]] }), jpegBytes({ before: [{ marker: 0xdd, payload: bytes(0, 4) }] })).problems.map((p) => p.code)).toEqual(["order-changed"]));
  it("says the file after is not whole", () => expect(compareStrip(dirty, bytes(1, 2, 3)).problems.map((p) => p.code)).toContain("not-whole"));
  it("says a trailer is left", () => expect(compareStrip(dirty, jpegBytes({ before: base, trailer: bytes(1, 2) })).problems.map((p) => p.code)).toEqual(["trailer-left"]));
});

describe("formatDiffProblem", () => {
  it("writes the code and the detail", () => expect(formatDiffProblem({ code: "segment-lost", detail: "DHT" })).toBe("segment-lost: DHT"));
});
