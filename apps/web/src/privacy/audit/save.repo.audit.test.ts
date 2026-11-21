// CI audit: every place in the App's source that makes a file for the person to save is in saveRegister.ts, file by
// file, with the right number of places and the formats the file names, and every row is still true. A new download
// fails here, so a new way for the App to hand a file to a person is always a visible decision.

import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SAVE_KINDS, SAVE_REGISTER, saveCounts, validateSave } from "../panel/saveRegister";
import { loadFiles } from "./repoFiles";
import { compareSave, formatSaveComparison, isCleanSave, saveTotalsByKind, scanSave } from "./saveScan";

const ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));

/** The folders the scan reads: the web app and every package. */
export const SAVE_FOLDERS = ["apps/web/src", "packages"] as const;

describe("downloads, in the source", () => {
  const files = loadFiles(ROOT, [...SAVE_FOLDERS]);
  const found = scanSave(files);

  it("scans the real tree, so it cannot pass by finding nothing", () => {
    const paths = files.map((f) => f.path);
    expect(paths).toContain("apps/web/src/states/downloadFile.ts");
    expect(paths).toContain("packages/contribute/src/export.ts");
    expect(found.length).toBeGreaterThan(30);
    expect(new Set(found.map((f) => f.kind)).size).toBe(SAVE_KINDS.length);
  });

  it("matches the register in both directions", () => {
    const c = compareSave(found, SAVE_REGISTER);
    expect(isCleanSave(c), `\n${formatSaveComparison(c)}\n`).toBe(true);
  });

  it("has a well-formed register", () => {
    expect(validateSave(SAVE_REGISTER)).toEqual([]);
  });

  it("has a file that exists for every row", () => {
    const paths = new Set(files.map((f) => f.path));
    for (const r of SAVE_REGISTER) expect(paths.has(r.path), r.path).toBe(true);
  });

  it("agrees with the register about how many places and files there are", () => {
    expect(found.reduce((n, f) => n + f.lines.length, 0)).toBe(saveCounts(SAVE_REGISTER).uses);
    expect(found.length).toBe(saveCounts(SAVE_REGISTER).files);
    expect(saveTotalsByKind(found, SAVE_KINDS).reduce((n, t) => n + t.places, 0)).toBe(saveCounts(SAVE_REGISTER).uses);
  });

  it("finds each kind in as many files as the register has rows of that kind", () => {
    for (const t of saveTotalsByKind(found, SAVE_KINDS)) expect(SAVE_REGISTER.filter((r) => r.kind === t.kind).length, t.kind).toBe(t.files);
  });

  it("is not fooled by the privacy panel's own look at whether the browser can make a file", () => {
    expect(found.map((f) => f.path)).not.toContain("apps/web/src/privacy/panel/saveLive.ts");
    expect(files.find((f) => f.path === "apps/web/src/privacy/panel/saveLive.ts")?.text).toContain("createObjectURL");
  });

  describe("fails when the source and the register disagree", () => {
    const rows = SAVE_REGISTER;
    const plus = (path: string, text: string) => [...files, { path, text }];
    const change = (path: string, edit: (text: string) => string) => files.map((x) => (x.path === path ? { ...x, text: edit(x.text) } : x));

    it("for a new file that makes a download", () => {
      const c = compareSave(scanSave(plus("apps/web/src/map/New.tsx", "const u = URL.createObjectURL(new Blob([x]));\n")), rows);
      expect(c.unlisted).toEqual([{ path: "apps/web/src/map/New.tsx", lines: [1], kind: "none" }]);
      expect(formatSaveComparison(c)).toContain("apps/web/src/map/New.tsx:1: 1 place found that makes a file, and no row lists it");
    });

    it("for a new package file that makes a download", () => {
      const c = compareSave(scanSave(plus("packages/newpkg/src/save.ts", "export const go = () => URL.createObjectURL(b);")), rows);
      expect(c.unlisted.map((u) => u.path)).toEqual(["packages/newpkg/src/save.ts"]);
    });

    it("for one more place in a listed file", () => {
      const mutated = change("apps/web/src/hub/ReportsPage.tsx", (t) => `${t}\nconst more = URL.createObjectURL(b);\n`);
      expect(compareSave(scanSave(mutated), rows).wrongCount).toEqual([{ path: "apps/web/src/hub/ReportsPage.tsx", listed: 1, found: 2 }]);
    });

    it("for a place taken out of a file that has several", () => {
      const mutated = change("apps/web/src/offline/robust/handoffRehearsalPanel.ts", (t) => t.replace(/URL\.createObjectURL\(/, "makeAddress("));
      expect(compareSave(scanSave(mutated), rows).wrongCount).toEqual([{ path: "apps/web/src/offline/robust/handoffRehearsalPanel.ts", listed: 2, found: 1 }]);
    });

    it("for the only place taken out of a listed file", () => {
      const mutated = change("apps/web/src/hub/ReportsPage.tsx", (t) => t.replace(/URL\.createObjectURL\(/g, "makeAddress("));
      expect(compareSave(scanSave(mutated), rows).gone).toEqual([{ path: "apps/web/src/hub/ReportsPage.tsx" }]);
    });

    it("for a row whose file was deleted", () => {
      const mutated = files.filter((x) => x.path !== "packages/trip-check/src/export.ts");
      expect(compareSave(scanSave(mutated), rows).gone.map((g) => g.path)).toEqual(["packages/trip-check/src/export.ts"]);
    });

    it("for a file that starts to name a new format", () => {
      const mutated = change("apps/web/src/offline/robust/readinessPanel.ts", (t) => `${t}\nconst csv = "text/csv";\n`);
      expect(compareSave(scanSave(mutated), rows).wrongKind).toEqual([{ path: "apps/web/src/offline/robust/readinessPanel.ts", listed: "json", found: "mixed" }]);
    });

    it("for a file that stops naming a format", () => {
      const mutated = change("apps/web/src/pages/DataStatusPage.tsx", (t) => t.replace(/text\/csv/g, "text/x"));
      expect(compareSave(scanSave(mutated), rows).wrongKind).toEqual([{ path: "apps/web/src/pages/DataStatusPage.tsx", listed: "csv", found: "none" }]);
    });

    it("but not for a comment that mentions the call, or for a look at whether it exists", () => {
      const mutated = change("apps/web/src/hub/ReportsPage.tsx", (t) => `// URL.createObjectURL(b)\nconst ok = typeof URL.createObjectURL === "function";\n${t}`);
      expect(isCleanSave(compareSave(scanSave(mutated), rows))).toBe(true);
    });

    it("but not for a format named only in a comment", () => {
      const mutated = change("apps/web/src/hub/ReportsPage.tsx", (t) => `// text/csv application/json\n${t}`);
      expect(isCleanSave(compareSave(scanSave(mutated), rows))).toBe(true);
    });
  });
});
