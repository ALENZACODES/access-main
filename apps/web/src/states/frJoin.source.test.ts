import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Files whose "; " joins are never shown to a person as copy: HTTP header values and error messages for developers. */
const NOT_COPY = new Set(["securityHeaders.ts", "htmlAudit.ts"]);
/** The one join in packAudit.ts builds the message of a thrown developer error, from issue codes. */
const isAuditErrorJoin = (file: string, lines: string[], i: number): boolean => file === "packAudit.ts" && lines.slice(Math.max(0, i - 4), i + 1).some((l) => l.includes("result.issues"));
const sources = readdirSync(new URL("./", import.meta.url)).filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f));
const read = (f: string) => readFileSync(new URL(`./${f}`, import.meta.url), "utf8");

describe("a list joined with a semicolon in what a person reads", () => {
  it("is joined with the French spacing in French, in every source file", () => {
    const bad: string[] = [];
    for (const file of sources) {
      if (NOT_COPY.has(file)) continue;
      const lines = read(file).split("\n");
      lines.forEach((line, i) => {
        if (isAuditErrorJoin(file, lines, i)) return;
        // A join inside t(locale, en, fr) is spaced by the French typography pass, so only its English side has a plain "; ".
        if (/\bt\((locale|l),/.test(line)) return;
        if (/\.join\(\s*"; "\s*\)/.test(line)) bad.push(`${file}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(bad).toEqual([]);
  });
  it("the allow-listed files really are not copy", () => {
    for (const file of NOT_COPY) expect(read(file), file).not.toMatch(/\bt\(\s*locale/);
  });
});
