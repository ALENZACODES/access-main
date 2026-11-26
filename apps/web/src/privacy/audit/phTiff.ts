// Reads the EXIF block of a JPEG (the payload of an APP1 segment that starts with "Exif" and two zero bytes): the
// tags of the main directory, the EXIF directory, the GPS directory and the directory of the thumbnail. It reads
// only what it needs to find what identifies a person or a place: the camera, the software, the date, the owner, the
// serial number, a description and the GPS position. It never throws: a block that is cut off or loops gives
// problems and the tags read so far. Node and tests only.

export type IfdName = "ifd0" | "exif" | "gps" | "ifd1" | "interop";

export interface ExifTag {
  ifd: IfdName;
  tag: number;
  name: string;
  type: number;
  count: number;
  /** Text for an ASCII tag, numbers for the others (a rational is its value as a number). */
  value: string | number[];
}

export interface ExifRead {
  littleEndian: boolean;
  tags: ExifTag[];
  problems: string[];
}

export const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0, 0];

const NAMES: Record<IfdName, Record<number, string>> = {
  ifd0: { 0x010e: "ImageDescription", 0x010f: "Make", 0x0110: "Model", 0x0112: "Orientation", 0x0131: "Software", 0x0132: "DateTime", 0x013b: "Artist", 0x8298: "Copyright", 0x8769: "ExifIFD", 0x8825: "GPSIFD" },
  ifd1: { 0x0201: "ThumbnailOffset", 0x0202: "ThumbnailLength" },
  exif: { 0x829a: "ExposureTime", 0x9003: "DateTimeOriginal", 0x9004: "DateTimeDigitized", 0x927c: "MakerNote", 0x9286: "UserComment", 0xa005: "InteropIFD", 0xa430: "CameraOwnerName", 0xa431: "BodySerialNumber", 0xa432: "LensSpecification", 0xa433: "LensMake", 0xa434: "LensModel", 0xa435: "LensSerialNumber", 0xa420: "ImageUniqueID" },
  gps: { 0: "GPSVersionID", 1: "GPSLatitudeRef", 2: "GPSLatitude", 3: "GPSLongitudeRef", 4: "GPSLongitude", 5: "GPSAltitudeRef", 6: "GPSAltitude", 7: "GPSTimeStamp", 12: "GPSSpeedRef", 13: "GPSSpeed", 16: "GPSImgDirectionRef", 17: "GPSImgDirection", 29: "GPSDateStamp" },
  interop: {},
};

const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };
const MAX_ENTRIES = 512;

export function tagName(ifd: IfdName, tag: number): string {
  return NAMES[ifd][tag] ?? `0x${tag.toString(16).padStart(4, "0")}`;
}

/** Whether the payload of an APP1 segment is an EXIF block. */
export function isExifPayload(payload: Uint8Array): boolean {
  return payload.length >= 6 && EXIF_HEADER.every((b, i) => payload[i] === b);
}

export function readExif(payload: Uint8Array): ExifRead {
  const out: ExifRead = { littleEndian: true, tags: [], problems: [] };
  if (!isExifPayload(payload)) {
    out.problems.push("not an exif block");
    return out;
  }
  const tiff = payload.subarray(6);
  if (tiff.length < 8) {
    out.problems.push("tiff header is cut off");
    return out;
  }
  const order = String.fromCodePoint(tiff[0] as number, tiff[1] as number);
  if (order !== "II" && order !== "MM") {
    out.problems.push("byte order mark is wrong");
    return out;
  }
  out.littleEndian = order === "II";
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const le = out.littleEndian;
  if (view.getUint16(2, le) !== 42) out.problems.push("tiff magic number is wrong");
  const seen = new Set<number>();

  const readIfd = (offset: number, ifd: IfdName): number => {
    if (seen.has(offset)) {
      out.problems.push(`directory at ${offset} is read twice`);
      return 0;
    }
    seen.add(offset);
    if (offset < 8 || offset + 2 > tiff.length) {
      out.problems.push(`directory at ${offset} is outside the block`);
      return 0;
    }
    const n = Math.min(view.getUint16(offset, le), MAX_ENTRIES);
    for (let k = 0; k < n; k++) {
      const e = offset + 2 + k * 12;
      if (e + 12 > tiff.length) {
        out.problems.push(`entry ${k} of the ${ifd} directory is cut off`);
        break;
      }
      const tag = view.getUint16(e, le);
      const type = view.getUint16(e + 2, le);
      const count = view.getUint32(e + 4, le);
      const size = (TYPE_SIZE[type] ?? 0) * count;
      const at = size <= 4 ? e + 8 : view.getUint32(e + 8, le);
      let value: string | number[] = [];
      if (size === 0 || at + size > tiff.length || count > 65_536) {
        if (size !== 0) out.problems.push(`value of ${tagName(ifd, tag)} is outside the block`);
      } else {
        value = readValue(view, tiff, at, type, count, le);
      }
      out.tags.push({ ifd, tag, name: tagName(ifd, tag), type, count, value });
      const sub = pointerTarget(ifd, tag);
      if (sub !== null && Array.isArray(value) && typeof value[0] === "number") readIfd(value[0], sub);
    }
    const nextAt = offset + 2 + n * 12;
    return nextAt + 4 <= tiff.length ? view.getUint32(nextAt, le) : 0;
  };

  const next = readIfd(view.getUint32(4, le), "ifd0");
  if (next !== 0) readIfd(next, "ifd1");
  return out;
}

function pointerTarget(ifd: IfdName, tag: number): IfdName | null {
  if (ifd === "ifd0" && tag === 0x8769) return "exif";
  if (ifd === "ifd0" && tag === 0x8825) return "gps";
  if (ifd === "exif" && tag === 0xa005) return "interop";
  return null;
}

function readValue(view: DataView, tiff: Uint8Array, at: number, type: number, count: number, le: boolean): string | number[] {
  if (type === 2) {
    let end = at + count;
    while (end > at && tiff[end - 1] === 0) end--;
    return String.fromCodePoint(...tiff.subarray(at, end));
  }
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const p = at + i * (TYPE_SIZE[type] ?? 1);
    switch (type) {
      case 1: case 7: out.push(tiff[p] as number); break;
      case 6: out.push(view.getInt8(p)); break;
      case 3: out.push(view.getUint16(p, le)); break;
      case 8: out.push(view.getInt16(p, le)); break;
      case 4: out.push(view.getUint32(p, le)); break;
      case 9: out.push(view.getInt32(p, le)); break;
      case 5: out.push(ratio(view.getUint32(p, le), view.getUint32(p + 4, le))); break;
      case 10: out.push(ratio(view.getInt32(p, le), view.getInt32(p + 4, le))); break;
      case 11: out.push(view.getFloat32(p, le)); break;
      case 12: out.push(view.getFloat64(p, le)); break;
      default: out.push(tiff[p] as number);
    }
  }
  return out;
}

function ratio(n: number, d: number): number {
  return d === 0 ? 0 : n / d;
}

export interface GpsPosition {
  latitude: number;
  longitude: number;
  altitude: number | null;
}

const text = (t: ExifTag | undefined): string => (t !== undefined && typeof t.value === "string" ? t.value : "");
const nums = (t: ExifTag | undefined): number[] => (t !== undefined && Array.isArray(t.value) ? t.value : []);

/** The position in the GPS tags, in degrees (south and west negative), or null when there is none to read. */
export function gpsPosition(tags: readonly ExifTag[]): GpsPosition | null {
  const gps = tags.filter((t) => t.ifd === "gps");
  const get = (tag: number): ExifTag | undefined => gps.find((t) => t.tag === tag);
  const lat = nums(get(2));
  const lon = nums(get(4));
  if (lat.length !== 3 || lon.length !== 3) return null;
  const deg = (v: number[]): number => (v[0] as number) + (v[1] as number) / 60 + (v[2] as number) / 3600;
  const latRef = text(get(1)).toUpperCase();
  const lonRef = text(get(3)).toUpperCase();
  const alt = nums(get(6))[0];
  const altitude = alt === undefined ? null : nums(get(5))[0] === 1 ? -alt : alt;
  return { latitude: (latRef === "S" ? -1 : 1) * deg(lat), longitude: (lonRef === "W" ? -1 : 1) * deg(lon), altitude };
}

/** Tags that say who or what took the picture. */
export const IDENTITY_TAGS: ReadonlySet<string> = new Set(["Make", "Model", "Software", "Artist", "Copyright", "ImageDescription", "CameraOwnerName", "BodySerialNumber", "LensSerialNumber", "LensMake", "LensModel", "ImageUniqueID", "UserComment", "MakerNote"]);

/** Tags that say when the picture was taken. */
export const TIME_TAGS: ReadonlySet<string> = new Set(["DateTime", "DateTimeOriginal", "DateTimeDigitized", "GPSTimeStamp", "GPSDateStamp"]);

export function identityTags(tags: readonly ExifTag[]): ExifTag[] {
  return tags.filter((t) => IDENTITY_TAGS.has(t.name));
}

export function timeTags(tags: readonly ExifTag[]): ExifTag[] {
  return tags.filter((t) => TIME_TAGS.has(t.name));
}
