// CI audit: the what-the-App-does-on-its-own section inside the live panel, before and after the person asks the
// browser about offline workers and after each download, in both languages and with browsers that answer in different
// ways. Every state must pass the HTML audit and the copy rules, never show a script address, and never call an answer
// the browser would not give "none".

import { describe, expect, it } from "vitest";
import { containsForbiddenOrg } from "../../../../../packages/shared/test/forbiddenOrg.ts";
import { lintCopy, type Locale } from "../panel/copyLint";
import { createPrivacyController, type PrivacyController } from "../panel/controller";
import { AUTO_REGISTER } from "../panel/autoRegister";
import { browserWorkerHost, type WorkerHost } from "../panel/autoLive";
import { FIXTURE } from "../panel/fixtures.test-util";
import { liveControllerDeps } from "../panel/liveController";
import { createMemoryStorage } from "../panel/storage";
import { auditHtml, formatViolations } from "./htmlAudit";
import { rawTexts } from "./rawTexts";

const NOW = new Date(Date.UTC(2026, 10, 21, 12, 0, 0));
const LOCALES: readonly Locale[] = ["en", "fr"];
const SCRIPT = "https://example.org/secret-worker-script.js";

interface Setup {
  name: string;
  host: WorkerHost;
  differences: number;
}

const real = (registrations: Array<Record<string, unknown>> | "rejects" | "missing", controller: unknown = null): WorkerHost =>
  browserWorkerHost({
    serviceWorker: {
      controller,
      ...(registrations === "missing" ? {} : { getRegistrations: () => (registrations === "rejects" ? Promise.reject(new Error("no")) : Promise.resolve(registrations as never)) }),
    },
  });

const SETUPS: readonly Setup[] = [
  { name: "no workers in this browser", host: browserWorkerHost(undefined), differences: 0 },
  { name: "none registered", host: real([]), differences: 0 },
  { name: "one registered and controlling", host: real([{ scope: "https://example.org/", active: { scriptURL: SCRIPT } }], {}), differences: 0 },
  { name: "one waiting beside the active one", host: real([{ scope: "https://example.org/", active: { scriptURL: SCRIPT }, waiting: { scriptURL: SCRIPT } }]), differences: 0 },
  { name: "a browser that rejects the question", host: real("rejects"), differences: 1 },
  { name: "a browser with no registrations question", host: real("missing"), differences: 1 },
];

async function build(setup: Setup, locale: Locale, step: "none" | "check" | "csv" | "text"): Promise<{ html: string; c: PrivacyController }> {
  const c = createPrivacyController({ storage: createMemoryStorage(), inventory: FIXTURE, now: () => NOW, ...liveControllerDeps(), auto: { register: AUTO_REGISTER, host: setup.host } });
  c.dispatch({ type: "set-locale", locale });
  if (step === "check") await c.dispatchAsync({ type: "check-workers" });
  if (step === "csv") c.dispatch({ type: "export-auto-csv" });
  if (step === "text") c.dispatch({ type: "export-auto-text" });
  return { html: c.html(), c };
}

describe("the on-its-own section in the live panel", () => {
  for (const setup of SETUPS) {
    for (const locale of LOCALES) {
      for (const step of ["none", "check", "csv", "text"] as const) {
        it(`${setup.name}, ${locale}, ${step}: passes the audits`, async () => {
          const { html } = await build(setup, locale, step);
          expect(html).toContain("data-privacy-auto");
          const v = auditHtml(html);
          expect(v, formatViolations(v)).toEqual([]);
          for (const t of rawTexts(html)) expect(lintCopy(locale, t), t).toEqual([]);
          expect(containsForbiddenOrg(html)).toBe(false);
          expect(html).not.toMatch(/verified|vérif/i);
          expect(html).not.toContain("secret-worker-script");
          expect(html).not.toContain("example.org");
        });
      }
    }
  }

  it("reports exactly the differences each browser has", async () => {
    for (const setup of SETUPS) {
      const { c } = await build(setup, "en", "check");
      expect(c.getState().status, setup.name).toMatchObject({ kind: "workers-checked", differences: setup.differences });
    }
  });

  it("never calls an unreadable answer none", async () => {
    for (const setup of SETUPS.slice(4)) {
      const { html } = await build(setup, "en", "check");
      expect(html, setup.name).toContain("would not say which offline workers are registered");
      expect(html, setup.name).not.toContain("No offline worker is registered");
    }
  });

  it("says a browser with no workers has none, not that it has none registered", async () => {
    const { html } = await build(SETUPS[0]!, "en", "check");
    expect(html).toContain("This browser has no offline workers.");
    expect(html).not.toContain("No offline worker is registered");
  });

  it("shows no check until the person asks, and keeps it after a language change", async () => {
    const { c } = await build(SETUPS[2]!, "en", "none");
    expect(c.html()).not.toContain("data-privacy-auto-check");
    await c.dispatchAsync({ type: "check-workers" });
    c.dispatch({ type: "set-locale", locale: "fr" });
    expect(c.html()).toContain("data-privacy-auto-check");
    expect(c.html()).toContain("Un agent hors ligne contrôle cette page.");
  });

  it("puts the check in a status region and the findings in a list", async () => {
    const { html } = await build(SETUPS[2]!, "en", "check");
    expect(html).toMatch(/<div role="status" data-privacy-auto-check><p>[^<]+<\/p><ul><li>[^<]+<\/li><li>[^<]+<\/li><\/ul><\/div>/);
  });

  it("states the counts from the list and nothing it did not count", async () => {
    const { html } = await build(SETUPS[0]!, "en", "none");
    expect(html).toContain("20 rows are listed, at 31 places in 18 files.");
    expect(html).not.toMatch(/\b(?:never|nothing else|only these)\b[^<]*(?:runs|starts)/i);
  });

  it("uses no plain space before a French colon, semicolon, question or exclamation mark", async () => {
    const { html } = await build(SETUPS[4]!, "fr", "check");
    expect(html).not.toMatch(/ [:;!?]/);
  });
});

describe("the audit has teeth for this section", () => {
  it("catches a button with no text and an image with no alternative text", async () => {
    const { html } = await build(SETUPS[2]!, "en", "check");
    expect(auditHtml(html.replace("Ask the browser about offline workers", "")).length).toBeGreaterThan(0);
    expect(auditHtml(html.replace("</ul>", '<li><img src="x"></li></ul>')).length).toBeGreaterThan(0);
  });
  it("catches a plain space before a French colon", async () => {
    const { html } = await build(SETUPS[4]!, "fr", "check");
    const bad = html.replace("Agents hors ligne\u00a0:", "Agents hors ligne :").replace("rien\u00a0:", "rien :");
    expect(rawTexts(bad).some((t) => lintCopy("fr", t).length > 0)).toBe(true);
  });
  it("catches the word verified", async () => {
    const { html } = await build(SETUPS[2]!, "en", "check");
    expect(html.replace("Ask the browser", "verified")).toMatch(/verified/i);
  });
});
