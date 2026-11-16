import { describe, expect, it } from "vitest";
import { createPrivacyController } from "./controller";
import { FIXTURE, PREFIX } from "./fixtures.test-util";
import { mountPrivacyPanel, type ActionTarget, type PanelEvent, type PanelRoot } from "./mount";
import type { ExportFile } from "./localData";
import { createMemoryStorage } from "./storage";

type Handler = (e: PanelEvent) => void;

class FakeRoot implements PanelRoot {
  innerHTML = "";
  focused: string[] = [];
  private handlers = new Map<string, Handler[]>();
  addEventListener(type: "click" | "change", handler: Handler): void {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler]);
  }
  querySelector(selector: string): { focus(): void } | null {
    return { focus: () => this.focused.push(selector) };
  }
  fire(type: "click" | "change", attrs: Record<string, string> | null): void {
    const event: PanelEvent = {
      target:
        attrs === null
          ? null
          : {
              closest: (selector: string): ActionTarget | null => {
                const name = selector.slice(1, -1); // "[data-x]" -> "data-x"
                return name in attrs ? { getAttribute: (n) => attrs[n] ?? null } : null;
              },
            },
    };
    for (const h of this.handlers.get(type) ?? []) h(event);
  }
}

function setup() {
  const storage = createMemoryStorage({ [`${PREFIX}a`]: "1" });
  const controller = createPrivacyController({
    storage,
    prefix: PREFIX,
    inventory: FIXTURE,
    now: () => new Date(2026, 10, 15),
  });
  const root = new FakeRoot();
  const exported: ExportFile[] = [];
  mountPrivacyPanel(root, controller, { onExport: (f) => exported.push(f) });
  return { root, controller, storage, exported };
}

describe("mountPrivacyPanel", () => {
  it("renders on mount", () => {
    expect(setup().root.innerHTML).toContain("data-privacy-panel");
  });
  it("export click calls onExport once with the file and moves focus to the status", () => {
    const { root, exported } = setup();
    root.fire("click", { "data-action": "export" });
    expect(exported).toHaveLength(1);
    expect(exported[0]?.count).toBe(1);
    expect(root.focused.at(-1)).toBe("[data-privacy-status]");
    expect(root.innerHTML).toContain("Download prepared: 1 item.");
  });
  it("export with nothing stored does not call onExport", () => {
    const { root, exported, storage } = setup();
    storage.removeItem(`${PREFIX}a`);
    root.fire("click", { "data-action": "export" });
    expect(exported).toHaveLength(0);
    expect(root.innerHTML).toContain("Nothing from the App was found on this device.");
  });
  it("erase asks, focuses Cancel, and cancel returns focus to the erase button", () => {
    const { root } = setup();
    root.fire("click", { "data-action": "erase" });
    expect(root.innerHTML).toContain("data-privacy-confirm");
    expect(root.focused.at(-1)).toBe('[data-action="erase-cancel"]');
    root.fire("click", { "data-action": "erase-cancel" });
    expect(root.innerHTML).not.toContain("data-privacy-confirm");
    expect(root.focused.at(-1)).toBe('[data-action="erase"]');
  });
  it("confirming erases and announces the result", () => {
    const { root, storage } = setup();
    root.fire("click", { "data-action": "erase" });
    root.fire("click", { "data-action": "erase-confirm" });
    expect(storage.getItem(`${PREFIX}a`)).toBeNull();
    expect(root.innerHTML).toContain("Erased: 1 item.");
    expect(root.focused.at(-1)).toBe("[data-privacy-status]");
  });
  it("changing the language re-renders and keeps focus on the chosen option", () => {
    const { root } = setup();
    root.fire("change", { "data-locale-option": "", value: "fr" });
    expect(root.innerHTML).toContain('lang="fr"');
    expect(root.focused.at(-1)).toBe('[data-locale-option][value="fr"]');
  });
  it("ignores an unknown language value", () => {
    const { root, controller } = setup();
    root.fire("change", { "data-locale-option": "", value: "de" });
    expect(controller.getState().prefs.locale).toBe("en");
  });
  it("ignores clicks that are not on an action, and unknown actions", () => {
    const { root, controller } = setup();
    const before = root.innerHTML;
    root.fire("click", {});
    root.fire("click", null);
    root.fire("click", { "data-action": "unknown" });
    expect(root.innerHTML).toBe(before);
    expect(controller.getState().status).toBeNull();
  });
});
