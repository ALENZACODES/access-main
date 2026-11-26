import { describe, expect, it } from "vitest";
import { containsForbiddenOrg } from "../../../../packages/shared/test/forbiddenOrg";
import {
  CREDITS_CSV_HEADER,
  LICENCE_URLS,
  MAX_URLS_PER_GROUP,
  OSM_CREDIT,
  buildCredits,
  creditRecordsFromPack,
  creditTier,
  creditsToCsv,
  creditsToText,
  dateRangeText,
  groupText,
  oldestAgeDays,
  tierCountsText,
  type CreditRecord,
} from "./dataCredits";
import { lintCopy } from "./copyLint";
import { OPEN_LICENCES, type OpenLicenceId, type Provenance } from "./provenance";

const TODAY = "2026-11-19";
const OSM = "OpenStreetMap, Geofabrik Ontario extract";
const prov = (over: Partial<Provenance> = {}): Provenance => ({ source: OSM, licence: "ODbL-1.0", retrievedOn: "2026-11-13", ...over });
const rec = (over: Partial<CreditRecord> & { p?: Partial<Provenance> | null } = {}): CreditRecord => ({
  provenance: over.p === null ? null : prov(over.p ?? {}),
  tier: "tier" in over ? over.tier : 0,
});

describe("creditTier", () => {
  it.each([[0, 0], [1, 1], [2, 2], [3, 3], [4, 4], ["E", "E"], ["0", 0]] as const)("reads %s", (input, tier) => expect(creditTier(input)).toBe(tier));
  it.each([[undefined], [null], ["UNKNOWN"], [9], ["tier-9"], [{}], [true]])("keeps %s unknown", (input) => expect(creditTier(input)).toBeNull());
});

describe("licence list", () => {
  it("has an https page for every open licence and none for anything else", () => {
    expect(Object.keys(LICENCE_URLS).sort()).toEqual(Object.keys(OPEN_LICENCES).sort());
    for (const url of Object.values(LICENCE_URLS)) expect(url).toMatch(/^https:\/\/\S+$/);
  });
});

describe("buildCredits: grouping", () => {
  it("groups by source and licence and counts records", () => {
    const c = buildCredits([rec(), rec(), rec({ p: { source: "Open Data Toronto", licence: "OGL-Ontario-1.0" } })], TODAY);
    expect(c.groups.map((g) => [g.source, g.records])).toEqual([[OSM, 2], ["Open Data Toronto", 1]]);
    expect(c.recordCount).toBe(3);
    expect(c.withoutSource).toBe(0);
  });
  it("treats the same source name under two licences as two groups", () => {
    const c = buildCredits([rec({ p: { licence: "CC-BY-4.0" } }), rec({ p: { licence: "CC0-1.0" } })], TODAY);
    expect(c.groups).toHaveLength(2);
  });
  it("matches a source name regardless of letter case", () => {
    const c = buildCredits([rec({ p: { source: "City Open Data" } }), rec({ p: { source: "city open data" } })], TODAY);
    expect(c.groups).toHaveLength(1);
    expect(c.groups[0]?.source).toBe("City Open Data");
  });
  it("counts a record with no provenance as having no source and credits nobody", () => {
    const c = buildCredits([rec({ p: null }), rec({ p: null, tier: 1 }), rec()], TODAY);
    expect(c.withoutSource).toBe(2);
    expect(c.groups).toHaveLength(1);
    expect(c.groups[0]?.records).toBe(1);
    expect(c.recordCount).toBe(3);
  });
  it("orders by record count, then name, then licence, whatever the input order", () => {
    const a = rec({ p: { source: "Alpha", licence: "CC0-1.0" } });
    const b = rec({ p: { source: "Beta", licence: "CC0-1.0" } });
    const big = rec({ p: { source: "Zed", licence: "CC0-1.0" } });
    const one = buildCredits([a, b, big, big], TODAY).groups.map((g) => g.source);
    const two = buildCredits([big, b, big, a], TODAY).groups.map((g) => g.source);
    expect(one).toEqual(["Zed", "Alpha", "Beta"]);
    expect(two).toEqual(one);
  });
  it("gives an empty result for no records", () => {
    expect(buildCredits([], TODAY)).toEqual({ groups: [], recordCount: 0, withoutSource: 0, needsOsmCredit: false });
  });
});

describe("buildCredits: dates and staleness", () => {
  it("keeps the earliest and latest retrieval date", () => {
    const c = buildCredits([rec({ p: { retrievedOn: "2026-05-02" } }), rec({ p: { retrievedOn: "2026-11-13" } }), rec({ p: { retrievedOn: "2026-08-30" } })], TODAY);
    expect(c.groups[0]).toMatchObject({ earliest: "2026-05-02", latest: "2026-11-13" });
  });
  it("counts a record as stale only when it is older than the stale limit", () => {
    const c = buildCredits([rec({ p: { retrievedOn: "2025-11-19" } }), rec({ p: { retrievedOn: "2025-11-18" } }), rec({ p: { retrievedOn: "2026-11-19" } })], TODAY);
    expect(c.groups[0]?.staleRecords).toBe(1);
  });
  it("reports the age of the oldest record, and null with none", () => {
    expect(oldestAgeDays(buildCredits([rec({ p: { retrievedOn: "2026-11-09" } }), rec()], TODAY), TODAY)).toBe(10);
    expect(oldestAgeDays(buildCredits([], TODAY), TODAY)).toBeNull();
    expect(oldestAgeDays(buildCredits([rec({ p: null })], TODAY), TODAY)).toBeNull();
  });
});

describe("buildCredits: tiers", () => {
  it("counts each stated tier in tier order and keeps unrecognised tiers as UNKNOWN", () => {
    const c = buildCredits([rec({ tier: "E" }), rec({ tier: 1 }), rec({ tier: 0 }), rec({ tier: 0 }), rec({ tier: "banana" }), rec({ tier: undefined })], TODAY);
    const g = c.groups[0]!;
    expect(g.tiers).toEqual([{ tier: 0, records: 2 }, { tier: 1, records: 1 }, { tier: "E", records: 1 }]);
    expect(g.tierUnknownRecords).toBe(2);
  });
  it("never invents a tier for a record that does not state one", () => {
    const g = buildCredits([rec({ tier: undefined })], TODAY).groups[0]!;
    expect(g.tiers).toEqual([]);
    expect(g.tierUnknownRecords).toBe(1);
  });
  it("writes the counts in both languages with the token UNKNOWN", () => {
    const g = buildCredits([rec({ tier: 0 }), rec({ tier: null })], TODAY).groups[0]!;
    expect(tierCountsText(g, "en")).toBe("Tier 0: 1; Tier UNKNOWN: 1");
    expect(tierCountsText(g, "fr")).toBe("Niveau 0 : 1\u202f; Niveau UNKNOWN : 1");
    expect(tierCountsText(g, "fr")).not.toMatch(/INCONNU/);
  });
});

describe("buildCredits: links", () => {
  it("keeps distinct source pages in first-seen order and caps them", () => {
    const urls = Array.from({ length: 6 }, (_, i) => `https://example.org/p/${i}`);
    const c = buildCredits([...urls, urls[0]!, urls[1]!].map((url) => rec({ p: { url } })), TODAY);
    expect(c.groups[0]?.urls).toEqual(urls.slice(0, MAX_URLS_PER_GROUP));
  });
  it("lists no page when the records give none", () => {
    expect(buildCredits([rec()], TODAY).groups[0]?.urls).toEqual([]);
  });
});

describe("OpenStreetMap credit", () => {
  it("is required for OpenStreetMap data and for any ODbL group", () => {
    expect(buildCredits([rec()], TODAY).needsOsmCredit).toBe(true);
    expect(buildCredits([rec({ p: { source: "Some extract", licence: "ODbL-1.0" } })], TODAY).needsOsmCredit).toBe(true);
    expect(buildCredits([rec({ p: { source: "openstreetmap mirror", licence: "CC0-1.0" } })], TODAY).needsOsmCredit).toBe(true);
  });
  it("is not asked for when no group is OpenStreetMap data", () => {
    expect(buildCredits([rec({ p: { source: "Open Data Toronto", licence: "OGL-Ontario-1.0" } })], TODAY).needsOsmCredit).toBe(false);
    expect(buildCredits([rec({ p: null })], TODAY).needsOsmCredit).toBe(false);
  });
  it("reads exactly the required words and appears in the text in both languages", () => {
    expect(OSM_CREDIT).toBe("© OpenStreetMap contributors");
    for (const locale of ["en", "fr"] as const) expect(creditsToText(buildCredits([rec()], TODAY), locale, TODAY).split("\n")).toContain(OSM_CREDIT);
    expect(creditsToText(buildCredits([rec({ p: { source: "X", licence: "CC0-1.0" } })], TODAY), "en", TODAY)).not.toContain("OpenStreetMap contributors");
  });
});

describe("text output", () => {
  const c = buildCredits([rec({ p: { url: "https://www.openstreetmap.org/way/1", retrievedOn: "2026-11-01" } }), rec({ tier: null, p: { retrievedOn: "2026-11-13" } }), rec({ p: null })], TODAY);
  it("names the source, licence with its page, count, dates and tiers in English", () => {
    const text = creditsToText(c, "en", TODAY);
    expect(text).toContain(`${OSM}. Licence: ODbL 1.0 (https://opendatacommons.org/licenses/odbl/1-0/).`);
    expect(text).toContain("2 records. Retrieved 1 November 2026 to 13 November 2026.");
    expect(text).toContain("Tier 0: 1; Tier UNKNOWN: 1.");
    expect(text).toContain("https://www.openstreetmap.org/way/1");
    expect(text).toContain("1 record carry no usable source");
  });
  it("says the same in French with French typography", () => {
    const text = creditsToText(c, "fr", TODAY);
    expect(text).toContain("Licence : ODbL 1.0");
    expect(text).toContain("2 enregistrements.");
    expect(text).toContain("Consulté du 1er novembre 2026 au 13 novembre 2026.");
    expect(text).toContain("Niveau 0 : 1\u202f; Niveau UNKNOWN : 1.");
    expect(text).toContain("1 enregistrement sans source utilisable");
  });
  it("uses a single date when every record was retrieved on one day", () => {
    const g = buildCredits([rec(), rec()], TODAY).groups[0]!;
    expect(dateRangeText(g, "en")).toBe("Retrieved 13 November 2026");
    expect(dateRangeText(g, "fr")).toBe("Consulté le 13 novembre 2026");
  });
  it("warns about old records without saying anything is current", () => {
    const old = buildCredits([rec({ p: { retrievedOn: "2024-01-01" } })], TODAY).groups[0]!;
    expect(groupText(old, "en", TODAY)).toContain("may be out of date");
    expect(groupText(old, "fr", TODAY)).toContain("peuvent être périmés");
    expect(groupText(buildCredits([rec()], TODAY).groups[0]!, "en", TODAY)).not.toContain("out of date");
  });
  it("says so plainly when there are no records", () => {
    expect(creditsToText(buildCredits([], TODAY), "en", TODAY)).toBe("No saved records on this device, so there is nothing to credit yet.");
    expect(creditsToText(buildCredits([], TODAY), "fr", TODAY)).toContain("rien à créditer");
  });
  it("passes the copy linter in both languages, outside the quoted source names", () => {
    const clean = buildCredits([rec({ p: { source: "Open Data Toronto", licence: "OGL-Ontario-1.0", retrievedOn: "2024-02-02" } }), rec({ p: null })], TODAY);
    for (const locale of ["en", "fr"] as const) {
      for (const line of creditsToText(clean, locale, TODAY).split("\n")) expect(lintCopy(line, locale), `${locale}: ${line}`).toEqual([]);
    }
  });
  it("carries no banned organisation name", () => {
    for (const locale of ["en", "fr"] as const) expect(containsForbiddenOrg(creditsToText(c, locale, TODAY))).toBe(false);
  });
  it("is deterministic", () => {
    expect(creditsToText(c, "en", TODAY)).toBe(creditsToText(buildCredits([rec({ p: null }), rec({ tier: null, p: { retrievedOn: "2026-11-13" } }), rec({ p: { url: "https://www.openstreetmap.org/way/1", retrievedOn: "2026-11-01" } })], TODAY), "en", TODAY));
  });
});

describe("CSV output", () => {
  it("has a fixed header and one row per group", () => {
    const rows = creditsToCsv(buildCredits([rec(), rec({ tier: "E" }), rec({ p: { source: "Open Data Toronto", licence: "OGL-Ontario-1.0" } })], TODAY)).split("\r\n");
    expect(rows[0]).toBe(CREDITS_CSV_HEADER.join(","));
    expect(rows).toHaveLength(4);
    expect(rows[1]).toBe(`"${OSM}",ODbL-1.0,https://opendatacommons.org/licenses/odbl/1-0/,2,2026-11-13,2026-11-13,0:1;E:1,0,0`.replace(`"${OSM}"`, `"${OSM}"`));
  });
  it("quotes commas, quotes and line breaks in a source name", () => {
    const csv = creditsToCsv(buildCredits([rec({ p: { source: 'A, "B"\nC' } })], TODAY));
    expect(csv).toContain('"A, ""B""\nC"');
  });
  it("neutralises a source name that starts like a spreadsheet formula", () => {
    for (const bad of ["=SUM(A1)", "+1", "-1", "@x"]) expect(creditsToCsv(buildCredits([rec({ p: { source: bad } })], TODAY)).split("\r\n")[1]).toMatch(new RegExp(`^'${bad.replace(/[()+]/g, "\\$&")}`));
  });
  it("lists every licence id that can occur as its id, never a free-text licence", () => {
    const ids = Object.keys(OPEN_LICENCES) as OpenLicenceId[];
    const csv = creditsToCsv(buildCredits(ids.map((licence, i) => rec({ p: { source: `S${i}`, licence } })), TODAY));
    for (const id of ids) expect(csv).toContain(`,${id},`);
  });
});

describe("creditRecordsFromPack", () => {
  const packProv = (over: Record<string, unknown> = {}) => ({
    source_name: OSM,
    source_url: "https://www.openstreetmap.org/way/1",
    licence: "ODbL-1.0",
    retrieved_at: "2026-11-13",
    tier: 0,
    ...over,
  });
  const place = (over: Record<string, unknown> = {}) => ({ id: "a", name: "Hall", wheelchair: "yes", lat: 43.65, lon: -79.38, provenance: packProv(), ...over });

  it("reads provenance and the stated tier from each record", () => {
    const [r] = creditRecordsFromPack([place({ provenance: packProv({ tier: "E" }) })]);
    expect(r?.provenance).toEqual({ source: OSM, licence: "ODbL-1.0", retrievedOn: "2026-11-13", url: "https://www.openstreetmap.org/way/1" });
    expect(r?.tier).toBe("E");
  });
  it("keeps a record without provenance, as one with no source", () => {
    const c = buildCredits(creditRecordsFromPack([place({ id: "a" }), place({ id: "b", provenance: null })]), TODAY);
    expect(c.recordCount).toBe(2);
    expect(c.withoutSource).toBe(1);
  });
  it("leaves out what the places list would drop and counts a repeated id once", () => {
    const records = creditRecordsFromPack([place(), place(), { id: "" }, null, 7, place({ id: "z" })]);
    expect(records).toHaveLength(2);
  });
  it("gives nothing when the input is not an array", () => {
    for (const v of [null, undefined, {}, "places", 3]) expect(creditRecordsFromPack(v)).toEqual([]);
  });
  it("leaves the tier UNKNOWN when the pack states none", () => {
    const c = buildCredits(creditRecordsFromPack([place({ provenance: packProv({ tier: undefined }) })]), TODAY);
    expect(c.groups[0]?.tierUnknownRecords).toBe(1);
  });
  it("credits the shipped pack's records to their source, with no record lost", async () => {
    const { default: text } = await import("../../public/packs/toronto/content.json?raw");
    const places = (JSON.parse(text) as { places: unknown[] }).places;
    const c = buildCredits(creditRecordsFromPack(places), TODAY);
    expect(c.recordCount).toBe(24);
    expect(c.groups.reduce((n, g) => n + g.records, 0) + c.withoutSource).toBe(24);
    expect(c.needsOsmCredit).toBe(true);
  });
});
