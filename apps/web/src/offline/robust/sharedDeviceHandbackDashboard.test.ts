/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { mountOfflineDashboard } from "./offlineDashboard";
import { HANDBACK_COPY } from "./sharedDeviceHandbackCopy";

function setup() {
  const root = document.createElement("div");
  const unmount = mountOfflineDashboard(root, { regionId: "north", cells: [] }, {
    store: { get: async () => undefined, put: async () => undefined },
    fetchCell: vi.fn(),
    estimateStorage: async () => ({ quota: 1024, usage: 0 }),
  }, "en");
  const button = (name: string): HTMLButtonElement => {
    const node = [...root.querySelectorAll("button")].find((el) => el.textContent === name);
    if (!node) throw new Error("Missing button: " + name);
    return node;
  };
  const handback = () => root.querySelector('section[aria-label="Shared-device handback review"]');
  return { root, unmount, button, handback };
}

describe("the shared-device handback launcher", () => {
  it("mounts only on request and stays available when the pack change review closes", async () => {
    const view = setup();
    try {
      await vi.dynamicImportSettled();
      expect(view.handback()).toBeNull();
      view.button("Open pack change review").click();
      await vi.dynamicImportSettled();
      view.button("Close pack change review").click();
      view.button(HANDBACK_COPY.en.open).click();
      await vi.dynamicImportSettled();
      expect(view.handback()?.textContent).toContain(HANDBACK_COPY.en.empty);
      view.button(HANDBACK_COPY.en.close).click();
      expect(view.handback()).toBeNull();
    } finally {
      view.unmount();
    }
  });

  it("abandons a pending import on close or dashboard teardown", async () => {
    const view = setup();
    const launch = view.button(HANDBACK_COPY.en.open);
    const host = launch.parentElement!;
    launch.click();
    launch.click();
    await vi.dynamicImportSettled();
    expect(view.handback()).toBeNull();
    launch.click();
    view.unmount();
    await vi.dynamicImportSettled();
    expect(host.querySelector("section")).toBeNull();
    launch.click();
    await vi.dynamicImportSettled();
    expect(host.querySelector("section")).toBeNull();
    expect(view.root.childElementCount).toBe(0);
  });
});
