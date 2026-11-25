// CI audit: what the code does around each download matches what the list promises. Every file that makes a download
// address also gives it back, names the file, and clicks a link it made; none sends anything over the network or
// opens another page; and only the evidence workbench names a web page as a format. The checks read the source, so
// they show the code is written that way, not that a given download behaves that way when it runs.

import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SAVE_REGISTER } from "../panel/saveRegister";
import { loadFiles } from "./repoFiles";
import { scanSave, withoutComments } from "./saveScan";
import { isScannedSource } from "./storageKeys";

const ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));
const files = loadFiles(ROOT, ["apps/web/src", "packages"]);
const found = scanSave(files);
const codeOf = (path: string): string => withoutComments(files.find((f) => f.path === path)?.text ?? "");
const count = (text: string, re: RegExp): number => (text.match(re) ?? []).length;

describe("downloads, in what the code does", () => {
  it("reads a real tree", () => {
    expect(found.length).toBe(SAVE_REGISTER.length);
  });

  it("gives every download address back, at least as often as it makes one", () => {
    for (const f of found) expect(count(codeOf(f.path), /\bURL\.revokeObjectURL\b|\brevokeUrl\b/g), f.path).toBeGreaterThanOrEqual(f.lines.length);
  });

  it("names the file it saves, in every file that makes one", () => {
    for (const f of found) expect(count(codeOf(f.path), /\.download\s*=|setAttribute\(\s*["']download|\bdownload\s*[:=]/g), f.path).toBeGreaterThanOrEqual(1);
  });

  it("clicks a link it made, in every file that makes one", () => {
    for (const f of found) expect(count(codeOf(f.path), /\.click\s*\(|\bdownload\s*\(/g), f.path).toBeGreaterThanOrEqual(1);
  });

  it("sends nothing over the network from a file that makes a download", () => {
    const net = /\b(?:fetch|sendBeacon|XMLHttpRequest|WebSocket|EventSource)\b/g;
    const withNet = found.filter((f) => count(codeOf(f.path), net) > 0).map((f) => f.path);
    // data-status/standalone/main.ts fetches the status file it shows; that call is checked below.
    expect(withNet).toEqual(["apps/web/src/data-status/standalone/main.ts"]);
  });

  it("makes the one network call in the data status page a read of the file it shows, not a send", () => {
    const lines = codeOf("apps/web/src/data-status/standalone/main.ts")
      .split("\n")
      .filter((l) => /\bfetch\b/.test(l));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/fetch\(url, \{ headers: \{ accept: 'application\/json' \} \}\)/);
    expect(lines[0]).not.toMatch(/method|body/);
  });

  it("opens no other page from a file that makes a download", () => {
    for (const f of found) expect(count(codeOf(f.path), /\bwindow\.open\b|\blocation\.(?:href|assign|replace)\b/g), f.path).toBe(0);
  });

  it("names a web page as a format only in the evidence workbench", () => {
    const html = found.filter((f) => /text\/html/.test(codeOf(f.path))).map((f) => f.path);
    expect(html).toEqual(["apps/web/src/offline/evidence-workbench/EvidenceWorkbench.tsx"]);
  });

  it("never asks the person where to save, and never writes to a folder", () => {
    const code = files.filter((f) => isScannedSource(f.path)).map((f) => `${f.path}\n${withoutComments(f.text)}`);
    for (const c of code) expect(c.split("\n").slice(1).join("\n")).not.toMatch(/showSaveFilePicker|showDirectoryPicker|FileSystemFileHandle|createWritable/);
  });

  it("does not make a download from a page that is only loading: no call at the top of a file", () => {
    for (const f of found) {
      const text = files.find((x) => x.path === f.path)?.text ?? "";
      const lines = text.split("\n");
      for (const n of f.lines) expect(/^\S/.test(lines[n - 1] ?? ""), `${f.path}:${n}`).toBe(false);
    }
  });

  it("never puts a download address in storage or in the page's address", () => {
    for (const f of found) {
      const code = codeOf(f.path);
      expect(code, f.path).not.toMatch(/(?:localStorage|sessionStorage)\.setItem\([^)]*(?:createObjectURL|objectUrl)/);
      expect(code, f.path).not.toMatch(/history\.(?:push|replace)State\([^)]*(?:createObjectURL|objectUrl)/);
    }
  });

  it("lists the privacy panel's own download, which is handed over by the page and not made by the controller", () => {
    expect(found.map((f) => f.path)).toContain("apps/web/src/privacy/panel/mount.ts");
    expect(files.find((f) => f.path === "apps/web/src/privacy/panel/controller.ts")?.text).not.toMatch(/createObjectURL/);
  });

  it("keeps the plain-language rows free of the names of files and of browser functions", () => {
    for (const r of SAVE_REGISTER) expect(`${r.makes.en} ${r.makes.fr}`, r.path).not.toMatch(/createObjectURL|\bBlob\b|\.tsx?\b/);
  });
});
