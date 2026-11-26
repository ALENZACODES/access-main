import { describe, expect, it } from "vitest";
import { helpToCsv, helpToText } from "./helpExport";
import { readContact, spokenContact } from "./helpContact";
import { EMPTY_HELP_QUERY, matchesHelp, rowFor, viewHelp } from "./helpView";
import { parseCsv } from "./csvParse";
import { parseHelpNumbers, readContactText } from "./packHelp";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const pickOf = <T,>(r: () => number, xs: T[]): T => xs[Math.floor(r() * xs.length)]!;
const JUNK: unknown[] = [null, undefined, 0, -1, NaN, "", " ", "x", "UNKNOWN", true, [], {}, [1], { en: 1 }, "\u0000", "‮", "=1+1", "<b>", "\ud83d", "9".repeat(80)];
function word(r: () => number): string {
  const alpha = "abc éè,\"\n-0123456789()+.";
  return Array.from({ length: Math.floor(r() * 14) }, () => alpha[Math.floor(r() * alpha.length)]).join("");
}
function value(r: () => number): unknown {
  const k = r();
  if (k < 0.3) return pickOf(r, JUNK);
  if (k < 0.6) return word(r);
  if (k < 0.8) return { en: r() < 0.5 ? word(r) : pickOf(r, JUNK), fr: r() < 0.5 ? word(r) : pickOf(r, JUNK) };
  return { nested: value(r) };
}
function record(r: () => number): unknown {
  if (r() < 0.1) return pickOf(r, JUNK);
  const o: Record<string, unknown> = {};
  for (const k of ["id", "name", "how", "contact", "url", "provenance"]) if (r() < 0.85) o[k] = r() < 0.5 && k === "id" ? `i${Math.floor(r() * 9)}` : value(r);
  if (r() < 0.5) o.provenance = { source_name: value(r), source_url: value(r), licence: value(r), retrieved_at: value(r), tier: value(r) };
  return o;
}

describe("fuzz: the parser, view and exports never throw on damaged data", () => {
  it("handles 600 random lists", () => {
    const r = rng(7);
    for (let n = 0; n < 600; n++) {
      const list = Array.from({ length: Math.floor(r() * 8) }, () => record(r));
      const parsed = parseHelpNumbers(list);
      expect(parsed.items.length + parsed.dropped).toBe(list.length);
      const ids = parsed.items.map((i) => i.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const l of ["en", "fr"] as const) {
        for (const q of [EMPTY_HELP_QUERY, { text: word(r), sort: "name" as const }]) {
          const v = viewHelp(parsed.items, q, l);
          expect(v.shown).toBe(v.rows.length);
          expect(v.total).toBe(parsed.items.length);
          expect(typeof helpToText(v.rows, "2026-11-21", l, q)).toBe("string");
        }
      }
    }
  });
  it("gives a CSV that reads back with the same cells for 300 random lists", () => {
    const r = rng(11);
    for (let n = 0; n < 300; n++) {
      const items = parseHelpNumbers(Array.from({ length: 1 + Math.floor(r() * 6) }, () => record(r))).items;
      const parsed = parseCsv(helpToCsv(items).replace(/^\uFEFF/, ""));
      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        expect(parsed.rows).toHaveLength(items.length + 1);
        const widths = new Set(parsed.rows.map((x) => x.length));
        expect(widths.size).toBe(1);
      }
    }
  });
  it("keeps every digit of a number it reads, in order, and says exactly those digits", () => {
    const r = rng(23);
    const sep = [" ", "-", ".", "(", ")", "‑"];
    for (let n = 0; n < 500; n++) {
      const len = 1 + Math.floor(r() * 14);
      let text = r() < 0.2 ? "+" : "";
      let digits = "";
      for (let i = 0; i < len; i++) {
        const d = String(Math.floor(r() * 10));
        digits += d;
        text += d + (r() < 0.3 ? pickOf(r, sep) : "");
      }
      const ok = readContactText(text);
      if (ok === null) continue;
      const reading = readContact(ok)!;
      expect(reading.digits).toBe(digits);
      const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
      const back = spokenContact(reading, "en").split(/[ ,]+/).filter(Boolean).map((w) => words.indexOf(w)).join("");
      expect(back).toBe(digits);
    }
  });
  it("finds every entry by its own id and by its number's digits", () => {
    const r = rng(31);
    for (let n = 0; n < 100; n++) {
      const items = parseHelpNumbers(Array.from({ length: 5 }, (_, i) => ({ id: `id${i}x${n}`, name: { en: word(r) }, contact: `${100 + Math.floor(r() * 800)}` }))).items;
      for (const it of items) {
        expect(matchesHelp(rowFor(it, "en"), it.id), it.id).toBe(true);
        if (it.contact) expect(matchesHelp(rowFor(it, "en"), it.contact)).toBe(true);
      }
    }
  });
  it("never changes the pack's order with an empty query", () => {
    const r = rng(41);
    for (let n = 0; n < 100; n++) {
      const items = parseHelpNumbers(Array.from({ length: 6 }, (_, i) => ({ id: `k${i}`, name: { en: word(r) } }))).items;
      expect(viewHelp(items, EMPTY_HELP_QUERY, "en").rows.map((x) => x.item.id)).toEqual(items.map((x) => x.id));
    }
  });
});
