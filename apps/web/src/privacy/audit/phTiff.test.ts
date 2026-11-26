import { describe, expect, it } from "vitest";
import { ascTag, bytes, exifPayload, gpsTags, longTag, ratTag, shortTag } from "./phBuild";
import { EXIF_HEADER, gpsPosition, identityTags, isExifPayload, readExif, tagName, timeTags } from "./phTiff";

const full = (le: boolean) =>
  exifPayload({
    littleEndian: le,
    ifd0: [ascTag(0x010f, "Acme"), ascTag(0x0110, "Cam One"), shortTag(0x0112, 6), ascTag(0x0131, "EditPro 4"), ascTag(0x0132, "2026:11:20 10:11:12")],
    exif: [ascTag(0xa431, "SN12345"), ascTag(0x9003, "2026:11:20 10:11:12")],
    gps: gpsTags(43.6532, -79.3832, 76),
    thumbnail: bytes(0xff, 0xd8, 0xff, 0xd9),
  });
const byName = (p: Uint8Array, n: string) => readExif(p).tags.find((t) => t.name === n);

describe("isExifPayload and tagName", () => {
  it("knows the header", () => {
    expect(isExifPayload(Uint8Array.from([...EXIF_HEADER, 1]))).toBe(true);
    expect(isExifPayload(bytes(0x45, 0x78, 0x69, 0x66, 0, 1))).toBe(false);
    expect(isExifPayload(bytes(0x45, 0x78))).toBe(false);
  });
  it("names the tags it knows in their directory and hex for the others", () => {
    expect(tagName("ifd0", 0x010f)).toBe("Make");
    expect(tagName("gps", 2)).toBe("GPSLatitude");
    expect(tagName("exif", 0xa431)).toBe("BodySerialNumber");
    expect(tagName("ifd0", 0x9999)).toBe("0x9999");
    expect(tagName("gps", 2)).not.toBe(tagName("ifd0", 2));
  });
});

describe.each([[true], [false]])("readExif, little endian %s", (le) => {
  const p = full(le);
  const r = readExif(p);
  it("reads the byte order", () => expect(r.littleEndian).toBe(le));
  it("has no problem", () => expect(r.problems).toEqual([]));
  it("reads the text tags", () => {
    expect(byName(p, "Make")?.value).toBe("Acme");
    expect(byName(p, "Model")?.value).toBe("Cam One");
    expect(byName(p, "Software")?.value).toBe("EditPro 4");
    expect(byName(p, "BodySerialNumber")?.value).toBe("SN12345");
  });
  it("reads a short, in the directory it is in", () => expect(r.tags.find((t) => t.name === "Orientation")).toMatchObject({ ifd: "ifd0", value: [6] }));
  it("reads the sub directories through their pointers", () => {
    expect(r.tags.filter((t) => t.ifd === "exif").map((t) => t.name).sort()).toEqual(["BodySerialNumber", "DateTimeOriginal"]);
    expect(r.tags.filter((t) => t.ifd === "gps").length).toBeGreaterThanOrEqual(5);
  });
  it("reads the thumbnail directory", () => expect(r.tags.filter((t) => t.ifd === "ifd1").map((t) => t.name)).toEqual(["ThumbnailOffset", "ThumbnailLength"]));
  it("reads a rational as its value", () => expect(byName(p, "GPSLatitude")?.value).toEqual([43, 39, 11.52]));
  it("gives the position, south and west negative", () => {
    const pos = gpsPosition(r.tags);
    expect(pos?.latitude).toBeCloseTo(43.6532, 4);
    expect(pos?.longitude).toBeCloseTo(-79.3832, 4);
    expect(pos?.altitude).toBe(76);
  });
});

describe("gpsPosition", () => {
  const pos = (lat: number, lon: number, alt?: number) => gpsPosition(readExif(exifPayload({ gps: gpsTags(lat, lon, alt) })).tags);
  it("reads the four quarters of the globe", () => {
    expect(pos(10, 20)).toMatchObject({ latitude: expect.closeTo(10, 4), longitude: expect.closeTo(20, 4) });
    expect(pos(-10, 20)?.latitude).toBeCloseTo(-10, 4);
    expect(pos(10, -20)?.longitude).toBeCloseTo(-20, 4);
    expect(pos(-33.8688, 151.2093)).toMatchObject({ latitude: expect.closeTo(-33.8688, 3), longitude: expect.closeTo(151.2093, 3) });
  });
  it("reads an altitude below sea level as negative, and no altitude as null", () => {
    expect(pos(1, 1, -30)?.altitude).toBe(-30);
    expect(pos(1, 1)?.altitude).toBeNull();
  });
  it("is null with no GPS tags or with only one of the two", () => {
    expect(gpsPosition([])).toBeNull();
    expect(gpsPosition(readExif(exifPayload({ gps: [ascTag(1, "N"), ratTag(2, [1, 1], [2, 1], [3, 1])] })).tags)).toBeNull();
  });
});

describe("identityTags and timeTags", () => {
  const tags = readExif(full(true)).tags;
  it("picks the tags that say who or what took the picture", () => expect(identityTags(tags).map((t) => t.name).sort()).toEqual(["BodySerialNumber", "Make", "Model", "Software"]));
  it("picks the tags that say when", () => expect(timeTags(tags).map((t) => t.name).sort()).toEqual(["DateTime", "DateTimeOriginal"]));
  it("picks nothing from a block with only a position", () => {
    const t = readExif(exifPayload({ gps: gpsTags(1, 2) })).tags;
    expect(identityTags(t)).toEqual([]);
    expect(timeTags(t)).toEqual([]);
  });
});

describe("readExif on a block that is not whole", () => {
  const head = (...n: number[]) => Uint8Array.from([...EXIF_HEADER, ...n]);
  it("says it is not an exif block", () => expect(readExif(bytes(1, 2, 3)).problems).toEqual(["not an exif block"]));
  it("says the header is cut off", () => expect(readExif(head(0x49, 0x49)).problems).toEqual(["tiff header is cut off"]));
  it("says the byte order mark is wrong", () => expect(readExif(head(0x41, 0x41, 42, 0, 8, 0, 0, 0)).problems).toEqual(["byte order mark is wrong"]));
  it("says the magic number is wrong and still reads on", () => expect(readExif(head(0x49, 0x49, 43, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0)).problems).toContain("tiff magic number is wrong"));
  it("says a directory is outside the block", () => expect(readExif(head(0x49, 0x49, 42, 0, 200, 0, 0, 0)).problems).toEqual(["directory at 200 is outside the block"]));
  it("says an entry is cut off", () => {
    const p = full(true);
    expect(readExif(p.subarray(0, 6 + 8 + 2 + 12 + 4)).problems.some((x) => x.includes("cut off"))).toBe(true);
  });
  it("says a value is outside the block", () => {
    const p = exifPayload({ ifd0: [ascTag(0x010f, "A much longer make than fits in four bytes")] });
    expect(readExif(p.subarray(0, p.length - 20)).problems.join()).toContain("value of Make is outside the block");
  });
  it("does not read a directory twice: a pointer that points back is stopped", () => {
    const p = Uint8Array.from(exifPayload({ ifd0: [longTag(0x8769, 8)] }));
    expect(readExif(p).problems.join()).toContain("is read twice");
  });
  it("never throws, whatever the bytes", () => {
    for (let n = 0; n < 400; n++) {
      const d = Uint8Array.from({ length: (n * 5) % 90 }, (_, i) => (i * 29 + n * 13) & 0xff);
      expect(() => readExif(Uint8Array.from([...EXIF_HEADER, 0x49, 0x49, 42, 0, 8, 0, 0, 0, ...d]))).not.toThrow();
      expect(() => readExif(Uint8Array.from([...EXIF_HEADER, 0x4d, 0x4d, 0, 42, 0, 0, 0, 8, ...d]))).not.toThrow();
    }
  });
});

describe("exifPayload builder", () => {
  it("starts with the header and the byte order mark", () => {
    expect(Array.from(exifPayload({}).subarray(0, 8))).toEqual([...EXIF_HEADER, 0x49, 0x49]);
    expect(Array.from(exifPayload({ littleEndian: false }).subarray(6, 8))).toEqual([0x4d, 0x4d]);
  });
  it("reads back with no tags for an empty spec", () => expect(readExif(exifPayload({})).tags).toEqual([]));
  it("writes the same tags in either byte order", () => {
    const a = readExif(full(true)).tags.map((t) => `${t.ifd}.${t.name}=${JSON.stringify(t.value)}`);
    const b = readExif(full(false)).tags.map((t) => `${t.ifd}.${t.name}=${JSON.stringify(t.value)}`);
    expect(b).toEqual(a);
  });
});
