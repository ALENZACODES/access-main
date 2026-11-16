import { describe, expect, it } from "vitest";
import { createPrivacyController, type ControllerDeps } from "./controller";
import type { DeviceHost } from "./deviceStorage";
import { FIXTURE, PREFIX } from "./fixtures.test-util";
import { createMemoryStorage, type StorageLike } from "./storage";

const NOW = new Date(2026, 10, 15, 9, 0, 0);
const PASS = "correct horse battery";
const CRYPTO = { crypto: globalThis.crypto, protectedIterations: 1000, minProtectedIterations: 1000 } as const;

function deviceHost(caches: string[] = ["app-v1", "other"], dbs: string[] = ["app-maps"]): { host: DeviceHost; caches: Set<string>; dbs: Set<string> } {
  const cs = new Set(caches);
  const ds = new Set(dbs);
  return {
    caches: cs,
    dbs: ds,
    host: {
      caches: { keys: () => Promise.resolve([...cs]), delete: (n) => Promise.resolve(cs.delete(n)) },
      indexedDB: {
        databases: () => Promise.resolve([...ds].map((name) => ({ name }))),
        deleteDatabase: (n) => {
          const req = { onsuccess: null as null | (() => void), onerror: null, onblocked: null };
          queueMicrotask(() => {
            ds.delete(n);
            req.onsuccess?.();
          });
          return req;
        },
      },
      document: { cookie: "theme=dark" },
    },
  };
}

function make(patch: Partial<ControllerDeps> = {}, storage: StorageLike | null = createMemoryStorage({ [`${PREFIX}a`]: "secret-value-1", [`${PREFIX}b`]: "2" })) {
  return { storage, c: createPrivacyController({ storage, prefix: PREFIX, inventory: FIXTURE, now: () => NOW, ...patch }) };
}

describe("protected copy", () => {
  it("is hidden unless crypto is given", () => {
    expect(make().c.html()).not.toContain("data-privacy-protected");
    expect(make(CRYPTO).c.html()).toContain("data-privacy-protected");
  });
  it("makes a download that needs the passphrase, and nothing stored changes", async () => {
    const { c, storage } = make(CRYPTO);
    const keysBefore = JSON.stringify(Object.fromEntries([`${PREFIX}a`, `${PREFIX}b`].map((k) => [k, storage!.getItem(k)])));
    const s = await c.dispatchAsync({ type: "protected-export", passphrase: PASS, confirm: PASS });
    expect(s.status).toEqual({ kind: "protected-prepared", count: 2 });
    expect(s.lastExport?.mime).toBe("application/json");
    expect(s.lastExport?.filename).toBe("the-app-data-2026-11-15-protected.json");
    expect(s.lastExport?.text).not.toContain("secret-value-1");
    expect(JSON.stringify(Object.fromEntries([`${PREFIX}a`, `${PREFIX}b`].map((k) => [k, storage!.getItem(k)])))).toBe(keysBefore);
  });
  it("round-trips through the restore check and confirm", async () => {
    const a = make(CRYPTO);
    const out = await a.c.dispatchAsync({ type: "protected-export", passphrase: PASS, confirm: PASS });
    const b = make(CRYPTO, createMemoryStorage());
    await b.c.dispatchAsync({ type: "protected-import", text: out.lastExport!.text, passphrase: PASS });
    expect(b.c.getState()).toMatchObject({ importPending: true, status: { kind: "import-ready", additions: 2 } });
    expect(b.storage!.getItem(`${PREFIX}a`)).toBeNull();
    b.c.dispatch({ type: "import-confirm" });
    expect(b.storage!.getItem(`${PREFIX}a`)).toBe("secret-value-1");
  });
  it.each([
    ["", "", "empty"],
    ["short", "short", "too-short"],
    [PASS, "different passphrase", "mismatch"],
    ["aaaaaaaaaaaa", "aaaaaaaaaaaa", "repeated"],
  ])("refuses %j / %j with %s and makes no file", async (passphrase, confirm, code) => {
    const { c } = make(CRYPTO);
    const s = await c.dispatchAsync({ type: "protected-export", passphrase, confirm });
    expect(s.status).toEqual({ kind: "protected-problem", code });
    expect(s.lastExport).toBeNull();
  });
  it("says when there is nothing to protect, or no storage, or no crypto", async () => {
    expect((await make(CRYPTO, createMemoryStorage()).c.dispatchAsync({ type: "protected-export", passphrase: PASS, confirm: PASS })).status).toEqual({ kind: "nothing" });
    expect((await make(CRYPTO, null).c.dispatchAsync({ type: "protected-export", passphrase: PASS, confirm: PASS })).status).toEqual({ kind: "unavailable" });
    expect((await make().c.dispatchAsync({ type: "protected-export", passphrase: PASS, confirm: PASS })).status).toEqual({ kind: "protected-problem", code: "unsupported" });
  });
  it("a wrong passphrase gives the plain message and writes nothing", async () => {
    const a = make(CRYPTO);
    const out = await a.c.dispatchAsync({ type: "protected-export", passphrase: PASS, confirm: PASS });
    const b = make(CRYPTO, createMemoryStorage());
    const s = await b.c.dispatchAsync({ type: "protected-import", text: out.lastExport!.text, passphrase: "not the passphrase" });
    expect(s.status).toEqual({ kind: "protected-problem", code: "cannot-open" });
    expect(s.importPending).toBe(false);
    expect(b.storage!.getItem(`${PREFIX}a`)).toBeNull();
  });
  it("never keeps the passphrase: not in state, page, storage, activity or the file", async () => {
    const secret = "unmistakable passphrase 8271";
    const { c, storage } = make({ ...CRYPTO, logActivity: true });
    const s = await c.dispatchAsync({ type: "protected-export", passphrase: secret, confirm: secret });
    await c.dispatchAsync({ type: "protected-import", text: s.lastExport!.text, passphrase: secret });
    await c.dispatchAsync({ type: "protected-import", text: s.lastExport!.text, passphrase: `${secret}x` });
    const everything = [
      JSON.stringify(c.getState()),
      c.html(),
      s.lastExport!.text,
      ...[...Array(storage!.length).keys()].map((i) => storage!.getItem(storage!.key(i)!) ?? ""),
    ].join("\n");
    expect(everything).not.toContain(secret);
  });
  it("is listed in the activity log without contents", async () => {
    const { c } = make({ ...CRYPTO, logActivity: true });
    await c.dispatchAsync({ type: "protected-export", passphrase: PASS, confirm: PASS });
    expect(c.html()).toContain("Downloaded a protected copy: 2 items");
  });
  it("opening a copy made with fewer iterations than the limit is refused", async () => {
    const a = make(CRYPTO);
    const out = await a.c.dispatchAsync({ type: "protected-export", passphrase: PASS, confirm: PASS });
    const strict = make({ crypto: globalThis.crypto }, createMemoryStorage());
    const s = await strict.c.dispatchAsync({ type: "protected-import", text: out.lastExport!.text, passphrase: PASS });
    expect(s.status).toEqual({ kind: "protected-problem", code: "bad-fields" });
  });
});

describe("offline storage", () => {
  it("is hidden unless a host is given, and shows Not checked yet before a scan", async () => {
    expect(make().c.html()).not.toContain("data-privacy-device");
    const { c } = make({ device: { host: deviceHost().host } });
    expect(c.html()).toContain("Not checked yet.");
    await c.dispatchAsync({ type: "scan-device" });
    expect(c.html()).toContain("app-v1");
    expect(c.html()).toContain("theme");
    expect(c.getState().status).toEqual({ kind: "scan-done" });
  });
  it("shows Unknown for what the browser does not report", async () => {
    const { c } = make({ device: { host: {} } });
    await c.dispatchAsync({ type: "scan-device" });
    expect(c.html().match(/Unknown\. This browser does not say\./g)).toHaveLength(3);
  });
  it("offers removal only when a prefix is configured, and only for names under it", async () => {
    const d = deviceHost();
    const none = make({ device: { host: d.host } });
    await none.c.dispatchAsync({ type: "scan-device" });
    expect(none.c.html()).not.toContain('data-action="clear-device-ask"');
    const { c } = make({ device: { host: d.host, cachePrefix: "app-", dbPrefix: "app-" } });
    await c.dispatchAsync({ type: "scan-device" });
    expect(c.html()).toContain('data-action="clear-device-ask"');
    c.dispatch({ type: "clear-device-ask" });
    expect(c.html()).toContain("This removes 1 cache and 1 database of the App");
  });
  it("asks first, cancel removes nothing, confirm removes and rescans", async () => {
    const d = deviceHost();
    const { c } = make({ device: { host: d.host, cachePrefix: "app-", dbPrefix: "app-" }, logActivity: true });
    await c.dispatchAsync({ type: "scan-device" });
    c.dispatch({ type: "clear-device-ask" });
    c.dispatch({ type: "clear-device-cancel" });
    await c.dispatchAsync({ type: "clear-device-confirm" });
    expect([...d.caches]).toEqual(["app-v1", "other"]);
    c.dispatch({ type: "clear-device-ask" });
    const s = await c.dispatchAsync({ type: "clear-device-confirm" });
    expect(s.status).toEqual({ kind: "device-cleared", caches: 1, databases: 1 });
    expect([...d.caches]).toEqual(["other"]);
    expect([...d.dbs]).toEqual([]);
    expect(s.scan?.caches).toEqual(["other"]);
    expect(s.confirmingClearDevice).toBe(false);
    expect(c.html()).toContain("There is nothing of the App to remove.");
    expect(c.html()).toContain("Removed offline storage: 2");
  });
  it("confirm without asking does nothing", async () => {
    const d = deviceHost();
    const { c } = make({ device: { host: d.host, cachePrefix: "app-" } });
    await c.dispatchAsync({ type: "scan-device" });
    await c.dispatchAsync({ type: "clear-device-confirm" });
    expect(d.caches.has("app-v1")).toBe(true);
  });
  it("asking with nothing to remove says so instead of asking", async () => {
    const d = deviceHost(["other"], []);
    const { c } = make({ device: { host: d.host, cachePrefix: "app-" } });
    await c.dispatchAsync({ type: "scan-device" });
    c.dispatch({ type: "clear-device-ask" });
    expect(c.getState()).toMatchObject({ confirmingClearDevice: false, status: { kind: "device-nothing" } });
  });
  it("never touches localStorage", async () => {
    const d = deviceHost();
    const { c, storage } = make({ device: { host: d.host, cachePrefix: "app-", dbPrefix: "app-" } });
    await c.dispatchAsync({ type: "scan-device" });
    c.dispatch({ type: "clear-device-ask" });
    await c.dispatchAsync({ type: "clear-device-confirm" });
    expect(storage!.getItem(`${PREFIX}a`)).toBe("secret-value-1");
  });
  it("erasing local data closes a waiting removal question", async () => {
    const d = deviceHost();
    const { c } = make({ device: { host: d.host, cachePrefix: "app-" } });
    await c.dispatchAsync({ type: "scan-device" });
    c.dispatch({ type: "clear-device-ask" });
    c.dispatch({ type: "erase-ask" });
    c.dispatch({ type: "erase-confirm" });
    expect(c.getState().confirmingClearDevice).toBe(false);
  });
});

describe("browser signals", () => {
  it("is hidden unless a host is given, and shows Unknown before it is read", async () => {
    expect(make().c.html()).not.toContain("data-privacy-signals");
    const { c } = make({ signals: { navigator: { globalPrivacyControl: true, cookieEnabled: false } } });
    expect(c.html().match(/<td>Unknown<\/td>/g)).toHaveLength(5);
    expect(c.html()).toContain("Space used by this site: Unknown.");
    await c.dispatchAsync({ type: "read-signals" });
    expect(c.getState().signals?.gpc).toBe("yes");
    expect(c.html()).toMatch(/Global Privacy Control<\/th><td>Yes<\/td>/);
    expect(c.html()).toMatch(/allowed in this browser<\/th><td>No<\/td>/);
    expect(c.html()).toMatch(/Do Not Track<\/th><td>Unknown<\/td>/);
  });
  it("is French in French, with Inconnu for what is not said", async () => {
    const { c } = make({ signals: {}, languages: ["fr"] });
    await c.dispatchAsync({ type: "read-signals" });
    expect(c.html()).toContain("Signaux de confidentialité du navigateur");
    expect(c.html()).toContain("<td>Inconnu</td>");
    expect(c.html()).toContain("Espace utilisé par ce site\u00a0: inconnu.");
  });
  it("reading signals changes nothing stored", async () => {
    const { c, storage } = make({ signals: { navigator: { doNotTrack: "1" } } });
    const n = storage!.length;
    await c.dispatchAsync({ type: "read-signals" });
    expect(storage!.length).toBe(n);
  });
});

describe("report and publish", () => {
  it("report shows a status and clears a pending question", () => {
    const { c } = make();
    c.dispatch({ type: "erase-ask" });
    c.dispatch({ type: "report", status: { kind: "nothing" } });
    expect(c.getState()).toMatchObject({ confirmingErase: false, status: { kind: "nothing" } });
  });
  it("subscribers are told about async results", async () => {
    const { c } = make({ signals: { navigator: { cookieEnabled: true } } });
    const seen: Array<boolean> = [];
    c.subscribe((s) => seen.push(s.signals !== null));
    await c.dispatchAsync({ type: "read-signals" });
    expect(seen).toEqual([true]);
  });
});
