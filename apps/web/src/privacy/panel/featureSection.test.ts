import { describe, expect, it } from "vitest";
import { auditHtml, formatViolations } from "../audit/htmlAudit";
import { checkParity } from "../audit/parity";
import { lintCopy, type Locale } from "./copyLint";
import { FEATURE_REGISTER } from "./featureRegister";
import { FEATURE_STRINGS, renderFeaturesHtml } from "./featureSection";
import type { FeatureStates } from "./permissions";

const LOCALES: Locale[] = ["en", "fr"];
const STATES: FeatureStates = {
  at: "2026-11-19T14:00:00.000Z",
  answers: { geolocation: "denied", "camera-microphone": "prompt", notifications: "granted", "clipboard-read": "unknown", "storage-persist": "granted", "clipboard-write": "prompt" },
};
const view = (states: FeatureStates | null) => ({ register: FEATURE_REGISTER, states });
const textOf = (html: string): string => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const rowText = (html: string, label: string): string => textOf([...html.matchAll(/<tr>.*?<\/tr>/g)].map((m) => m[0]).find((r) => r.includes(label)) ?? "");

describe("renderFeaturesHtml", () => {
  it("renders nothing when the register is empty", () => {
    for (const l of LOCALES) expect(renderFeaturesHtml(l, { register: [], states: null })).toBe("");
  });
  it("has the two tables, each with a caption and a header row, and the check button", () => {
    const html = renderFeaturesHtml("en", view(null));
    expect(html.match(/<table>/g)).toHaveLength(2);
    expect(html.match(/<caption>/g)).toHaveLength(2);
    expect(html).toContain('data-action="check-features"');
    expect(html).toContain("Check what my browser allows");
  });
  it("lists every used feature with why the App uses it", () => {
    const html = renderFeaturesHtml("en", view(null));
    expect(html).toContain("Copying text you chose to copy");
    expect(html).toContain("So you can paste your draft elsewhere");
    expect(html).toContain("Reading a file you pick from your device");
  });
  it("lists the powerful features the App does not use, without a reason", () => {
    const html = renderFeaturesHtml("en", view(null));
    expect(html).toContain("Your location");
    expect(html).toContain("Your camera or microphone");
    expect(html).toContain("Showing notifications");
  });
  it("says answers are not checked before the check, never a guess", () => {
    const html = renderFeaturesHtml("en", view(null));
    expect(rowText(html, "Your location")).toContain("Not checked");
    expect(html).not.toContain("Allowed");
    expect(html).not.toContain("Blocked");
    expect(html).not.toContain("Checked on");
  });
  it("shows the browser's answers after the check, and the date", () => {
    const html = renderFeaturesHtml("en", view(STATES));
    expect(rowText(html, "Your location")).toContain("Blocked");
    expect(rowText(html, "Showing notifications")).toContain("Allowed");
    expect(rowText(html, "Your camera or microphone")).toContain("Will ask you");
    expect(rowText(html, "Reading what you last copied")).toContain("Unknown");
    expect(html).toContain("Checked on 2026-11-19.");
  });
  it("shows a feature with no permission name as not applicable, even after the check", () => {
    expect(rowText(renderFeaturesHtml("en", view(STATES)), "Opening your browser’s print window")).toContain("Not applicable");
  });
  it("shows unknown for a feature the browser was not asked about or did not answer", () => {
    const html = renderFeaturesHtml("en", view({ at: STATES.at, answers: {} }));
    expect(rowText(html, "Your location")).toContain("Unknown");
  });
  it("says what the App has not confirmed about being asked as Unknown", () => {
    expect(rowText(renderFeaturesHtml("en", view(null)), "A request that the browser keep")).toContain("Unknown");
    expect(rowText(renderFeaturesHtml("fr", view(null)), "Une demande pour que le navigateur conserve")).toContain("Inconnu");
  });
  it("says which features the App's header settings list as off, and that the site was not checked", () => {
    const html = renderFeaturesHtml("en", view(null));
    expect(rowText(html, "Your location")).toContain("Listed as off");
    expect(rowText(html, "Showing notifications")).toContain("No setting");
    expect(html).toContain("Whether the site you use sends it was not checked.");
  });
  it("follows the language", () => {
    const fr = renderFeaturesHtml("fr", view(STATES));
    expect(fr).toContain("Ce que l’App demande à votre navigateur");
    expect(rowText(fr, "Votre position")).toContain("Bloqué");
    expect(fr).toContain("Contrôlé le 2026-11-19.");
    expect(fr).toContain("Contrôler ce que mon navigateur autorise");
  });
  it("omits a table that would be empty, and the header note when no row has a header setting", () => {
    const onlyUsed = renderFeaturesHtml("en", { register: FEATURE_REGISTER.filter((r) => r.used), states: null });
    expect(onlyUsed.match(/<table>/g)).toHaveLength(1);
    expect(onlyUsed).not.toContain("Not used by the App");
    const noHeader = renderFeaturesHtml("en", { register: FEATURE_REGISTER.filter((r) => !r.used && r.blockedBy === undefined), states: null });
    expect(noHeader).not.toContain("Whether the site you use sends it");
  });
  it("escapes text from the register", () => {
    const html = renderFeaturesHtml("en", { register: [{ ...FEATURE_REGISTER[0]!, holds: { en: "<b>bold</b>", fr: "x" } }], states: null });
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;b&gt;");
  });
  it("passes the HTML audit in both languages, before and after the check", () => {
    for (const l of LOCALES) {
      for (const s of [null, STATES]) {
        const v = auditHtml(`<section lang="${l}">${renderFeaturesHtml(l, view(s))}</section>`);
        expect(v, formatViolations(v)).toEqual([]);
      }
    }
  });
});

describe("FEATURE_STRINGS", () => {
  it("passes the copy lint in both languages", () => {
    for (const l of LOCALES) {
      const s = FEATURE_STRINGS[l];
      const texts: string[] = [s.heading, s.note, s.usedHeading, s.unusedHeading, ...Object.values(s.columns), ...Object.values(s.asks), ...Object.values(s.answer), ...Object.values(s.headers), s.checkButton, s.checked("2026-11-19"), s.caption.used, s.caption.unused];
      for (const t of texts) expect(lintCopy(l, t), t).toEqual([]);
    }
  });
  it("puts a narrow no-break space before the question mark in French", () => {
    expect(FEATURE_STRINGS.fr.columns.asks).toContain("d’abord ?");
  });
  it("has the same shape in English and French", () => {
    const flat = (l: Locale): Record<string, string> => {
      const s = FEATURE_STRINGS[l];
      const out: Record<string, string> = { heading: s.heading, note: s.note, usedHeading: s.usedHeading, unusedHeading: s.unusedHeading, checkButton: s.checkButton, checked: s.checked("2026-11-19"), captionUsed: s.caption.used, captionUnused: s.caption.unused };
      for (const [k, v] of Object.entries(s.columns)) out[`columns.${k}`] = v;
      for (const [k, v] of Object.entries(s.asks)) out[`asks.${k}`] = v;
      for (const [k, v] of Object.entries(s.answer)) out[`answer.${k}`] = v;
      for (const [k, v] of Object.entries(s.headers)) out[`headers.${k}`] = v;
      return out;
    };
    expect(checkParity(flat("en"), flat("fr"), { allowIdentical: ["checked"] })).toEqual([]);
  });
});
