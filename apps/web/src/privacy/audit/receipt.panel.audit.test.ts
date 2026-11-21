// CI audit: the live privacy panel's record of choices, built from the App's real purposes and rules, in both
// languages and in each state a choice can be in.

import { describe, expect, it } from "vitest";
import { containsForbiddenOrg } from "../../../../../packages/shared/test/forbiddenOrg.ts";
import { createPrivacyController } from "../panel/controller";
import { lintCopy, type Locale } from "../panel/copyLint";
import { FIXTURE } from "../panel/fixtures.test-util";
import { LIVE_PURPOSES, clearLiveRefused } from "../panel/live";
import { liveControllerDeps } from "../panel/liveController";
import { STORAGE_REGISTER } from "../panel/storageRegister";
import { createMemoryStorage } from "../panel/storage";
import { auditHtml, formatViolations } from "./htmlAudit";
import { rawTexts } from "./rawTexts";

const NOW = new Date(2026, 10, 20, 9, 0, 0);
const LOCALES: readonly Locale[] = ["en", "fr"];
const ID = LIVE_PURPOSES[0]!.id;

const STATES: ReadonlyArray<{ name: string; value: "granted" | "declined" | null }> = [
  { name: "not asked yet", value: null },
  { name: "allowed", value: "granted" },
  { name: "not allowed", value: "declined" },
];

function render(value: "granted" | "declined" | null, locale: Locale): string {
  clearLiveRefused();
  const c = createPrivacyController({ storage: createMemoryStorage(), inventory: FIXTURE, now: () => NOW, ...liveControllerDeps() });
  c.dispatch({ type: "set-locale", locale });
  if (value !== null) c.dispatch({ type: "consent", purposeId: ID, value });
  return c.html();
}

describe("live panel record of choices", () => {
  for (const s of STATES) {
    for (const locale of LOCALES) {
      it(`${s.name} (${locale}): passes the HTML audit, the copy lint and the name check`, () => {
        const html = render(s.value, locale);
        const v = auditHtml(html);
        expect(v, formatViolations(v)).toEqual([]);
        for (const t of rawTexts(html)) expect(lintCopy(locale, t), t).toEqual([]);
        expect(containsForbiddenOrg(html)).toBe(false);
        expect(html).toContain("data-privacy-receipt");
      });
    }
  }

  it("shows every live purpose's label in both languages", () => {
    for (const locale of LOCALES) for (const p of LIVE_PURPOSES) expect(render(null, locale)).toContain(p.label[locale]);
  });

  it("lists the live register's row for the route reports as what the choice lets the App save", () => {
    for (const locale of LOCALES) {
      const row = STORAGE_REGISTER.find((r) => r.gated)!;
      expect(render(null, locale)).toContain(row.holds[locale]);
    }
  });

  it("never shows a storage name or a file path to the person", () => {
    const html = render("granted", "en");
    const start = html.indexOf("data-privacy-receipt");
    const section = html.slice(start, html.indexOf("</table>", start));
    for (const bad of ["access.routeReports", "apps/web", "localStorage"]) expect(section, bad).not.toContain(bad);
  });

  it("does not use the word verified or its French forms", () => {
    for (const locale of LOCALES) expect(render("granted", locale)).not.toMatch(/verified|vérif/i);
  });
});
