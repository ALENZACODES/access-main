import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { diagnosticsCopy } from "./recoveryDiagnostics";
import { actionsCopy } from "./recoveryActions";
import { comparisonCopy } from "./recoveryComparison";
import { forbiddenOrgNeedles } from "../../../../packages/shared/test/forbiddenOrg.ts";

/**
 * Enforcement guard for the mounted recovery workstream. Tests intentionally
 * read its concrete source files so that a future regression fails CI when
 * the test runner executes *.test.ts in this directory.
 */
const root = dirname(fileURLToPath(import.meta.url));
function sourceFiles(): string[] {
  return readdirSync(root)
    .filter((file) => /\.(ts|tsx)$/.test(file) && !file.endsWith(".test.ts") && !file.endsWith(".test.tsx"))
    .sort();
}
function textOf(file: string): string {
  return readFileSync(join(root, file), "utf8");
}

const forbiddenClaims = new RegExp([
  "ver" + "ified", "vér" + "ifié", "real" + "-time",
  "partner" + "ship", "guaran" + "tee",
].join("|"), "i");

/** Extract only normal quoted user-copy from a module's copy object. */
function extractCopySegments(source: string): string[] {
  const segments: string[] = [];
  const patterns = [
    /\b(?:heading|description|explanation|title|actionLabel|dismiss|warning|caution|empty|pending|noFindings|sourceNote):\s*"([^"\n]*)"/g,
    /\b(?:blocked|attention|clear|unknown|complete|failed|cancelled|ready|offline|quota|permission|interrupted):\s*"([^"\n]*)"/g,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) segments.push(match[1] ?? "");
  }
  return segments;
}

/** Locale strings are matched as complete leaf values, not translated keys. */
function leafStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value === null || typeof value !== "object") return [];
  return Object.values(value).flatMap(leafStrings);
}

const english = [diagnosticsCopy("en"), actionsCopy("en"), comparisonCopy("en")];
const french = [diagnosticsCopy("fr"), actionsCopy("fr"), comparisonCopy("fr")];

describe("recovery source audit", () => {
  it("excludes organisation identifiers from repository source and test files", () => {
    const parent = join(root, "..", "offline", "RegionPackPage.tsx");
    const files = [...readdirSync(root).filter((name) => /\.(?:ts|tsx|md)$/.test(name)).map((name) => join(root, name)), parent];
    for (const file of files) {
      const content = readFileSync(file, "utf8").toLowerCase();
      for (const name of forbiddenOrgNeedles()) expect(content).not.toContain(name.toLowerCase());
    }
  });

  it("includes real shell wiring and exported functions", () => {
    const center = textOf("RecoveryCenter.tsx");
    const index = textOf("index.ts");
    expect(center).toContain('import { RecoveryWorkbench } from "./RecoveryWorkbench"');
    expect(center).toContain("<RecoveryWorkbench");
    expect(index).toContain('export { RecoveryWorkbench } from "./RecoveryWorkbench"');
    for (const module of ["recoveryDiagnostics", "recoveryActions", "recoveryComparison"]) {
      expect(index).toContain(`from "./${module}"`);
    }
  });
  it("uses native interactive buttons, with at least 44px declared targets", () => {
    for (const component of ["RecoveryCenter.tsx", "RecoveryWorkbench.tsx", "RecoveryNotice.tsx"]) {
      const source = textOf(component);
      expect(source).toMatch(/minHeight:\s*44/);
      expect(source).toMatch(/minWidth:\s*44/);
      expect(source).toContain('<button');
      expect(source).toContain('type="button"');
    }
  });
  it("provides headings and announced status for the mounted workbench", () => {
    const source = textOf("RecoveryWorkbench.tsx");
    expect(source).toContain('aria-labelledby={diagnosticsHeading}');
    expect(source).toContain('aria-labelledby={actionsHeading}');
    expect(source).toContain('aria-labelledby={comparisonHeading}');
    expect(source).toContain('aria-labelledby={historyHeading}');
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('lang={locale}');
  });
  it("does not hardcode external tile or submission URLs", () => {
    for (const file of sourceFiles()) {
      const source = textOf(file);
      expect(source).not.toMatch(/https?:\/\//i);
      expect(source).not.toMatch(/fetch\s*\(/);
      expect(source).not.toMatch(/navigator\.sendBeacon/);
    }
  });
  it("does not introduce scheduled or background jobs", () => {
    for (const file of [
      "recoveryDiagnostics.ts", "recoveryActions.ts", "recoveryComparison.ts", "RecoveryWorkbench.tsx",
    ]) {
      const source = textOf(file);
      expect(source).not.toMatch(/setInterval\s*\(/);
      expect(source).not.toMatch(/setTimeout\s*\(/);
      expect(source).not.toMatch(/localStorage|indexedDB|serviceWorker/);
    }
  });
  it("keeps prohibited claims out of copy leaf values", () => {
    for (const value of [...english, ...french]) {
      for (const text of leafStrings(value)) {
        expect(text).not.toMatch(forbiddenClaims);
      }
    }
  });
  it("keeps prohibited claims out of common static user-copy properties", () => {
    for (const file of sourceFiles()) {
      for (const segment of extractCopySegments(textOf(file))) {
        expect(segment).not.toMatch(forbiddenClaims);
      }
    }
  });
  it("does not use ASCII apostrophes in newly provided French copy", () => {
    for (const value of french) {
      for (const text of leafStrings(value)) expect(text).not.toMatch(/[A-Za-z]'[A-Za-z]/);
    }
  });
  it("does not place regular spaces before French colon or strong punctuation", () => {
    for (const value of french) {
      for (const text of leafStrings(value)) {
        expect(text).not.toMatch(/ [;!?]/);
        expect(text).not.toMatch(/ :/);
      }
    }
  });
  it("provides distinct locale copy instead of one-language fallback", () => {
    for (let index = 0; index < english.length; index++) {
      const en = leafStrings(english[index]);
      const fr = leafStrings(french[index]);
      expect(en.length).toBe(fr.length);
      expect(en.length).toBeGreaterThan(5);
      expect(en.every((value, i) => value.trim() !== "" && fr[i]?.trim() !== "")).toBe(true);
      expect(en.some((value, i) => value !== fr[i])).toBe(true);
    }
  });
});
