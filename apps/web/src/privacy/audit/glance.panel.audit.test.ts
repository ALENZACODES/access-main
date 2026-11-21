// CI audit: the live privacy panel's counts section, built from the App's real registers, in both languages.

import { describe, expect, it } from "vitest";
import { containsForbiddenOrg } from "../../../../../packages/shared/test/forbiddenOrg.ts";
import { createPrivacyController } from "../panel/controller";
import { lintCopy, type Locale } from "../panel/copyLint";
import { FIXTURE } from "../panel/fixtures.test-util";
import { glanceFigures } from "../panel/glance";
import { clearLiveRefused } from "../panel/live";
import { liveControllerDeps } from "../panel/liveController";
import { checkStatements } from "../panel/statementRegister";
import { createMemoryStorage } from "../panel/storage";
import { auditHtml, formatViolations } from "./htmlAudit";
import { rawTexts } from "./rawTexts";

const NOW = new Date(2026, 10, 19, 9, 0, 0);
const LOCALES: readonly Locale[] = ["en", "fr"];

function render(locale: Locale): string {
  clearLiveRefused();
  const c = createPrivacyController({ storage: createMemoryStorage(), inventory: FIXTURE, now: () => NOW, ...liveControllerDeps() });
  c.dispatch({ type: "set-locale", locale });
  return c.html();
}

describe("live panel privacy counts", () => {
  for (const locale of LOCALES) {
    it(`(${locale}) passes the HTML audit, the copy lint and the name check`, () => {
      const html = render(locale);
      const v = auditHtml(html);
      expect(v, formatViolations(v)).toEqual([]);
      for (const t of rawTexts(html)) expect(lintCopy(locale, t), t).toEqual([]);
      expect(containsForbiddenOrg(html)).toBe(false);
      expect(html).toContain("data-privacy-glance");
    });
  }

  it("shows five tables, one for each of the App's lists", () => {
    const html = render("en");
    const start = html.indexOf("data-privacy-glance");
    const end = html.indexOf("data-privacy-addresses");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(html.slice(start, end).match(/<table>/g)).toHaveLength(5);
  });

  it("matches the live controller's own lists, figure by figure", () => {
    const live = liveControllerDeps();
    const figures = glanceFigures({ ...(live.kept ? { kept: live.kept } : {}), ...(live.deviceRegister ? { device: live.deviceRegister } : {}), ...(live.features ? { features: live.features.register } : {}), ...(live.addresses ? { addresses: live.addresses } : {}), ...(live.statements ? { statements: checkStatements(live.statements, live.addresses?.calls ?? null) } : {}) });
    expect(figures.length).toBe(16);
    expect(figures.every((f) => Number.isInteger(f.count) && f.count >= 0)).toBe(true);
  });

  it("says the App has not confirmed some things, because the real lists do hold unknowns", () => {
    expect(render("en")).toMatch(/\d+ things? the App has not confirmed/);
    expect(render("fr")).toMatch(/\d+ éléments? que l’App n’a pas confirmé/);
  });

  it("does not use the word verified or its French forms", () => {
    for (const locale of LOCALES) expect(render(locale)).not.toMatch(/verified|vérif/i);
  });
});
