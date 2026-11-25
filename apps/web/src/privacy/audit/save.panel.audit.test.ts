// CI audit: the downloads section inside the live panel, in both languages and in every state the person can reach
// with it, against browsers that answer in different ways. Every state must pass the HTML audit and the copy rules,
// give the buttons 44 px targets, name no file or browser function, and show no answer the browser did not give.

import { describe, expect, it } from "vitest";
import { containsForbiddenOrg } from "../../../../../packages/shared/test/forbiddenOrg.ts";
import { lintCopy, type Locale } from "../panel/copyLint";
import { createPrivacyController, type PrivacyController } from "../panel/controller";
import { FIXTURE } from "../panel/fixtures.test-util";
import { liveControllerDeps } from "../panel/liveController";
import type { SaveHost } from "../panel/saveLive";
import { SAVE_REGISTER } from "../panel/saveRegister";
import { createMemoryStorage } from "../panel/storage";
import { auditHtml, formatViolations } from "./htmlAudit";
import { rawTexts } from "./rawTexts";

const NOW = new Date(Date.UTC(2026, 10, 21, 12, 0, 0));
const LOCALES: readonly Locale[] = ["en", "fr"];

const THROWS = (): never => {
  throw new Error("blocked");
};
const HOSTS: Record<string, SaveHost> = {
  "a browser that can do all three": { blob: () => true, address: () => true, attribute: () => true },
  "a browser that can do none": { blob: () => false, address: () => false, attribute: () => false },
  "a browser that answers nothing": {},
  "a browser that throws": { blob: THROWS, address: THROWS, attribute: THROWS },
  "a browser that gives odd values": { blob: () => "yes" as unknown as boolean, address: () => null as unknown as boolean, attribute: () => ({ x: "<b>x</b>" }) as unknown as boolean },
  "a browser that can make a file but cannot name it": { blob: () => true, address: () => true, attribute: () => false },
};

type Step = "none" | "check" | "csv" | "text" | "check-then-csv";
const STEPS: readonly Step[] = ["none", "check", "csv", "text", "check-then-csv"];

async function build(host: SaveHost, locale: Locale, step: Step): Promise<{ html: string; c: PrivacyController }> {
  const c = createPrivacyController({ storage: createMemoryStorage(), inventory: FIXTURE, now: () => NOW, ...liveControllerDeps(), save: { register: SAVE_REGISTER, host } });
  c.dispatch({ type: "set-locale", locale });
  if (step === "check" || step === "check-then-csv") await c.dispatchAsync({ type: "check-save" });
  if (step === "csv" || step === "check-then-csv") c.dispatch({ type: "export-save-csv" });
  if (step === "text") c.dispatch({ type: "export-save-text" });
  return { html: c.html(), c };
}

describe("the downloads section in the live panel", () => {
  for (const [name, host] of Object.entries(HOSTS)) {
    for (const step of STEPS) {
      for (const locale of LOCALES) {
        it(`${name}, step ${step}, ${locale}: passes the audits and names nothing it must not`, async () => {
          const { html } = await build(host, locale, step);
          expect(html).toContain("data-privacy-save");
          const v = auditHtml(html);
          expect(v, formatViolations(v)).toEqual([]);
          for (const t of rawTexts(html)) expect(lintCopy(locale, t), t).toEqual([]);
          expect(containsForbiddenOrg(html)).toBe(false);
          expect(html).not.toMatch(/verified|vérif/i);
          expect(html).not.toMatch(/apps\/web|packages\/[a-z-]+\/src/);
          const part = html.slice(html.indexOf("data-privacy-save"), html.indexOf("data-privacy-retention"));
          expect(part).not.toMatch(/createObjectURL|revokeObjectURL|\bBlob\b|\.download\b|showSaveFilePicker/);
        });
      }
    }
  }

  it("shows an answer only after the person asks, and never one the browser did not give", async () => {
    const before = (await build(HOSTS["a browser that can do all three"]!, "en", "none")).html;
    expect(before).not.toContain("data-privacy-save-check");
    const after = (await build(HOSTS["a browser that answers nothing"]!, "en", "check")).html;
    expect(after).toContain("data-privacy-save-check");
    expect(after).not.toMatch(/data-label="Answer">(?:Yes|No)</);
  });

  it("shows odd values as unknown, and escapes what it does show", async () => {
    const { html } = await build(HOSTS["a browser that gives odd values"]!, "en", "check");
    expect(html).not.toContain("<b>x</b>");
    expect([...html.matchAll(/data-label="Answer">([^<]*)</g)].map((m) => m[1])).toEqual(["Unknown", "Unknown", "Unknown"]);
  });

  it("says what is missing, in words, in each language", async () => {
    expect((await build(HOSTS["a browser that can do none"]!, "en", "check")).html).toContain("the browser says this is not available here");
    expect((await build(HOSTS["a browser that can do none"]!, "fr", "check")).html).toContain("le navigateur dit que ce n’est pas possible ici");
    expect((await build(HOSTS["a browser that can make a file but cannot name it"]!, "en", "check")).html).toContain("Naming the file to save: the browser says this is not available here");
  });

  it("lists nothing under the answers when the browser can do all three", async () => {
    const html = (await build(HOSTS["a browser that can do all three"]!, "en", "check")).html;
    const part = html.slice(html.indexOf("data-privacy-save-check"), html.indexOf("data-privacy-retention"));
    expect(part).not.toContain("<ul>");
    expect(part).toContain("3 answers to 3 questions.");
  });

  it("gives every button in the section a 44 px target", async () => {
    for (const locale of LOCALES) {
      const { html } = await build(HOSTS["a browser that can do all three"]!, locale, "check");
      const part = html.slice(html.indexOf("data-privacy-save"));
      const buttons = part.match(/<button[^>]*data-action="(?:check|export)-save[^>]*>/g) ?? [];
      expect(buttons).toHaveLength(3);
      for (const b of buttons) expect(b).toContain("min-width:44px;min-height:44px");
    }
  });

  it("has one heading of its own, before the how-long-kept section", async () => {
    const { html } = await build(HOSTS["a browser that answers nothing"]!, "en", "none");
    expect(html.match(/id="privacy-save-title"/g)).toHaveLength(1);
    expect(html.indexOf("data-privacy-save")).toBeLessThan(html.indexOf("data-privacy-retention"));
  });

  it("says the same in both languages: same buttons, same number of rows and answers", async () => {
    const en = (await build(HOSTS["a browser that can do all three"]!, "en", "check")).html;
    const fr = (await build(HOSTS["a browser that can do all three"]!, "fr", "check")).html;
    const count = (h: string, re: RegExp): number => h.slice(h.indexOf("data-privacy-save")).match(re)?.length ?? 0;
    expect(count(fr, /<tr>/g)).toBe(count(en, /<tr>/g));
    expect(count(fr, /data-action="/g)).toBe(count(en, /data-action="/g));
  });

  it("lists as many rows as the register, and each of its three downloads of the list is the same size in both languages", async () => {
    const { html, c } = await build(HOSTS["a browser that can do all three"]!, "en", "none");
    const part = html.slice(html.indexOf("data-privacy-save"), html.indexOf("data-privacy-retention"));
    expect(part.match(/<tr><th scope="row">/g)?.length).toBe(SAVE_REGISTER.length);
    expect(c.dispatch({ type: "export-save-csv" }).lastExport?.count).toBe(SAVE_REGISTER.length);
  });
});
