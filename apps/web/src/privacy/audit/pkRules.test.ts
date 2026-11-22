import { describe, expect, it } from "vitest";
import { auditPack, countByCode, formatPkFinding, sortPkFindings, type PkFinding } from "./pkRules";

const H = `${"http"}s://`;
const SHA = "c".repeat(64);
const OPTS = { hosts: ["example.org"] };
const goodManifest = () => ({
  schema_version: "v1",
  pack_id: "t",
  title: { en: "Pack", fr: "Donn\u00e9es" },
  built_at: "2026-11-14",
  content_path: "/packs/t/content.json",
  size_bytes: 10,
  sha256: SHA,
  source_dates: [{ source_name: "S1", licence: "ODbL-1.0", retrieved_at: "2026-11-13" }],
  counts: { places: 1, help_numbers: 0, elevator_status: 0, journeys: 0 },
});
const goodPlace = () => ({
  id: "p1",
  name: "Cafe",
  category: "cafe",
  wheelchair: "yes",
  address: "1 Main Street",
  lat: 43.7,
  lon: -79.4,
  provenance: { source_name: "S1", source_url: `${H}example.org/p1`, licence: "ODbL-1.0", licence_url: `${H}example.org/l`, source_date: "2026-11-13", retrieved_at: "2026-11-13", tier: 0, freshness: "unknown" },
});
const goodContent = () => ({ schema_version: "v1", pack_id: "t", places: [goodPlace()], help_numbers: [], elevator_status: [], journeys: [] });
const run = (m: unknown = goodManifest(), c: unknown = goodContent(), measured: { bytes: number; sha256: string } | null = { bytes: 10, sha256: SHA }): PkFinding[] => auditPack({ manifest: m, content: c, measured }, OPTS);
const codes = (f: PkFinding[]): string[] => f.map((x) => x.code);

describe("auditPack: a clean pack", () => {
  it("has no findings", () => expect(run()).toEqual([]));
});

describe("auditPack: text and addresses", () => {
  it("finds an email address in a place name, with where it is", () => {
    const c = goodContent();
    c.places[0]!.name = "Cafe jo@example.org";
    expect(run(goodManifest(), c)).toEqual([{ code: "pk-text-email", file: "content", path: "places[0].name", detail: "an email address" }]);
  });
  it("finds an address that is not https in the content and in the manifest", () => {
    const c = goodContent();
    c.places[0]!.provenance.source_url = `${"http"}://example.org/x`;
    const m = goodManifest() as Record<string, unknown>;
    m["homepage_url"] = `${"http"}://example.org/`;
    expect(run(m, c).map((f) => `${f.file} ${f.code}`)).toEqual(["content pk-url-not-https", "manifest pk-url-not-https"]);
  });
  it("finds a host that is not listed", () => {
    const c = goodContent();
    c.places[0]!.provenance.licence_url = `${H}other.net/l`;
    expect(codes(run(goodManifest(), c))).toEqual(["pk-url-host-not-listed"]);
  });
  it("does not read the content path as an address that needs a host", () => expect(run()).toEqual([]));
  it("does not judge a null address", () => {
    const c = goodContent() as Record<string, unknown>;
    c["help_numbers"] = [{ id: "h", name: { en: "E", fr: "U" }, contact: "911", how: { en: "Call", fr: "Appelez" }, url: null, provenance: { source_name: "S1", licence: "ODbL-1.0", source_url: null } }];
    const m = goodManifest();
    m.counts.help_numbers = 1;
    expect(run(m, c)).toEqual([]);
  });
  it("finds French typography in French copy only", () => {
    const m = goodManifest();
    m.title.fr = "Donn\u00e9es d'accueil";
    expect(run(m).map((f) => `${f.path} ${f.code}`)).toEqual(["title.fr pk-fr-apostrophe"]);
  });
  it("finds wording about verification in a copy field", () => {
    const m = goodManifest();
    m.title.en = "Verified pack";
    expect(codes(run(m))).toEqual(["pk-text-wording"]);
  });
  it("says when a file is deeper than the audit reads", () => {
    let v: unknown = "x";
    for (let i = 0; i < 20; i += 1) v = { k: v };
    expect(run(goodManifest(), { ...goodContent(), extra: v }).map((f) => f.code)).toContain("pk-file-truncated");
  });
});

describe("auditPack: points and the manifest", () => {
  it("finds a point outside the box, with the place it is in", () => {
    const c = goodContent();
    c.places[0]!.lat = 10;
    expect(run(goodManifest(), c)).toEqual([{ code: "pk-geo-outside", file: "content", path: "places[0]", detail: "10, -79.4 is outside the box of the pack" }]);
  });
  it("uses the box it is given", () => {
    const c = goodContent();
    c.places[0]!.lat = 10;
    expect(auditPack({ manifest: goodManifest(), content: c, measured: { bytes: 10, sha256: SHA } }, { hosts: ["example.org"], box: { south: 0, north: 20, west: -80, east: -79 } })).toEqual([]);
  });
  it("finds a count that differs, as a finding of the pack", () => {
    const m = goodManifest();
    m.counts.places = 3;
    expect(run(m)).toEqual([{ code: "pk-count-mismatch", file: "pack", path: "counts.places", detail: "manifest 3, content 1" }]);
  });
  it("finds a wrong size and hash", () => expect(codes(run(goodManifest(), goodContent(), { bytes: 11, sha256: "d".repeat(64) }))).toEqual(["pk-sha-mismatch", "pk-size-mismatch"]));
  it("finds a manifest that is not an object, and still reads the content", () => {
    const c = goodContent();
    c.places[0]!.name = "";
    expect(codes(run(null, c))).toEqual(["pk-text-empty", "pk-manifest-unreadable"]);
  });
  it("gives no finding for content that is not readable and has no text", () => expect(codes(run(goodManifest(), null))).toEqual(["pk-content-unreadable"]));
});

describe("sortPkFindings, formatPkFinding and countByCode", () => {
  const f = (file: PkFinding["file"], path: string, code: PkFinding["code"], detail = "d"): PkFinding => ({ file, path, code, detail });
  it("sorts by file, then path, then code, then detail", () => {
    const s = sortPkFindings([f("pack", "a", "pk-count-mismatch"), f("manifest", "z", "pk-text-empty"), f("content", "b", "pk-text-email", "y"), f("content", "b", "pk-text-email", "x"), f("content", "a", "pk-text-wording")]);
    expect(s.map((x) => `${x.file} ${x.path} ${x.code} ${x.detail}`)).toEqual(["content a pk-text-wording d", "content b pk-text-email x", "content b pk-text-email y", "manifest z pk-text-empty d", "pack a pk-count-mismatch d"]);
  });
  it("does not change the list it is given", () => {
    const input = [f("pack", "a", "pk-count-mismatch"), f("content", "a", "pk-text-empty")];
    sortPkFindings(input);
    expect(input[0]?.file).toBe("pack");
  });
  it("writes a finding on one line, with the path when there is one", () => {
    expect(formatPkFinding(f("content", "places[0].name", "pk-text-empty", "an empty text"))).toBe("content places[0].name pk-text-empty: an empty text");
    expect(formatPkFinding(f("manifest", "", "pk-file-truncated", "too deep"))).toBe("manifest pk-file-truncated: too deep");
  });
  it("counts the findings of each code, in code order", () => expect(countByCode([f("pack", "a", "pk-text-empty"), f("pack", "b", "pk-count-mismatch"), f("pack", "c", "pk-text-empty")])).toEqual([["pk-count-mismatch", 1], ["pk-text-empty", 2]]));
  it("counts nothing for no findings", () => expect(countByCode([])).toEqual([]));
});

describe("auditPack: help numbers", () => {
  const withHelp = (h: Record<string, unknown>) => {
    const c = goodContent() as Record<string, unknown>;
    c["help_numbers"] = [{ id: "h", name: { en: "Line", fr: "Ligne" }, contact: "911", how: { en: "Call now", fr: "Appelez" }, url: null, provenance: { source_name: "S1", licence: "ODbL-1.0", source_url: null }, ...h }];
    const m = goodManifest();
    m.counts.help_numbers = 1;
    return run(m, c);
  };
  it("accepts a complete help number", () => expect(withHelp({})).toEqual([]));
  it("finds a contact that is not a short code or a toll-free number, with the record", () => expect(withHelp({ contact: "416-555-0199" })).toEqual([{ code: "pk-help-contact", file: "content", path: "help_numbers[0]", detail: 'contact "416-555-0199" is not a short code or a toll-free number' }]));
  it("finds a name that is missing in French", () => expect(codes(withHelp({ name: { en: "Line" } }))).toEqual(["pk-help-not-bilingual"]));
  it("finds an email address in the instructions", () => expect(codes(withHelp({ how: { en: "Write jo@example.org", fr: "Écrivez" } }))).toEqual(["pk-text-email"]));
  it("finds a telephone number written in the instructions, and not the contact field", () => expect(codes(withHelp({ how: { en: "Call 416-555-0199", fr: "Appelez" } }))).toEqual(["pk-text-phone"]));
  it("finds a link on a host that is not listed", () => expect(codes(withHelp({ url: `${H}other.net/` }))).toEqual(["pk-url-host-not-listed"]));
});
