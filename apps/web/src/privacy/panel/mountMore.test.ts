import { describe, expect, it } from "vitest";
import { createPrivacyController } from "./controller";
import { createEgressPolicy, type GuardHost } from "./egress";
import { loadBlocked } from "./egressLog";
import { FIXTURE, PREFIX } from "./fixtures.test-util";
import { exportLocalData, type ExportFile } from "./localData";
import { mountPrivacyPanel, type ActionTarget, type PanelEvent } from "./mount";
import { installPrivacyRoute, type Focusable, type ShellContainer, type ShellHost } from "./page";
import { createMemoryStorage } from "./storage";

type Handler = (e: PanelEvent) => void;
const NOW = new Date(2026, 10, 15);

class FakeRoot implements ShellContainer {
  innerHTML = "";
  hidden = true;
  focused: string[] = [];
  private handlers = new Map<string, Handler[]>();
  addEventListener(type: "click" | "change", h: Handler): void {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), h]);
  }
  querySelector(selector: string): Focusable | null {
    return { focus: () => this.focused.push(selector) };
  }
  fire(type: "click" | "change", attrs: Record<string, string>, files?: Array<{ text(): Promise<string> }>): void {
    const target: ActionTarget = { getAttribute: (n) => attrs[n] ?? null, ...(files === undefined ? {} : { files }) };
    const event: PanelEvent = { target: { closest: (sel) => (sel.slice(1, -1) in attrs ? target : null) } };
    for (const h of this.handlers.get(type) ?? []) h(event);
  }
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function setup() {
  const storage = createMemoryStorage({ [`${PREFIX}a`]: "1" });
  const controller = createPrivacyController({ storage, prefix: PREFIX, inventory: FIXTURE, now: () => NOW });
  const root = new FakeRoot();
  const exported: ExportFile[] = [];
  mountPrivacyPanel(root, controller, { onExport: (f) => exported.push(f) });
  return { root, controller, storage, exported };
}

const backup = (items: Record<string, string>): string => exportLocalData(createMemoryStorage(items), PREFIX, NOW, "en").text;

describe("choosing a file to restore", () => {
  it("reads the file, shows what would change, and moves focus to the confirm button", async () => {
    const { root, controller, storage } = setup();
    root.fire("change", { "data-import-file": "" }, [{ text: () => Promise.resolve(backup({ "app.b": "2" })) }]);
    await tick();
    expect(controller.getState().importPending).toBe(true);
    expect(root.innerHTML).toContain("Ready to restore. New items: 1.");
    expect(root.focused.at(-1)).toBe('[data-action="import-confirm"]');
    expect(storage.getItem("app.b")).toBeNull();
  });
  it("restores only after the confirm button is pressed", async () => {
    const { root, storage } = setup();
    root.fire("change", { "data-import-file": "" }, [{ text: () => Promise.resolve(backup({ "app.b": "2" })) }]);
    await tick();
    root.fire("click", { "data-action": "import-confirm" });
    expect(storage.getItem("app.b")).toBe("2");
    expect(root.innerHTML).toContain("Restored: 1 item.");
    expect(root.focused.at(-1)).toBe("[data-privacy-status]");
  });
  it("cancel returns focus to the file chooser", async () => {
    const { root, storage } = setup();
    root.fire("change", { "data-import-file": "" }, [{ text: () => Promise.resolve(backup({ "app.b": "2" })) }]);
    await tick();
    root.fire("click", { "data-action": "import-cancel" });
    expect(storage.getItem("app.b")).toBeNull();
    expect(root.focused.at(-1)).toBe("[data-import-file]");
    expect(root.innerHTML).toContain("Restore cancelled.");
  });
  it("a file that cannot be read gives the same plain message as a wrong file", async () => {
    const { root, controller } = setup();
    root.fire("change", { "data-import-file": "" }, [{ text: () => Promise.reject(new Error("read failed")) }]);
    await tick();
    expect(controller.getState().status).toEqual({ kind: "import-problem", code: "not-json" });
    expect(root.focused.at(-1)).toBe("[data-privacy-status]");
  });
  it("ignores a change with no file chosen", async () => {
    const { root, controller } = setup();
    root.fire("change", { "data-import-file": "" }, []);
    await tick();
    expect(controller.getState().status).toBeNull();
  });
  it("the file input has a visible label and a 44 px target", () => {
    const { root } = setup();
    expect(root.innerHTML).toMatch(/<label for="privacy-import-file"[^>]*min-height:44px/);
    expect(root.innerHTML).toMatch(/id="privacy-import-file" type="file"[^>]*min-height:44px/);
  });
});

describe("support summary and printable page buttons", () => {
  it.each([
    ["export-support", "text/plain"],
    ["export-printable", "text/html"],
  ] as const)("%s hands one file to onExport and returns focus to the status", (action, mime) => {
    const { root, exported } = setup();
    root.fire("click", { "data-action": action });
    expect(exported.map((f) => f.mime)).toEqual([mime]);
    expect(root.focused.at(-1)).toBe("[data-privacy-status]");
  });
  it("shows both buttons with names that match their visible text", () => {
    const { root } = setup();
    expect(root.innerHTML).toContain("Download a support summary");
    expect(root.innerHTML).toContain("Download a printable page");
  });
});

describe("the route starts and stops the network guard", () => {
  class Host implements ShellHost {
    location = { hash: "" };
    document = { title: "Home", documentElement: { lang: "en" }, activeElement: null as Focusable | null };
    private l: Array<() => void> = [];
    addEventListener(_t: "hashchange", h: () => void): void {
      this.l.push(h);
    }
    removeEventListener(_t: "hashchange", h: () => void): void {
      this.l = this.l.filter((x) => x !== h);
    }
  }
  it("blocks and records while installed, and puts fetch back on dispose", async () => {
    const storage = createMemoryStorage();
    const original = (): Promise<unknown> => Promise.resolve("ok");
    const guardHost: GuardHost = { fetch: original };
    const route = installPrivacyRoute({
      host: new Host(),
      container: new FakeRoot(),
      createController: () => createPrivacyController({ storage, prefix: PREFIX, inventory: FIXTURE, now: () => NOW }),
      guard: { host: guardHost, policy: createEgressPolicy({ selfOrigin: "https://app.example.ca" }), storage, prefix: PREFIX, now: () => NOW },
    });
    expect(guardHost.fetch).not.toBe(original);
    await expect(guardHost.fetch?.("https://evil.example.net/p?q=1")).rejects.toThrow(TypeError);
    await expect(guardHost.fetch?.("/ok")).resolves.toBe("ok");
    expect(loadBlocked(storage, PREFIX, NOW).hosts.map((h) => h.host)).toEqual(["evil.example.net"]);
    route.dispose();
    expect(guardHost.fetch).toBe(original);
  });
  it("installs nothing when no guard is given", () => {
    const guardHost: GuardHost = { fetch: () => Promise.resolve("ok") };
    const before = guardHost.fetch;
    installPrivacyRoute({
      host: new Host(),
      container: new FakeRoot(),
      createController: () => createPrivacyController({ storage: null, prefix: PREFIX, inventory: FIXTURE, now: () => NOW }),
    }).dispose();
    expect(guardHost.fetch).toBe(before);
  });
});
