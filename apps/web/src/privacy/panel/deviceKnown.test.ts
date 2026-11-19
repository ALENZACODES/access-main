import { describe, expect, it } from "vitest";
import { auditHtml, formatViolations } from "../audit/htmlAudit";
import { checkParity } from "../audit/parity";
import { lintCopy, type Locale } from "./copyLint";
import { countListed, DEVICE_KNOWN_STRINGS, renderDeviceKnownHtml } from "./deviceKnown";
import { DEVICE_REGISTER, describeDevice } from "./deviceRegister";

const LOCALES: Locale[] = ["en", "fr"];
const scan = { caches: ["map-tiles-v2", "stranger-cache", "app-shell-v4"], databases: ["app-offline-regions"] };
const described = describeDevice(scan, DEVICE_REGISTER, { cachePrefix: "app-shell-" });
const textOf = (html: string): string => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("renderDeviceKnownHtml", () => {
  it("renders nothing before the device has been checked", () => {
    for (const l of LOCALES) expect(renderDeviceKnownHtml(l, null)).toBe("");
  });
  it("says what each listed name holds, in the person's language", () => {
    expect(renderDeviceKnownHtml("en", described)).toContain("Map tiles saved for offline use");
    expect(renderDeviceKnownHtml("fr", described)).toContain("Des tuiles de carte enregistrées pour l’usage hors ligne");
  });
  it("shows a name that is not in the App's list as unknown, without guessing", () => {
    const en = renderDeviceKnownHtml("en", described);
    expect(en).toContain("stranger-cache");
    expect(en).toContain("Unknown. The App’s list does not include it.");
    expect(renderDeviceKnownHtml("fr", described)).toContain("Inconnu. La liste de l’App ne le comprend pas.");
  });
  it("says whether the clear button removes each name", () => {
    const html = renderDeviceKnownHtml("en", described);
    const rows = [...html.matchAll(/<tr><th scope="row">.*?<\/tr>/g)].map((m) => textOf(m[0]));
    expect(rows.find((r) => r.includes("app-shell-v4"))).toContain("Yes");
    expect(rows.find((r) => r.includes("map-tiles-v2"))).toContain("No");
    expect(rows.find((r) => r.includes("app-offline-regions"))).toContain("No");
  });
  it("counts the names that match and the names that do not", () => {
    expect(countListed(described)).toEqual({ listed: 3, unlisted: 1 });
    expect(renderDeviceKnownHtml("en", described)).toContain("3 names match the App’s list. 1 does not.");
    expect(renderDeviceKnownHtml("fr", described)).toContain("3 noms correspondent à la liste de l’App. 1 ne correspond pas.");
  });
  it("uses the singular and the plural correctly", () => {
    const one = describeDevice({ caches: ["map-tiles-v2"], databases: [] }, DEVICE_REGISTER);
    expect(renderDeviceKnownHtml("en", one)).toContain("1 name matches the App’s list. 0 do not.");
    expect(renderDeviceKnownHtml("fr", one)).toContain("1 nom correspond à la liste de l’App. 0 ne correspond pas.");
  });
  it("says unknown, not none, when the browser did not answer", () => {
    const silent = describeDevice({ caches: null, databases: null }, DEVICE_REGISTER);
    const html = renderDeviceKnownHtml("en", silent);
    expect(html.match(/Your browser did not say, so this is unknown\./g)).toHaveLength(2);
    expect(html).not.toContain("None found.");
    expect(html).not.toContain("name matches");
    expect(html).not.toContain("names match");
  });
  it("says none found for an empty answer, and keeps the summary", () => {
    const empty = describeDevice({ caches: [], databases: [] }, DEVICE_REGISTER);
    const html = renderDeviceKnownHtml("fr", empty);
    expect(html.match(/Aucun trouvé\./g)).toHaveLength(2);
    expect(html).toContain("0 nom correspond");
  });
  it("escapes names from the device", () => {
    const hostile = describeDevice({ caches: ['<img src=x onerror="alert(1)">'], databases: [] }, DEVICE_REGISTER);
    const html = renderDeviceKnownHtml("en", hostile);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
  it("passes the HTML audit in both languages", () => {
    for (const l of LOCALES) {
      for (const d of [described, describeDevice({ caches: null, databases: [] }, DEVICE_REGISTER)]) {
        const v = auditHtml(`<section lang="${l}">${renderDeviceKnownHtml(l, d)}</section>`);
        expect(v, formatViolations(v)).toEqual([]);
      }
    }
  });
});

describe("DEVICE_KNOWN_STRINGS", () => {
  it("passes the copy lint, with the French spacing, in every string", () => {
    for (const l of LOCALES) {
      const s = DEVICE_KNOWN_STRINGS[l];
      const texts = [s.heading, s.note, s.caches, s.databases, s.columns.name, s.columns.holds, s.columns.clear, s.unknownHolds, s.yes, s.no, s.browserSilent, s.none, s.summary(0, 0), s.summary(1, 1), s.summary(2, 2)];
      for (const t of texts) expect(lintCopy(l, t), t).toEqual([]);
    }
  });
  it("puts a no-break space before the colon in the French note", () => {
    expect(DEVICE_KNOWN_STRINGS.fr.note).toContain("inconnu : il");
  });
  it("has the same shape in English and French", () => {
    const flat = (l: Locale): Record<string, string> => {
      const s = DEVICE_KNOWN_STRINGS[l];
      return { ...Object.fromEntries(Object.entries(s).filter(([, v]) => typeof v === "string")), "columns.name": s.columns.name, "columns.holds": s.columns.holds, "columns.clear": s.columns.clear, summary: s.summary(12, 3) };
    };
    expect(checkParity(flat("en"), flat("fr"), { allowIdentical: ["yes", "no"] })).toEqual([]);
  });
});
