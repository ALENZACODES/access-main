// CI audit: the browser-questions section inside the live panel, in both languages and in every state the person can
// reach with it, against browsers that answer in different ways. Every state must pass the HTML audit and the copy
// rules, give the buttons 44 px targets, name no file or browser interface, and show no answer the browser did not give.

import { describe, expect, it } from "vitest";
import { containsForbiddenOrg } from "../../../../../packages/shared/test/forbiddenOrg.ts";
import type { BrowserHost } from "../panel/browserLive";
import { BROWSER_REGISTER } from "../panel/browserRegister";
import { lintCopy, type Locale } from "../panel/copyLint";
import { createPrivacyController, type PrivacyController } from "../panel/controller";
import { FIXTURE } from "../panel/fixtures.test-util";
import { liveControllerDeps } from "../panel/liveController";
import { createMemoryStorage } from "../panel/storage";
import { auditHtml, formatViolations } from "./htmlAudit";
import { rawTexts } from "./rawTexts";

const NOW = new Date(Date.UTC(2026, 10, 21, 12, 0, 0));
const LOCALES: readonly Locale[] = ["en", "fr"];

const THROWS = (): never => { throw new Error("blocked"); };
const HOSTS: Record<string, BrowserHost> = {
  "a browser that answers everything": { language: () => "fr-CA", online: () => true, prefers: () => true, storage: async () => ({ usage: 5_000_000, quota: 2_000_000_000, persisted: true }) },
  "a browser that says no to everything": { language: () => "en", online: () => false, prefers: () => false, storage: async () => ({ usage: 0, quota: 1, persisted: false }) },
  "a browser that answers nothing": {},
  "a browser that throws": { language: THROWS, online: THROWS, prefers: THROWS, storage: THROWS },
  "a browser that gives odd values": { language: () => "<b>x</b>".repeat(10), online: () => "yes" as unknown as boolean, prefers: () => null as unknown as boolean, storage: async () => ({ usage: -1, quota: Number.NaN, persisted: "no" as unknown as boolean }) },
  "a browser with huge sizes": { language: () => "en-CA", storage: async () => ({ usage: 3 * 10 ** 15, quota: 9 * 10 ** 15 }) },
};

type Step = "none" | "check" | "csv" | "text" | "check-then-csv";

async function build(host: BrowserHost, locale: Locale, step: Step): Promise<{ html: string; c: PrivacyController }> {
  const c = createPrivacyController({ storage: createMemoryStorage(), inventory: FIXTURE, now: () => NOW, ...liveControllerDeps(), browser: { register: BROWSER_REGISTER, host } });
  c.dispatch({ type: "set-locale", locale });
  if (step === "check" || step === "check-then-csv") await c.dispatchAsync({ type: "check-browser" });
  if (step === "csv" || step === "check-then-csv") c.dispatch({ type: "export-browser-csv" });
  if (step === "text") c.dispatch({ type: "export-browser-text" });
  return { html: c.html(), c };
}

const STEPS: readonly Step[] = ["none", "check", "csv", "text", "check-then-csv"];

describe("the browser section in the live panel", () => {
  for (const [name, host] of Object.entries(HOSTS)) {
    for (const step of STEPS) {
      for (const locale of LOCALES) {
        it(`${name}, step ${step}, ${locale}: passes the audits and names nothing it must not`, async () => {
          const { html } = await build(host, locale, step);
          expect(html).toContain("data-privacy-browser");
          const v = auditHtml(html);
          expect(v, formatViolations(v)).toEqual([]);
          for (const t of rawTexts(html)) expect(lintCopy(locale, t), t).toEqual([]);
          expect(containsForbiddenOrg(html)).toBe(false);
          expect(html).not.toMatch(/verified|vérif/i);
          expect(html).not.toMatch(/apps\/web|packages\/[a-z-]+\/src/);
          const part = html.slice(html.indexOf("data-privacy-browser"), html.indexOf("data-privacy-retention"));
          expect(part).not.toMatch(/navigator|matchMedia|onLine|randomUUID|toLocale|estimate\(|persisted\(/);
        });
      }
    }
  }

  it("shows an answer only after the person asks, and never one the browser did not give", async () => {
    const before = (await build(HOSTS["a browser that answers everything"]!, "en", "none")).html;
    expect(before).not.toContain("data-privacy-browser-check");
    expect(before).not.toContain("fr-CA");
    const after = (await build(HOSTS["a browser that answers nothing"]!, "en", "check")).html;
    expect(after).toContain("data-privacy-browser-check");
    expect(after).not.toMatch(/data-label="Answer">(?:Yes|No)</);
  });

  it("shows odd values as unknown, and escapes what it does show", async () => {
    const { html } = await build(HOSTS["a browser that gives odd values"]!, "en", "check");
    expect(html).not.toContain("<b>x</b>");
    expect(html).not.toMatch(/NaN|-1 /);
  });

  it("writes a large size in terabytes, in each language", async () => {
    expect((await build(HOSTS["a browser with huge sizes"]!, "en", "check")).html).toMatch(/\d(?:\.\d+)? TB/);
    expect((await build(HOSTS["a browser with huge sizes"]!, "fr", "check")).html).toMatch(/\d(?:,\d+)?\u00A0To/);
  });

  it("gives every button in the section a 44 px target", async () => {
    for (const locale of LOCALES) {
      const { html } = await build(HOSTS["a browser that answers everything"]!, locale, "check");
      const part = html.slice(html.indexOf("data-privacy-browser"));
      const buttons = part.match(/<button[^>]*data-action="(?:check|export)-browser[^>]*>/g) ?? [];
      expect(buttons).toHaveLength(3);
      for (const b of buttons) expect(b).toContain("min-width:44px;min-height:44px");
    }
  });

  it("has one heading of its own, before the how-long-kept section", async () => {
    const { html } = await build(HOSTS["a browser that answers nothing"]!, "en", "none");
    expect(html.match(/id="privacy-browser-title"/g)).toHaveLength(1);
    expect(html.indexOf("data-privacy-browser")).toBeLessThan(html.indexOf("data-privacy-retention"));
  });

  it("says the same in both languages: same buttons, same number of rows and answers", async () => {
    const en = (await build(HOSTS["a browser that answers everything"]!, "en", "check")).html;
    const fr = (await build(HOSTS["a browser that answers everything"]!, "fr", "check")).html;
    const count = (h: string, re: RegExp): number => h.slice(h.indexOf("data-privacy-browser")).match(re)?.length ?? 0;
    expect(count(fr, /<tr>/g)).toBe(count(en, /<tr>/g));
    expect(count(fr, /data-action="/g)).toBe(count(en, /data-action="/g));
  });

  it("says that the device is offline, in words, when it says so", async () => {
    const en = (await build(HOSTS["a browser that says no to everything"]!, "en", "check")).html;
    expect(en).toContain("Your device says it is offline right now.");
    const fr = (await build(HOSTS["a browser that says no to everything"]!, "fr", "check")).html;
    expect(fr).toContain("hors ligne");
  });
});
