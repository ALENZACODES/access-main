import { describe, expect, it } from "vitest";
import { checkParity } from "../audit/parity";
import { lintCopy, type Locale } from "./copyLint";
import { DEVICE_REGISTER, type DeviceRow } from "./deviceRegister";
import { KEPT_STRINGS, keptAsCsv, keptAsText, keptLines } from "./keptExport";
import { REGISTER_STRINGS } from "./registerExport";
import { STORAGE_REGISTER, UNSCANNED, type RegisterRow } from "./storageRegister";

const NOW = new Date(2026, 10, 19, 9, 0, 0);
const LOCALES: Locale[] = ["en", "fr"];
const REG: RegisterRow[] = [
  { key: "access.a", path: "p", holds: { en: "Zebra", fr: "Zèbre" }, gated: true, reach: "panel", source: "S1", recordedOn: "2026-11-01" },
  { key: "app.b", path: "p", holds: { en: "Apple", fr: "Pomme" }, gated: false, reach: "elsewhere", source: "S2", recordedOn: "2026-11-02" },
];
const DEV: DeviceRow[] = [
  { kind: "database", name: "zz-db", match: "exact", path: "p", holds: { en: "Records", fr: "Dossiers" }, source: "S3", recordedOn: "2026-11-03" },
  { kind: "cache", name: "b-cache", match: "exact", path: "p", holds: { en: "Beta files", fr: "Fichiers bêta" }, source: "S4", recordedOn: "2026-11-04" },
  { kind: "cache", name: "app-shell-", match: "prefix", path: "p", holds: { en: "Alpha files", fr: "Fichiers alpha" }, source: "S5", recordedOn: "2026-11-05" },
];

describe("keptLines", () => {
  it("puts settings first, then caches, then databases, then storage it could not read", () => {
    const lines = keptLines("en", { register: REG, unscanned: UNSCANNED, device: DEV });
    expect(lines.map((l) => l.where)).toEqual([
      KEPT_STRINGS.en.where.browser,
      KEPT_STRINGS.en.where.browser,
      KEPT_STRINGS.en.where.cache,
      KEPT_STRINGS.en.where.cache,
      KEPT_STRINGS.en.where.database,
      ...UNSCANNED.map(() => REGISTER_STRINGS.en.notConfirmed),
    ]);
  });
  it("sorts each group in the language's alphabetical order", () => {
    expect(keptLines("en", { register: REG, unscanned: [], device: DEV }).map((l) => l.item)).toEqual(["Apple", "Zebra", "Alpha files", "Beta files", "Records"]);
    expect(keptLines("fr", { register: REG, unscanned: [], device: DEV }).map((l) => l.item)).toEqual(["Pomme", "Zèbre", "Fichiers alpha", "Fichiers bêta", "Dossiers"]);
  });
  it("says what saving a settings item needs and whether Erase reaches it", () => {
    const [apple, zebra] = keptLines("en", { register: REG, unscanned: [], device: [] });
    expect(apple).toMatchObject({ item: "Apple", choice: "No", erase: "No", clear: "No", source: "S2" });
    expect(zebra).toMatchObject({ item: "Zebra", choice: "Yes", erase: "Yes", clear: "No", source: "S1" });
  });
  it("never claims a consent choice for a cache or database, and says the erase button does not reach it", () => {
    for (const l of keptLines("en", { register: [], unscanned: [], device: DEV })) {
      expect(l.choice).toBe("Not confirmed");
      expect(l.erase).toBe("No");
    }
  });
  it("says whether the offline storage button reaches a cache or database, from the prefixes it was given", () => {
    const lines = keptLines("en", { register: [], unscanned: [], device: DEV, clear: { cachePrefix: "app-shell-" } });
    expect(lines.map((l) => [l.item, l.clear])).toEqual([["Alpha files", "Yes"], ["Beta files", "No"], ["Records", "No"]]);
  });
  it("says not confirmed, not no, when the button's prefixes are not known", () => {
    for (const l of keptLines("en", { register: [], unscanned: [], device: DEV })) expect(l.clear).toBe("Not confirmed");
  });
  it("treats an empty prefix as reaching nothing", () => {
    for (const l of keptLines("en", { register: [], unscanned: [], device: DEV, clear: { cachePrefix: "", dbPrefix: "" } })) expect(l.clear).toBe("No");
  });
  it("lists storage it could not read as not confirmed on every question", () => {
    const [u] = keptLines("fr", { register: [], unscanned: UNSCANNED, device: [] });
    expect(u).toMatchObject({ where: "Non confirmé", choice: "Non confirmé", erase: "Non confirmé", clear: "Non confirmé" });
    expect(u?.source).toBe(REGISTER_STRINGS.fr.unconfirmedSource);
  });
  it("uses the App's own cache and database list when none is given", () => {
    const lines = keptLines("en", { register: [], unscanned: [] });
    expect(lines).toHaveLength(DEVICE_REGISTER.length);
    expect(lines.map((l) => l.item)).toContain("Map tiles saved for offline use");
  });
  it("has one line per register row, device row and unread item for the App's real lists", () => {
    expect(keptLines("fr", { register: STORAGE_REGISTER, unscanned: UNSCANNED })).toHaveLength(STORAGE_REGISTER.length + DEVICE_REGISTER.length + UNSCANNED.length);
  });
});

describe("keptAsCsv", () => {
  const f = keptAsCsv("en", { register: REG, unscanned: [], device: DEV }, NOW);
  it("has a seven-column header, one row per item and a dated file name", () => {
    const rows = f.text.split("\r\n").filter((r) => r !== "");
    expect(rows[0]).toBe(KEPT_STRINGS.en.header.join(","));
    expect(rows).toHaveLength(1 + 5);
    expect(f.count).toBe(5);
    expect(f.filename).toBe("the-app-everything-kept-2026-11-19.csv");
    expect(f.mime).toBe("text/csv");
  });
  it("uses the French file name and a semicolon, and quotes a cell that holds the delimiter", () => {
    const risky: DeviceRow = { ...DEV[0]!, holds: { en: "a;b", fr: "a;b" } };
    const fr = keptAsCsv("fr", { register: [], unscanned: [], device: [risky] }, NOW, ";");
    expect(fr.filename).toBe("l-app-tout-ce-qui-est-conserve-2026-11-19.csv");
    expect(fr.text.split("\r\n")[1]).toMatch(/^"a;b";/);
  });
  it("does not contain a storage key, a cache name or a database name", () => {
    for (const r of REG) expect(f.text).not.toContain(r.key);
    for (const d of DEV) expect(f.text).not.toContain(d.name);
  });
});

describe("keptAsText", () => {
  it("writes each item with its answers, and a no-break space before each French colon", () => {
    const f = keptAsText("fr", { register: REG, unscanned: [], device: DEV }, NOW);
    expect(f.filename).toBe("l-app-tout-ce-qui-est-conserve-2026-11-19.txt");
    expect(f.text.startsWith(`${REGISTER_STRINGS.fr.title}\n\nPomme\n`)).toBe(true);
    expect(f.text).toContain("  Où c’est conservé\u00a0: Réglages et éléments enregistrés");
    expect(f.text).not.toMatch(/\S :/);
    expect(f.count).toBe(5);
  });
  it("writes the English labels with a plain colon", () => {
    const f = keptAsText("en", { register: REG, unscanned: [], device: DEV }, NOW);
    expect(f.text).toContain("  Removed by the offline storage button: Not confirmed");
    expect(f.mime).toBe("text/plain");
  });
});

describe("wording", () => {
  it("passes the copy lint in both languages, for the labels and for every line", () => {
    for (const l of LOCALES) {
      const k = KEPT_STRINGS[l];
      const texts: string[] = [...k.header, ...Object.values(k.line), ...Object.values(k.where)];
      for (const line of keptLines(l, { register: STORAGE_REGISTER, unscanned: UNSCANNED, clear: { cachePrefix: "app-shell-" } })) texts.push(line.item, line.where, line.choice, line.erase, line.clear);
      for (const t of texts) expect(lintCopy(l, t), t).toEqual([]);
    }
  });
  it("has the same shape in English and French", () => {
    const flat = (l: Locale): Record<string, string> => ({
      ...Object.fromEntries(KEPT_STRINGS[l].header.map((h, i) => [`header.${i}`, h])),
      ...Object.fromEntries(Object.entries(KEPT_STRINGS[l].line).map(([key, v]) => [`line.${key}`, v])),
      ...Object.fromEntries(Object.entries(KEPT_STRINGS[l].where).map(([key, v]) => [`where.${key}`, v])),
    });
    expect(checkParity(flat("en"), flat("fr"), { allowIdentical: ["header.5", "line.source"] })).toEqual([]);
  });
  it("keeps the header and the labels in the same order", () => {
    for (const l of LOCALES) {
      const k = KEPT_STRINGS[l];
      expect(k.header.slice(1)).toEqual([k.line.where, k.line.choice, k.line.erase, k.line.clear, k.line.source, k.line.date]);
      expect(k.header[0]).toBe(REGISTER_STRINGS[l].header[0]);
    }
  });
});
