// Audit of the masking reader and the scan over every real file of the App: whatever the files hold, the mask keeps
// their length and lines, masking is stable, the scan gives lines inside the file, and the sites of a file are the same
// whether it is scanned alone or with the rest. It also checks a few figures about the tree so that the audit cannot
// pass by reading nothing.

import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { maskCode } from "./idMask";
import { countScanned, isIdScanned, scanFile, scanIds } from "./idScan";
import { loadFiles } from "./repoFiles";

const ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));
const files = loadFiles(ROOT, ["apps/web/src"]).filter((f) => /\.(?:ts|tsx|js|jsx|mjs|cjs|mts|cts)$/.test(f.path));

// These read and mask every script of the App, several times over; the tree is large, so give them room on slow CI runners.
describe("every script of the App", { timeout: 30_000 }, () => {
  it("is read", () => {
    expect(files.length).toBeGreaterThan(500);
    expect(files.some((f) => f.path.endsWith(".tsx"))).toBe(true);
  });
  it("keeps its length and its lines when masked", () => {
    const bad = files.filter((f) => {
      const m = maskCode(f.text);
      return m.length !== f.text.length || m.split("\n").length !== f.text.split("\n").length;
    });
    expect(bad.map((f) => f.path)).toEqual([]);
  });
  it("is masked to the same text when masked again", () => {
    const bad = files.filter((f) => maskCode(maskCode(f.text)) !== maskCode(f.text));
    expect(bad.map((f) => f.path)).toEqual([]);
  });
  it("only has characters blanked, never changed", () => {
    for (const f of files) {
      const m = maskCode(f.text);
      for (let i = 0; i < m.length; i++) {
        if (m[i] !== f.text[i] && m[i] !== " ") throw new Error(`${f.path}: character ${i} was changed`);
      }
    }
  });
  it("has balanced braces, brackets and parentheses once masked: a text, a comment or a regular expression was not taken for code", () => {
    const count = (s: string, c: string): number => s.split(c).length - 1;
    const bad = files.filter((f) => {
      const m = maskCode(f.text);
      return count(m, "{") !== count(m, "}") || count(m, "(") !== count(m, ")") || count(m, "[") !== count(m, "]");
    });
    expect(bad.map((f) => f.path)).toEqual([]);
  });
  it("gives sites with lines inside the file", () => {
    for (const f of files) for (const s of scanFile(f)) expect(s.line >= 1 && s.line <= f.text.split("\n").length, `${f.path}:${s.line}`).toBe(true);
  });
  it("gives the same sites alone as with the rest", () => {
    const all = scanIds(files);
    for (const f of files.slice(0, 200)) expect(all.filter((s) => s.path === f.path)).toEqual(scanFile(f));
  });
  it("is scanned only where the scan says so", () => {
    expect(countScanned(files)).toBe(files.filter((f) => isIdScanned(f.path)).length);
    for (const s of scanIds(files)) expect(s.path).not.toMatch(/\.test\.|\/e2e\/|privacy\/audit\//);
  });
  it("gives a figure that is larger than a handful and smaller than the whole tree", () => {
    const n = scanIds(files).length;
    expect(n).toBeGreaterThan(10);
    expect(n).toBeLessThan(200);
  });
});
