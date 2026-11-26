/**
 * Hand a text file to the person's browser to save. Nothing is uploaded: the content is already on
 * this device, and the file is made from it in memory.
 */
export interface SavedFile {
  readonly name: string;
  readonly mime: string;
  readonly content: string;
}

/** A file name safe on every system: no path parts, no control characters, no reserved characters. */
export function safeFileName(name: string, fallback = "download.txt"): string {
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is removed
  const cleaned = name.replace(/[\u0000-\u001F\u007F<>:"/\\|?*]+/g, "-").replace(/^[.\s-]+/, "").trim().slice(0, 120);
  return cleaned === "" ? fallback : cleaned;
}

/** Saves the supplied bytes through a temporary link, including any byte-order mark. */
export function saveBlobFile(blob: Blob, name: string, doc: Document = document): boolean {
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return false;
  const link = doc.createElement("a");
  const url = URL.createObjectURL(blob);
  try {
    link.href = url;
    link.download = safeFileName(name);
    link.rel = "noopener";
    doc.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
  return true;
}

/** Save a text export using its declared MIME type. */
export function saveTextFile(file: SavedFile, doc: Document = document): boolean {
  if (typeof Blob === "undefined") return false;
  return saveBlobFile(new Blob([file.content], { type: file.mime }), file.name, doc);
}
