import { describe, expect, it } from "vitest";
import { CATALOG, message, pluralCategory, type Entry, type MessageId } from "./messages";
import { frTypography } from "./typography";

const IDS = Object.keys(CATALOG) as MessageId[];
const LOCALES = ["en", "fr"] as const;
const templates = (e: string | { one: string; other: string }): string[] => (typeof e === "string" ? [e] : [e.one, e.other]);
const holes = (s: string): string[] => [...s.matchAll(/\{([a-zA-Z]+)\}/g)].map((m) => m[1]!);
const DUMMY = (e: Entry): Record<string, string | number> => {
  const params: Record<string, string | number> = {};
  for (const l of LOCALES) for (const t of templates(e[l])) for (const h of holes(t)) params[h] = h === "n" ? 2 : `<${h}>`;
  if (typeof e.en !== "string") params.n = 2;
  return params;
};

describe("the message catalogue", () => {
  it("has a useful number of messages", () => expect(IDS.length).toBeGreaterThan(100));
  it("names every id as a group, a dot and a name, with no spaces", () => {
    for (const id of IDS) expect(id, id).toMatch(/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)+$/);
  });
  it("has each id once", () => expect(new Set(IDS).size).toBe(IDS.length));
  it("has the same shape in both languages", () => {
    for (const id of IDS) expect(typeof CATALOG[id].en, id).toBe(typeof CATALOG[id].fr);
  });
  it("has the same placeholders in both languages, and the same in every plural form", () => {
    for (const id of IDS) {
      const sets = LOCALES.flatMap((l) => templates(CATALOG[id][l]).map((t) => [...new Set(holes(t))].sort().join(",")));
      const numeric = typeof CATALOG[id].en === "string" ? sets : sets.map((s) => s.replace(/(^|,)n(,|$)/, "$1$2"));
      expect(new Set(numeric).size, id).toBe(1);
    }
  });
  it("has the count in a message that has plural forms", () => {
    for (const id of IDS) {
      const e = CATALOG[id];
      if (typeof e.en === "string") continue;
      for (const l of LOCALES) {
        const f = e[l] as { one: string; other: string };
        expect(f.one, `${id}/${l}`).toContain("{n}");
        expect(f.other, `${id}/${l}`).toContain("{n}");
        if (l === "en") expect(f.one, `${id}/${l}`).not.toBe(f.other);
      }
    }
  });
  it("has no text with a space at an end, a double space, a tab or a newline", () => {
    for (const id of IDS) for (const l of LOCALES) for (const t of templates(CATALOG[id][l])) {
      expect(t, `${id}/${l}`).toBe(t.trim());
      expect(t, `${id}/${l}`).not.toMatch(/ {2}|[\t\n\r]/);
    }
  });
  it("has no text left in the other language's apostrophe style", () => {
    for (const id of IDS) for (const t of templates(CATALOG[id].en)) expect(t, id).not.toContain("’’");
  });
  it("has French that is not the same as the English, apart from credits, names, labels and short words", () => {
    const same = IDS.filter((id) => templates(CATALOG[id].en).join("|") === templates(CATALOG[id].fr).join("|"));
    for (const id of same) expect(templates(CATALOG[id].en).every((t) => t.length <= 20 || !/\s/.test(t) || t.startsWith("\u00a9")), id).toBe(true);
  });
});

describe("message over the whole catalogue", () => {
  for (const l of LOCALES) {
    it(`fills every message in ${l} without a missing parameter and leaves no brace`, () => {
      for (const id of IDS) {
        const s = message(id, l, DUMMY(CATALOG[id]));
        expect(s, id).not.toMatch(/[{}]/);
        expect(s.length, id).toBeGreaterThan(0);
      }
    });
    it(`puts the values in as given, with no typography applied to them, in ${l}`, () => {
      for (const id of IDS) {
        const params = DUMMY(CATALOG[id]);
        const s = message(id, l, params);
        for (const [k, v] of Object.entries(params)) if (k !== "n") expect(s, `${id}.${k}`).toContain(String(v));
      }
    });
    it(`gives the same text twice in ${l}`, () => {
      for (const id of IDS) expect(message(id, l, DUMMY(CATALOG[id]))).toBe(message(id, l, DUMMY(CATALOG[id])));
    });
  }
  it("applies French typography to the French template only", () => {
    for (const id of IDS) {
      const e = CATALOG[id];
      if (typeof e.fr !== "string" || holes(e.fr).length > 0) continue;
      expect(message(id, "fr"), id).toBe(frTypography(e.fr));
    }
  });
  it("leaves the English template as it is", () => {
    for (const id of IDS) {
      const e = CATALOG[id];
      if (typeof e.en !== "string" || holes(e.en).length > 0) continue;
      expect(message(id, "en"), id).toBe(e.en);
    }
  });
  it("picks a plural form by the count, for a handful of counts", () => {
    for (const id of IDS) {
      const e = CATALOG[id];
      if (typeof e.en === "string") continue;
      for (const l of LOCALES) for (const n of [0, 1, 2, 5, 21, 100]) {
        const f = e[l] as { one: string; other: string };
        const want = f[pluralCategory(l, n)].replace("{n}", String(n));
        const params: Record<string, string | number> = { ...DUMMY(e), n };
        expect(message(id, l, params), `${id}/${l}/${n}`).toBe(l === "fr" ? frTypography(f[pluralCategory(l, n)]).replace("{n}", String(n)).replace(/\{([a-zA-Z]+)\}/g, (_m, k: string) => String(params[k])) : want.replace(/\{([a-zA-Z]+)\}/g, (_m, k: string) => String(params[k])));
      }
    }
  });
  it("throws for a plural message with no count or a count that is not a number", () => {
    for (const id of IDS) {
      if (typeof CATALOG[id].en === "string") continue;
      expect(() => message(id, "en", { ...DUMMY(CATALOG[id]), n: undefined as never }), id).toThrow();
      expect(() => message(id, "en", { ...DUMMY(CATALOG[id]), n: "2" }), id).toThrow();
    }
  });
});

describe("pluralCategory", () => {
  it("follows the English rule for many counts", () => {
    for (let n = -3; n <= 200; n++) expect(pluralCategory("en", n)).toBe(n === 1 ? "one" : "other");
  });
  it("follows the French rule: zero and one, and anything between, are singular", () => {
    for (const n of [0, 0.5, 1, 1.5, 1.99]) expect(pluralCategory("fr", n), String(n)).toBe("one");
    for (const n of [2, 3, 10, 1000, -1, -0.5]) expect(pluralCategory("fr", n), String(n)).toBe("other");
  });
  it("calls a count that is not a number plural", () => {
    for (const l of LOCALES) expect(pluralCategory(l, NaN)).toBe("other");
  });
});
