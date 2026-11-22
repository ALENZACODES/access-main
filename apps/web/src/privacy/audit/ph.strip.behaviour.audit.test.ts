// Behaviour audit of stripJpegMetadata, the function that cleans a photo before it is kept and exported. Files are
// built with a camera's EXIF block, GPS position, XMP, a thumbnail and every application segment, and the result is
// read back with a reader that was written separately. What the function does well is checked as a rule; what it
// does not do is recorded as known, and each known test fails when the function is fixed, so the record is changed
// with it. It checks the function on the shapes built here, not on the photos of any phone or camera.

import { describe, expect, it } from "vitest";
import { stripJpegMetadata } from "../../../../../packages/contribute/src/photos";
import { ascTag, ascii, baselineSegments, bytes, concat, exifSegment, gpsTags, jpegBytes, scanData, shortTag } from "./phBuild";
import type { RawSegment } from "./phBuild";
import { compareStrip, formatDiffProblem } from "./phDiff";
import { isWholeJpeg, parseJpeg } from "./phJpeg";
import { auditJpeg, formatPhFinding } from "./phRules";
import { referenceStrip } from "./phStrip";

const base = baselineSegments();
const run = async (data: Uint8Array): Promise<Uint8Array> => new Uint8Array(await (await stripJpegMetadata(new Blob([data as Uint8Array<ArrayBuffer>], { type: "image/jpeg" }))).arrayBuffer());
const runErr = async (data: Uint8Array): Promise<string> => {
  try {
    await run(data);
    return "";
  } catch (e) {
    return (e as Error).message;
  }
};
const camera = (le = true): RawSegment =>
  exifSegment({
    littleEndian: le,
    ifd0: [ascTag(0x010f, "Acme"), ascTag(0x0110, "Cam One"), ascTag(0x0131, "EditPro 4"), ascTag(0x0132, "2026:11:20 10:11:12"), shortTag(0x0112, 6)],
    exif: [ascTag(0xa431, "SN12345"), ascTag(0x9003, "2026:11:20 10:11:12")],
    gps: gpsTags(43.6532, -79.3832, 76),
    thumbnail: bytes(0xff, 0xd8, 0xff, 0xdb, 0, 2, 0xff, 0xd9),
  });
const xmp: RawSegment = { marker: 0xe1, payload: ascii("http" + "://ns.adobe.com/xap/1.0/\0<x:xmpmeta><dc:creator>Jane</dc:creator></x:xmpmeta>") };
const icc: RawSegment = { marker: 0xe2, payload: concat(ascii("ICC_PROFILE\0"), bytes(1, 1), new Uint8Array(40)) };
const photoshop: RawSegment = { marker: 0xed, payload: concat(ascii("Photoshop 3.0\0"), new Uint8Array(20)) };
const adobe: RawSegment = { marker: 0xee, payload: concat(ascii("Adobe"), bytes(0, 100, 0, 0, 0, 0, 1)) };
const jfif: RawSegment = { marker: 0xe0, payload: concat(ascii("JFIF\0"), bytes(1, 1, 0, 0, 1, 0, 1, 0, 0)) };
const comment: RawSegment = { marker: 0xfe, payload: ascii("taken by Jane at home") };
const ALL: RawSegment[] = [jfif, camera(), xmp, icc, photoshop, adobe, comment];

describe("what it removes", () => {
  it("leaves no finding in a file with every kind of metadata before the scan", async () => {
    const out = await run(jpegBytes({ before: [...ALL, ...base] }));
    expect(auditJpeg(out).map(formatPhFinding)).toEqual([]);
  });
  it.each([[true], [false]])("removes a camera block with GPS, in either byte order (little endian %s)", async (le) => {
    const before = jpegBytes({ before: [camera(le), ...base] });
    expect(auditJpeg(before).map((f) => f.code)).toEqual(expect.arrayContaining(["ph-exif-gps", "ph-exif-identity", "ph-exif-time", "ph-embedded-image"]));
    expect(auditJpeg(await run(before))).toEqual([]);
  });
  it.each(Array.from({ length: 16 }, (_, k) => [k]))("removes application segment %i", async (k) => {
    const out = await run(jpegBytes({ before: [{ marker: 0xe0 + k, payload: ascii(`data-${k}`) }, ...base] }));
    expect(auditJpeg(out)).toEqual([]);
  });
  it("removes a comment", async () => expect(auditJpeg(await run(jpegBytes({ before: [comment, ...base] })))).toEqual([]));
  it("removes the text of the metadata from the bytes, not only the segment", async () => {
    const out = new TextDecoder("latin1").decode(await run(jpegBytes({ before: [...ALL, ...base] })));
    for (const word of ["Acme", "Cam One", "SN12345", "EditPro", "Jane", "Photoshop", "ICC_PROFILE", "Adobe", "JFIF", "Exif"]) expect(out, word).not.toContain(word);
  });
  it("removes many segments of one kind", async () => {
    const out = await run(jpegBytes({ before: [...Array.from({ length: 30 }, (_, i) => ({ marker: 0xe1, payload: ascii(`x${i}`) })), ...base] }));
    expect(auditJpeg(out)).toEqual([]);
  });
  it("removes metadata that sits between the tables", async () => {
    const out = await run(jpegBytes({ before: [base[0] as RawSegment, comment, base[1] as RawSegment, camera(), base[2] as RawSegment] }));
    expect(auditJpeg(out)).toEqual([]);
  });
  it("removes a segment of the largest size", async () => {
    const big: RawSegment = { marker: 0xe1, payload: new Uint8Array(0xffff - 2).fill(7) };
    expect(auditJpeg(await run(jpegBytes({ before: [big, ...base] })))).toEqual([]);
  });
  it("gives the same bytes as the reference for each of these files", async () => {
    for (const before of [[camera(), ...base], [...ALL, ...base], [comment, ...base], base]) {
      const f = jpegBytes({ before });
      expect(Array.from(await run(f))).toEqual(Array.from(referenceStrip(f)));
    }
  });
});

describe("what it keeps", () => {
  it("keeps the tables, the frame header, the picture data and the order, and nothing else is different", async () => {
    const before = jpegBytes({ before: [...ALL, ...base], scan: scanData(300, 11) });
    const d = compareStrip(before, await run(before));
    expect(d.problems.map(formatDiffProblem)).toEqual([]);
    expect(d.kept).toEqual(["DQT", "SOF0", "DHT", "SOS"]);
  });
  it("names what it removed", async () => {
    const before = jpegBytes({ before: [...ALL, ...base] });
    expect(compareStrip(before, await run(before)).removed).toEqual({ APP0: 1, APP1: 2, APP2: 1, APP13: 1, APP14: 1, COM: 1 });
  });
  it("gives a whole file", async () => expect(isWholeJpeg(parseJpeg(await run(jpegBytes({ before: [...ALL, ...base] }))))).toBe(true));
  it("keeps picture data that holds stuffed zeros and bytes that look like a marker", async () => {
    const scan = Uint8Array.from([1, 0xff, 0, 2, 0xff, 0, 0xff, 0xd0, 3, 0xff, 0, 4]);
    const before = jpegBytes({ before: [camera(), ...base], scan });
    expect(compareStrip(before, await run(before)).problems).toEqual([]);
  });
  it("keeps a file with no metadata byte for byte", async () => {
    const f = jpegBytes({ before: base });
    expect(Array.from(await run(f))).toEqual(Array.from(f));
  });
  it("is stable: cleaning twice gives the same bytes", async () => {
    const once = await run(jpegBytes({ before: [...ALL, ...base] }));
    expect(Array.from(await run(once))).toEqual(Array.from(once));
  });
  it("gives a blob of type image/jpeg", async () => expect((await stripJpegMetadata(new Blob([jpegBytes({ before: base }) as Uint8Array<ArrayBuffer>]))).type).toBe("image/jpeg"));
  it("does not change the file it was given", async () => {
    const f = jpegBytes({ before: [camera(), ...base] });
    const copy = f.slice();
    await run(f);
    expect(Array.from(f)).toEqual(Array.from(copy));
  });
});

describe("what it refuses", () => {
  it("refuses bytes that are not a JPEG", async () => expect(await runErr(bytes(1, 2, 3, 4))).toBe("Invalid JPEG"));
  it("refuses an empty file", async () => expect(await runErr(new Uint8Array(0))).toBe("Invalid JPEG"));
  it("refuses a marker that is not where one should be", async () => expect(await runErr(bytes(0xff, 0xd8, 1, 2, 3, 4))).toBe("Malformed JPEG marker"));
  it("refuses a segment whose length is too short or past the end", async () => {
    expect(await runErr(bytes(0xff, 0xd8, 0xff, 0xe1, 0, 1, 0))).toBe("Malformed JPEG segment");
    expect(await runErr(bytes(0xff, 0xd8, 0xff, 0xe1, 0, 99, 0))).toBe("Malformed JPEG segment");
  });
  it("refuses a file cut off inside a length field", async () => expect(await runErr(bytes(0xff, 0xd8, 0xff, 0xe1, 0))).toBe("Truncated JPEG"));
  it("never leaves metadata in a file it accepts, for 300 files with random metadata before the scan", async () => {
    let accepted = 0;
    for (let n = 0; n < 300; n++) {
      const segments: RawSegment[] = [];
      for (let k = 0; k < 1 + (n % 5); k++) segments.push({ marker: 0xe0 + ((n + k * 3) % 16), payload: Uint8Array.from({ length: (n * 7 + k) % 40 }, (_, i) => (i * 13 + n + k) & 0xff) });
      if (n % 3 === 0) segments.push(comment);
      if (n % 4 === 0) segments.push(camera(n % 8 === 0));
      const before = jpegBytes({ before: [...segments, ...base] });
      const out = await run(before);
      accepted++;
      expect(auditJpeg(out).map(formatPhFinding), `file ${n}`).toEqual([]);
    }
    expect(accepted).toBe(300);
  });
});

describe("known: what it leaves", () => {
  // Each of these records what the function does today. When one is fixed the test fails, and the record and the
  // finding in the notes file are changed with it.
  it("keeps everything after the end of image, including a second picture with its own GPS position", async () => {
    const second = jpegBytes({ before: [camera(), ...base] });
    const out = await run(jpegBytes({ before: base, trailer: second }));
    expect(auditJpeg(out).map((f) => f.code)).toEqual(expect.arrayContaining(["ph-trailer", "ph-trailer-image"]));
    expect(out.length).toBeGreaterThan(second.length);
  });
  it("keeps application data and comments that come after the first scan", async () => {
    const f = Uint8Array.from([0xff, 0xd8, 0xff, 0xda, 0, 2, 1, 0xff, 0xe1, 0, 4, 9, 9, 0xff, 0xfe, 0, 4, 8, 8, 0xff, 0xd9]);
    expect(auditJpeg(await run(f)).map((x) => x.code)).toEqual(["ph-app-segment", "ph-comment"]);
  });
  it("keeps application data that sits between two scans", async () => {
    const f = Uint8Array.from([0xff, 0xd8, 0xff, 0xda, 0, 2, 1, 0xff, 0xe1, 0, 4, 9, 9, 0xff, 0xda, 0, 2, 3, 0xff, 0xd9]);
    expect(auditJpeg(await run(f)).map((x) => x.code)).toEqual(["ph-app-segment"]);
  });
  it("accepts a file with no end of image and gives it back as it is", async () => {
    const f = jpegBytes({ before: [camera(), ...base], noEnd: true });
    const out = await run(f);
    expect(isWholeJpeg(parseJpeg(out))).toBe(false);
    expect(auditJpeg(out).map((x) => x.code)).toEqual(["ph-malformed"]);
  });
  it("refuses a file that has fill bytes before a marker, which is allowed in a JPEG", async () => expect(await runErr(Uint8Array.from([0xff, 0xd8, 0xff, 0xff, 0xfe, 0, 3, 65, 0xff, 0xda, 0, 2, 1, 0xff, 0xd9]))).toBe("Malformed JPEG segment"));
  it("refuses a file that has a marker with no length before the scan", async () => {
    expect(await runErr(Uint8Array.from([0xff, 0xd8, 0xff, 0x01, 0xff, 0xda, 0, 2, 1, 0xff, 0xd9]))).toBe("Malformed JPEG segment");
    expect(await runErr(Uint8Array.from([0xff, 0xd8, 0xff, 0xd0, 0xff, 0xda, 0, 2, 1, 0xff, 0xd9]))).toBe("Malformed JPEG segment");
  });
  it("is stricter than the reference on those files, and looser on the trailer: the reference gives a clean file for all of them", () => {
    for (const f of [jpegBytes({ before: base, trailer: bytes(0xff, 0xd8, 0xff, 1) }), Uint8Array.from([0xff, 0xd8, 0xff, 0xff, 0xfe, 0, 3, 65, 0xff, 0xda, 0, 2, 1, 0xff, 0xd9])]) {
      expect(auditJpeg(referenceStrip(f))).toEqual([]);
    }
  });
});
