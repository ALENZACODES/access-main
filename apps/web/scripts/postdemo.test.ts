import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run, snapshotDirectory } from "./postdemo.ts";

function tempBuild(): string {
  const dir = mkdtempSync(join(tmpdir(), "postdemo-"));
  mkdirSync(join(dir, "assets"));
  writeFileSync(join(dir, "index.html"), "<!doctype html><title>the App</title>");
  writeFileSync(join(dir, "assets", "app.js"), "console.log(1)");
  return dir;
}

describe("postdemo script", () => {
  it("hashes every built file with forward-slash paths", () => {
    const snapshot = snapshotDirectory(tempBuild(), "synthetic-build", "2000-01-03T00:00:00.000Z");
    expect(Object.keys(snapshot.files)).toEqual(["assets/app.js", "index.html"]);
    expect(snapshot.files["index.html"]).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses an empty build folder", () => {
    expect(() => snapshotDirectory(mkdtempSync(join(tmpdir(), "empty-")), "x")).toThrow("has no built files");
  });

  it("compares before and after and fails a silent change", () => {
    const dist = tempBuild();
    const work = mkdtempSync(join(tmpdir(), "snap-"));
    const before = join(work, "before.json");
    const after = join(work, "after.json");
    const output: string[] = [];
    expect(run(["snapshot", dist, "--build", "b1", "--out", before])).toBe(0);
    expect(run(["snapshot", dist, "--build", "b1", "--out", after])).toBe(0);
    expect(run(["compare", before, after], (text) => output.push(text))).toBe(0);
    expect(output.join("")).toContain("PASS: The build was unchanged during the session.");

    writeFileSync(join(dist, "assets", "app.js"), "console.log(2)");
    expect(run(["snapshot", dist, "--build", "b1", "--out", after])).toBe(0);
    output.length = 0;
    expect(run(["compare", before, after], (text) => output.push(text))).toBe(1);
    expect(output.join("")).toContain("changed assets/app.js");

    const record = join(work, "change.json");
    writeFileSync(record, JSON.stringify({ failure: "A page failed to load.", action: "Used the fallback slides.", fallbackUsed: true }));
    expect(run(["compare", before, after, "--record", record], () => undefined)).toBe(0);
  });

  it("renders a card and exits 1 when it is incomplete", () => {
    const work = mkdtempSync(join(tmpdir(), "card-"));
    const path = join(work, "card.json");
    writeFileSync(
      path,
      JSON.stringify({
        buildId: "synthetic-build",
        checkedOn: "2000-01-03",
        seedCounts: [{ file: "synthetic.json", tier: "1", records: 4, basis: "counted" }],
        sources: [{ name: "Synthetic", licence: "UNKNOWN", retrievedOn: "2000-01-01" }],
        demoJourneys: [],
        fallback: { ready: true, where: "Synthetic folder" },
      }),
    );
    const output: string[] = [];
    expect(run(["card", path, "--lang", "fr"], (text) => output.push(text))).toBe(0);
    expect(output.join("")).toContain("# Fiche de version");
    writeFileSync(path, JSON.stringify({ buildId: "", checkedOn: "", seedCounts: [], sources: [], demoJourneys: [], fallback: { ready: false, where: "" } }));
    expect(run(["card", path], () => undefined)).toBe(1);
    expect(() => run(["card", path, "--lang", "de"])).toThrow("--lang is en or fr.");
    expect(() => run(["snapshot", work])).toThrow("needs --build");
  });
});
