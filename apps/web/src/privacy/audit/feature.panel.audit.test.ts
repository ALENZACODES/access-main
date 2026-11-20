// CI audit: the live privacy panel's browser features section, built from the App's real register, in both
// languages, before and after the check, with each answer a browser can give.

import { describe, expect, it } from "vitest";
import { containsForbiddenOrg } from "../../../../../packages/shared/test/forbiddenOrg.ts";
import { createPrivacyController } from "../panel/controller";
import { lintCopy, type Locale } from "../panel/copyLint";
import { FEATURE_REGISTER } from "../panel/featureRegister";
import { FIXTURE } from "../panel/fixtures.test-util";
import { clearLiveRefused } from "../panel/live";
import { liveControllerDeps } from "../panel/liveController";
import type { FeatureHost } from "../panel/permissions";
import { createMemoryStorage } from "../panel/storage";
import { auditHtml, formatViolations } from "./htmlAudit";
import { rawTexts } from "./rawTexts";

const NOW = new Date(2026, 10, 19, 9, 0, 0);
const LOCALES: readonly Locale[] = ["en", "fr"];
const every = (state: string): FeatureHost => ({ permissions: { query: () => Promise.resolve({ state }) } });

const BROWSERS: ReadonlyArray<{ name: string; host: FeatureHost | null }> = [
  { name: "not checked yet", host: null },
  { name: "everything allowed", host: every("granted") },
  { name: "everything blocked", host: every("denied") },
  { name: "the browser will ask", host: every("prompt") },
  { name: "the browser gives an answer the App does not know", host: every("maybe") },
  { name: "the browser has no permission query", host: {} },
  { name: "the browser rejects every question", host: { permissions: { query: () => Promise.reject(new Error("no")) } } },
];

async function render(host: FeatureHost | null, locale: Locale): Promise<string> {
  clearLiveRefused();
  const live = liveControllerDeps();
  const c = createPrivacyController({
    storage: createMemoryStorage(),
    inventory: FIXTURE,
    now: () => NOW,
    ...live,
    features: { register: FEATURE_REGISTER, host: host ?? {} },
  });
  c.dispatch({ type: "set-locale", locale });
  if (host !== null) await c.dispatchAsync({ type: "check-features" });
  return c.html();
}

describe("live panel browser features", () => {
  for (const b of BROWSERS) {
    for (const locale of LOCALES) {
      it(`${b.name} (${locale}): passes the HTML audit, the copy lint and the name check`, async () => {
        const html = await render(b.host, locale);
        const v = auditHtml(html);
        expect(v, formatViolations(v)).toEqual([]);
        for (const t of rawTexts(html)) expect(lintCopy(locale, t), t).toEqual([]);
        expect(containsForbiddenOrg(html)).toBe(false);
        expect(html).toContain("data-privacy-features");
      });
    }
  }

  it("shows one row for every register row, in both languages", async () => {
    for (const locale of LOCALES) {
      const html = await render(null, locale);
      for (const r of FEATURE_REGISTER) expect(html, r.id).toContain(r.holds[locale].replace(/’/g, "’"));
    }
  });

  it("never shows a programming interface name or a permission name to the person", async () => {
    const html = await render(every("granted"), "en");
    for (const name of ["navigator", "getUserMedia", "persistent-storage", "clipboard-write", "serviceWorker"]) expect(html, name).not.toContain(name);
  });

  it("says Allowed, Blocked or Will ask you only after the check", async () => {
    const before = await render(null, "en");
    for (const w of ["Allowed", "Blocked", "Will ask you"]) expect(before, w).not.toContain(w);
    expect(await render(every("granted"), "en")).toContain("Allowed");
    expect(await render(every("denied"), "en")).toContain("Blocked");
    expect(await render(every("prompt"), "en")).toContain("Will ask you");
  });

  it("shows unknown when the browser cannot say, never an answer it did not give", async () => {
    for (const host of [{}, { permissions: { query: () => Promise.reject(new Error("no")) } }, every("maybe")]) {
      const html = await render(host as FeatureHost, "fr");
      for (const w of ["Autorisé", "Bloqué", "Vous le demandera"]) expect(html, w).not.toContain(w);
      expect(html).toContain("Inconnu");
    }
  });
});
