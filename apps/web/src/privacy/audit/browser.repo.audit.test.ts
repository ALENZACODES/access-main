// CI audit: every place in the App's source that asks the browser about the device or settings, makes a random
// identifier or writes a number in the browser's own language is in browserRegister.ts, kind by kind and file by file,
// and every row is still true. A new question to the browser fails here, so a new thing the App can learn about a
// person's device is always a visible decision.

import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BROWSER_REGISTER, browserCounts, validateBrowser } from "../panel/browserRegister";
import { browserTotalsByKind, compareBrowser, formatBrowserComparison, isCleanBrowser, scanBrowser } from "./browserScan";
import { loadFiles } from "./repoFiles";

const ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));

/** The folders the scan reads: the web app and every package. */
export const BROWSER_FOLDERS = ["apps/web/src", "packages"] as const;

describe("browser questions, in the source", () => {
  const files = loadFiles(ROOT, [...BROWSER_FOLDERS]);
  const found = scanBrowser(files);

  it("scans the real tree, so it cannot pass by finding nothing", () => {
    const paths = files.map((f) => f.path);
    expect(paths).toContain("apps/web/src/shell/useOnline.ts");
    expect(paths).toContain("packages/consent/src/main.tsx");
    expect(found.length).toBeGreaterThan(10);
    expect(new Set(found.map((f) => f.kind)).size).toBe(7);
  });

  it("matches the register in both directions", () => {
    const c = compareBrowser(found, BROWSER_REGISTER);
    expect(isCleanBrowser(c), `\n${formatBrowserComparison(c)}\n`).toBe(true);
  });

  it("has a well-formed register", () => {
    expect(validateBrowser(BROWSER_REGISTER)).toEqual([]);
  });

  it("has a file that exists for every row", () => {
    const paths = new Set(files.map((f) => f.path));
    for (const r of BROWSER_REGISTER) expect(paths.has(r.path), r.path).toBe(true);
  });

  it("agrees with the register about how many places there are", () => {
    expect(found.reduce((n, f) => n + f.lines.length, 0)).toBe(browserCounts(BROWSER_REGISTER).uses);
    expect(browserTotalsByKind(found).reduce((n, t) => n + t.places, 0)).toBe(browserCounts(BROWSER_REGISTER).uses);
    expect(new Set(found.map((f) => f.path)).size).toBe(browserCounts(BROWSER_REGISTER).files);
  });

  it("finds each kind in as many files as the register has rows of that kind", () => {
    for (const t of browserTotalsByKind(found)) expect(BROWSER_REGISTER.filter((r) => r.kind === t.kind).length, t.kind).toBe(t.files);
  });

  describe("fails when the source and the register disagree", () => {
    const rows = BROWSER_REGISTER;
    const plus = (path: string, text: string) => [...files, { path, text }];
    const change = (path: string, edit: (text: string) => string) => files.map((x) => (x.path === path ? { ...x, text: edit(x.text) } : x));

    it("for a new file that asks the browser its language", () => {
      const c = compareBrowser(scanBrowser(plus("apps/web/src/map/New.tsx", "const l = navigator.language;\n")), rows);
      expect(c.unlisted).toEqual([{ kind: "language", path: "apps/web/src/map/New.tsx", lines: [1] }]);
      expect(formatBrowserComparison(c)).toContain("apps/web/src/map/New.tsx:1: 1 language place found and no row lists them");
    });

    it("for each other kind of question in a new file", () => {
      const cases: Array<[string, string]> = [
        ["navigator.onLine", "online"],
        ["window.matchMedia('(prefers-color-scheme: dark)')", "preference"],
        ["await navigator.storage.estimate()", "storage-size"],
        ["crypto.randomUUID()", "identifier"],
        ["n.toLocaleString()", "own-language"],
      ];
      for (const [code, kind] of cases) expect(compareBrowser(scanBrowser(plus("apps/web/src/map/N.ts", code)), rows).unlisted.map((u) => u.kind), code).toEqual(expect.arrayContaining([kind]));
    });

    it("for a new package file that makes an identifier", () => {
      const c = compareBrowser(scanBrowser(plus("packages/newpkg/src/id.ts", "export const id = () => crypto.randomUUID();")), rows);
      expect(c.unlisted.map((u) => u.path)).toEqual(["packages/newpkg/src/id.ts"]);
    });

    it("for a new kind of question in a listed file", () => {
      const mutated = change("apps/web/src/shell/useOnline.ts", (t) => `${t}\nconst l = navigator.language;\n`);
      expect(compareBrowser(scanBrowser(mutated), rows).unlisted.map((u) => `${u.kind} ${u.path.split("/").pop()}`)).toEqual(["language useOnline.ts"]);
    });

    it("for one more place of a listed kind", () => {
      const mutated = change("apps/web/src/shell/useApplyPreferences.ts", (t) => `${t}\nconst more = window.matchMedia("(prefers-contrast: less)");\n`);
      expect(compareBrowser(scanBrowser(mutated), rows).wrongCount).toEqual([{ kind: "preference", path: "apps/web/src/shell/useApplyPreferences.ts", listed: 2, found: 3 }]);
    });

    it("for a question taken out of a listed file", () => {
      const mutated = change("apps/web/src/storage/repository.ts", (t) => t.replace(/crypto\.randomUUID\(\)/g, "makeId()"));
      expect(compareBrowser(scanBrowser(mutated), rows).gone).toEqual([{ kind: "identifier", path: "apps/web/src/storage/repository.ts" }]);
    });

    it("for a listed place that was removed from a file that has several", () => {
      const mutated = change("apps/web/src/offline/RegionPackPage.tsx", (t) => t.replace(/navigator\.onLine/, "online"));
      expect(compareBrowser(scanBrowser(mutated), rows).wrongCount).toEqual([{ kind: "online", path: "apps/web/src/offline/RegionPackPage.tsx", listed: 3, found: 2 }]);
    });

    it("for a row whose file was deleted", () => {
      const mutated = files.filter((x) => x.path !== "packages/proposals/src/store.ts");
      expect(compareBrowser(scanBrowser(mutated), rows).gone.map((g) => g.path)).toEqual(["packages/proposals/src/store.ts"]);
    });

    it("for a number written in the browser's language in a new place", () => {
      const mutated = change("apps/web/src/features/featureScreens.tsx", (t) => `${t}\nconst z = (3).toLocaleString();\n`);
      expect(compareBrowser(scanBrowser(mutated), rows).wrongCount.map((w) => `${w.kind} ${w.listed}->${w.found}`)).toEqual(["own-language 2->3"]);
    });

    it("but not for a number written with a named language", () => {
      const mutated = change("apps/web/src/features/featureScreens.tsx", (t) => `${t}\nconst z = (3).toLocaleString("fr-CA");\n`);
      expect(isCleanBrowser(compareBrowser(scanBrowser(mutated), rows))).toBe(true);
    });

    it("but not for a comment that mentions a call", () => {
      const mutated = change("apps/web/src/shell/useOnline.ts", (t) => `// navigator.language\n${t}`);
      expect(isCleanBrowser(compareBrowser(scanBrowser(mutated), rows))).toBe(true);
    });
  });
});
