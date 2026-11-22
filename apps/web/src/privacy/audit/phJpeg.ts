// Reads the structure of a JPEG file without decoding the picture: the markers, the segments before the scan, the
// entropy-coded scans, the end of image and whatever follows it. It is a reader for audits, so it never throws: a
// file that is not well formed gives an "error" part at the place it went wrong. Node and tests only.

export type JpegPart =
  | { kind: "soi"; offset: number }
  | { kind: "segment"; marker: number; name: string; offset: number; length: number; payload: Uint8Array }
  | { kind: "standalone"; marker: number; name: string; offset: number }
  | { kind: "fill"; offset: number; count: number }
  | { kind: "scan"; offset: number; end: number }
  | { kind: "eoi"; offset: number }
  | { kind: "trailer"; offset: number; length: number }
  | { kind: "error"; offset: number; message: string };

const SOF_NAMES: Record<number, string> = {
  0xc0: "SOF0", 0xc1: "SOF1", 0xc2: "SOF2", 0xc3: "SOF3", 0xc5: "SOF5", 0xc6: "SOF6", 0xc7: "SOF7",
  0xc9: "SOF9", 0xca: "SOF10", 0xcb: "SOF11", 0xcd: "SOF13", 0xce: "SOF14", 0xcf: "SOF15",
};

export function markerName(marker: number): string {
  if (SOF_NAMES[marker] !== undefined) return SOF_NAMES[marker] as string;
  if (marker >= 0xe0 && marker <= 0xef) return `APP${marker - 0xe0}`;
  if (marker >= 0xd0 && marker <= 0xd7) return `RST${marker - 0xd0}`;
  switch (marker) {
    case 0xc4: return "DHT";
    case 0xc8: return "JPG";
    case 0xcc: return "DAC";
    case 0xd8: return "SOI";
    case 0xd9: return "EOI";
    case 0xda: return "SOS";
    case 0xdb: return "DQT";
    case 0xdc: return "DNL";
    case 0xdd: return "DRI";
    case 0xde: return "DHP";
    case 0xdf: return "EXP";
    case 0xfe: return "COM";
    case 0x01: return "TEM";
    default: return `0x${marker.toString(16).padStart(2, "0")}`;
  }
}

/** Markers that have no length field and no payload. */
export function isStandalone(marker: number): boolean {
  return marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8);
}

/** Markers that carry application data or a comment: where a camera or an editor puts what it knows. */
export function isMetadataMarker(marker: number): boolean {
  return (marker >= 0xe0 && marker <= 0xef) || marker === 0xfe;
}

/** The index of the next marker in entropy-coded data, from index i: an FF that is not a stuffed zero, a restart or fill. */
export function nextScanMarker(data: Uint8Array, from: number): number {
  for (let i = from; i < data.length - 1; i++) {
    if (data[i] !== 0xff) continue;
    const m = data[i + 1] as number;
    if (m === 0x00 || (m >= 0xd0 && m <= 0xd7) || m === 0xff) continue;
    return i;
  }
  return -1;
}

export function parseJpeg(data: Uint8Array): JpegPart[] {
  const parts: JpegPart[] = [];
  if (data.length < 2 || data[0] !== 0xff || data[1] !== 0xd8) return [{ kind: "error", offset: 0, message: "no start of image" }];
  parts.push({ kind: "soi", offset: 0 });
  let i = 2;
  while (i < data.length) {
    if (data[i] !== 0xff) {
      parts.push({ kind: "error", offset: i, message: "expected a marker" });
      return parts;
    }
    let j = i;
    while (j < data.length && data[j] === 0xff) j++;
    if (j - i > 1) parts.push({ kind: "fill", offset: i, count: j - i - 1 });
    if (j >= data.length) {
      parts.push({ kind: "error", offset: i, message: "marker is cut off" });
      return parts;
    }
    const marker = data[j] as number;
    const at = j - 1;
    if (marker === 0xd9) {
      parts.push({ kind: "eoi", offset: at });
      if (at + 2 < data.length) parts.push({ kind: "trailer", offset: at + 2, length: data.length - (at + 2) });
      return parts;
    }
    if (isStandalone(marker)) {
      parts.push({ kind: "standalone", marker, name: markerName(marker), offset: at });
      i = j + 1;
      continue;
    }
    if (j + 2 >= data.length) {
      parts.push({ kind: "error", offset: at, message: "segment length is cut off" });
      return parts;
    }
    const length = ((data[j + 1] as number) << 8) | (data[j + 2] as number);
    if (length < 2 || j + 1 + length > data.length) {
      parts.push({ kind: "error", offset: at, message: "segment length is wrong" });
      return parts;
    }
    parts.push({ kind: "segment", marker, name: markerName(marker), offset: at, length, payload: data.subarray(j + 3, j + 1 + length) });
    i = j + 1 + length;
    if (marker === 0xda) {
      const end = nextScanMarker(data, i);
      const stop = end < 0 ? data.length : end;
      parts.push({ kind: "scan", offset: i, end: stop });
      i = stop;
      if (end < 0) {
        parts.push({ kind: "error", offset: data.length, message: "no end of image" });
        return parts;
      }
    }
  }
  parts.push({ kind: "error", offset: data.length, message: "no end of image" });
  return parts;
}

/** The segments of the file, in order. */
export function segmentsOf(parts: readonly JpegPart[]): Extract<JpegPart, { kind: "segment" }>[] {
  return parts.filter((p): p is Extract<JpegPart, { kind: "segment" }> => p.kind === "segment");
}

/** The segments that carry application data or a comment. */
export function metadataSegments(parts: readonly JpegPart[]): Extract<JpegPart, { kind: "segment" }>[] {
  return segmentsOf(parts).filter((s) => isMetadataMarker(s.marker));
}

export function errorsOf(parts: readonly JpegPart[]): string[] {
  return parts.filter((p): p is Extract<JpegPart, { kind: "error" }> => p.kind === "error").map((p) => `${p.message} at ${p.offset}`);
}

/** Whether the parts form a whole file: start, at least one scan, end, and no error. */
export function isWholeJpeg(parts: readonly JpegPart[]): boolean {
  return errorsOf(parts).length === 0 && parts[0]?.kind === "soi" && parts.some((p) => p.kind === "scan") && parts.some((p) => p.kind === "eoi");
}

/** The bytes of every scan, joined: the picture data itself. */
export function scanBytes(data: Uint8Array, parts: readonly JpegPart[]): Uint8Array {
  const chunks = parts.filter((p): p is Extract<JpegPart, { kind: "scan" }> => p.kind === "scan").map((p) => data.subarray(p.offset, p.end));
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** The bytes after the end of image, or an empty array. */
export function trailerBytes(data: Uint8Array, parts: readonly JpegPart[]): Uint8Array {
  const t = parts.find((p): p is Extract<JpegPart, { kind: "trailer" }> => p.kind === "trailer");
  return t === undefined ? new Uint8Array(0) : data.subarray(t.offset, t.offset + t.length);
}
