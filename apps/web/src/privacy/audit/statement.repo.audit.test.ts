// CI audit: every statement in the App's text that says data stays on the device or is not sent is listed in
// statementRegister.ts, and the list is kept in step with the source in both directions.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CALL_REGISTER } from "../panel/addressRegister";
import { STATEMENT_REGISTER, checkStatementRegister, checkStatements } from "../panel/statementRegister";
import { compareClaims, formatClaimComparison, scanClaims } from "./claimScan";
import { scanCalls } from "./addressScan";
import { loadFiles } from "./repoFiles";

const ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));

describe("statements about data in the source", () => {
  const files = loadFiles(ROOT, ["apps/web/src"]);
  const found = scanClaims(files);

  it("scans the real tree, so it cannot pass by finding nothing", () => {
    expect(found.length).toBeGreaterThan(5);
    expect(found.map((f) => f.path)).toContain("apps/web/src/i18n/en.ts");
  });

  it("matches the register in both directions", () => {
    const c = compareClaims(found, STATEMENT_REGISTER);
    expect(c, `\n${formatClaimComparison(c)}\n`).toEqual({ unlisted: [], stale: [], differences: [] });
  });

  it("has a well-formed register whose files exist", () => {
    expect(checkStatementRegister(STATEMENT_REGISTER)).toEqual([]);
    for (const r of STATEMENT_REGISTER) expect(existsSync(join(ROOT, r.path)), r.path).toBe(true);
  });

  it("agrees with the scan of network requests about which files make them", () => {
    const calling = new Set(scanCalls(files).map((c) => c.path));
    for (const r of checkStatements(STATEMENT_REGISTER, CALL_REGISTER)) expect(r.check === "requests-in-file", r.row.path).toBe(calling.has(r.row.path));
  });

  it("names every file that holds a statement and also makes a request, so the check says unknown for it", () => {
    const both = checkStatements(STATEMENT_REGISTER, CALL_REGISTER).filter((r) => r.check === "requests-in-file");
    expect(both.map((r) => r.row.path)).toEqual([]);
  });

  it("only counts statements on lines that hold a quoted string", () => {
    for (const f of found) {
      const lines = readFileSync(join(ROOT, f.path), "utf8").split("\n");
      for (const n of f.lines) expect(/["'`]/.test(lines[n - 1] ?? ""), `${f.path}:${n}`).toBe(true);
    }
  });

  describe("would fail on a change, so it cannot pass by being blind", () => {
    const withFile = (path: string, text: string) => [...files, { path, text }];
    const cmp = (path: string, text: string) => compareClaims(scanClaims(withFile(path, text)), STATEMENT_REGISTER);

    it("fails when a new page says nothing is sent", () => {
      const c = cmp("apps/web/src/x/new.ts", 'export const note = "Nothing is sent.";');
      expect(c.unlisted.map((u) => u.path)).toEqual(["apps/web/src/x/new.ts"]);
      expect(formatClaimComparison(c)).toContain("apps/web/src/x/new.ts: holds 1 statement (line 1)");
    });

    it("fails when a new French statement is added to a listed file", () => {
      const path = "apps/web/src/hub/i18n.ts";
      const c = cmp(path, `${readFileSync(join(ROOT, path), "utf8")}\nexport const extra = "Rien n’est envoyé.";`);
      expect(c.differences.join("\n")).toContain("the register says 3 English and 4 French, the source has 3 and 5");
    });

    it("fails when a listed file loses its statements", () => {
      const c = compareClaims(found.filter((f) => !f.path.endsWith("pages/AboutPage.tsx")), STATEMENT_REGISTER);
      expect(c.stale.map((r) => r.path)).toEqual(["apps/web/src/pages/AboutPage.tsx"]);
    });

    it("fails when a listed file makes a request, by turning the row to unknown", () => {
      const calls = [...CALL_REGISTER, { ...CALL_REGISTER[0]!, path: "apps/web/src/pages/AboutPage.tsx" }];
      const r = checkStatements(STATEMENT_REGISTER, calls).find((x) => x.row.path === "apps/web/src/pages/AboutPage.tsx");
      expect(r?.check).toBe("requests-in-file");
    });
  });
});
