// CI audit: the live privacy panel after the device has been checked, in both languages and with
// the answers a browser can give: names the App lists, a name it does not list, an empty answer, and no answer.

import { describe, expect, it } from "vitest";
import { containsForbiddenOrg } from "../../../../../packages/shared/test/forbiddenOrg.ts";
import { createPrivacyController } from "../panel/controller";
import { lintCopy, type Locale } from "../panel/copyLint";
import { DEVICE_REGISTER } from "../panel/deviceRegister";
import type { DeviceHost } from "../panel/deviceStorage";
import { FIXTURE } from "../panel/fixtures.test-util";
import { clearLiveRefused } from "../panel/live";
import { liveControllerDeps } from "../panel/liveController";
import { createMemoryStorage } from "../panel/storage";
import { auditHtml, formatViolations } from "./htmlAudit";
import { rawTexts } from "./rawTexts";

const NOW = new Date(2026, 10, 19, 9, 0, 0);
const LOCALES: readonly Locale[] = ["en", "fr"];

function hostWith(caches: string[] | null, dbs: string[] | null): DeviceHost {
  return {
    ...(caches === null ? {} : { caches: { keys: () => Promise.resolve(caches), delete: () => Promise.resolve(true) } }),
    ...(dbs === null
      ? {}
      : { indexedDB: { databases: () => Promise.resolve(dbs.map((name) => ({ name }))), deleteDatabase: () => ({ onsuccess: null, onerror: null, onblocked: null }) } }),
  };
}

const ANSWERS: ReadonlyArray<{ name: string; caches: string[] | null; dbs: string[] | null }> = [
  { name: "every name listed", caches: ["map-tiles-v2", "map-tile-list-v1", "data-status-v1", "app-shell-v7"], dbs: ["app-offline-regions"] },
  { name: "a name the App does not list", caches: ["map-tiles-v2", "unlisted-cache"], dbs: ["unlisted-db"] },
  { name: "nothing found", caches: [], dbs: [] },
  { name: "the browser gave no answer", caches: null, dbs: null },
];

async function render(host: DeviceHost, locale: Locale): Promise<string> {
  clearLiveRefused();
  const c = createPrivacyController({
    storage: createMemoryStorage(),
    inventory: FIXTURE,
    now: () => NOW,
    ...liveControllerDeps(),
    device: { host, cachePrefix: "app-shell-" },
  });
  c.dispatch({ type: "set-locale", locale });
  await c.dispatchAsync({ type: "scan-device" });
  return c.html();
}

describe("live panel after a device check", () => {
  for (const a of ANSWERS) {
    for (const locale of LOCALES) {
      it(`${a.name} (${locale}): passes the HTML audit, the copy lint and the name check`, async () => {
        const html = await render(hostWith(a.caches, a.dbs), locale);
        const v = auditHtml(html);
        expect(v, formatViolations(v)).toEqual([]);
        for (const t of rawTexts(html)) expect(lintCopy(locale, t), t).toEqual([]);
        expect(containsForbiddenOrg(html)).toBe(false);
        expect(html).toContain("data-privacy-device-known");
      });
    }
  }

  it("describes only names the register lists, so a listed name never shows as unknown", async () => {
    const html = await render(hostWith(DEVICE_REGISTER.filter((r) => r.kind === "cache").map((r) => (r.match === "prefix" ? `${r.name}v1` : r.name)), []), "en");
    expect(html).not.toContain("Unknown. The App’s list does not include it.");
  });

  it("shows the unlisted name and says it is unknown", async () => {
    const html = await render(hostWith(["unlisted-cache"], []), "fr");
    expect(html).toContain("unlisted-cache");
    expect(html).toContain("Inconnu. La liste de l’App ne le comprend pas.");
  });
});
