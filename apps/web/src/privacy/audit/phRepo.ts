// A reader for how photos get into the App's storage and out of it, from source text. It finds where a stored photo
// is written, where the picture functions are called, and where a file that is picked is turned into stored bytes, so
// a test can check that no stored photo skips the cleaning step. It reads text only; it does not run anything.

import type { SourceFile } from "./repoAudit";

export interface PhotoWrite {
  path: string;
  line: number;
  call: string;
}

export interface PhotoSite {
  path: string;
  line: number;
  /** The name that was called, such as sanitisePhoto. */
  name: string;
}

const WRITE = /\.photos\s*\.\s*(put|add|bulkPut|bulkAdd|update)\s*\(/g;
const NAMES = ["sanitisePhoto", "stripJpegMetadata", "createImageBitmap", "exportZip"] as const;

const lineOf = (text: string, index: number): number => text.slice(0, index).split("\n").length;

/** Code with comments and the inside of strings blanked, same length, so a name in text is not a call. */
export function blankNonCode(text: string): string {
  const out = text.split("");
  let i = 0;
  const blank = (from: number, to: number): void => {
    for (let k = from; k < to && k < out.length; k++) if (out[k] !== "\n") out[k] = " ";
  };
  while (i < text.length) {
    const c = text[i];
    const n = text[i + 1];
    if (c === "/" && n === "/") {
      const end = text.indexOf("\n", i);
      const stop = end < 0 ? text.length : end;
      blank(i, stop);
      i = stop;
    } else if (c === "/" && n === "*") {
      const end = text.indexOf("*/", i + 2);
      const stop = end < 0 ? text.length : end + 2;
      blank(i, stop);
      i = stop;
    } else if (c === '"' || c === "'") {
      let k = i + 1;
      while (k < text.length && text[k] !== c && text[k] !== "\n") k += text[k] === "\\" ? 2 : 1;
      blank(i + 1, k);
      i = k + 1;
    } else {
      i++;
    }
  }
  return out.join("");
}

export function findPhotoWrites(files: readonly SourceFile[]): PhotoWrite[] {
  const out: PhotoWrite[] = [];
  for (const f of files) {
    const code = blankNonCode(f.text);
    for (const m of code.matchAll(WRITE)) out.push({ path: f.path, line: lineOf(code, m.index ?? 0), call: m[1] ?? "" });
  }
  return out;
}

export function findPhotoSites(files: readonly SourceFile[]): PhotoSite[] {
  const out: PhotoSite[] = [];
  for (const f of files) {
    const code = blankNonCode(f.text);
    for (const name of NAMES) {
      const re = new RegExp(`\\b${name}\\s*\\(`, "g");
      for (const m of code.matchAll(re)) out.push({ path: f.path, line: lineOf(code, m.index ?? 0), name });
    }
  }
  return out.sort((a, b) => (a.path === b.path ? a.line - b.line : a.path < b.path ? -1 : 1));
}

/**
 * For each write of a stored photo, whether the same file calls sanitisePhoto before it. A file that writes photos
 * and does not is a way for a raw picture to be stored.
 */
export function unsanitisedWrites(files: readonly SourceFile[]): PhotoWrite[] {
  const bad: PhotoWrite[] = [];
  for (const w of findPhotoWrites(files)) {
    const sites = findPhotoSites(files.filter((f) => f.path === w.path));
    if (!sites.some((s) => s.name === "sanitisePhoto" && s.line < w.line)) bad.push(w);
  }
  return bad;
}

/** Whether a file's text writes the `name` of a picked file into stored data, which would keep a file name. */
export function storesFileName(text: string): boolean {
  const code = blankNonCode(text);
  return /name\s*:\s*(?:file|f|p|photo)\.name\b/.test(code) || /\bname\s*:\s*[a-z]+\.name\s*\.\s*slice/.test(code);
}
