import { describe, expect, it } from "vitest";
import { lcg } from "./placeFixtures";
import { parityOf, parseAddress } from "./streetAddress";

const WORDS = ["King", "Queen", "rue", "Sainte-Catherine", "de", "la", "Gauchetière", "St", "Street", "Ave", "Rd", "E", "W", "Est", "Ouest", "North", "Unit", "5", "#3", "100", "12A", "100-104", "&", "and", "at", "PO", "Box", "UNKNOWN", "l’Église", "Dundas", "Square", "Highway", "7", "boul.", "Apt"];
const SEPS = [" ", " ", " ", ", ", "; ", "  ", "\t"];

function line(next: () => number): string {
  const n = 1 + Math.floor(next() * 7);
  let s = "";
  for (let i = 0; i < n; i++) s += WORDS[Math.floor(next() * WORDS.length)]! + (i < n - 1 ? SEPS[Math.floor(next() * SEPS.length)]! : "");
  return s;
}

describe("parseAddress on many generated lines", () => {
  const next = lcg(2026);
  const lines = Array.from({ length: 4000 }, () => line(next));
  it("never throws", () => {
    for (const l of lines) expect(() => parseAddress(l), l).not.toThrow();
  });
  it("a street always has a street, a key and no other kind's fields", () => {
    for (const l of lines) {
      const a = parseAddress(l);
      if (a.kind === "street") {
        expect(a.street, l).toBeTruthy();
        expect(a.key, l).toBeTruthy();
      } else {
        expect([a.street, a.key, a.direction, a.number, a.numberValue], l).toEqual([null, null, null, null, null]);
      }
    }
  });
  it("is the same every time", () => {
    for (const l of lines.slice(0, 500)) expect(parseAddress(l), l).toEqual(parseAddress(l));
  });
  it("a number value is the integer at the start of the number text", () => {
    for (const l of lines) {
      const a = parseAddress(l);
      if (a.number !== null) expect(a.numberValue, l).toBe(Number.parseInt(a.number, 10));
      else expect(a.numberValue, l).toBeNull();
    }
  });
  it("a key has no upper-case letters except a final direction, no accents and no double spaces", () => {
    for (const l of lines) {
      const a = parseAddress(l);
      if (a.kind !== "street") continue;
      const base = a.direction === null ? a.key! : a.key!.slice(0, -2);
      expect(base, l).toBe(base.toLowerCase());
      expect(a.key, l).not.toMatch(/[̀-ͯà-ÿ]/);
      expect(a.key, l).not.toMatch(/ {2}/);
      expect(a.key!.trim(), l).toBe(a.key);
    }
  });
  it("a direction is part of the key", () => {
    for (const l of lines) {
      const a = parseAddress(l);
      if (a.direction !== null) expect(a.key!.endsWith(` ${a.direction}`), l).toBe(true);
    }
  });
  it("reading the shown street again gives the same key", () => {
    let checked = 0;
    for (const l of lines) {
      const a = parseAddress(l);
      // A street name with "Unit" inside it reads as a unit the second time, so those lines are left out of this check.
      if (a.kind !== "street" || a.number !== null || /\b(unit|apt)\b/i.test(a.street!) || /[A-Z]\b/.test(a.street!.replace(/\b[A-Z][a-zé]/g, ""))) continue;
      const b = parseAddress(a.street);
      if (b.kind === "street") {
        expect(b.key, `${l} -> ${a.street}`).toBe(a.key);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
  it("output never contains a control character or a double space", () => {
    for (const l of lines) {
      const a = parseAddress(l);
      for (const v of [a.street, a.unit]) {
        if (v === null) continue;
        expect([...v].some((ch) => ch.codePointAt(0)! < 0x20), l).toBe(false);
        expect(v, l).not.toContain("  ");
      }
    }
  });
  it("parity matches the number", () => {
    for (let n = 0; n < 200; n++) expect(parityOf(n)).toBe(n % 2 === 0 ? "even" : "odd");
  });
});
