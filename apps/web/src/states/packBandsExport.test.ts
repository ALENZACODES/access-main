import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import { type BandRow, buildBands } from "./packBands";
import { BAND_CSV_FILENAMES, BAND_CSV_HEADER, BAND_TEXT_FILENAMES, bandsToCsv, bandsToText } from "./packBandsExport";
import { parsePackPlaces, type PackPlaceRecord } from "./packPlaces";

const TODAY = "2026-11-19";
const FROM = { lat: 43.65, lon: -79.38 };
const OSM = { source_name: "OpenStreetMap, Geofabrik Ontario extract", licence: "ODbL-1.0", retrieved_at: "2026-11-10", tier: 0 };
const R = 6_371_008.8;
const at = (metres: number | null) => (metres === null ? {} : { lat: FROM.lat + ((metres / R) * 180) / Math.PI, lon: FROM.lon });
const mk = (id: string, metres: number | null, over: Record<string, unknown> = {}): PackPlaceRecord => parsePackPlaces([{ id, name: id, wheelchair: "yes", provenance: OSM, ...at(metres), ...over }]).places[0]!;
const rows = (): BandRow[] => buildBands([mk("a", 100), mk("b", 120, { wheelchair: "no" }), mk("c", 300, { wheelchair: undefined }), mk("d", 800, { wheelchair: "limited" }), mk("e", null), mk("f", 9000, { wheelchair: "designated" })], FROM);

function parseCsv(text: string): string[][] {
  return text
    .replace(/\r\n$/, "")
    .split("\r\n")
    .map((line) => line.split(","));
}

describe("bandsToCsv", () => {
  it("has the fixed English header", () => {
    expect(parseCsv(bandsToCsv(rows()))[0]).toEqual([...BAND_CSV_HEADER]);
  });
  it("has one row per band", () => {
    expect(parseCsv(bandsToCsv(rows()))).toHaveLength(rows().length + 1);
  });
  it("writes band tokens and whole-metre edges", () => {
    const body = parseCsv(bandsToCsv(rows())).slice(1);
    expect(body[0]!.slice(0, 4)).toEqual(["lt250", "0", "250", "2"]);
    expect(body[1]!.slice(0, 3)).toEqual(["250-500", "250", "500"]);
    expect(body[5]!.slice(0, 3)).toEqual(["5000+", "5000", "UNKNOWN"]);
  });
  it("writes the no-point group with UNKNOWN edges", () => {
    const last = parseCsv(bandsToCsv(rows())).slice(1).at(-1)!;
    expect(last.slice(0, 4)).toEqual(["no-point", "UNKNOWN", "UNKNOWN", "1"]);
  });
  it("writes the tag counts in the fixed order yes, limited, no, designated, UNKNOWN", () => {
    const first = parseCsv(bandsToCsv(rows())).slice(1)[0]!;
    expect(first.slice(4, 9)).toEqual(["1", "0", "1", "0", "0"]);
    const second = parseCsv(bandsToCsv(rows())).slice(1)[1]!;
    expect(second.slice(4, 9)).toEqual(["0", "0", "0", "0", "1"]);
  });
  it("writes the share of reported tags rounded down, or UNKNOWN for an empty band", () => {
    const body = parseCsv(bandsToCsv(rows())).slice(1);
    expect(body[0]![9]).toBe("100");
    expect(body[1]![9]).toBe("0");
    expect(body[2]![9]).toBe("100");
    expect(parseCsv(bandsToCsv(buildBands([], FROM))).slice(1)[0]![9]).toBe("UNKNOWN");
  });
  it("adds up to the number of places", () => {
    const body = parseCsv(bandsToCsv(rows())).slice(1);
    expect(body.reduce((n, r) => n + Number(r[3]), 0)).toBe(6);
  });
  it("uses CRLF line ends and ends with one", () => {
    const text = bandsToCsv(rows());
    expect(text.endsWith("\r\n")).toBe(true);
    expect(text.replace(/\r\n/g, "").includes("\n")).toBe(false);
  });
  it("adds a byte order mark only when asked", () => {
    expect(bandsToCsv(rows()).startsWith("\uFEFF")).toBe(false);
    expect(bandsToCsv(rows(), { bom: true }).startsWith("\uFEFFband,")).toBe(true);
  });
  it("is the same file in both languages, since it holds only tokens and numbers", () => {
    expect(bandsToCsv(rows())).toBe(bandsToCsv(rows()));
  });
  it("never holds the point that was typed", () => {
    const text = bandsToCsv(rows());
    expect(text).not.toContain("43.65");
    expect(text).not.toContain("79.38");
  });
});

describe("bandsToText", () => {
  it("starts with a title, an underline of the same length and the date", () => {
    const lines = bandsToText(rows(), "en", TODAY).split("\n");
    expect(lines[0]).toBe("Places by distance from a point you typed");
    expect(lines[1]).toBe("=".repeat(lines[0]!.length));
    expect(lines[2]).toBe("Date: 2026-11-19");
  });
  it("says the distances are straight lines and not a route", () => {
    expect(bandsToText(rows(), "en", TODAY)).toContain("straight-line distances, not a walking, rolling or driving route");
  });
  it("has one block per band with the tag counts spelled out", () => {
    const text = bandsToText(rows(), "en", TODAY);
    expect(text).toContain("Under 250\u00a0m — 2 places");
    expect(text).toContain("  Wheelchair tag: yes 1, limited 0, no 1, designated 0, UNKNOWN 0");
    expect(text).toContain("250\u00a0m to 500\u00a0m — 1 place\n");
    expect(text).toContain("No map point (UNKNOWN distance) — 1 place");
  });
  it("writes the reported share, with UNKNOWN for an empty band", () => {
    const text = bandsToText(rows(), "en", TODAY);
    expect(text).toContain("  Tag reported with a source: 100%");
    expect(text).toContain("  Tag reported with a source: UNKNOWN");
  });
  it("ends with the exact OpenStreetMap credit and a final newline", () => {
    expect(bandsToText(rows(), "en", TODAY).endsWith("\n© OpenStreetMap contributors\n")).toBe(true);
    expect(bandsToText(rows(), "fr", TODAY).endsWith("\n© OpenStreetMap contributors\n")).toBe(true);
  });
  it("never holds the point that was typed", () => {
    for (const locale of ["en", "fr"] as const) {
      const text = bandsToText(rows(), locale, TODAY);
      expect(text).not.toContain("43.65");
      expect(text).not.toContain("79.38");
    }
  });
  it("sets French typography: no-break space before the colon, thin space before the percent sign", () => {
    const text = bandsToText(rows(), "fr", TODAY);
    expect(text).toContain("Date\u00a0: 2026-11-19");
    expect(text).toContain("Indication pour fauteuil roulant\u00a0: oui 1, limité 0, non 1, réservé 0, UNKNOWN 0");
    expect(text).toContain("Indication fournie avec une source\u00a0: 100\u202f%");
    expect(text).not.toMatch(/ [:;!?]/);
  });
  it("uses the token UNKNOWN in French, never INCONNU, and a typographic apostrophe", () => {
    const text = bandsToText(rows(), "fr", TODAY);
    expect(text).not.toMatch(/INCONNU/i);
    expect(text).not.toContain("'");
  });
  it("counts places with French plural rules: 0 and 1 are singular", () => {
    const text = bandsToText(rows(), "fr", TODAY);
    expect(text).toContain("De 500\u00a0m à 1\u00a0km — 1 lieu");
    expect(text).toContain("De 1\u00a0km à 2\u00a0km — 0 lieu");
    expect(text).toContain("Moins de 250\u00a0m — 2 lieux");
  });
  it("is clean copy line by line in both languages", () => {
    for (const locale of ["en", "fr"] as const) {
      for (const line of bandsToText(rows(), locale, TODAY).split("\n")) {
        if (line.startsWith("©")) continue; // the credit is fixed text
        expect(lintCopy(line, locale), line).toEqual([]);
      }
    }
  });
  it("still says what it counted when there are no places", () => {
    const text = bandsToText(buildBands([], FROM), "en", TODAY);
    expect(text).toContain("No places to group by distance.");
    expect(text).toContain("Under 250\u00a0m — 0 places");
  });
});

describe("file names", () => {
  it("are plain ASCII, differ by language and end in the right extension", () => {
    for (const name of [...Object.values(BAND_CSV_FILENAMES), ...Object.values(BAND_TEXT_FILENAMES)]) expect(name).toMatch(/^[a-z-]+\.(csv|txt)$/);
    expect(BAND_CSV_FILENAMES.en).not.toBe(BAND_CSV_FILENAMES.fr);
    expect(BAND_TEXT_FILENAMES.fr.endsWith(".txt")).toBe(true);
  });
});
