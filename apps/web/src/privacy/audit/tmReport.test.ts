import { describe, expect, it } from "vitest";
import { renderFolder, renderTmReport } from "./tmReport";
import type { TmKind, TmSite } from "./tmScan";
import type { TmFinding } from "./tmRules";

const s = (kind: TmKind, path = "apps/web/src/hub/a.ts", line = 1, extra: Partial<TmSite> = {}): TmSite => ({ path, line, kind, detail: kind, inText: false, ...extra });
const f = (code: TmFinding["code"], path = "apps/web/src/hub/a.ts"): TmFinding => ({ code, path, line: 1, detail: "x" });

describe("renderTmReport", () => {
  it("says what was read and that nothing differs", () => {
    const t = renderTmReport({ files: 3, sites: [s("clock-ms"), s("clock-ms"), s("stamp-full")], findings: [], problems: [] });
    expect(t).toContain("Read 3 files of the App's own code.");
    expect(t).toContain("Sites: 3 (2 clock reads, 1 full times written).");
    expect(t).toContain("Findings: 0 in 0 places.");
    expect(t).toContain("Differences from the accepted list: none.");
  });
  it("lists the findings by code and counts the places", () => {
    const t = renderTmReport({ files: 1, sites: [], findings: [f("tm-local-getter"), f("tm-local-getter"), f("tm-hires-timer", "apps/web/src/narrow/a.ts")], problems: [] });
    expect(t).toContain("Findings: 3 in 2 places.");
    expect(t).toContain("  tm-local-getter: 2");
    expect(t).toContain("  tm-hires-timer: 1");
    expect(t).not.toContain("tm-tz-read");
  });
  it("uses the singular for one place", () => expect(renderTmReport({ files: 1, sites: [], findings: [f("tm-local-getter")], problems: [] })).toContain("in 1 place."));
  it("lists the differences", () => {
    const t = renderTmReport({ files: 1, sites: [], findings: [], problems: [{ code: "stale-folder", path: "x", tmCode: "", detail: "listed, but nothing found" }] });
    expect(t).toContain("Differences from the accepted list: 1.");
    expect(t).toContain("  stale-folder x: listed, but nothing found");
  });
  it("says none for no sites", () => expect(renderTmReport({ files: 0, sites: [], findings: [], problems: [] })).toContain("Sites: 0 (none)."));
  it("ends with one line break", () => expect(renderTmReport({ files: 0, sites: [], findings: [], problems: [] }).endsWith(".\n")).toBe(true));
});

describe("renderFolder", () => {
  it("lists the sites of one folder with the path inside it", () => {
    const t = renderFolder([s("clock-ms", "apps/web/src/hub/a.ts", 4, { inText: true }), s("stamp-full", "apps/web/src/map/b.ts")], "hub");
    expect(t).toBe("hub: 1 site\n  a.ts:4 clock-ms: clock-ms (written into text)\n");
  });
  it("says so for a folder with none", () => expect(renderFolder([s("clock-ms")], "map")).toBe("map: no sites.\n"));
  it("does not take a folder with the same start for the folder", () => expect(renderFolder([s("clock-ms", "apps/web/src/hubby/a.ts")], "hub")).toBe("hub: no sites.\n"));
});
