import { describe, expect, it } from "vitest";
import { createPrivacyController, type ControllerDeps } from "./controller";
import { DEVICE_REGISTER } from "./deviceRegister";
import type { DeviceHost } from "./deviceStorage";
import { FIXTURE, PREFIX } from "./fixtures.test-util";
import { liveControllerDeps } from "./liveController";
import { createMemoryStorage } from "./storage";

const NOW = new Date(2026, 10, 19, 9, 0, 0);

function host(caches: string[] | null, dbs: string[] | null): { host: DeviceHost; caches: Set<string>; dbs: Set<string> } {
  const cs = new Set(caches ?? []);
  const ds = new Set(dbs ?? []);
  return {
    caches: cs,
    dbs: ds,
    host: {
      ...(caches === null ? {} : { caches: { keys: () => Promise.resolve([...cs]), delete: (n: string) => Promise.resolve(cs.delete(n)) } }),
      ...(dbs === null
        ? {}
        : {
            indexedDB: {
              databases: () => Promise.resolve([...ds].map((name) => ({ name }))),
              deleteDatabase: (n: string) => {
                const req = { onsuccess: null as null | (() => void), onerror: null, onblocked: null };
                queueMicrotask(() => {
                  ds.delete(n);
                  req.onsuccess?.();
                });
                return req;
              },
            },
          }),
    },
  };
}

function make(h: DeviceHost, patch: Partial<ControllerDeps> = {}) {
  return createPrivacyController({
    storage: createMemoryStorage(),
    prefix: PREFIX,
    inventory: FIXTURE,
    now: () => NOW,
    device: { host: h, cachePrefix: "app-shell-" },
    deviceRegister: DEVICE_REGISTER,
    ...patch,
  });
}

describe("device names in the controller", () => {
  it("hides the section until the device has been checked", () => {
    const c = make(host(["map-tiles-v2"], []).host);
    expect(c.html()).toContain("data-privacy-device>");
    expect(c.html()).not.toContain("data-privacy-device-known");
  });
  it("shows what each name is after the check, and unknown for a stranger", async () => {
    const c = make(host(["map-tiles-v2", "app-shell-v1", "stranger"], ["app-offline-regions"]).host);
    await c.dispatchAsync({ type: "scan-device" });
    const html = c.html();
    expect(html).toContain("data-privacy-device-known");
    expect(html).toContain("Map tiles saved for offline use");
    expect(html).toContain("Copies of App pages, kept so they open without a connection");
    expect(html).toContain("Offline region data you downloaded");
    expect(html).toContain("Unknown. The App’s list does not include it.");
    expect(html).toContain("3 names match the App’s list. 1 does not.");
  });
  it("follows the language", async () => {
    const c = make(host(["map-tiles-v2"], []).host);
    await c.dispatchAsync({ type: "scan-device" });
    c.dispatch({ type: "set-locale", locale: "fr" });
    expect(c.html()).toContain("Des tuiles de carte enregistrées pour l’usage hors ligne");
  });
  it("shows unknown, not none, when the browser has no cache or database API", async () => {
    const c = make(host(null, null).host);
    await c.dispatchAsync({ type: "scan-device" });
    expect(c.html().match(/Your browser did not say, so this is unknown\./g)).toHaveLength(2);
  });
  it("says the clear button removes the app-shell caches and not the map tiles, and the button agrees", async () => {
    const h = host(["map-tiles-v2", "app-shell-v1"], ["app-offline-regions"]);
    const c = make(h.host);
    await c.dispatchAsync({ type: "scan-device" });
    const rows = [...c.html().matchAll(/<tr><th scope="row"><span[^>]*>([^<]*)<\/span><\/th>.*?<\/tr>/g)].map((m) => [m[1], /<span[^>]*>(Yes|No)<\/span><\/td><\/tr>$/.exec(m[0])?.[1]]);
    expect(rows).toEqual([["app-shell-v1", "Yes"], ["map-tiles-v2", "No"], ["app-offline-regions", "No"]]);
    c.dispatch({ type: "clear-device-ask" });
    await c.dispatchAsync({ type: "clear-device-confirm" });
    expect([...h.caches]).toEqual(["map-tiles-v2"]);
    expect([...h.dbs]).toEqual(["app-offline-regions"]);
  });
  it("refreshes after the clear, so the removed name is no longer shown", async () => {
    const c = make(host(["map-tiles-v2", "app-shell-v1"], []).host);
    await c.dispatchAsync({ type: "scan-device" });
    c.dispatch({ type: "clear-device-ask" });
    await c.dispatchAsync({ type: "clear-device-confirm" });
    expect(c.html()).not.toContain("app-shell-v1");
    expect(c.html()).toContain("map-tiles-v2");
  });
  it("stays hidden when no register is given, even after a check", async () => {
    const c = make(host(["map-tiles-v2"], []).host, { deviceRegister: undefined as never });
    await c.dispatchAsync({ type: "scan-device" });
    expect(c.html()).not.toContain("data-privacy-device-known");
  });
  it("stays hidden when the device section itself is off", () => {
    const c = createPrivacyController({ storage: createMemoryStorage(), prefix: PREFIX, inventory: FIXTURE, now: () => NOW, deviceRegister: DEVICE_REGISTER });
    expect(c.html()).not.toContain("data-privacy-device");
  });
  it("is provided by the live controller's settings", () => {
    expect(liveControllerDeps().deviceRegister).toBe(DEVICE_REGISTER);
  });
});
