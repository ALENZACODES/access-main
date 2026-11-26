import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { PACKS_FOLDER, byteLength, loadPacks, urlsIn } from "./pkFiles";
import { renderPkReport } from "./pkReport";

const H = `${"http"}s://`;
const root = mkdtempSync(join(tmpdir(), "pk-files-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function put(rel: string, text: string): void {
  const full = join(root, rel);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, text);
}

const content = JSON.stringify({
  schema_version: "v1",
  pack_id: "toronto",
  places: [{ id: "p1", name: "Caf\u00e9 Alpha", category: "cafe", wheelchair: "yes", lat: 43.7, lon: -79.4, provenance: { source_name: "S1", licence: "ODbL-1.0", source_url: `${H}www.openstreetmap.org/node/1` } }],
  help_numbers: [],
  elevator_status: [],
  journeys: [],
});
const manifest = JSON.stringify({
  schema_version: "v1",
  pack_id: "toronto",
  built_at: "2026-11-14",
  size_bytes: byteLength(content),
  sha256: createHash("sha256").update(content, "utf8").digest("hex"),
  source_dates: [{ source_name: "S1", licence: "ODbL-1.0", retrieved_at: "2026-11-13" }],
  counts: { places: 1, help_numbers: 0, elevator_status: 0, journeys: 0 },
});
put(`${PACKS_FOLDER}/toronto/content.json`, content);
put(`${PACKS_FOLDER}/toronto/manifest.json`, manifest);
put(`${PACKS_FOLDER}/broken/content.json`, "{ nope");
put(`${PACKS_FOLDER}/loose.txt`, "not a pack");

describe("byteLength", () => {
  it.each([["", 0], ["abc", 3], ["\u00e9", 2], ["\u20ac", 3], ["\u{1F600}", 4], ["a\u00e9\u20ac\u{1F600}", 10]])("%j is %d bytes", (t, n) => expect(byteLength(t)).toBe(n));
  it("counts a text with a lone surrogate as three bytes, as the encoder does", () => expect(byteLength("\ud800")).toBe(3));
});

describe("urlsIn", () => {
  it("gives the texts under a url key, and under a key that ends in _url", () => expect(urlsIn({ url: "a", source_url: "b", licence_url: "c", name: "d", curl: "e", urls: "f" })).toEqual(["a", "b", "c"]));
  it("leaves out an empty text and a null", () => expect(urlsIn({ url: "", source_url: null })).toEqual([]));
  it("finds them at any depth", () => expect(urlsIn({ a: [{ b: { source_url: "x" } }] })).toEqual(["x"]));
});

describe("loadPacks", () => {
  const l = loadPacks(root);
  it("reads each folder under the packs folder, in order, and not a loose file", () => expect(l.folders.map((f) => f.id)).toEqual(["broken", "toronto"]));
  it("lists the files of each folder", () => expect(l.folders.map((f) => f.files)).toEqual([["content.json"], ["content.json", "manifest.json"]]));
  it("reads the hosts, the sources and the findings of a pack", () => {
    const t = l.packs.find((p) => p.id === "toronto");
    expect(t?.hosts).toEqual(["www.openstreetmap.org"]);
    expect(t?.sources).toEqual([{ name: "S1", licence: "ODbL-1.0" }]);
  });
  it("judges the size and hash against the file itself, so a pack that agrees has none of those findings", () => {
    const t = l.packs.find((p) => p.id === "toronto");
    expect(t?.findings.filter((f) => /size|sha/.test(f.code))).toEqual([]);
  });
  it("reads a pack whose files are not readable without throwing, and says so", () => {
    const b = l.packs.find((p) => p.id === "broken");
    expect(b?.findings.map((f) => f.code)).toEqual(["pk-content-unreadable", "pk-manifest-unreadable"]);
  });
  it("finds a changed file by its hash and size", () => {
    put(`${PACKS_FOLDER}/toronto/content.json`, `${content} `);
    const t = loadPacks(root).packs.find((p) => p.id === "toronto");
    expect(t?.findings.map((f) => f.code).sort()).toEqual(["pk-sha-mismatch", "pk-size-mismatch"]);
    put(`${PACKS_FOLDER}/toronto/content.json`, content);
  });
  it("is empty for a checkout with no packs folder", () => {
    const empty = mkdtempSync(join(tmpdir(), "pk-empty-"));
    try {
      expect(loadPacks(empty)).toEqual({ packs: [], folders: [] });
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe("renderPkReport", () => {
  const packs = loadPacks(root).packs;
  it("says how many packs were read and the line of each", () => {
    const text = renderPkReport({ packs, accepted: [], problems: [] });
    expect(text.split("\n")[0]).toBe("Packs read: 2.");
    expect(text).toContain("toronto: 1 hosts, 1 sources in the manifest,");
  });
  it("lists the count of each code, then each finding", () => {
    const text = renderPkReport({ packs, accepted: [], problems: [] });
    expect(text).toContain("  pk-content-unreadable \u00d71");
    expect(text).toContain("    pack content pk-content-unreadable: the content is not a JSON object");
  });
  it("lists the accepted findings and says when there are no differences", () => {
    const text = renderPkReport({ packs, accepted: [{ pack: "toronto", code: "pk-fr-apostrophe", count: 2, reason: "A reason that is long enough." }], problems: [] });
    expect(text).toContain("Findings accepted as they stand: 1.\n  toronto \u2014 pk-fr-apostrophe \u00d72");
    expect(text.endsWith("Differences from the register: none.")).toBe(true);
  });
  it("lists the differences", () => expect(renderPkReport({ packs: [], accepted: [], problems: [{ code: "pack-added", key: "z", detail: "d" }] })).toContain("Differences from the register: 1.\n  pack-added z: d"));
  it("has no trailing line break", () => expect(renderPkReport({ packs: [], accepted: [], problems: [] }).endsWith("\n")).toBe(false));
});
