import { describe, expect, it } from "vitest";
import { checkParity } from "../audit/parity";
import { ADDRESS_REGISTER, CALL_REGISTER, type AddressRow, type CallRow } from "./addressRegister";
import { ADDRESS_EXPORT_STRINGS, addressLines, addressesAsCsv, addressesAsText } from "./addressExport";
import { lintCopy, type Locale } from "./copyLint";

const NOW = new Date(2026, 10, 19, 9, 0, 0);
const LOCALES: Locale[] = ["en", "fr"];
const VIEW = { addresses: ADDRESS_REGISTER, calls: CALL_REGISTER };
const A: AddressRow = { host: "a-site.org", kind: "link", path: "p.ts", holds: { en: "A page, with a comma", fr: "Une page" }, source: "Read from p.ts", recordedOn: "2026-11-20" };
const C: CallRow = { path: "q.ts", calls: 2, destination: "UNKNOWN", holds: { en: "Loads \"files\"", fr: "Charge des fichiers" }, source: "Read from q.ts", recordedOn: "2026-11-20" };

describe("addressLines", () => {
  it("lists the addresses first, then the places that make requests, in register order", () => {
    const lines = addressLines("en", VIEW);
    expect(lines.map((l) => l.part)).toEqual([...ADDRESS_REGISTER.map(() => "link"), ...CALL_REGISTER.map(() => "call")]);
    expect(lines[0]?.name).toBe(ADDRESS_REGISTER[0]?.host);
  });
  it("writes what an address is and leaves the destination fields empty for it", () => {
    const l = addressLines("en", { addresses: [A], calls: [] })[0];
    expect(l).toMatchObject({ part: "link", name: "a-site.org", what: "A page you can open", where: "", count: "" });
  });
  it("writes unknown for a destination the code does not fix, and the count", () => {
    const l = addressLines("en", { addresses: [], calls: [C] })[0];
    expect(l?.where).toBe("Unknown. The address comes from data the code does not fix.");
    expect(l?.count).toBe("2");
  });
  it("writes French text for French", () => {
    expect(addressLines("fr", { addresses: [A], calls: [C] }).map((l) => l.holds)).toEqual(["Une page", "Charge des fichiers"]);
  });
});

describe("addressesAsCsv", () => {
  it("has a header, one row per line, and the count", () => {
    const f = addressesAsCsv("en", VIEW, NOW);
    expect(f.mime).toBe("text/csv");
    expect(f.count).toBe(ADDRESS_REGISTER.length + CALL_REGISTER.length);
    expect(f.text.split("\r\n")).toHaveLength(f.count + 2);
    expect(f.text.startsWith("Part,Address or place,")).toBe(true);
  });
  it("names the file with the local date", () => {
    expect(addressesAsCsv("en", VIEW, NOW).filename).toBe("the-app-addresses-and-requests-2026-11-19.csv");
    expect(addressesAsCsv("fr", VIEW, NOW, ";").filename).toBe("l-app-adresses-et-requetes-2026-11-19.csv");
  });
  it("quotes commas and quotation marks, and uses the delimiter it is given", () => {
    const f = addressesAsCsv("en", { addresses: [A], calls: [C] }, NOW);
    expect(f.text).toContain('"A page, with a comma"');
    expect(f.text).toContain('"Loads ""files"""');
    const fr = addressesAsCsv("fr", { addresses: [A], calls: [C] }, NOW, ";");
    expect(fr.text.split("\r\n")[0]?.split(";")).toHaveLength(8);
  });
  it("is an empty body after the header for an empty view", () => {
    const f = addressesAsCsv("en", { addresses: [], calls: [] }, NOW);
    expect(f.count).toBe(0);
    expect(f.text.split("\r\n")).toEqual([ADDRESS_EXPORT_STRINGS.en.header.join(","), ""]);
  });
});

describe("addressesAsText", () => {
  it("has a title and the two groups, each with its rows", () => {
    const f = addressesAsText("en", { addresses: [A], calls: [C] }, NOW);
    expect(f.mime).toBe("text/plain");
    expect(f.filename).toBe("the-app-addresses-and-requests-2026-11-19.txt");
    expect(f.text.split("\n").slice(0, 3)).toEqual(["Web addresses and network requests in the App", "", "Addresses named in the App"]);
    expect(f.text).toContain("a-site.org\n  What it is: A page you can open");
    expect(f.text).toContain("q.ts\n  What it is for: Loads \"files\"\n  Where it goes: Unknown.");
    expect(f.text).toContain("  Places in the code: 2");
    expect(f.text.endsWith("\n")).toBe(true);
  });
  it("says none found for an empty group", () => {
    const f = addressesAsText("en", { addresses: [A], calls: [] }, NOW);
    expect(f.text).toContain("Places where the App makes network requests\n\nNone found.");
  });
  it("puts a no-break space before the colon in French", () => {
    const f = addressesAsText("fr", { addresses: [A], calls: [C] }, NOW);
    expect(f.text).toContain("De quoi il s’agit : Une page");
    expect(f.text).not.toContain("agit: ");
  });
});

describe("wording", () => {
  it("passes the copy lint in both languages for the labels and every line", () => {
    for (const l of LOCALES) {
      const e = ADDRESS_EXPORT_STRINGS[l];
      const texts: string[] = [e.title, ...e.header, ...Object.values(e.line), e.partLink, e.partCall, e.linksTitle, e.callsTitle, e.none];
      for (const x of addressLines(l, VIEW)) texts.push(x.what, x.holds, x.where);
      for (const t of texts) if (t !== "") expect(lintCopy(l, t), t).toEqual([]);
    }
  });
  it("has the same shape in English and French, and the header follows the labels", () => {
    const flat = (l: Locale): Record<string, string> => {
      const e = ADDRESS_EXPORT_STRINGS[l];
      return { title: e.title, partLink: e.partLink, partCall: e.partCall, linksTitle: e.linksTitle, callsTitle: e.callsTitle, none: e.none, ...Object.fromEntries(e.header.map((h, i) => [`h${i}`, h])), ...Object.fromEntries(Object.entries(e.line).map(([k, v]) => [`line.${k}`, v])) };
    };
    expect(checkParity(flat("en"), flat("fr"), { allowIdentical: ["h6", "line.source"] })).toEqual([]);
    for (const l of LOCALES) {
      const e = ADDRESS_EXPORT_STRINGS[l];
      expect(e.header.slice(2)).toEqual([e.line.what, e.line.holds, e.line.where, e.line.count, e.line.source, e.line.date]);
    }
  });
});
