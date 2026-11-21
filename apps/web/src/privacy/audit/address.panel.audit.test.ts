// CI audit: the live privacy panel's addresses and network requests section, built from the App's real
// register, in both languages and with each list empty or full.

import { describe, expect, it } from "vitest";
import { containsForbiddenOrg } from "../../../../../packages/shared/test/forbiddenOrg.ts";
import { ADDRESS_REGISTER, CALL_REGISTER } from "../panel/addressRegister";
import { createPrivacyController } from "../panel/controller";
import { lintCopy, type Locale } from "../panel/copyLint";
import { FIXTURE } from "../panel/fixtures.test-util";
import { clearLiveRefused } from "../panel/live";
import { liveControllerDeps } from "../panel/liveController";
import { createMemoryStorage } from "../panel/storage";
import { auditHtml, formatViolations } from "./htmlAudit";
import { rawTexts } from "./rawTexts";

const NOW = new Date(2026, 10, 19, 9, 0, 0);
const LOCALES: readonly Locale[] = ["en", "fr"];

const VIEWS = [
  { name: "the real registers", view: { addresses: ADDRESS_REGISTER, calls: CALL_REGISTER } },
  { name: "no requests", view: { addresses: ADDRESS_REGISTER, calls: [] } },
  { name: "no addresses", view: { addresses: [], calls: CALL_REGISTER } },
] as const;

function render(view: { addresses: typeof ADDRESS_REGISTER; calls: typeof CALL_REGISTER }, locale: Locale): string {
  clearLiveRefused();
  const c = createPrivacyController({ storage: createMemoryStorage(), inventory: FIXTURE, now: () => NOW, ...liveControllerDeps(), addresses: view });
  c.dispatch({ type: "set-locale", locale });
  return c.html();
}

describe("live panel addresses and network requests", () => {
  for (const v of VIEWS) {
    for (const locale of LOCALES) {
      it(`${v.name} (${locale}): passes the HTML audit, the copy lint and the name check`, () => {
        const html = render(v.view, locale);
        const violations = auditHtml(html);
        expect(violations, formatViolations(violations)).toEqual([]);
        for (const t of rawTexts(html)) expect(lintCopy(locale, t), t).toEqual([]);
        expect(containsForbiddenOrg(html)).toBe(false);
        expect(html).toContain("data-privacy-addresses");
      });
    }
  }

  it("shows every host in the register in both languages", () => {
    for (const locale of LOCALES) {
      const html = render({ addresses: ADDRESS_REGISTER, calls: CALL_REGISTER }, locale);
      for (const a of ADDRESS_REGISTER) expect(html, a.host).toContain(a.host);
    }
  });

  it("never shows a file path, a full address or a programming interface name to the person", () => {
    const html = render({ addresses: ADDRESS_REGISTER, calls: CALL_REGISTER }, "en");
    const section = html.slice(html.indexOf("data-privacy-addresses"), html.indexOf("data-privacy-addresses") + 20000);
    for (const bad of ["apps/web", "https://", "http://", "XMLHttpRequest", "sendBeacon", "importScripts", "serviceWorker"]) expect(section, bad).not.toContain(bad);
  });

  it("says unknown, in both languages, for the request whose address comes from data", () => {
    expect(render({ addresses: [], calls: CALL_REGISTER }, "en")).toContain("Unknown.");
    expect(render({ addresses: [], calls: CALL_REGISTER }, "fr")).toContain("Inconnu.");
  });

  it("does not use the word verified or its French forms", () => {
    for (const locale of LOCALES) expect(render({ addresses: ADDRESS_REGISTER, calls: CALL_REGISTER }, locale)).not.toMatch(/verified|vérif/i);
  });

  it("has no section when the controller is given no lists", () => {
    for (const locale of LOCALES) expect(render({ addresses: [], calls: [] }, locale)).not.toContain("data-privacy-addresses");
  });
});
