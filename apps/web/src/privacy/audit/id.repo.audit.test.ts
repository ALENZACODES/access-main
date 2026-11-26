// CI audit: where the App's code makes an identifier or reads something that tells one browser from another. No
// code reads the cores, the memory, the battery, the cameras, a canvas, a font list, audio or WebGL. No Math.random
// value is stored or sent on its own line. Every identifier and every low-level device read is on the accepted list
// with a reason. No identifier made in the code is used on a line with a network call in the same file. It reads one
// file at a time, so an identifier that leaves through another file, an object or a function argument is not seen.

import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compareIds, formatIdProblems } from "./idCompare";
import { flowsOf, reachingNetwork, unfollowed } from "./idFlow";
import { ID_ACCEPTED, validateIdRegister } from "./idRegister";
import { renderIdReport } from "./idReport";
import { auditSites, countFindings } from "./idRules";
import { countKinds, countScanned, scanIds } from "./idScan";
import { loadFiles } from "./repoFiles";

const ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));
const files = loadFiles(ROOT, ["apps/web/src"]);
const sites = scanIds(files);
const findings = auditSites(sites);
const flows = flowsOf(files);

describe("the code of the App", () => {
  it("is read, so the audit cannot pass by finding nothing", () => {
    expect(files.length).toBeGreaterThan(300);
    expect(countScanned(files)).toBeGreaterThan(300);
    expect(sites.length).toBeGreaterThan(8);
  });
  it("matches the accepted list exactly", () => expect(formatIdProblems(compareIds(findings, ID_ACCEPTED))).toEqual([]));
  it("has a valid accepted list", () => expect(validateIdRegister()).toEqual([]));
  it("reads no high-entropy device value", () => expect(findings.filter((f) => f.code === "id-device-high")).toEqual([]));
  it("stores or sends no Math.random value on the line that makes it", () => expect(findings.filter((f) => f.code === "id-math-random-moves")).toEqual([]));
  it("makes no identifier from Math.random in the code that stores records", () => {
    const paths = sites.filter((s) => s.kind === "math-random").map((s) => s.path);
    for (const p of paths) expect(p, p).not.toMatch(/^apps\/web\/src\/(?:storage|profile|contribute)\//);
  });
  it("makes an id from the clock only in a template of an element id or a report id", () => {
    expect(sites.filter((s) => s.kind === "time-id").map((s) => s.path).sort()).toEqual(["apps/web/src/hub/RouteReportsPage.tsx", "apps/web/src/offline/robust/contingencyPanel.ts"]);
  });
  it("uses getRandomValues only in the protected copy code", () => {
    expect([...new Set(sites.filter((s) => s.kind === "random-bytes").map((s) => s.path))]).toEqual(["apps/web/src/privacy/panel/protectedBackup.ts"]);
  });
  it("uses randomUUID only where a record or a photo is made on the device", () => {
    expect([...new Set(sites.filter((s) => s.kind === "uuid").map((s) => s.path))]).toEqual([
      "apps/web/src/contribute/useDraftPhotos.ts",
      "apps/web/src/hub/RouteReportsPage.tsx",
      "apps/web/src/storage/repository.ts",
    ]);
  });
  it("makes every accepted device read a low one: a setting, a language or a privacy signal", () => {
    const details = new Set(sites.filter((s) => s.kind === "device-low").map((s) => s.detail));
    expect([...details].sort()).toEqual(["matchMedia", "navigator.cookieEnabled", "navigator.doNotTrack", "navigator.globalPrivacyControl", "navigator.language"]);
  });
});

describe("the identifiers made in the App", () => {
  it("are followed, so the audit cannot pass by following nothing", () => {
    expect(flows.length).toBe(sites.filter((s) => s.kind === "uuid" || s.kind === "random-bytes" || s.kind === "math-random" || s.kind === "time-id").length);
    expect(flows.length).toBeGreaterThan(6);
  });
  it("are not used with a network call in the same file", () => expect(reachingNetwork(flows).map((f) => `${f.site.path}:${f.site.line}`)).toEqual([]));
  it("say how many could not be followed, so the limit stays in view", () => {
    const n = unfollowed(flows).length;
    expect(n).toBeLessThanOrEqual(flows.length);
    expect(n).toBeGreaterThan(0);
  });
});

describe("the report", () => {
  const report = renderIdReport({ files: countScanned(files), findings, accepted: ID_ACCEPTED, problems: compareIds(findings, ID_ACCEPTED) });
  it("has no problems and counts what was found", () => {
    expect(report).toContain("## Problems\n\nnone");
    expect(report).toContain(`Findings: ${findings.length}`);
  });
  it("counts the kinds the same way the scan does", () => {
    const k = countKinds(sites);
    const c = countFindings(findings);
    expect(c["id-uuid"]).toBe(k.uuid);
    expect(c["id-random-bytes"]).toBe(k["random-bytes"]);
    expect(c["id-math-random"] + c["id-math-random-moves"]).toBe(k["math-random"]);
    expect(c["id-time-id"]).toBe(k["time-id"]);
    expect(c["id-device-high"]).toBe(k["device-high"]);
    expect(c["id-device-low"]).toBe(k["device-low"]);
  });
});
