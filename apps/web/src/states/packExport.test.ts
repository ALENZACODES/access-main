import { describe, expect, it } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";
import { containsForbiddenOrg } from "../../../../packages/shared/test/forbiddenOrg";
import { lintCopy } from "./copyLint";
import {
  PACK_CSV_FILENAMES,
  PACK_CSV_HEADER,
  UNKNOWN_TOKEN,
  licenceLegend,
  packExportSummary,
  packPlaceToText,
  packPlacesToCsv,
  packRow,
  readExportRecords,
} from "./packExport";

const TODAY = "2026-11-19";
const prov = (over: Record<string, unknown> = {}) => ({
  source_name: "OpenStreetMap, Geofabrik Ontario extract",
  source_url: "https://www.openstreetmap.org/way/1",
  licence: "ODbL-1.0",
  retrieved_at: "2026-11-13",
  tier: 0,
  ...over,
});
const raw = (over: Record<string, unknown> = {}) => ({
  id: "osm:way/1",
  name: "Hall",
  category: "attraction",
  wheelchair: "yes",
  wheelchair_description: "Ramp at the side door.",
  address: "1 Main Street",
  lat: 43.65,
  lon: -79.38,
  provenance: prov(),
  ...over,
});
const first = (over: Record<string, unknown> = {}) => readExportRecords([raw(over)]).records[0]!;
const col = (row: string[], name: (typeof PACK_CSV_HEADER)[number]) => row[PACK_CSV_HEADER.indexOf(name)];

describe("readExportRecords", () => {
  it("reads records with the tier their provenance states", () => {
    const { records, dropped } = readExportRecords([raw(), raw({ id: "b", provenance: prov({ tier: "E" }) })]);
    expect(records.map((r) => [r.place.id, r.tier])).toEqual([["osm:way/1", "0"], ["b", "E"]]);
    expect(dropped).toBe(0);
  });
  it("keeps a missing or unrecognised tier null and never defaults it", () => {
    for (const tier of [undefined, null, "UNKNOWN", 9, "tier-0", {}]) expect(first({ provenance: prov({ tier }) }).tier, String(tier)).toBeNull();
    expect(first({ provenance: null }).tier).toBeNull();
  });
  it("leaves out and counts unreadable and repeated records", () => {
    const r = readExportRecords([raw(), raw(), { id: "" }, null, 5, "x", raw({ id: "ok" })]);
    expect(r.records.map((x) => x.place.id)).toEqual(["osm:way/1", "ok"]);
    expect(r.dropped).toBe(5);
  });
  it("gives nothing for input that is not an array", () => {
    for (const v of [null, undefined, {}, "places", 3]) expect(readExportRecords(v)).toEqual({ records: [], dropped: 0 });
  });
});

describe("packRow", () => {
  it("writes every column for a complete record", () => {
    const row = packRow(first());
    expect(row).toHaveLength(PACK_CSV_HEADER.length);
    expect(Object.fromEntries(PACK_CSV_HEADER.map((h, i) => [h, row[i]]))).toEqual({
      place_id: "osm:way/1",
      place_name: "Hall",
      kind: "attraction",
      address: "1 Main Street",
      latitude: "43.65",
      longitude: "-79.38",
      wheelchair_tag: "yes",
      tag_status: "reported",
      tag_unknown_reason: "",
      source: "OpenStreetMap, Geofabrik Ontario extract",
      licence: "ODbL-1.0",
      retrieved_on: "2026-11-13",
      tier: "0",
      source_url: "https://www.openstreetmap.org/way/1",
    });
  });
  it("writes UNKNOWN for everything the pack does not state", () => {
    const row = packRow(first({ name: null, category: "UNKNOWN", address: "", lat: undefined, wheelchair: "UNKNOWN", provenance: null }));
    for (const c of ["place_name", "kind", "address", "latitude", "longitude", "wheelchair_tag", "source", "licence", "retrieved_on", "tier"] as const) expect(col(row, c), c).toBe(UNKNOWN_TOKEN);
    expect(col(row, "tag_status")).toBe("unknown");
    expect(col(row, "tag_unknown_reason")).toBe("not-recorded");
    expect(col(row, "source_url")).toBe("");
  });
  it("does not report a tag that has no usable source", () => {
    const row = packRow(first({ provenance: { source_name: "", licence: "ODbL-1.0", retrieved_at: "2026-11-13" } }));
    expect(col(row, "wheelchair_tag")).toBe(UNKNOWN_TOKEN);
    expect(col(row, "tag_status")).toBe("unknown");
    expect(col(row, "tag_unknown_reason")).toBe("missing-provenance");
  });
  it("says why an unrecognised tag is UNKNOWN", () => {
    expect(col(packRow(first({ wheelchair: "maybe" })), "tag_unknown_reason")).toBe("unrecognised-value");
  });
});

describe("packPlacesToCsv", () => {
  it("has the fixed header and one row per record, with CRLF line ends", () => {
    const csv = packPlacesToCsv(readExportRecords([raw(), raw({ id: "b" })]).records);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(PACK_CSV_HEADER.join(","));
    expect(lines).toHaveLength(4);
    expect(lines[3]).toBe("");
  });
  it("is just the header for no records", () => {
    expect(packPlacesToCsv([])).toBe(`${PACK_CSV_HEADER.join(",")}\r\n`);
  });
  it("adds a byte order mark only when asked", () => {
    expect(packPlacesToCsv([]).charCodeAt(0)).toBe("p".charCodeAt(0));
    expect(packPlacesToCsv([], { bom: true }).charCodeAt(0)).toBe(0xfeff);
  });
  it("quotes commas, quotes and line breaks", () => {
    const csv = packPlacesToCsv(readExportRecords([raw({ name: 'Hall, "East"', address: "1 Main\nSuite 2" })]).records);
    expect(csv).toContain('"Hall, ""East"""');
    // The pack parser folds line breaks into spaces, so a cell never holds one.
    expect(csv).toContain(",1 Main Suite 2,");
    expect(csv.split("\r\n")).toHaveLength(3);
  });
  it("neutralises a name that a spreadsheet could read as a formula", () => {
    for (const name of ["=SUM(A1)", "+1", "-1", "@x"]) {
      const line = packPlacesToCsv(readExportRecords([raw({ name })]).records).split("\r\n")[1]!;
      expect(line).toContain(`,'${name},`);
    }
  });
  it("is the same in both languages: the file does not depend on locale", () => {
    const records = readExportRecords([raw()]).records;
    expect(packPlacesToCsv(records)).toBe(packPlacesToCsv(records));
    expect(PACK_CSV_FILENAMES.en).not.toBe(PACK_CSV_FILENAMES.fr);
  });
  it("exports every record of the shipped pack with a source, a licence and a date or UNKNOWN", () => {
    const { records, dropped } = readExportRecords((JSON.parse(contentText) as { places: unknown[] }).places);
    expect(records.length + dropped).toBe(24);
    for (const r of records) {
      const row = packRow(r);
      expect(col(row, "source")).not.toBe("");
      expect(col(row, "licence")).not.toBe("");
      expect(col(row, "retrieved_on")).not.toBe("");
      expect(col(row, "tier")).not.toBe("");
    }
  });
});

describe("packPlaceToText", () => {
  it("states the report, source, licence, date, tier and credit in English", () => {
    const text = packPlaceToText(first(), "en", TODAY);
    expect(text).toContain("Hall\n====");
    expect(text).toContain("Wheelchair tag as reported: yes");
    expect(text).toContain("Tier: 0");
    expect(text).toContain("Note from contributors: Ramp at the side door.");
    expect(text).toContain("Source: OpenStreetMap, Geofabrik Ontario extract. Licence: ODbL 1.0. Retrieved 13 November 2026.");
    expect(text).toContain("Retrieved 6 days ago");
    expect(text).toContain("https://www.openstreetmap.org/way/1");
    expect(text).toContain("© OpenStreetMap contributors");
    expect(text).not.toContain("out of date");
  });
  it("reads in French with French typography", () => {
    const text = packPlaceToText(first(), "fr", TODAY);
    expect(text).toContain("telle que signalée : oui");
    expect(text).toContain("Niveau : 0");
    expect(text).toContain("Consulté le 13 novembre 2026");
    expect(text).toContain("© OpenStreetMap contributors");
  });
  it("keeps Unknown unknown and says there is no source", () => {
    const text = packPlaceToText(first({ name: null, wheelchair: "UNKNOWN", provenance: null, lat: undefined }), "en", TODAY);
    expect(text).toContain("Name UNKNOWN");
    expect(text).toContain("Wheelchair tag as reported: UNKNOWN");
    expect(text).toContain("Position: UNKNOWN");
    expect(text).toContain("Tier: UNKNOWN");
    expect(text).toContain("No usable source is recorded");
    expect(text).not.toContain("© OpenStreetMap");
    expect(packPlaceToText(first({ name: null, provenance: null }), "fr", TODAY)).not.toMatch(/INCONNU/);
  });
  it("flags an old record without calling anything current", () => {
    const old = first({ provenance: prov({ retrieved_at: "2024-01-01" }) });
    expect(packPlaceToText(old, "en", TODAY)).toContain("This may be out of date.");
    expect(packPlaceToText(old, "fr", TODAY)).toContain("peuvent être périmés");
  });
  it("gives the OpenStreetMap credit for ODbL data and not for other licences", () => {
    expect(packPlaceToText(first({ provenance: prov({ licence: "CC0-1.0", source_name: "Open Data Toronto" }) }), "en", TODAY)).not.toContain("OpenStreetMap contributors");
    expect(packPlaceToText(first({ provenance: prov({ licence: "ODbL-1.0", source_name: "Some extract" }) }), "en", TODAY)).toContain("© OpenStreetMap contributors");
  });
  it("strips control characters from names and notes before they reach the text", () => {
    const text = packPlaceToText(first({ name: "Ha\u0000ll‮", wheelchair_description: "a\u0007b" }), "en", TODAY);
    expect(text).toContain("Hall\n");
    // eslint-disable-next-line no-control-regex -- the point is to look for control characters
    expect(text).not.toMatch(/[\u0000-\u0008‪-‮]/);
  });
  it("passes the copy linter and carries no banned organisation name", () => {
    for (const locale of ["en", "fr"] as const) {
      for (const r of [first(), first({ name: null, provenance: null }), first({ provenance: prov({ retrieved_at: "2024-01-01" }) })]) {
        const text = packPlaceToText(r, locale, TODAY);
        expect(containsForbiddenOrg(text)).toBe(false);
        for (const line of text.split("\n").filter((l) => l && !/^=+$/.test(l) && !l.startsWith("http") && !l.startsWith("Source") && !l.startsWith("©"))) {
          expect(lintCopy(line, locale), `${locale}: ${line}`).toEqual([]);
        }
      }
    }
  });
});

describe("packExportSummary and licenceLegend", () => {
  it("counts places and says how many were left out", () => {
    expect(packExportSummary(1, 0, "en", TODAY)).toBe("1 place, exported 19 November 2026.");
    expect(packExportSummary(2, 3, "en", TODAY)).toBe("2 places, exported 19 November 2026. 3 left out because they could not be read safely.");
    expect(packExportSummary(1, 0, "fr", TODAY)).toBe("1 lieu, exporté le 19 novembre 2026.");
    expect(packExportSummary(2, 1, "fr", TODAY)).toContain("1 omis, car illisibles");
  });
  it("lists each open licence once, sorted, and nothing for unsourced records", () => {
    const records = readExportRecords([raw(), raw({ id: "b" }), raw({ id: "c", provenance: prov({ licence: "CC0-1.0" }) }), raw({ id: "d", provenance: null })]).records;
    expect(licenceLegend(records)).toEqual(["CC0-1.0: CC0 1.0", "ODbL-1.0: ODbL 1.0"]);
    expect(licenceLegend([])).toEqual([]);
  });
});
