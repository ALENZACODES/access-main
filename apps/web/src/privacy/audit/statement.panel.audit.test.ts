// CI audit: the live privacy panel's statements section, built from the App's real register and its list of
// network requests, in both languages, with and without the list of requests.

import { describe, expect, it } from "vitest";
import { containsForbiddenOrg } from "../../../../../packages/shared/test/forbiddenOrg.ts";
import { createPrivacyController } from "../panel/controller";
import { lintCopy, type Locale } from "../panel/copyLint";
import { FIXTURE } from "../panel/fixtures.test-util";
import { clearLiveRefused } from "../panel/live";
import { liveControllerDeps } from "../panel/liveController";
import { STATEMENT_REGISTER } from "../panel/statementRegister";
import { createMemoryStorage } from "../panel/storage";
import { auditHtml, formatViolations } from "./htmlAudit";
import { rawTexts } from "./rawTexts";

const NOW = new Date(2026, 10, 20, 9, 0, 0);
const LOCALES: readonly Locale[] = ["en", "fr"];

function render(locale: Locale, withRequests: boolean): string {
  clearLiveRefused();
  const { addresses, ...rest } = liveControllerDeps();
  const c = createPrivacyController({ storage: createMemoryStorage(), inventory: FIXTURE, now: () => NOW, ...rest, ...(withRequests && addresses !== undefined ? { addresses } : {}) });
  c.dispatch({ type: "set-locale", locale });
  return c.html();
}

describe("live panel statements about data", () => {
  for (const withRequests of [true, false]) {
    for (const locale of LOCALES) {
      it(`${withRequests ? "with" : "without"} the list of requests (${locale}): passes the HTML audit, the copy lint and the name check`, () => {
        const html = render(locale, withRequests);
        const v = auditHtml(html);
        expect(v, formatViolations(v)).toEqual([]);
        for (const t of rawTexts(html)) expect(lintCopy(locale, t), t).toEqual([]);
        expect(containsForbiddenOrg(html)).toBe(false);
        expect(html).toContain("data-privacy-statements");
      });
    }
  }

  it("shows every part of the register in both languages", () => {
    for (const locale of LOCALES) {
      const html = render(locale, true);
      for (const r of STATEMENT_REGISTER) expect(html, r.path).toContain(r.where[locale].replace(/&/g, "&amp;"));
    }
  });

  it("says each part was not checked, and counts none as a pass, without the list of requests", () => {
    const html = render("en", false);
    const start = html.indexOf("data-privacy-statements");
    const section = html.slice(start, html.indexOf("</table>", start));
    expect(section).not.toContain("None found");
    expect(section.match(/Not checked/g)).toHaveLength(STATEMENT_REGISTER.length);
  });

  it("does not say the statements are true", () => {
    for (const locale of LOCALES) expect(render(locale, true)).not.toMatch(/verified|vérif|proves? that|prouve que/i);
  });
});
