// What a JPEG file still says about the person or the place after it was prepared for sharing. Each finding names a
// kind of leftover: a GPS position, a camera or owner, a time, a thumbnail or a second picture, a comment, an XMP
// block, any other application segment, or bytes after the end of image. A file that is not well formed is a
// finding too, because nothing can be said about what is hidden in a file that cannot be read.

import { isExifPayload, readExif, gpsPosition, identityTags, timeTags } from "./phTiff";
import { errorsOf, metadataSegments, parseJpeg, trailerBytes } from "./phJpeg";

export type PhCode =
  | "ph-malformed"
  | "ph-exif-gps"
  | "ph-exif-identity"
  | "ph-exif-time"
  | "ph-xmp"
  | "ph-embedded-image"
  | "ph-comment"
  | "ph-app-segment"
  | "ph-trailer"
  | "ph-trailer-image";

export const PH_CODES: readonly PhCode[] = ["ph-malformed", "ph-exif-gps", "ph-exif-identity", "ph-exif-time", "ph-xmp", "ph-embedded-image", "ph-comment", "ph-app-segment", "ph-trailer", "ph-trailer-image"];

export interface PhFinding {
  code: PhCode;
  detail: string;
  offset: number;
}

const XMP_HEADER = "http" + "://ns.adobe.com/xap/1.0/\0";

function startsWithText(payload: Uint8Array, text: string): boolean {
  return payload.length >= text.length && [...text].every((c, i) => payload[i] === c.charCodeAt(0));
}

/** The index of the first start of image (FF D8 FF) after index 0 in the bytes, or -1. */
export function findEmbeddedImage(data: Uint8Array, from = 0): number {
  for (let i = from; i + 2 < data.length; i++) if (data[i] === 0xff && data[i + 1] === 0xd8 && data[i + 2] === 0xff) return i;
  return -1;
}

export function auditJpeg(data: Uint8Array): PhFinding[] {
  const out: PhFinding[] = [];
  const parts = parseJpeg(data);
  for (const e of errorsOf(parts)) out.push({ code: "ph-malformed", detail: e, offset: Number(/at (\d+)$/.exec(e)?.[1] ?? 0) });
  for (const s of metadataSegments(parts)) {
    const where = `${s.name} (${s.length} bytes)`;
    if (s.marker === 0xfe) out.push({ code: "ph-comment", detail: where, offset: s.offset });
    else if (s.marker === 0xe1 && isExifPayload(s.payload)) {
      const exif = readExif(s.payload);
      const pos = gpsPosition(exif.tags);
      if (pos !== null) out.push({ code: "ph-exif-gps", detail: `${pos.latitude.toFixed(4)}, ${pos.longitude.toFixed(4)}`, offset: s.offset });
      else if (exif.tags.some((t) => t.ifd === "gps")) out.push({ code: "ph-exif-gps", detail: "a GPS directory with no position that could be read", offset: s.offset });
      const who = identityTags(exif.tags);
      if (who.length > 0) out.push({ code: "ph-exif-identity", detail: who.map((t) => t.name).join(", "), offset: s.offset });
      const when = timeTags(exif.tags);
      if (when.length > 0) out.push({ code: "ph-exif-time", detail: when.map((t) => t.name).join(", "), offset: s.offset });
      if (findEmbeddedImage(s.payload) >= 0) out.push({ code: "ph-embedded-image", detail: `in ${where}`, offset: s.offset });
      if (exif.tags.length === 0 && exif.problems.length > 0) out.push({ code: "ph-app-segment", detail: `${where}, an exif block that could not be read`, offset: s.offset });
    } else if (s.marker === 0xe1 && startsWithText(s.payload, XMP_HEADER)) out.push({ code: "ph-xmp", detail: where, offset: s.offset });
    else out.push({ code: "ph-app-segment", detail: where, offset: s.offset });
    if (s.marker !== 0xe1 && findEmbeddedImage(s.payload) >= 0) out.push({ code: "ph-embedded-image", detail: `in ${where}`, offset: s.offset });
  }
  const trailer = trailerBytes(data, parts);
  if (trailer.length > 0) {
    out.push({ code: "ph-trailer", detail: `${trailer.length} bytes after the end of image`, offset: data.length - trailer.length });
    if (findEmbeddedImage(trailer) >= 0) out.push({ code: "ph-trailer-image", detail: "a second picture after the end of image", offset: data.length - trailer.length + findEmbeddedImage(trailer) });
  }
  return out.sort((a, b) => a.offset - b.offset || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
}

export function isClean(data: Uint8Array): boolean {
  return auditJpeg(data).length === 0;
}

export function countCodes(findings: readonly PhFinding[]): Record<PhCode, number> {
  const out = Object.fromEntries(PH_CODES.map((c) => [c, 0])) as Record<PhCode, number>;
  for (const f of findings) out[f.code]++;
  return out;
}

export function formatPhFinding(f: PhFinding): string {
  return `${f.code} at ${f.offset}: ${f.detail}`;
}

/** The codes that mean something about a person or a place was found, not only that the file is odd. */
export const PH_LEAKS: readonly PhCode[] = ["ph-exif-gps", "ph-exif-identity", "ph-exif-time", "ph-xmp", "ph-embedded-image", "ph-comment", "ph-app-segment", "ph-trailer", "ph-trailer-image"];
