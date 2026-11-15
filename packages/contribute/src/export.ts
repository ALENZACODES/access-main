import { assertDraft, type Draft } from "./schema";

export interface FeatureCollection {
  type: "FeatureCollection";
  features: Array<{ type: "Feature"; geometry: { type: "Point"; coordinates: [number, number] } | null; properties: Draft }>;
}
export function toGeoJSON(drafts: Draft[]): FeatureCollection {
  drafts.forEach(assertDraft);
  return { type: "FeatureCollection", features: drafts.map((draft) => {
    const lat = draft.changes.latitude?.value;
    const lon = draft.changes.longitude?.value;
    const geometry = typeof lat === "number" && typeof lon === "number" && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180
      ? { type: "Point" as const, coordinates: [lon, lat] as [number, number] } : null;
    return { type: "Feature" as const, geometry, properties: draft };
  }) };
}
export function parseImport(value: unknown): Draft[] {
  let drafts: unknown;
  if (Array.isArray(value)) drafts = value;
  else if (value && typeof value === "object" && (value as { type?: string }).type === "FeatureCollection") {
    const features = (value as FeatureCollection).features;
    if (!Array.isArray(features) || features.some((f) => f.type !== "Feature")) throw new Error("Invalid GeoJSON");
    drafts = features.map((f) => f.properties);
  } else drafts = [value];
  if (!Array.isArray(drafts) || drafts.length > 500) throw new Error("Too many drafts");
  drafts.forEach(assertDraft);
  return drafts as Draft[];
}
export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const encoder = new TextEncoder();

function copyBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

const table = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const b of bytes) crc = (table[(crc ^ b) & 255] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function u16(view: DataView, offset: number, value: number): void { view.setUint16(offset, value, true); }
function u32(view: DataView, offset: number, value: number): void { view.setUint32(offset, value, true); }
function zipEntry(name: string, data: Uint8Array, offset: number): { local: Uint8Array; central: Uint8Array } {
  const filename = encoder.encode(name);
  const crc = crc32(data);
  const local = new Uint8Array(30 + filename.length + data.length);
  const l = new DataView(local.buffer);
  u32(l, 0, 0x04034b50); u16(l, 4, 20); u16(l, 6, 0x800); u16(l, 8, 0);
  u32(l, 14, crc); u32(l, 18, data.length); u32(l, 22, data.length); u16(l, 26, filename.length);
  local.set(filename, 30); local.set(data, 30 + filename.length);
  const central = new Uint8Array(46 + filename.length);
  const c = new DataView(central.buffer);
  u32(c, 0, 0x02014b50); u16(c, 4, 20); u16(c, 6, 20); u16(c, 8, 0x800);
  u32(c, 16, crc); u32(c, 20, data.length); u32(c, 24, data.length);
  u16(c, 28, filename.length); u32(c, 42, offset); central.set(filename, 46);
  return { local, central };
}
/** Offline ZIP, stored entries; no third-party service or upload path. */
export async function exportZip(drafts: Draft[], readPhoto: (id: string) => Promise<Blob | undefined>): Promise<Blob> {
  const files: Array<[string, Uint8Array]> = [
    ["contributions.json", encoder.encode(JSON.stringify(drafts, null, 2))],
    ["contributions.geojson", encoder.encode(JSON.stringify(toGeoJSON(drafts), null, 2))],
  ];
  const used = new Set<string>();
  for (const draft of drafts) for (const photo of draft.photos) {
    const name = `photos/${draft.id}/${photo.id}.jpg`;
    if (used.has(name)) continue;
    used.add(name);
    const blob = await readPhoto(photo.id);
    if (!blob) throw new Error(`Missing photo: ${photo.id}`);
    files.push([name, new Uint8Array(await blob.arrayBuffer())]);
  }
  let offset = 0;
  const locals: Uint8Array[] = [], centrals: Uint8Array[] = [];
  for (const [name, bytes] of files) {
    const entry = zipEntry(name, bytes, offset);
    locals.push(entry.local); centrals.push(entry.central); offset += entry.local.length;
  }
  const centralBytes = centrals.reduce((sum, item) => sum + item.length, 0);
  const end = new Uint8Array(22);
  const view = new DataView(end.buffer);
  u32(view, 0, 0x06054b50); u16(view, 8, files.length); u16(view, 10, files.length);
  u32(view, 12, centralBytes); u32(view, 16, offset);
  return new Blob([...locals, ...centrals, end].map(copyBytes), { type: "application/zip" });
}
