// CI audit: the web-address section inside the live panel, in both languages and in every state the person can
// reach with it. Every state must pass the HTML audit and the copy rules, give the buttons 44 px targets, repeat no
// value taken from the address, and say nothing the register does not.

import { describe, expect, it } from "vitest";
import { containsForbiddenOrg } from "../../../../../packages/shared/test/forbiddenOrg.ts";
import { lintCopy, type Locale } from "../panel/copyLint";
import { createPrivacyController, type PrivacyController } from "../panel/controller";
import { FIXTURE } from "../panel/fixtures.test-util";
import { liveControllerDeps } from "../panel/liveController";
import { createMemoryStorage } from "../panel/storage";
import { auditHtml, formatViolations } from "./htmlAudit";
import { rawTexts } from "./rawTexts";

const NOW = new Date(Date.UTC(2026, 10, 21, 12, 0, 0));
const LOCALES: readonly Locale[] = ["en", "fr"];
const SECRET = "43.987654,-79.123456";

interface Setup {
  name: string;
  address: string;
  run: (c: PrivacyController) => void;
}

const SETUPS: readonly Setup[] = [
  { name: "first visit", address: "", run: () => undefined },
  { name: "after a CSV download", address: "", run: (c) => void c.dispatch({ type: "export-query-csv" }) },
  { name: "after a text download", address: "", run: (c) => void c.dispatch({ type: "export-query-text" }) },
  { name: "after examining an address with nothing in it", address: "", run: (c) => void c.dispatch({ type: "check-query" }) },
  { name: "after examining a clean address", address: "?lang=fr&sort=retrieved", run: (c) => void c.dispatch({ type: "check-query" }) },
  { name: "after examining an address with a place", address: `?near=${SECRET}`, run: (c) => void c.dispatch({ type: "check-query" }) },
  { name: "after examining an address with a name nothing lists", address: "?utm_source=x", run: (c) => void c.dispatch({ type: "check-query" }) },
  { name: "after examining a very long value", address: `?q=${"x".repeat(300)}`, run: (c) => void c.dispatch({ type: "check-query" }) },
  { name: "after examining an address that cannot be read", address: "", run: (c) => void c.dispatch({ type: "check-query" }) },
  { name: "after another section's download", address: "", run: (c) => void c.dispatch({ type: "export-glance-csv" }) },
  { name: "after the choice is allowed", address: "", run: (c) => void c.dispatch({ type: "consent", purposeId: "route-reports", value: "granted" }) },
];

function build(setup: Setup, locale: Locale): { html: string; c: PrivacyController } {
  const unreadable = setup.name.includes("cannot be read");
  const address = unreadable ? (): string => { throw new Error("blocked"); } : (): string => setup.address;
  const c = createPrivacyController({ storage: createMemoryStorage(), inventory: FIXTURE, now: () => NOW, ...liveControllerDeps({ address }) });
  c.dispatch({ type: "set-locale", locale });
  setup.run(c);
  return { html: c.html(), c };
}

describe("the web-address section in the live panel", () => {
  for (const setup of SETUPS) {
    for (const locale of LOCALES) {
      it(`${setup.name}, ${locale}: passes the audits`, () => {
        const { html } = build(setup, locale);
        expect(html).toContain("data-privacy-query");
        const v = auditHtml(html);
        expect(v, formatViolations(v)).toEqual([]);
        for (const t of rawTexts(html)) expect(lintCopy(locale, t), t).toEqual([]);
        expect(containsForbiddenOrg(html)).toBe(false);
        expect(html).not.toMatch(/verified|vérif/i);
      });
      it(`${setup.name}, ${locale}: repeats no value from the address`, () => {
        const { html } = build(setup, locale);
        expect(html).not.toContain("43.987654");
        expect(html).not.toContain("79.123456");
        expect(html).not.toContain("x".repeat(20));
        expect(html).not.toContain("utm_source=x");
      });
    }
  }

  it("gives every button in the section a 44 px target", () => {
    for (const locale of LOCALES) {
      const { html } = build(SETUPS[0]!, locale);
      const part = html.slice(html.indexOf("data-privacy-query"));
      const buttons = part.match(/<button[^>]*data-action="(?:check|export)-query[^>]*>/g) ?? [];
      expect(buttons).toHaveLength(3);
      for (const b of buttons) expect(b).toContain("min-width:44px;min-height:44px");
    }
  });

  it("sits among the other lists and has one heading of its own", () => {
    const { html } = build(SETUPS[0]!, "en");
    expect(html.match(/id="privacy-query-title"/g)).toHaveLength(1);
    expect(html.indexOf("data-privacy-handoff")).toBeLessThan(html.indexOf("data-privacy-query"));
  });

  it("says the same in both languages: same buttons, same number of rows", () => {
    const en = build(SETUPS[0]!, "en").html;
    const fr = build(SETUPS[0]!, "fr").html;
    const count = (h: string, re: RegExp): number => h.slice(h.indexOf("data-privacy-query")).match(re)?.length ?? 0;
    expect(count(fr, /<tr>/g)).toBe(count(en, /<tr>/g));
    expect(count(fr, /data-action="/g)).toBe(count(en, /data-action="/g));
  });

  it("names a place the address carries, and says nothing about the value", () => {
    const { html } = build(SETUPS[5]!, "en");
    expect(html).toContain("carries “near”, which holds a place on the map");
  });

  it("says a name nothing lists is not known here, and does not call it fine", () => {
    const { html } = build(SETUPS[6]!, "en");
    expect(html).toContain("has “utm_source”");
    expect(html).toContain("not known here");
    expect(html).not.toMatch(/Nothing to report/);
  });
});
