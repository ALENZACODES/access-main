import { describe, expect, it } from "vitest";
import { checkParity } from "../audit/parity";
import { lintCopy, type Locale } from "./copyLint";
import { FEATURE_EXPORT_STRINGS, featureLines, featuresAsCsv, featuresAsText } from "./featureExport";
import { FEATURE_REGISTER, type FeatureRow } from "./featureRegister";
import type { FeatureStates } from "./permissions";

const NOW = new Date(2026, 10, 19, 9, 0, 0);
const LOCALES: Locale[] = ["en", "fr"];
const mk = (patch: Partial<FeatureRow> & Pick<FeatureRow, "id">): FeatureRow => ({ used: true, path: "p", asks: "no", holds: { en: "Printing", fr: "L’impression" }, why: { en: "To print", fr: "Pour imprimer" }, source: "S", recordedOn: "2026-11-19", ...patch });
const REG: FeatureRow[] = [
  mk({ id: "geolocation", used: false, path: null, asks: "yes", permission: "geolocation", blockedBy: "h.ts", holds: { en: "Your location", fr: "Votre position" }, why: undefined as never }),
  mk({ id: "print" }),
  mk({ id: "clipboard-write", asks: "UNKNOWN", permission: "clipboard-write", holds: { en: "Copying", fr: "La copie" }, why: { en: "To paste, later", fr: "Pour coller" } }),
  mk({ id: "share", used: false, path: null, asks: "no", holds: { en: "Sharing", fr: "Le partage" }, why: undefined as never }),
];
for (const r of REG) if (!r.used) delete (r as { why?: unknown }).why;
const STATES: FeatureStates = { at: "2026-11-19T14:00:00.000Z", answers: { geolocation: "denied", "clipboard-write": "granted" } };

describe("featureLines", () => {
  it("puts used features first, then unused ones, each in the register's order", () => {
    expect(featureLines("en", REG, null).map((l) => l.feature)).toEqual(["Printing", "Copying", "Your location", "Sharing"]);
  });
  it("says what a used feature is for and leaves an unused feature's reason empty", () => {
    const lines = featureLines("en", REG, null);
    expect(lines[0]?.why).toBe("To print");
    expect(lines[2]?.why).toBe("");
    expect(lines.map((l) => l.used)).toEqual(["Yes", "Yes", "No", "No"]);
  });
  it("writes not checked before the check, and not applicable where there is no permission name", () => {
    expect(featureLines("en", REG, null).map((l) => l.answer)).toEqual(["Not applicable", "Not checked", "Not checked", "Not applicable"]);
  });
  it("writes the browser's answers after the check, and unknown for a missing answer", () => {
    expect(featureLines("en", REG, STATES).map((l) => l.answer)).toEqual(["Not applicable", "Allowed", "Blocked", "Not applicable"]);
    expect(featureLines("en", REG, { at: STATES.at, answers: {} }).map((l) => l.answer)).toEqual(["Not applicable", "Unknown", "Unknown", "Not applicable"]);
  });
  it("keeps what the App has not confirmed as Unknown", () => {
    expect(featureLines("en", REG, null).map((l) => l.asks)).toEqual(["No", "Unknown", "Yes", "No"]);
    expect(featureLines("fr", REG, null)[1]?.asks).toBe("Inconnu");
  });
  it("says which unused features the header settings list as off, and not applicable for used ones", () => {
    expect(featureLines("en", REG, null).map((l) => l.headers)).toEqual(["Not applicable", "Not applicable", "Listed as off", "No setting"]);
  });
  it("uses the French words in French", () => {
    const [l] = featureLines("fr", REG, STATES);
    expect(l).toMatchObject({ feature: "L’impression", used: "Oui", answer: "Sans objet" });
  });
  it("covers the App's whole register", () => {
    expect(featureLines("en", FEATURE_REGISTER, null)).toHaveLength(FEATURE_REGISTER.length);
  });
});

describe("featuresAsCsv", () => {
  const f = featuresAsCsv("en", REG, STATES, NOW);
  it("has an eight-column header, one row per feature and a dated file name", () => {
    const rows = f.text.split("\r\n").filter((r) => r !== "");
    expect(rows[0]).toBe(FEATURE_EXPORT_STRINGS.en.header.join(","));
    expect(rows).toHaveLength(5);
    expect(f.count).toBe(4);
    expect(f.filename).toBe("the-app-browser-features-2026-11-19.csv");
    expect(f.mime).toBe("text/csv");
  });
  it("quotes a cell that holds the delimiter", () => {
    expect(f.text).toContain('"To paste, later"');
  });
  it("uses the French file name and a semicolon in French", () => {
    const fr = featuresAsCsv("fr", REG, null, NOW, ";");
    expect(fr.filename).toBe("l-app-fonctions-du-navigateur-2026-11-19.csv");
    expect(fr.text.split("\r\n")[0]).toBe(FEATURE_EXPORT_STRINGS.fr.header.join(";"));
  });
  it("shows no permission name, header file or interface name", () => {
    for (const w of ["geolocation", "clipboard-write", "h.ts", "navigator"]) expect(f.text, w).not.toContain(w);
  });
});

describe("featuresAsText", () => {
  it("writes each feature with its answers and a no-break space before each French colon", () => {
    const f = featuresAsText("fr", REG, STATES, NOW);
    expect(f.filename).toBe("l-app-fonctions-du-navigateur-2026-11-19.txt");
    expect(f.text.startsWith(`${FEATURE_EXPORT_STRINGS.fr.title}\n\nL’impression\n`)).toBe(true);
    expect(f.text).toContain("  Utilisé par l’App : Oui");
    expect(f.text).not.toMatch(/\S :/);
    expect(f.count).toBe(4);
  });
  it("leaves out the reason line for a feature the App does not use", () => {
    const text = featuresAsText("en", REG, null, NOW).text;
    const block = text.split("\n\n").find((b) => b.startsWith("Your location")) ?? "";
    expect(block).not.toContain("Why:");
    expect(text.split("\n\n").find((b) => b.startsWith("Printing"))).toContain("  Why: To print");
  });
  it("writes the English labels with a plain colon", () => {
    const f = featuresAsText("en", REG, null, NOW);
    expect(f.text).toContain("  Your browser’s answer: Not checked");
    expect(f.mime).toBe("text/plain");
  });
});

describe("wording", () => {
  it("passes the copy lint in both languages, for the labels and for every line", () => {
    for (const l of LOCALES) {
      const e = FEATURE_EXPORT_STRINGS[l];
      const texts: string[] = [e.title, ...e.header, ...Object.values(e.line), e.yes, e.no];
      for (const line of featureLines(l, FEATURE_REGISTER, STATES)) texts.push(line.feature, line.used, line.why, line.asks, line.answer, line.headers);
      for (const t of texts) if (t !== "") expect(lintCopy(l, t), t).toEqual([]);
    }
  });
  it("has the same shape in English and French, and the header follows the labels' order", () => {
    const flat = (l: Locale): Record<string, string> => ({ title: FEATURE_EXPORT_STRINGS[l].title, yes: FEATURE_EXPORT_STRINGS[l].yes, no: FEATURE_EXPORT_STRINGS[l].no, ...Object.fromEntries(FEATURE_EXPORT_STRINGS[l].header.map((h, i) => [`h${i}`, h])), ...Object.fromEntries(Object.entries(FEATURE_EXPORT_STRINGS[l].line).map(([k, v]) => [`line.${k}`, v])) });
    expect(checkParity(flat("en"), flat("fr"), { allowIdentical: ["h6", "line.source"] })).toEqual([]);
    for (const l of LOCALES) {
      const e = FEATURE_EXPORT_STRINGS[l];
      expect(e.header.slice(1)).toEqual([e.line.used, e.line.why, e.line.asks, e.line.answer, e.line.headers, e.line.source, e.line.date]);
    }
  });
});
