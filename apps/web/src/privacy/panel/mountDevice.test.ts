import { describe, expect, it } from "vitest";
import { createPrivacyController } from "./controller";
import type { DeviceHost } from "./deviceStorage";
import { FIXTURE, PREFIX } from "./fixtures.test-util";
import type { ExportFile } from "./localData";
import { mountPrivacyPanel, type ActionTarget, type PanelEvent, type PanelRoot } from "./mount";
import { createMemoryStorage } from "./storage";

type Handler = (e: PanelEvent) => void;
const NOW = new Date(2026, 10, 15);
const PASS = "correct horse battery";

class FakeRoot implements PanelRoot {
  innerHTML = "";
  focused: string[] = [];
  values: Record<string, string> = {};
  private handlers = new Map<string, Handler[]>();
  addEventListener(type: "click" | "change", h: Handler): void {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), h]);
  }
  querySelector(selector: string): { focus(): void; value?: string } | null {
    const value = this.values[selector];
    return { focus: () => this.focused.push(selector), ...(value === undefined ? {} : { value }) };
  }
  fire(type: "click" | "change", attrs: Record<string, string>, files?: Array<{ text(): Promise<string> }>): void {
    const target: ActionTarget = { getAttribute: (n) => attrs[n] ?? null, ...(files === undefined ? {} : { files }) };
    for (const h of this.handlers.get(type) ?? []) h({ target: { closest: (sel) => (sel.slice(1, -1) in attrs ? target : null) } });
  }
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 5));
async function until(done: () => boolean): Promise<void> {
  for (let i = 0; i < 400 && !done(); i += 1) await tick();
  if (!done()) throw new Error("timed out");
}

function host(): { host: DeviceHost; caches: Set<string> } {
  const caches = new Set(["app-v1"]);
  return { caches, host: { caches: { keys: () => Promise.resolve([...caches]), delete: (n) => Promise.resolve(caches.delete(n)) } } };
}

function setup(withDevice = true) {
  const storage = createMemoryStorage({ [`${PREFIX}a`]: "1" });
  const d = host();
  const controller = createPrivacyController({
    storage,
    prefix: PREFIX,
    inventory: FIXTURE,
    now: () => NOW,
    crypto: globalThis.crypto,
    protectedIterations: 1000,
    minProtectedIterations: 1000,
    signals: { navigator: { globalPrivacyControl: true } },
    ...(withDevice ? { device: { host: d.host, cachePrefix: "app-" } } : {}),
  });
  const root = new FakeRoot();
  const exported: ExportFile[] = [];
  mountPrivacyPanel(root, controller, { onExport: (f) => exported.push(f) });
  return { root, controller, storage, exported, d };
}

describe("signals on mount", () => {
  it("shows Unknown first, then the answers the browser gives", async () => {
    const { root } = setup();
    expect(root.innerHTML).toMatch(/Global Privacy Control<\/th><td>Unknown<\/td>/);
    await tick();
    expect(root.innerHTML).toMatch(/Global Privacy Control<\/th><td>Yes<\/td>/);
  });
  it("does not re-render when there is nothing to read", async () => {
    const controller = createPrivacyController({ storage: null, prefix: PREFIX, inventory: FIXTURE, now: () => NOW });
    const root = new FakeRoot();
    mountPrivacyPanel(root, controller);
    const html = root.innerHTML;
    await tick();
    expect(root.innerHTML).toBe(html);
    expect(root.focused).toEqual([]);
  });
});

describe("offline storage buttons", () => {
  it("scan, ask, cancel, ask again, confirm", async () => {
    const { root, d } = setup();
    root.fire("click", { "data-action": "scan-device" });
    await tick();
    expect(root.innerHTML).toContain("app-v1");
    expect(root.focused.at(-1)).toBe("[data-privacy-status]");
    root.fire("click", { "data-action": "clear-device-ask" });
    expect(root.focused.at(-1)).toBe('[data-action="clear-device-cancel"]');
    root.fire("click", { "data-action": "clear-device-cancel" });
    expect(root.focused.at(-1)).toBe('[data-action="clear-device-ask"]');
    expect(d.caches.has("app-v1")).toBe(true);
    root.fire("click", { "data-action": "clear-device-ask" });
    root.fire("click", { "data-action": "clear-device-confirm" });
    await tick();
    expect(d.caches.size).toBe(0);
    expect(root.innerHTML).toContain("Removed: 1 cache and 0 databases.");
    expect(root.focused.at(-1)).toBe("[data-privacy-status]");
  });
});

describe("protected copy buttons", () => {
  it("reads the two fields, makes the file, hands it to onExport, and the page no longer holds the passphrase", async () => {
    const { root, exported } = setup();
    root.values = { "[data-protected-pass]": PASS, "[data-protected-confirm]": PASS };
    root.fire("click", { "data-action": "export-protected" });
    await until(() => exported.length > 0);
    expect(exported).toHaveLength(1);
    expect(exported[0]!.filename).toContain("-protected.json");
    expect(root.innerHTML).not.toContain(PASS);
    expect(root.innerHTML).toContain("Protected copy prepared: 1 item.");
    expect(root.focused.at(-1)).toBe("[data-privacy-status]");
  });
  it("a mismatch makes no file", async () => {
    const { root, exported } = setup();
    root.values = { "[data-protected-pass]": PASS, "[data-protected-confirm]": "other" };
    root.fire("click", { "data-action": "export-protected" });
    await tick();
    expect(exported).toEqual([]);
    expect(root.innerHTML).toContain("The two passphrases do not match.");
  });
  it("opens a protected file with the typed passphrase, then restores only after confirm", async () => {
    const a = setup();
    a.root.values = { "[data-protected-pass]": PASS, "[data-protected-confirm]": PASS };
    a.root.fire("click", { "data-action": "export-protected" });
    await until(() => a.exported.length > 0);
    const file = a.exported[0]!.text;
    const b = setup();
    b.storage.removeItem(`${PREFIX}a`);
    b.root.values = { "[data-protected-pass]": PASS };
    b.root.fire("change", { "data-protected-file": "" }, [{ text: () => Promise.resolve(file) }]);
    await until(() => b.controller.getState().importPending);
    expect(b.controller.getState().importPending).toBe(true);
    expect(b.root.focused.at(-1)).toBe('[data-action="import-confirm"]');
    expect(b.storage.getItem(`${PREFIX}a`)).toBeNull();
    b.root.fire("click", { "data-action": "import-confirm" });
    expect(b.storage.getItem(`${PREFIX}a`)).toBe("1");
  });
  it("a wrong passphrase gives the plain message", async () => {
    const a = setup();
    a.root.values = { "[data-protected-pass]": PASS, "[data-protected-confirm]": PASS };
    a.root.fire("click", { "data-action": "export-protected" });
    await until(() => a.exported.length > 0);
    const b = setup();
    b.root.values = { "[data-protected-pass]": "wrong wrong wrong" };
    b.root.fire("change", { "data-protected-file": "" }, [{ text: () => Promise.resolve(a.exported[0]!.text) }]);
    await until(() => b.root.innerHTML.includes("could not be opened"));
    expect(b.root.innerHTML).toContain("The file could not be opened.");
    expect(b.controller.getState().importPending).toBe(false);
  });
  it("an unreadable file gives the not-a-protected-copy message", async () => {
    const { root } = setup();
    root.values = { "[data-protected-pass]": PASS };
    root.fire("change", { "data-protected-file": "" }, [{ text: () => Promise.reject(new Error("read")) }]);
    await tick();
    expect(root.innerHTML).toContain("That file is not a protected copy from the App.");
  });
  it("ignores a change with no file", async () => {
    const { root, controller } = setup();
    root.fire("change", { "data-protected-file": "" }, []);
    await tick();
    expect(controller.getState().status).toBeNull();
  });
  it("the fields are labelled, hidden as passwords, and 44 px", () => {
    const { root } = setup();
    for (const id of ["privacy-protected-pass", "privacy-protected-confirm"]) {
      expect(root.innerHTML).toMatch(new RegExp(`<label for="${id}"[^>]*min-height:44px`));
      expect(root.innerHTML).toMatch(new RegExp(`id="${id}" type="password" autocomplete="new-password"[^>]*min-height:44px`));
    }
    expect(root.innerHTML).toContain('data-protected-pass aria-describedby="privacy-protected-hint"');
  });
});
