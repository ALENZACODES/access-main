// CI audit: all shipped copy, and the visible text of every panel state, must be
// plain language: short sentences, no jargon, a reading level most people can
// follow. The checks are rough heuristics (see plainLanguage.ts), so the limits
// catch dense text rather than grade it.

import { describe, expect, it } from "vitest";
import { createPrivacyController } from "../panel/controller";
import { setConsent, type Purpose } from "../panel/consent";
import type { Locale } from "../panel/copyLint";
import { createEgressPolicy } from "../panel/egress";
import { recordBlocked } from "../panel/egressLog";
import { FIXTURE, PREFIX } from "../panel/fixtures.test-util";
import { exportLocalData } from "../panel/localData";
import { checkPlain } from "../panel/plainLanguage";
import { renderPrintableDocument } from "../panel/printable";
import { reconcile } from "../panel/reconcile";
import { createMemoryStorage } from "../panel/storage";
import { collectCopy } from "./copyCorpus";
import { extractTexts } from "./htmlAudit";

const LOCALES: readonly Locale[] = ["en", "fr"];
const NOW = new Date(2026, 10, 15, 9, 0, 0);

function report(locale: Locale, items: ReadonlyArray<{ source: string; text: string }>): string[] {
  const bad: string[] = [];
  for (const i of items) {
    for (const p of checkPlain(locale, i.text)) bad.push(`${i.source}: ${p.code} ${p.detail} :: ${i.text}`);
  }
  return bad;
}

describe.each(LOCALES)("plain language: shipped copy (%s)", (locale) => {
  const copy = collectCopy(locale);
  it("collects a real amount of copy, so the audit cannot pass on an empty list", () => {
    expect(copy.length).toBeGreaterThan(90);
    expect(copy.map((c) => c.source)).toEqual(
      expect.arrayContaining(["panel.title", "more.importer.note", "more.network.note", "extra.stored.note"]),
    );
  });
  it("every string passes the plain-language checks", () => {
    const bad = report(locale, copy);
    expect(bad, `\n${bad.join("\n")}\n`).toEqual([]);
  });
});

const PURPOSES: readonly Purpose[] = [
  { id: "saved-places", label: { en: "Saved places", fr: "Lieux enregistrés" }, description: { en: "Remember places on this device", fr: "Garder des lieux sur cet appareil" }, wordingVersion: 1 },
];

describe.each(LOCALES)("plain language: the live panel's visible text (%s)", (locale) => {
  function panelTexts(): string[] {
    const storage = createMemoryStorage({ [`${PREFIX}a`]: "1" });
    recordBlocked(storage, PREFIX, { at: NOW.toISOString(), host: "evil.example.net", scheme: "https:", via: "fetch", reason: "not-listed" }, NOW);
    const c = createPrivacyController({
      storage,
      prefix: PREFIX,
      inventory: FIXTURE,
      purposes: PURPOSES,
      now: () => NOW,
      logActivity: true,
      trackChanges: true,
      egress: createEgressPolicy({ selfOrigin: "https://app.example.ca", allowedOrigins: ["https://data.example.ca"] }),
      reviewedOn: "2026-11-15",
      languages: [locale],
    });
    c.dispatch({ type: "set-locale", locale });
    c.dispatch({ type: "consent", purposeId: "saved-places", value: "granted" });
    c.dispatch({ type: "import-load", text: exportLocalData(createMemoryStorage({ [`${PREFIX}b`]: "2" }), PREFIX, NOW, locale).text });
    return extractTexts(c.html());
  }
  it("extracts the text, so the audit cannot pass on nothing", () => {
    const t = panelTexts();
    expect(t.length).toBeGreaterThan(60);
    expect(t.join(" ")).toContain(locale === "fr" ? "Connexions réseau" : "Network connections");
  });
  it("passes, apart from the test fixture's own list text", () => {
    const fixtureText = new Set(FIXTURE.flatMap((e) => [e.label.en, e.label.fr, e.purpose?.en ?? "", e.purpose?.fr ?? "", e.keptFor?.en ?? "", e.keptFor?.fr ?? "", e.source.en, e.source.fr]));
    const bad = report(locale, panelTexts().filter((t) => !fixtureText.has(t)).map((text) => ({ source: "panel", text })));
    expect(bad, `\n${bad.join("\n")}\n`).toEqual([]);
  });
});

describe.each(LOCALES)("plain language: the printable page (%s)", (locale) => {
  it("passes", () => {
    const html = renderPrintableDocument({ locale, now: NOW, inventory: [], stored: reconcile(createMemoryStorage(), PREFIX, []), reviewedOn: "2026-11-15" });
    const bad = report(locale, extractTexts(html).map((text) => ({ source: "printable", text })));
    expect(bad, `\n${bad.join("\n")}\n`).toEqual([]);
  });
});

describe("the audit is not vacuous", () => {
  it("fails on jargon", () => {
    expect(report("en", [{ source: "x", text: "The App collects telemetry on this device." }])).not.toEqual([]);
    expect(report("fr", [{ source: "x", text: "L’App envoie de la télémétrie." }])).not.toEqual([]);
  });
  it("fails on a long, dense sentence", () => {
    const dense =
      "Pursuant to the aforementioned considerations the administrative determination necessitates comprehensive documentation regarding organizational responsibilities and accountabilities.";
    expect(report("en", [{ source: "x", text: dense }])).not.toEqual([]);
  });
  it("fails on dense French", () => {
    const dense = "Les déterminations administratives nécessitent une documentation exhaustive concernant les responsabilités organisationnelles et institutionnelles.";
    expect(report("fr", [{ source: "x", text: dense }])).not.toEqual([]);
  });
  it("setConsent is used so consent text is part of the page", () => {
    expect(setConsent({}, PURPOSES[0]!, "granted", NOW)["saved-places"]?.value).toBe("granted");
  });
});
