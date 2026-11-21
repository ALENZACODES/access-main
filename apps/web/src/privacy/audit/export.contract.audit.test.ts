// CI audit: every file the privacy panel can hand over keeps the promises in exportContract.ts, in both languages,
// built from the App's real lists and from awkward values.

import { describe, expect, it } from "vitest";
import { ADDRESS_REGISTER, CALL_REGISTER } from "../panel/addressRegister";
import type { Locale } from "../panel/copyLint";
import { DEVICE_REGISTER } from "../panel/deviceRegister";
import { FEATURE_REGISTER } from "../panel/featureRegister";
import { addressesAsCsv, addressesAsText } from "../panel/addressExport";
import { featuresAsCsv, featuresAsText } from "../panel/featureExport";
import { FIXTURE } from "../panel/fixtures.test-util";
import { glanceAsCsv, glanceAsText } from "../panel/glanceSection";
import { HANDOFF_REGISTER } from "../panel/handoffRegister";
import { QUERY_REGISTER } from "../panel/queryRegister";
import { queryAsCsv, queryAsText } from "../panel/querySection";
import { handoffAsCsv, handoffAsText } from "../panel/handoffSection";
import { BROWSER_REGISTER } from "../panel/browserRegister";
import { browserAsCsv, browserAsText } from "../panel/browserSection";
import { RETENTION_REGISTER } from "../panel/retentionRegister";
import { retentionAsCsv, retentionAsText } from "../panel/retentionSection";
import { inventoryAsCsv, inventoryAsText } from "../panel/inventoryExport";
import { keptAsCsv, keptAsText } from "../panel/keptExport";
import { exportLocalData, type ExportFile } from "../panel/localData";
import { registerAsCsv, registerAsText } from "../panel/registerExport";
import { createMemoryStorage } from "../panel/storage";
import { STORAGE_REGISTER, UNSCANNED } from "../panel/storageRegister";
import { ALL_CONTRACTS, CSV_CONTRACTS, DELIMITER, JSON_CONTRACTS, TEXT_CONTRACTS, type ExportContract } from "./exportContract";
import { checkContracts, checkExportFile } from "./exportCheck";

const NOW = new Date(2026, 10, 20, 9, 0, 0);
const LOCALES: readonly Locale[] = ["en", "fr"];
const KEPT = { register: STORAGE_REGISTER, unscanned: UNSCANNED };
const GLANCE = { kept: KEPT, device: DEVICE_REGISTER, features: FEATURE_REGISTER, addresses: { addresses: ADDRESS_REGISTER, calls: CALL_REGISTER } };

function storage(): ReturnType<typeof createMemoryStorage> {
  const s = createMemoryStorage();
  s.setItem("access.one", "1");
  s.setItem("access.two", '{"a":"=1+1"}');
  return s;
}

/** Each export, built for a language, keyed by its contract id and kind. */
function build(locale: Locale): Array<{ id: string; kind: ExportContract["kind"]; file: ExportFile }> {
  const d = DELIMITER[locale];
  return [
    { id: "inventory", kind: "csv", file: inventoryAsCsv(locale, FIXTURE, NOW, d) },
    { id: "register", kind: "csv", file: registerAsCsv(locale, STORAGE_REGISTER, UNSCANNED, NOW, d) },
    { id: "kept", kind: "csv", file: keptAsCsv(locale, KEPT, NOW, d) },
    { id: "features", kind: "csv", file: featuresAsCsv(locale, FEATURE_REGISTER, null, NOW, d) },
    { id: "addresses", kind: "csv", file: addressesAsCsv(locale, { addresses: ADDRESS_REGISTER, calls: CALL_REGISTER }, NOW, d) },
    { id: "glance", kind: "csv", file: glanceAsCsv(locale, GLANCE, NOW, d) },
    { id: "handoffs", kind: "csv", file: handoffAsCsv(locale, HANDOFF_REGISTER, NOW, d) },
    { id: "query", kind: "csv", file: queryAsCsv(locale, QUERY_REGISTER, NOW, d) },
    { id: "browser", kind: "csv", file: browserAsCsv(locale, BROWSER_REGISTER, NOW, d) },
    { id: "retention", kind: "csv", file: retentionAsCsv(locale, RETENTION_REGISTER, NOW, d) },
    { id: "inventory", kind: "text", file: inventoryAsText(locale, FIXTURE, NOW) },
    { id: "register", kind: "text", file: registerAsText(locale, STORAGE_REGISTER, UNSCANNED, NOW) },
    { id: "kept", kind: "text", file: keptAsText(locale, KEPT, NOW) },
    { id: "features", kind: "text", file: featuresAsText(locale, FEATURE_REGISTER, null, NOW) },
    { id: "addresses", kind: "text", file: addressesAsText(locale, { addresses: ADDRESS_REGISTER, calls: CALL_REGISTER }, NOW) },
    { id: "glance", kind: "text", file: glanceAsText(locale, GLANCE, NOW) },
    { id: "handoffs", kind: "text", file: handoffAsText(locale, HANDOFF_REGISTER, NOW) },
    { id: "query", kind: "text", file: queryAsText(locale, QUERY_REGISTER, NOW) },
    { id: "browser", kind: "text", file: browserAsText(locale, BROWSER_REGISTER, NOW) },
    { id: "retention", kind: "text", file: retentionAsText(locale, RETENTION_REGISTER, NOW) },
    { id: "local-data", kind: "json", file: exportLocalData(storage(), "access.", NOW, locale) },
  ];
}

const contractFor = (id: string, kind: string): ExportContract => {
  const c = ALL_CONTRACTS.find((x) => x.id === id && x.kind === kind);
  if (c === undefined) throw new Error(`no contract for ${kind} ${id}`);
  return c;
};

describe("the contracts", () => {
  it("are well-formed", () => {
    expect(checkContracts(ALL_CONTRACTS)).toEqual([]);
  });
  it("cover every export the audit builds, and nothing else", () => {
    const built = build("en").map((b) => `${b.kind}:${b.id}`).sort();
    expect(ALL_CONTRACTS.map((c) => `${c.kind}:${c.id}`).sort()).toEqual(built);
  });
  it("number ten spreadsheet files, ten text files and one data file", () => {
    expect([CSV_CONTRACTS.length, TEXT_CONTRACTS.length, JSON_CONTRACTS.length]).toEqual([10, 10, 1]);
  });
});

describe("every export keeps its contract", () => {
  for (const locale of LOCALES) {
    for (const b of build(locale)) {
      it(`${b.kind} ${b.id} (${locale})`, () => {
        const problems = checkExportFile(b.file, contractFor(b.id, b.kind), locale);
        expect(problems, `\n${problems.join("\n")}\n`).toEqual([]);
      });
    }
  }
});

describe("awkward values", () => {
  it("keep the spreadsheet files readable when a row holds quotation marks, delimiters, line breaks and formulas", () => {
    const nasty = [
      { ...STORAGE_REGISTER[0]!, holds: { en: 'He said "yes", then; left\nnow', fr: "=1+1 ; « oui »" } },
      { ...STORAGE_REGISTER[0]!, key: "access.x", holds: { en: "+cmd|' /C calc'!A0", fr: "@SUM(1)" } },
    ];
    for (const locale of LOCALES) {
      const file = registerAsCsv(locale, nasty, [], NOW, DELIMITER[locale]);
      expect(checkExportFile(file, contractFor("register", "csv"), locale)).toEqual([]);
    }
  });
  it("keep the data file valid when a stored value holds markup, quotation marks and unusual characters", () => {
    const s = createMemoryStorage();
    s.setItem("access.a", '"quoted" <b>é — ’ « »</b>\n ');
    expect(checkExportFile(exportLocalData(s, "access.", NOW, "fr"), contractFor("local-data", "json"), "fr")).toEqual([]);
  });
  it("give a dated name from the local date, not the UTC date", () => {
    const lateEvening = new Date(2026, 10, 20, 23, 30, 0);
    expect(inventoryAsCsv("en", FIXTURE, lateEvening).filename).toBe("the-app-data-list-2026-11-20.csv");
  });
});

describe("would fail on a change, so the audit cannot pass by being blind", () => {
  const csv = (id: string, locale: Locale): ExportFile => build(locale).find((b) => b.id === id && b.kind === "csv")!.file;
  const text = (id: string, locale: Locale): ExportFile => build(locale).find((b) => b.id === id && b.kind === "text")!.file;
  const check = (f: ExportFile, id: string, kind: string, locale: Locale = "en"): string[] => checkExportFile(f, contractFor(id, kind), locale);

  it("fails when a spreadsheet heading is renamed", () => {
    const f = csv("glance", "en");
    expect(check({ ...f, text: f.text.replace("How many", "Count") }, "glance", "csv")[0]).toContain("heading row is [Group | What | Count");
  });
  it("fails when a column is added to the heading row", () => {
    const f = csv("glance", "en");
    const [head, ...rest] = f.text.split("\r\n");
    const problems = check({ ...f, text: [`${head},Extra`, ...rest].join("\r\n") }, "glance", "csv");
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("Not confirmed by the App | Extra");
  });
  it("fails when a row has a missing cell", () => {
    const f = csv("glance", "en");
    const lines = f.text.split("\r\n");
    lines[1] = (lines[1] ?? "").split(",").slice(0, 3).join(",");
    expect(check({ ...f, text: lines.join("\r\n") }, "glance", "csv").join("\n")).toContain("row 2 has 3 cells, the heading row has 4");
  });
  it("fails when the file name loses its date or changes its stem", () => {
    const f = csv("glance", "en");
    expect(check({ ...f, filename: "the-app-privacy-at-a-glance.csv" }, "glance", "csv")[0]).toContain("is not");
    expect(check({ ...f, filename: "privacy-2026-11-20.csv" }, "glance", "csv")[0]).toContain("is not");
  });
  it("fails when the type is wrong", () => {
    expect(check({ ...csv("glance", "en"), mime: "text/plain" }, "glance", "csv")[0]).toBe("type is text/plain, not text/csv");
  });
  it("fails when a French file uses a comma as its delimiter", () => {
    const f = csv("glance", "fr");
    expect(check({ ...f, text: f.text.replace(/;/g, ",") }, "glance", "csv", "fr").length).toBeGreaterThan(0);
  });
  it("fails when a cell starts like a formula", () => {
    const f = csv("glance", "en");
    expect(check({ ...f, text: `${f.text}Group,=1+1,1,No\r\n`, count: f.count + 1 }, "glance", "csv").join("\n")).toContain("starts with a character a spreadsheet runs as a formula");
  });
  it("fails when the count is wrong, there is a byte order mark or the lines end with a bare line feed", () => {
    const f = csv("glance", "en");
    expect(check({ ...f, count: f.count + 1 }, "glance", "csv")[0]).toContain("count is");
    expect(check({ ...f, text: `\ufeff${f.text}` }, "glance", "csv").join("\n")).toContain("byte order mark");
    expect(check({ ...f, text: f.text.replace(/\r\n/g, "\n") }, "glance", "csv").join("\n")).toContain("no carriage return");
  });
  it("fails when a text file changes its first line", () => {
    const f = text("glance", "en");
    expect(check({ ...f, text: f.text.replace("Privacy at a glance", "Counts") }, "glance", "text")[0]).toContain('first line is "Counts"');
  });
  it("fails when a text file has a carriage return, trailing space or no final line break", () => {
    const f = text("glance", "en");
    expect(check({ ...f, text: f.text.replace(/\n/g, "\r\n") }, "glance", "text").join("\n")).toContain("carriage return");
    expect(check({ ...f, text: `${f.text.trimEnd()} ` }, "glance", "text").join("\n")).toContain("does not end with a line break");
    expect(check({ ...f, text: f.text.replace("Privacy at a glance", "Privacy at a glance ") }, "glance", "text").join("\n")).toContain("ends with a space");
  });
  it("fails when a French text file has an ordinary space before a colon", () => {
    const f = text("glance", "fr");
    expect(check({ ...f, text: f.text.replace(/\u00a0:/, " :") }, "glance", "text", "fr").join("\n")).toContain("ordinary space before a colon");
  });
  it("fails when an English text file has a no-break space before a colon", () => {
    const f = text("glance", "en");
    expect(check({ ...f, text: f.text.replace(/(\w): /, "$1\u00a0: ") }, "glance", "text").join("\n")).toContain("no-break space before a colon in English");
  });
  it("fails when the data file changes its format, version or keys", () => {
    const f = build("en").find((b) => b.kind === "json")!.file;
    expect(check({ ...f, text: f.text.replace("app-local-data", "other") }, "local-data", "json").join("\n")).toContain("format is");
    expect(check({ ...f, text: f.text.replace('"version": 1', '"version": 2') }, "local-data", "json").join("\n")).toContain("version is 2");
    expect(check({ ...f, text: f.text.replace('"prefix"', '"prefixes"') }, "local-data", "json").join("\n")).toContain("keys are");
  });
  it("fails when the data file is not valid JSON, not an object or holds a non-string item", () => {
    const f = build("en").find((b) => b.kind === "json")!.file;
    expect(check({ ...f, text: "{" }, "local-data", "json")).toEqual(["the file is not valid JSON"]);
    expect(check({ ...f, text: "[]\n" }, "local-data", "json")).toEqual(["the file is not a JSON object"]);
    expect(check({ ...f, text: f.text.replace('"1"', "1") }, "local-data", "json").join("\n")).toContain("an item is not a string");
  });
});

describe("checkContracts", () => {
  const base = CSV_CONTRACTS[0]!;
  it("flags a repeated contract, a repeated stem and a bad stem", () => {
    expect(checkContracts([base, base]).join("\n")).toContain("listed twice");
    expect(checkContracts([base, { ...base, id: "other" }]).join("\n")).toContain("is also used by");
    expect(checkContracts([{ ...base, stem: { en: "Bad Stem", fr: "ok" } }]).join("\n")).toContain("is not lower-case words");
  });
  it("flags empty, repeated and unquotable headings and rows of different lengths", () => {
    expect(checkContracts([{ ...base, header: { en: [], fr: [] } }]).join("\n")).toContain("heading row is empty");
    expect(checkContracts([{ ...base, header: { en: ["a", "a"], fr: ["a", "b"] } }]).join("\n")).toContain("repeats a heading");
    expect(checkContracts([{ ...base, header: { en: ["a,b", "c"], fr: ["a", "b"] } }]).join("\n")).toContain("needs quoting");
    expect(checkContracts([{ ...base, header: { en: ["a", "b"], fr: ["a"] } }]).join("\n")).toContain("different lengths");
  });
  it("flags an empty title", () => {
    expect(checkContracts([{ ...TEXT_CONTRACTS[0]!, title: { en: " ", fr: "x" } }]).join("\n")).toContain("a title is empty");
  });
});
