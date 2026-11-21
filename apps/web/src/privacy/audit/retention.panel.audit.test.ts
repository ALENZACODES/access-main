// CI audit: the how-long-kept section inside the live panel, before and after the person compares it with
// what is stored, in both languages and with stored values that disagree with the list. Every state must pass
// the HTML audit and the copy rules, never show a stored value, and never claim more than was read.

import { describe, expect, it } from "vitest";
import { containsForbiddenOrg } from "../../../../../packages/shared/test/forbiddenOrg.ts";
import { activityKey } from "../panel/activityLog";
import { lintCopy, type Locale } from "../panel/copyLint";
import { createPrivacyController, type PrivacyController } from "../panel/controller";
import { FIXTURE } from "../panel/fixtures.test-util";
import { PRIVACY_STORAGE_PREFIX } from "../panel/live";
import { liveControllerDeps } from "../panel/liveController";
import { RETENTION_REGISTER } from "../panel/retentionRegister";
import { createMemoryStorage, type StorageLike } from "../panel/storage";
import { auditHtml, formatViolations } from "./htmlAudit";
import { rawTexts } from "./rawTexts";

const NOW = new Date(Date.UTC(2026, 10, 20, 12, 0, 0));
const DAY = 86_400_000;
const LOCALES: readonly Locale[] = ["en", "fr"];
const STORED_TEXT = "value-that-must-never-be-shown-456";
const KEY = activityKey(PRIVACY_STORAGE_PREFIX);

interface Setup {
  name: string;
  put: (s: StorageLike) => void;
  differences: number;
}

const envelope = (v: string, savedMs: number, lifeMs: number): string => JSON.stringify({ v, savedAt: new Date(savedMs).toISOString(), expiresAt: new Date(savedMs + lifeMs).toISOString() });

const SETUPS: readonly Setup[] = [
  { name: "nothing stored", put: () => undefined, differences: 0 },
  { name: "a value that agrees with the list", put: (s) => s.setItem(KEY, envelope(JSON.stringify([STORED_TEXT]), NOW.getTime(), 90 * DAY)), differences: 0 },
  { name: "a value with no end date", put: (s) => s.setItem(KEY, JSON.stringify([STORED_TEXT])), differences: 1 },
  { name: "a value kept longer than listed", put: (s) => s.setItem(KEY, envelope(JSON.stringify([STORED_TEXT]), NOW.getTime(), 120 * DAY)), differences: 1 },
  { name: "a value past its end date", put: (s) => s.setItem(KEY, envelope(JSON.stringify([STORED_TEXT]), NOW.getTime() - 100 * DAY, 90 * DAY)), differences: 0 },
  { name: "a list over its limit", put: (s) => s.setItem(KEY, envelope(JSON.stringify(Array.from({ length: 60 }, () => STORED_TEXT)), NOW.getTime(), 90 * DAY)), differences: 1 },
  { name: "a value that is not readable", put: (s) => s.setItem(KEY, envelope(STORED_TEXT, NOW.getTime(), 90 * DAY)), differences: 1 },
];

function build(setup: Setup, locale: Locale, check: boolean): { html: string; c: PrivacyController; storage: StorageLike } {
  const storage = createMemoryStorage();
  setup.put(storage);
  const c = createPrivacyController({ storage, inventory: FIXTURE, now: () => NOW, ...liveControllerDeps() });
  c.dispatch({ type: "set-locale", locale });
  if (check) c.dispatch({ type: "check-retention" });
  return { html: c.html(), c, storage };
}

describe("the how-long-kept section in the live panel", () => {
  for (const setup of SETUPS) {
    for (const locale of LOCALES) {
      for (const check of [false, true]) {
        it(`${setup.name}, ${locale}, ${check ? "after comparing" : "before comparing"}: passes the audits`, () => {
          const { html } = build(setup, locale, check);
          const v = auditHtml(html);
          expect(v, formatViolations(v)).toEqual([]);
          for (const t of rawTexts(html)) expect(lintCopy(locale, t), t).toEqual([]);
          expect(containsForbiddenOrg(html)).toBe(false);
          expect(html).not.toContain(STORED_TEXT);
          expect(html).not.toMatch(/verified|vérif/i);
        });
      }
    }
  }

  it("reports exactly the differences each state has", () => {
    for (const setup of SETUPS) {
      const { c } = build(setup, "en", true);
      const s = c.getState().retentionCheck;
      expect(s?.findings.length, setup.name).toBe(setup.differences);
    }
  });

  it("has already removed a value past its end date by the time the panel is compared", () => {
    const { storage } = build(SETUPS[4]!, "en", true);
    expect(storage.getItem(KEY)).toBeNull();
  });

  it("shows no comparison until the person asks, and keeps it after a language change", () => {
    const { c } = build(SETUPS[2]!, "en", false);
    expect(c.html()).not.toContain("data-privacy-retention-check");
    c.dispatch({ type: "check-retention" });
    c.dispatch({ type: "set-locale", locale: "fr" });
    expect(c.html()).toContain("data-privacy-retention-check");
    expect(c.html()).toContain("conservé sans date de fin");
  });

  it("puts the comparison in a status region and the finding in a list", () => {
    const { html } = build(SETUPS[2]!, "en", true);
    expect(html).toMatch(/<div role="status" data-privacy-retention-check><p>[^<]+<\/p><ul><li>[^<]+<\/li><\/ul><\/div>/);
  });

  it("has no list when there is nothing to report", () => {
    const { html } = build(SETUPS[1]!, "en", true);
    expect(html).toMatch(/data-privacy-retention-check><p>Compared 1 stored item with the list\. No differences found\.<\/p><\/div>/);
  });

  it("uses a no-break space before each French colon in the findings", () => {
    const { html } = build(SETUPS[2]!, "fr", true);
    expect(html).toContain("access.activity.v1 : conservé sans date de fin");
  });
});

describe("the audit has teeth for this section", () => {
  const html = build(SETUPS[2]!, "en", true).html;
  it("catches a stored value shown in the section", () => {
    expect(html.replace("<ul>", `<ul><li>${STORED_TEXT}</li>`)).toContain(STORED_TEXT);
  });
  it("catches a button with no text and an image with no alternative text", () => {
    expect(auditHtml(html.replace("Compare with what is stored now", "")).length).toBeGreaterThan(0);
    expect(auditHtml(html.replace("</ul>", '<li><img src="x"></li></ul>')).length).toBeGreaterThan(0);
  });
  it("catches a plain space before a French colon in the findings", () => {
    const fr = build(SETUPS[2]!, "fr", true).html.replace("access.activity.v1 :", "access.activity.v1 :");
    expect(rawTexts(fr).some((t) => lintCopy("fr", t).length > 0)).toBe(true);
  });
  it("catches the word verified in a finding", () => {
    expect(html.replace("stored with no end date", "verified")).toMatch(/verified/i);
  });
});

describe("every row of the real list can be compared without a throw", () => {
  it("for each key, with a value of each shape", () => {
    for (const row of RETENTION_REGISTER) {
      for (const raw of ["", "[]", "{}", "null", "x", envelope("[]", NOW.getTime(), DAY), envelope("x", 0, 1)]) {
        const storage = createMemoryStorage();
        storage.setItem(row.key, raw);
        const c = createPrivacyController({ storage, prefix: PRIVACY_STORAGE_PREFIX, inventory: FIXTURE, now: () => NOW, retention: RETENTION_REGISTER });
        expect(() => c.dispatch({ type: "check-retention" }), `${row.key} ${raw}`).not.toThrow();
        expect(c.getState().retentionCheck).not.toBeNull();
      }
    }
  });
});
