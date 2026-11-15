
async function readBlobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === "function") return new Uint8Array(await blob.arrayBuffer());
  return new Uint8Array(await new Response(blob).arrayBuffer());
}
function copyBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

/** Canvas decoding and re-encoding discards source EXIF, XMP and GPS metadata. */
export async function sanitisePhoto(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("Not an image");
  if (file.size > 20 * 1024 * 1024) throw new Error("Image exceeds 20 MB");
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const result = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Image encoding failed")), "image/jpeg", 0.88);
    });
    // Strip even metadata inserted by a non-conforming encoder.
    return stripJpegMetadata(result);
  } finally {
    bitmap.close();
  }
}

/** Retain only JPEG image data and non-metadata markers. */
export async function stripJpegMetadata(blob: Blob): Promise<Blob> {
  const data = await readBlobBytes(blob);
  if (data[0] !== 0xff || data[1] !== 0xd8) throw new Error("Invalid JPEG");
  const segments: Uint8Array[] = [data.subarray(0, 2)];
  let offset = 2;
  while (offset < data.length) {
    if (data[offset] !== 0xff) throw new Error("Malformed JPEG marker");
    const marker = data[offset + 1];
    const lengthHi = data[offset + 2];
    const lengthLo = data[offset + 3];
    if (marker === undefined) throw new Error("Malformed JPEG marker");
    if (marker === 0xda) { segments.push(data.subarray(offset)); break; }
    if (marker === 0xd9) { segments.push(data.subarray(offset, offset + 2)); break; }
    if (offset + 4 > data.length || lengthHi === undefined || lengthLo === undefined) throw new Error("Truncated JPEG");
    const size = (lengthHi << 8) | lengthLo;
    if (size < 2 || offset + 2 + size > data.length) throw new Error("Malformed JPEG segment");
    const end = offset + 2 + size;
    // APP0-APP15 and COM may contain identifying metadata; discard all.
    if (!((marker >= 0xe0 && marker <= 0xef) || marker === 0xfe)) segments.push(data.subarray(offset, end));
    offset = end;
  }
  return new Blob(segments.map(copyBytes), { type: "image/jpeg" });
}
