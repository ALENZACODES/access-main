import { describe, expect, it } from "vitest";
import type { CallRow } from "./addressRegister";
import { STATEMENT_REGISTER, checkStatementRegister, checkStatements, statementTotal, type StatementRow } from "./statementRegister";

const row = (over: Partial<StatementRow> = {}): StatementRow => ({ path: "a/b.ts", where: { en: "A page", fr: "Une page" }, en: 1, fr: 0, source: "s", recordedOn: "2026-11-20", ...over });
const call = (path: string): CallRow => ({ path, calls: 1, destination: "same-site", holds: { en: "x", fr: "y" }, source: "s", recordedOn: "2026-11-20" });

describe("the real register", () => {
  it("has no problems", () => {
    expect(checkStatementRegister(STATEMENT_REGISTER)).toEqual([]);
  });
  it("lists every file once, in the repository's own paths", () => {
    const paths = STATEMENT_REGISTER.map((r) => r.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const p of paths) expect(p.startsWith("apps/web/src/")).toBe(true);
  });
  it("counts the statements in total", () => {
    expect(statementTotal(STATEMENT_REGISTER)).toBe(STATEMENT_REGISTER.reduce((n, r) => n + r.en + r.fr, 0));
    expect(statementTotal([])).toBe(0);
  });
});

describe("checkStatements", () => {
  it("says no request in the file when the file is not among the places that make requests", () => {
    expect(checkStatements([row()], [call("other.ts")])[0]?.check).toBe("no-requests-in-file");
  });
  it("says requests in the file when it is", () => {
    expect(checkStatements([row()], [call("a/b.ts")])[0]?.check).toBe("requests-in-file");
  });
  it("keeps the order of the rows", () => {
    const rows = [row({ path: "z.ts" }), row({ path: "a.ts" })];
    expect(checkStatements(rows, []).map((r) => r.row.path)).toEqual(["z.ts", "a.ts"]);
  });
});

describe("checkStatementRegister", () => {
  it("accepts a clean row", () => {
    expect(checkStatementRegister([row()])).toEqual([]);
  });
  it("flags a path listed twice and an empty path", () => {
    expect(checkStatementRegister([row(), row()])).toEqual(["a/b.ts: listed twice"]);
    expect(checkStatementRegister([row({ path: " " })])).toContain("a row has an empty path");
  });
  it("flags counts that are not whole numbers of at least 0, and a row with no statements", () => {
    expect(checkStatementRegister([row({ en: -1 })])).toEqual(["a/b.ts: counts must be whole numbers of at least 0"]);
    expect(checkStatementRegister([row({ fr: 0.5 })])).toEqual(["a/b.ts: counts must be whole numbers of at least 0"]);
    expect(checkStatementRegister([row({ en: 0, fr: 0 })])).toEqual(["a/b.ts: has no statements"]);
  });
  it("flags empty text, a bad date and a blank source", () => {
    expect(checkStatementRegister([row({ where: { en: "", fr: "x" } })])).toEqual(["a/b.ts: where is empty in one language"]);
    expect(checkStatementRegister([row({ recordedOn: "today" })])).toEqual(["a/b.ts: recordedOn is not YYYY-MM-DD"]);
    expect(checkStatementRegister([row({ source: " " })])).toEqual(["a/b.ts: source is empty"]);
  });
});
