// Builds JPEG files for tests from parts: a segment list, a scan and a trailer. The picture data is not a real
// picture, only bytes with the shape of an entropy-coded scan, because the audits read structure and never decode.
// Also builds the EXIF block of an APP1 segment, in either byte order, with a GPS directory and a thumbnail.

import { EXIF_HEADER } from "./phTiff";

export interface RawSegment {
  marker: number;
  payload: Uint8Array;
}

export const bytes = (...n: number[]): Uint8Array => Uint8Array.from(n);
export const ascii = (s: string): Uint8Array => Uint8Array.from([...s].map((c) => c.charCodeAt(0) & 0xff));
export const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

/** A marker, its length field and its payload. */
export function segment(marker: number, payload: Uint8Array): Uint8Array {
  const length = payload.length + 2;
  if (length > 0xffff) throw new Error("segment too long");
  return concat(bytes(0xff, marker, length >> 8, length & 0xff), payload);
}

/** The segments a small baseline file needs before the scan: tables, frame header and Huffman table. */
export function baselineSegments(): RawSegment[] {
  return [
    { marker: 0xdb, payload: bytes(0, ...Array.from({ length: 64 }, () => 16)) },
    { marker: 0xc0, payload: bytes(8, 0, 8, 0, 8, 1, 1, 0x11, 0) },
    { marker: 0xc4, payload: bytes(0x00, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0) },
  ];
}

/** Entropy-coded bytes for a scan: no marker in them, and a stuffed zero after every FF. */
export function scanData(length = 24, seed = 7): Uint8Array {
  const out: number[] = [];
  let x = seed;
  while (out.length < length) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    const b = (x >> 8) & 0xff;
    out.push(b);
    if (b === 0xff) out.push(0x00);
  }
  return Uint8Array.from(out);
}

export const SOS_HEADER = bytes(1, 1, 0x00, 0, 63, 0);

export interface JpegSpec {
  /** Segments between the start of image and the scan, in order. */
  before: RawSegment[];
  scan?: Uint8Array;
  /** Bytes put after the end of image. */
  trailer?: Uint8Array;
  /** Leave the end of image out. */
  noEnd?: boolean;
}

export function jpegBytes(spec: JpegSpec): Uint8Array {
  const parts: Uint8Array[] = [bytes(0xff, 0xd8)];
  for (const s of spec.before) parts.push(segment(s.marker, s.payload));
  parts.push(segment(0xda, SOS_HEADER), spec.scan ?? scanData());
  if (spec.noEnd !== true) parts.push(bytes(0xff, 0xd9));
  if (spec.trailer !== undefined) parts.push(spec.trailer);
  return concat(...parts);
}

export interface TagSpec {
  tag: number;
  type: number;
  /** Text for type 2; numbers for the others; a pair is a rational for types 5 and 10. */
  value: string | number[];
}

const SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

export const ascTag = (tag: number, text: string): TagSpec => ({ tag, type: 2, value: text });
export const shortTag = (tag: number, n: number): TagSpec => ({ tag, type: 3, value: [n] });
export const longTag = (tag: number, n: number): TagSpec => ({ tag, type: 4, value: [n] });
export const ratTag = (tag: number, ...pairs: Array<[number, number]>): TagSpec => ({ tag, type: 5, value: pairs.flat() });

export interface ExifSpec {
  littleEndian?: boolean;
  ifd0?: TagSpec[];
  exif?: TagSpec[];
  gps?: TagSpec[];
  /** Bytes of a thumbnail to put in the second directory. */
  thumbnail?: Uint8Array;
}

class Writer {
  readonly bytes: number[] = [];
  constructor(readonly le: boolean) {}
  get length(): number {
    return this.bytes.length;
  }
  u8(n: number): void {
    this.bytes.push(n & 0xff);
  }
  u16(n: number): void {
    if (this.le) this.bytes.push(n & 0xff, (n >> 8) & 0xff);
    else this.bytes.push((n >> 8) & 0xff, n & 0xff);
  }
  u32(n: number): void {
    const b = [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
    this.bytes.push(...(this.le ? b.reverse() : b));
  }
  set32(at: number, n: number): void {
    const b = [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
    const o = this.le ? b.reverse() : b;
    for (let i = 0; i < 4; i++) this.bytes[at + i] = o[i] as number;
  }
}

function encodeValue(w: Writer, t: TagSpec): number {
  const before = w.length;
  if (typeof t.value === "string") {
    for (const c of t.value) w.u8(c.charCodeAt(0));
    w.u8(0);
    return w.length - before;
  }
  for (const n of t.value) {
    if (t.type === 1 || t.type === 7) w.u8(n);
    else if (t.type === 3) w.u16(n);
    else w.u32(n);
  }
  return w.length - before;
}

function countOf(t: TagSpec): number {
  if (typeof t.value === "string") return t.value.length + 1;
  return t.type === 5 || t.type === 10 ? t.value.length / 2 : t.value.length;
}

/** Writes one directory at the writer's position and its values after it. Returns where the next-directory field is. */
function writeIfd(w: Writer, tags: TagSpec[]): number {
  const start = w.length;
  w.u16(tags.length);
  const entryAt = (k: number): number => start + 2 + k * 12;
  for (const t of tags) {
    w.u16(t.tag);
    w.u16(t.type);
    w.u32(countOf(t));
    w.u32(0);
  }
  const nextAt = w.length;
  w.u32(0);
  tags.forEach((t, k) => {
    const size = (SIZE[t.type] ?? 1) * countOf(t);
    if (size <= 4) {
      const inline = new Writer(w.le);
      encodeValue(inline, t);
      while (inline.length < 4) inline.u8(0);
      for (let i = 0; i < 4; i++) w.bytes[entryAt(k) + 8 + i] = inline.bytes[i] as number;
    } else {
      if (w.length % 2 === 1) w.u8(0);
      w.set32(entryAt(k) + 8, w.length);
      encodeValue(w, t);
    }
  });
  return nextAt;
}

/** The payload of an APP1 segment: "Exif", two zero bytes and a TIFF block. The offsets inside are from the TIFF header. */
export function exifPayload(spec: ExifSpec): Uint8Array {
  const le = spec.littleEndian !== false;
  const w = new Writer(le);
  w.u8(le ? 0x49 : 0x4d);
  w.u8(le ? 0x49 : 0x4d);
  w.u16(42);
  w.u32(8);
  const pointers: Record<number, number> = {};
  const ifd0 = [...(spec.ifd0 ?? [])];
  if (spec.exif) ifd0.push(longTag(0x8769, 0));
  if (spec.gps) ifd0.push(longTag(0x8825, 0));
  ifd0.sort((a, b) => a.tag - b.tag);
  // Directories are written one after the other, then the offsets of the sub directories are put into the first.
  const ifd0Next = writeIfd(w, ifd0);
  const place = (tags: TagSpec[], tag: number): void => {
    if (w.length % 2 === 1) w.u8(0);
    pointers[tag] = w.length;
    writeIfd(w, tags);
  };
  if (spec.exif) place(spec.exif, 0x8769);
  if (spec.gps) place(spec.gps, 0x8825);
  if (spec.thumbnail) {
    if (w.length % 2 === 1) w.u8(0);
    w.set32(ifd0Next, w.length);
    const t1 = [longTag(0x0201, 0), longTag(0x0202, spec.thumbnail.length)];
    const at = w.length;
    writeIfd(w, t1);
    const dataAt = w.length;
    w.set32(at + 2 + 8, dataAt);
    for (const b of spec.thumbnail) w.u8(b);
  }
  // Put the pointers of the sub directories into the entries of the first directory.
  const entries = ifd0.length;
  for (let k = 0; k < entries; k++) {
    const t = ifd0[k] as TagSpec;
    const target = pointers[t.tag];
    if (target !== undefined) w.set32(8 + 2 + k * 12 + 8, target);
  }
  return concat(Uint8Array.from(EXIF_HEADER), Uint8Array.from(w.bytes));
}

/** A GPS directory for a position in degrees, with the references set from the signs. */
export function gpsTags(latitude: number, longitude: number, altitude?: number): TagSpec[] {
  const dms = (v: number): Array<[number, number]> => {
    const a = Math.abs(v);
    const d = Math.floor(a);
    const m = Math.floor((a - d) * 60);
    const s = Math.round(((a - d) * 60 - m) * 60 * 1000);
    return [[d, 1], [m, 1], [s, 1000]];
  };
  const tags: TagSpec[] = [
    { tag: 0, type: 1, value: [2, 3, 0, 0] },
    ascTag(1, latitude < 0 ? "S" : "N"),
    ratTag(2, ...dms(latitude)),
    ascTag(3, longitude < 0 ? "W" : "E"),
    ratTag(4, ...dms(longitude)),
  ];
  if (altitude !== undefined) tags.push({ tag: 5, type: 1, value: [altitude < 0 ? 1 : 0] }, ratTag(6, [Math.round(Math.abs(altitude) * 100), 100]));
  return tags;
}

/** An APP1 EXIF segment, ready to go between the start of image and the tables. */
export function exifSegment(spec: ExifSpec): RawSegment {
  return { marker: 0xe1, payload: exifPayload(spec) };
}
