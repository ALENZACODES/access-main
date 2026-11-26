// CI audit: every place the App writes a coordinate with more than five decimals, or as it is, is on the accepted list.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LC_ACCEPTED } from "./lcRegister";
import { renderLcReport } from "./lcReport";
import { auditCoordinates, compareCoordinates, validateLcRows } from "./lcRules";
import { scanCoordinates, scanCoordinatesFile } from "./lcScan";
import { loadFiles } from "./repoFiles";

const ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));

describe("coordinates in the source", () => {
  const files = loadFiles(ROOT, ["apps/web/src"]);
  const sites = scanCoordinates(files);
  const findings = auditCoordinates(sites);
  const problems = compareCoordinates(findings, LC_ACCEPTED);

  it("reads the real tree, so it cannot pass by finding nothing", () => {
    const paths = sites.map((s) => s.path);
    expect(paths).toContain("apps/web/src/states/geo.ts");
    expect(paths).toContain("apps/web/src/states/packExport.ts");
    expect(sites.filter((s) => s.kind === "fixed").length).toBeGreaterThan(5);
  });

  it("matches the accepted list in both directions", () => {
    const text = renderLcReport({ files: files.length, sites, findings, problems });
    expect(problems, `\n${text}`).toEqual([]);
  });

  it("has a report that says the files were read and that nothing differs", () => {
    const text = renderLcReport({ files: files.length, sites, findings, problems });
    expect(text).toContain(`Read ${files.length} files of the App's own code.`);
    expect(text).toContain("Differences from the accepted list: none.");
  });

  it("has a well formed accepted list whose files exist", () => {
    expect(validateLcRows(LC_ACCEPTED)).toEqual([]);
    for (const r of LC_ACCEPTED) expect(existsSync(join(ROOT, r.path)), r.path).toBe(true);
  });

  it("writes no coordinate with more than five decimals", () => {
    expect(findings.filter((f) => f.code === "lc-too-fine")).toEqual([]);
    expect(findings.filter((f) => f.code === "lc-variable-digits")).toEqual([]);
  });

  it("is found again when the text of a real file changes", () => {
    const f = files.find((x) => x.path === "apps/web/src/states/geo.ts");
    expect(f).toBeDefined();
    const more = scanCoordinatesFile({ path: f!.path, text: `${f!.text}\nexport const q = (p: { lat: number }) => p.lat.toFixed(7);\n` });
    expect(more.length).toBe(scanCoordinatesFile(f!).length + 1);
    const changed = sites.filter((s) => s.path !== f!.path).concat(more);
    const p = compareCoordinates(auditCoordinates(changed), LC_ACCEPTED);
    expect(p.some((x) => x.lcCode === "lc-too-fine" && x.code === "finding-not-accepted")).toBe(true);
  });

  it("does not read a file of tests", () => {
    expect(sites.some((s) => /\.test\.tsx?$/.test(s.path))).toBe(false);
  });

  it("agrees with the text of the files for the lines it names", () => {
    for (const s of sites) {
      const text = readFileSync(join(ROOT, s.path), "utf8").split("\n");
      expect(text[s.line - 1], `${s.path}:${s.line}`).toBeDefined();
    }
  });
});
