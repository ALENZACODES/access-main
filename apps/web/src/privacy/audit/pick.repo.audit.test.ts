// CI audit: every place in the App's source that reads a file the person chose is in pickRegister.ts, kind by kind and
// file by file, and every row is still true. A new file input or file reader fails here, so a new way for a file to
// come into the App is always a visible decision.

import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PICK_REGISTER, pickCounts, validatePick } from "../panel/pickRegister";
import { comparePicks, formatPickComparison, isCleanPick, pickTotalsByKind, scanPicks } from "./pickScan";
import { loadFiles } from "./repoFiles";

const ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));

/** The folders the scan reads: the web app. The packages have no file input. */
export const PICK_FOLDERS = ["apps/web/src"] as const;

describe("files you choose, in the source", () => {
  const files = loadFiles(ROOT, [...PICK_FOLDERS]);
  const found = scanPicks(files);

  it("scans the real tree, so it cannot pass by finding nothing", () => {
    expect(files.map((f) => f.path)).toContain("apps/web/src/contribute/ContributePage.tsx");
    expect(files.map((f) => f.path)).toContain("apps/web/src/privacy/panel/mount.ts");
    expect(found.length).toBeGreaterThan(20);
    expect(new Set(found.map((f) => f.kind)).size).toBe(2);
  });

  it("matches the register in both directions", () => {
    const c = comparePicks(found, PICK_REGISTER);
    expect(isCleanPick(c), `\n${formatPickComparison(c)}\n`).toBe(true);
  });

  it("has a well-formed register", () => {
    expect(validatePick(PICK_REGISTER)).toEqual([]);
  });

  it("has a file that exists for every row, and for every file named as the place a limit is applied", () => {
    const paths = new Set(files.map((f) => f.path));
    for (const r of PICK_REGISTER) {
      expect(paths.has(r.path), r.path).toBe(true);
      if (r.checkedIn !== undefined) expect(paths.has(r.checkedIn), r.checkedIn).toBe(true);
    }
  });

  it("agrees with the register about how many places there are", () => {
    expect(found.reduce((n, f) => n + f.lines.length, 0)).toBe(pickCounts(PICK_REGISTER).uses);
    expect(pickTotalsByKind(found).reduce((n, t) => n + t.places, 0)).toBe(pickCounts(PICK_REGISTER).uses);
  });

  it("counts the files the same way the register does", () => {
    expect(new Set(found.map((f) => f.path)).size).toBe(pickCounts(PICK_REGISTER).files);
  });

  describe("fails when the source and the register disagree", () => {
    const rows = PICK_REGISTER;
    const plus = (path: string, text: string) => [...files, { path, text }];
    const change = (path: string, edit: (text: string) => string) => files.map((x) => (x.path === path ? { ...x, text: edit(x.text) } : x));

    it("for a new file with a file input", () => {
      const c = comparePicks(scanPicks(plus("apps/web/src/map/New.tsx", "const f = input.files?.[0];\n")), rows);
      expect(c.unlisted).toEqual([{ kind: "pick", path: "apps/web/src/map/New.tsx", lines: [1] }]);
      expect(formatPickComparison(c)).toContain("apps/web/src/map/New.tsx:1: 1 pick place found and no row lists them");
    });

    it("for a new file reader", () => {
      expect(comparePicks(scanPicks(plus("apps/web/src/map/R.tsx", "const r = new FileReader();")), rows).unlisted.map((u) => u.kind)).toEqual(["reader"]);
    });

    it("for a new way to take a file in a listed file", () => {
      const mutated = change("apps/web/src/contribute/ContributePage.tsx", (t) => `${t}\nconst again = e.target.files?.[0];\n`);
      expect(comparePicks(scanPicks(mutated), rows).wrongCount).toEqual([{ kind: "pick", path: "apps/web/src/contribute/ContributePage.tsx", listed: 2, found: 3 }]);
    });

    it("for a reader added to a file that only picks", () => {
      const mutated = change("apps/web/src/recovery/RecoveryTaskBoard.tsx", (t) => `${t}\nconst r = new FileReader();\n`);
      expect(comparePicks(scanPicks(mutated), rows).unlisted.map((u) => `${u.kind} ${u.path.split("/").pop()}`)).toEqual(["reader RecoveryTaskBoard.tsx"]);
    });

    it("for a pick taken out of a listed file", () => {
      const mutated = change("apps/web/src/recovery/RecoveryTaskBoard.tsx", (t) => t.replace(/\.files\?\.\[0\]/g, ".value"));
      expect(comparePicks(scanPicks(mutated), rows).gone).toEqual([{ kind: "pick", path: "apps/web/src/recovery/RecoveryTaskBoard.tsx" }]);
    });

    it("for a row whose file was deleted", () => {
      const mutated = files.filter((x) => x.path !== "apps/web/src/recovery/RecoveryDrillPanel.tsx");
      expect(comparePicks(scanPicks(mutated), rows).gone.map((g) => g.path)).toEqual(["apps/web/src/recovery/RecoveryDrillPanel.tsx"]);
    });

    it("but not for a comment that mentions a call", () => {
      const mutated = change("apps/web/src/recovery/RecoveryTaskBoard.tsx", (t) => `// input.files?.[0]\n${t}`);
      expect(isCleanPick(comparePicks(scanPicks(mutated), rows))).toBe(true);
    });
  });
});
