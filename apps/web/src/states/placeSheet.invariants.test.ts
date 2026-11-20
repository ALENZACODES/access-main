/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { varied } from "./placeFixtures";
import { SHEET_FIELDS, buildPlaceSheet, sheetSummary } from "./placeSheet";
import { VCARD_LINE_OCTETS, placeToVcard, placesToGpx, placesToVcards } from "./placeSheetExport";
import { lintFrench } from "./typography";

const TODAY = "2026-11-19";
const SEEDS = [1, 2, 3, 5, 8, 13, 21, 34];
const enc = new TextEncoder();

describe("every generated place, in both languages", () => {
  for (const seed of SEEDS) {
    const places = varied(seed, 40);
    it(`seed ${seed}: the sheet has nine details, in order, and the counts agree`, () => {
      for (const locale of ["en", "fr"] as const) {
        for (const p of places) {
          const s = buildPlaceSheet(p, locale, TODAY);
          expect(s.rows.filter((r) => r.field !== "note").map((r) => r.field)).toEqual([...SHEET_FIELDS]);
          expect(s.recorded + s.gaps.length).toBe(s.total);
          expect(s.recorded).toBe(s.rows.filter((r) => r.field !== "note" && r.known).length);
        }
      }
    });
    it(`seed ${seed}: an unknown value is the token UNKNOWN and always has a reason, a known one has none`, () => {
      for (const p of places) {
        for (const r of buildPlaceSheet(p, "fr", TODAY).rows) {
          if (r.known) {
            expect(r.reason).toBeNull();
            expect(r.value).not.toBe("UNKNOWN");
          } else {
            expect(r.value).toBe("UNKNOWN");
            expect(r.reason).toMatch(/\S/);
          }
        }
      }
    });
    it(`seed ${seed}: a map link exists exactly when the place has a map point`, () => {
      for (const p of places) expect(buildPlaceSheet(p, "en", TODAY).geoHref !== null).toBe(p.location !== null);
    });
    it(`seed ${seed}: the summary and every reason pass the French typography check`, () => {
      for (const p of places) {
        const s = buildPlaceSheet(p, "fr", TODAY);
        expect(lintFrench(sheetSummary(s, "fr")), sheetSummary(s, "fr")).toEqual([]);
        for (const r of s.rows) if (r.reason) expect(lintFrench(r.reason), r.reason).toEqual([]);
      }
    });
    it(`seed ${seed}: the cards are one per place, every physical line is within 75 octets and CRLF only`, () => {
      const out = placesToVcards(places, "en");
      expect(out.match(/^BEGIN:VCARD\r$/gm)).toHaveLength(places.length);
      for (const l of out.split("\r\n")) expect(enc.encode(l).length).toBeLessThanOrEqual(VCARD_LINE_OCTETS);
      expect(out.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    });
    it(`seed ${seed}: each card has a GEO line exactly when the place has a map point`, () => {
      for (const p of places) expect(/\r\nGEO:/.test(placeToVcard(p, "en").replace(/\r\n /g, ""))).toBe(p.location !== null);
    });
    it(`seed ${seed}: the GPX is well-formed and has one waypoint per located place, all inside the globe`, () => {
      for (const locale of ["en", "fr"] as const) {
        const doc = new DOMParser().parseFromString(placesToGpx(places, locale), "application/xml");
        expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
        const wpts = [...doc.getElementsByTagName("wpt")];
        expect(wpts).toHaveLength(places.filter((p) => p.location !== null).length);
        for (const w of wpts) {
          expect(Math.abs(Number(w.getAttribute("lat")))).toBeLessThanOrEqual(90);
          expect(Math.abs(Number(w.getAttribute("lon")))).toBeLessThanOrEqual(180);
        }
      }
    });
  }
  it("does not alter the places it is given", () => {
    const places = varied(99, 20);
    const before = JSON.stringify(places);
    for (const p of places) buildPlaceSheet(p, "en", TODAY);
    placesToVcards(places, "fr");
    placesToGpx(places, "fr");
    expect(JSON.stringify(places)).toBe(before);
  });
  it("gives the same output for the same input", () => {
    const places = varied(4, 20);
    expect(placesToGpx(places, "en")).toBe(placesToGpx(places, "en"));
    expect(placesToVcards(places, "fr")).toBe(placesToVcards(places, "fr"));
  });
});

describe("hostile text from the pack, in every output", () => {
  const HOSTILE = ["\r\nEND:VCARD\r\nBEGIN:VCARD", "</name><x/>", "]]>", "\u0000\u0007bell", "a;b,c\\d", "‮evil", "A".repeat(400), "😀".repeat(100), "'; DROP TABLE places;--", "=cmd|' /C calc'!A0"];
  it("never adds a card, a waypoint or an element, and keeps every line within 75 octets", async () => {
    const { place } = await import("./placeFixtures");
    for (const name of HOSTILE) {
      const p = place("h", { name, address: name, wheelchair_description: name });
      const vcf = placeToVcard(p, "en");
      expect(vcf.match(/^BEGIN:VCARD\r$/gm), name).toHaveLength(1);
      expect(vcf.match(/^END:VCARD\r$/gm), name).toHaveLength(1);
      for (const l of vcf.split("\r\n")) expect(enc.encode(l).length).toBeLessThanOrEqual(VCARD_LINE_OCTETS);
      const doc = new DOMParser().parseFromString(placesToGpx([p], "en"), "application/xml");
      expect(doc.getElementsByTagName("parsererror"), name).toHaveLength(0);
      expect(doc.getElementsByTagName("x"), name).toHaveLength(0);
      expect(doc.getElementsByTagName("wpt"), name).toHaveLength(1);
    }
  });
});
