import { describe, expect, it } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";
import { AROUND_RADII, buildAround, centreChoices } from "./aroundSearch";
import { aroundToCsv, aroundToText } from "./aroundExport";
import { lintCopy } from "./copyLint";
import { parseCsv } from "./csvParse";
import { OSM_CREDIT } from "./dataCredits";
import { parsePackPlaces } from "./packPlaces";
import { ringRows, sectorRows } from "./aroundRings";

const { places } = parsePackPlaces((JSON.parse(contentText) as { places: unknown[] }).places);

describe("around a place with the shipped pack", () => {
  it("parses a pack of places to try it on", () => {
    expect(places.length).toBeGreaterThan(10);
    expect(centreChoices(places).length).toBeGreaterThan(5);
  });
  it("gives a consistent result for every place that can be a centre, at every distance", () => {
    for (const c of centreChoices(places)) {
      for (const r of AROUND_RADII) {
        const res = buildAround(places, c.id, r);
        if (res.status !== "ok") throw new Error(`${c.id}: ${res.status}`);
        expect(res.members.length + res.beyond + res.unmeasured + 1, `${c.id} ${r}`).toBe(places.length);
        for (const m of res.members) {
          expect(m.metres).toBeLessThanOrEqual(r);
          expect(m.id).not.toBe(c.id);
        }
      }
    }
  });
  it("finds neighbours for a place in the middle of the pack, within a kilometre", () => {
    const best = Math.max(...centreChoices(places).map((c) => {
      const r = buildAround(places, c.id, 1000);
      return r.status === "ok" ? r.members.length : 0;
    }));
    expect(best).toBeGreaterThan(2);
  });
  it("keeps the tag the pack gives each neighbour, including UNKNOWN", () => {
    for (const c of centreChoices(places)) {
      const res = buildAround(places, c.id, 1000);
      if (res.status !== "ok") continue;
      for (const m of res.members) expect(m.tag).toBe(places.find((p) => p.id === m.id)!.tag);
    }
  });
  it("has band and direction counts that add up to the list, for every centre", () => {
    for (const c of centreChoices(places)) {
      const res = buildAround(places, c.id, 1000);
      if (res.status !== "ok") continue;
      expect(ringRows(res.members, 1000).reduce((n, r) => n + r.count, 0)).toBe(res.members.length);
      expect(sectorRows(res.members).reduce((n, r) => n + r.count, 0)).toBe(res.members.length);
    }
  });
  it("writes a text and a CSV file for every centre that pass the copy rules and read back", () => {
    for (const c of centreChoices(places)) {
      const res = buildAround(places, c.id, 1000);
      if (res.status !== "ok") continue;
      for (const locale of ["en", "fr"] as const) {
        const text = aroundToText(res, res.members, false, locale);
        expect(text.split(OSM_CREDIT)).toHaveLength(2);
        for (const line of text.split("\n")) {
          // Names and addresses come from the pack as written, so the line check covers the sentences only.
          if (!line.startsWith("   ") && !/^\d+\. /.test(line)) expect(lintCopy(line, locale), `${c.id}: ${line}`).toEqual([]);
        }
        expect(text).not.toMatch(/inconnu/i);
      }
      const csv = parseCsv(aroundToCsv(res, res.members));
      expect(csv.ok && csv.rows.length).toBe(1 + res.members.length);
    }
  });
  it("is the same on a second run", () => {
    const c = centreChoices(places)[0]!;
    expect(buildAround(places, c.id, 500)).toEqual(buildAround(places, c.id, 500));
  });
});
