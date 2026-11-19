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

/** Save through a temporary link. Returns false, and does nothing, where the browser cannot make a file. */
export function saveTextFile(file: SavedFile, doc: Document = document): boolean {
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function" || typeof Blob === "undefined") return false;
  const url = URL.createObjectURL(new Blob([file.content], { type: file.mime }));
  try {
    const link = doc.createElement("a");
    link.href = url;
    link.download = safeFileName(file.name);
    link.rel = "noopener";
    doc.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
  return true;
}
