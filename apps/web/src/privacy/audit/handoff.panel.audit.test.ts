// CI audit: the links-to-other-apps section inside the live panel, in both languages and in every state the person
// can reach with it. Every state must pass the HTML audit and the copy rules, give the buttons 44 px targets, and
// say nothing the register does not.

import { describe, expect, it } from "vitest";
import { containsForbiddenOrg } from "../../../../../packages/shared/test/forbiddenOrg.ts";
import { lintCopy, type Locale } from "../panel/copyLint";
import { createPrivacyController, type PrivacyController } from "../panel/controller";
import { FIXTURE } from "../panel/fixtures.test-util";
import { HANDOFF_REGISTER } from "../panel/handoffRegister";
import { liveControllerDeps } from "../panel/liveController";
import { createMemoryStorage } from "../panel/storage";
import { auditHtml, formatViolations } from "./htmlAudit";
import { rawTexts } from "./rawTexts";

const NOW = new Date(Date.UTC(2026, 10, 20, 12, 0, 0));
const LOCALES: readonly Locale[] = ["en", "fr"];

interface Setup {
  name: string;
  run: (c: PrivacyController) => void;
}

const SETUPS: readonly Setup[] = [
  { name: "first visit", run: () => undefined },
  { name: "after a CSV download", run: (c) => void c.dispatch({ type: "export-handoff-csv" }) },
  { name: "after a text download", run: (c) => void c.dispatch({ type: "export-handoff-text" }) },
  { name: "after another section's download", run: (c) => void c.dispatch({ type: "export-glance-csv" }) },
  { name: "after the choice is allowed", run: (c) => void c.dispatch({ type: "consent", purposeId: "route-reports", value: "granted" }) },
];

function build(setup: Setup, locale: Locale): { html: string; c: PrivacyController } {
  const c = createPrivacyController({ storage: createMemoryStorage(), inventory: FIXTURE, now: () => NOW, ...liveControllerDeps() });
  c.dispatch({ type: "set-locale", locale });
  setup.run(c);
  return { html: c.html(), c };
}

describe("the links-to-other-apps section in the live panel", () => {
  for (const setup of SETUPS) {
    for (const locale of LOCALES) {
      it(`${setup.name}, ${locale}: passes the audits`, () => {
        const { html } = build(setup, locale);
        expect(html).toContain("data-privacy-handoff");
        const v = auditHtml(html);
        expect(v, formatViolations(v)).toEqual([]);
        for (const t of rawTexts(html)) expect(lintCopy(locale, t), t).toEqual([]);
        expect(containsForbiddenOrg(html)).toBe(false);
        expect(html).not.toMatch(/verified|vérif/i);
      });
    }
  }

  it("lists each row of the register, in both languages", () => {
    for (const locale of LOCALES) {
      const { html } = build(SETUPS[0]!, locale);
      for (const r of HANDOFF_REGISTER) {
        expect(html, r.path).toContain(r.opens[locale].replace(/&/g, "&amp;"));
        expect(html).toContain(r.carries[locale].replace(/&/g, "&amp;"));
      }
    }
  });

  it("shows the file name nowhere in the page, because the path is for the download and not for the person", () => {
    const { html } = build(SETUPS[0]!, "en");
    for (const r of HANDOFF_REGISTER) expect(html).not.toContain(r.path);
  });

  it("says the download is ready in the status line and puts the file in the state", () => {
    const { c } = build(SETUPS[1]!, "en");
    expect(c.getState().lastExport?.filename).toBe("the-app-links-to-other-apps-2026-11-20.csv");
    expect(c.getState().status).toEqual({ kind: "handoff-exported", format: "csv" });
  });

  it("uses a no-break space before each colon in the French text file", () => {
    const { c } = build({ name: "fr text", run: (x) => void x.dispatch({ type: "export-handoff-text" }) }, "fr");
    expect(c.getState().lastExport?.text).toMatch(/Ce qui s’ouvre\u00a0: /);
  });
});

describe("the audit has teeth for this section", () => {
  const html = build(SETUPS[0]!, "en").html;
  it("catches a button that is too small", () => {
    const small = html.replace("min-width:44px;min-height:44px", "min-width:20px;min-height:20px");
    expect(auditHtml(small).length).toBeGreaterThan(0);
  });
  it("catches a table with no caption", () => {
    expect(auditHtml(html.replace(/<caption>Links that open another app<\/caption>/, "")).length).toBeGreaterThan(0);
  });
  it("catches a plain space before a French colon", () => {
    const fr = build(SETUPS[0]!, "fr").html.replace("Liens qui ouvrent une autre application", "Liens : une autre application");
    expect(rawTexts(fr).some((t) => lintCopy("fr", t).length > 0)).toBe(true);
  });
});
