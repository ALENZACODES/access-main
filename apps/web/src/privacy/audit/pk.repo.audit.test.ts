// CI audit: the packs the App ships. Every address in them goes to a host in pkRegister.ts, every source and licence
// the manifest names is in the register (a licence that is not known stays UNKNOWN), the manifest's size, hash and
// counts match the content file, no record holds an email address, a telephone number outside the contact field or a
// home, and the findings that remain are in its accepted list with a reason. It reads the files as they are
// committed. It does not check that a phone number or an address is right.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compareAccepted, comparePacks, formatPkProblems } from "./pkCompare";
import { PACKS_FOLDER, loadPacks } from "./pkFiles";
import { PK_ACCEPTED, PK_REGISTER, validatePkRegister } from "./pkRegister";
import { renderPkReport } from "./pkReport";
import { auditPack } from "./pkRules";
import { summarise, summaryLines } from "./pkSummary";
import { parseJson } from "./pkWalk";

const ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));
const loaded = loadPacks(ROOT);
const toronto = loaded.packs.find((p) => p.id === "toronto");
const codesOf = (id: string): string[] => loaded.packs.find((p) => p.id === id)?.findings.map((f) => f.code) ?? [];

describe("the shipped packs", () => {
  it("are read, so the audit cannot pass by finding nothing", () => {
    expect(loaded.folders.map((f) => f.id)).toContain("toronto");
    expect(loaded.folders.find((f) => f.id === "toronto")?.files).toEqual(["content.json", "manifest.json"]);
    expect(toronto?.hosts.length).toBeGreaterThan(3);
  });
  it("have a well-formed register", () => expect(validatePkRegister()).toEqual([]));
  it("match the register for packs, hosts and sources", () => expect(formatPkProblems(comparePacks(loaded.packs, PK_REGISTER))).toBe(""));
  it("have findings that are exactly the accepted ones", () => expect(formatPkProblems(compareAccepted(loaded.packs, PK_ACCEPTED))).toBe(""));
  it("have a report that says no differences", () => {
    const problems = [...comparePacks(loaded.packs, PK_REGISTER), ...compareAccepted(loaded.packs, PK_ACCEPTED)];
    expect(renderPkReport({ packs: loaded.packs, accepted: PK_ACCEPTED, problems })).toContain("Differences from the register: none.");
  });
});

describe("what the shipped packs must not hold", () => {
  const never = ["pk-text-email", "pk-text-phone", "pk-text-id-number", "pk-text-control", "pk-text-invisible", "pk-text-wording", "pk-text-empty", "pk-text-edge-space", "pk-text-long", "pk-url-unreadable", "pk-url-not-https", "pk-url-credentials", "pk-url-tracking", "pk-url-ip-host", "pk-url-shortener", "pk-url-port", "pk-url-host-not-listed", "pk-geo-missing", "pk-geo-range", "pk-geo-outside", "pk-geo-null-island", "pk-geo-precision", "pk-geo-private-kind", "pk-schema-mismatch", "pk-pack-id-mismatch", "pk-size-mismatch", "pk-sha-mismatch", "pk-count-mismatch", "pk-licence-invented", "pk-source-licence-differs", "pk-wheelchair-value", "pk-date-bad", "pk-date-after-build", "pk-id-duplicate", "pk-id-missing", "pk-file-truncated", "pk-manifest-unreadable", "pk-content-unreadable"];
  it.each(never)("has no %s", (code) => expect(codesOf("toronto").filter((c) => c === code)).toEqual([]));
  it("keeps a licence that is not known as UNKNOWN in the manifest", () => {
    const m = parseJson(readFileSync(`${ROOT}${PACKS_FOLDER}/toronto/manifest.json`, "utf8")) as { source_dates: Array<{ licence: string }> };
    expect(m.source_dates.some((s) => s.licence === "UNKNOWN")).toBe(true);
    for (const s of m.source_dates) expect(s.licence).not.toMatch(/^(n\/a|none|tbd|)$/i);
  });
});

describe("a change to the real files is found", () => {
  const manifestText = readFileSync(`${ROOT}${PACKS_FOLDER}/toronto/manifest.json`, "utf8");
  const contentText = readFileSync(`${ROOT}${PACKS_FOLDER}/toronto/content.json`, "utf8");
  const hosts = PK_REGISTER[0]?.hosts ?? [];
  const run = (content: string): string[] => auditPack({ manifest: parseJson(manifestText), content: parseJson(content), measured: null }, { hosts }).map((f) => f.code);
  const base = run(contentText);

  it("finds an email address added to a place name", () => {
    const changed = run(contentText.replace('"name": "Sankofa Square"', '"name": "Sankofa Square jo@example.org"'));
    expect(changed.filter((c) => c === "pk-text-email")).toHaveLength(1);
    expect(changed).toHaveLength(base.length + 1);
  });
  it("finds an address that is moved to a host that is not listed", () => {
    const changed = run(contentText.replace("https://www.openstreetmap.org/way/1105575638", "https://maps.example.net/way/1105575638"));
    expect(changed).toContain("pk-url-host-not-listed");
  });
  it("finds a record whose point is moved out of the box", () => expect(run(contentText.replace('"lat": 43.656157', '"lat": 12.5'))).toContain("pk-geo-outside"));
  it("finds a wheelchair value that is changed from UNKNOWN to lower case", () => expect(run(contentText.replace(/"wheelchair": "UNKNOWN"/, '"wheelchair": "unknown"'))).toContain("pk-wheelchair-value"));
  it("finds a record that is added without the manifest counting it", () => {
    const parsed = parseJson(contentText) as { places: unknown[] };
    parsed.places.push(parsed.places[0]);
    expect(run(JSON.stringify(parsed))).toEqual(expect.arrayContaining(["pk-count-mismatch", "pk-id-duplicate"]));
  });
  it("has a manifest whose size and hash are those of the committed content file", () => {
    const changed = loadPacks(ROOT).packs.find((p) => p.id === "toronto");
    expect(changed?.findings.some((f) => f.code === "pk-sha-mismatch")).toBe(false);
  });
});

describe("what the shipped Toronto pack leaves unknown", () => {
  const content = parseJson(readFileSync(`${ROOT}${PACKS_FOLDER}/toronto/content.json`, "utf8"));
  const manifest = parseJson(readFileSync(`${ROOT}${PACKS_FOLDER}/toronto/manifest.json`, "utf8")) as { counts: Record<string, number> };
  const s = summarise(content);
  it("counts the same places, help numbers and elevator records as the manifest", () => {
    expect(s.places).toBe(manifest.counts["places"]);
    expect(s.helpNumbers).toBe(manifest.counts["help_numbers"]);
    expect(s.elevators).toBe(manifest.counts["elevator_status"]);
  });
  it("still has places whose wheelchair access is UNKNOWN, and none written in another way", () => {
    expect(s.wheelchairUnknown).toBeGreaterThan(0);
    expect(s.wheelchairOther).toBe(0);
  });
  it("still has a licence that is UNKNOWN, and help numbers with no link", () => {
    expect(s.licenceUnknown).toBeGreaterThan(0);
    expect(s.helpWithoutLink).toBeGreaterThan(0);
  });
  it("gives every elevator record a time of last check", () => expect(s.elevatorsUnchecked).toBe(0));
  it("writes four lines", () => expect(summaryLines(s)).toHaveLength(4));
});
